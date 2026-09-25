import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {startJobScheduler} from './job-bootstrap.js';
import {JobCatalog} from './job-catalog.js';
import {ActionRegistry, ArtifactStore, JobRuntime, ResourceLockManager, RunLedger, WorkerRegistry} from './job-runtime.js';
import type {ActionHandler, JobDefinition} from './job-types.js';

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function until(predicate: () => boolean, timeoutMs = 4_000) { const end = Date.now() + timeoutMs; while (!predicate()) { if (Date.now() > end) throw new Error('condition_timeout'); await delay(10); } }
function job(id: string, action: string, concurrency: JobDefinition['spec']['concurrency'] = 'allow', timeoutSeconds?: number, steps?: JobDefinition['spec']['steps']): JobDefinition {
  return {apiVersion: 'agent-control/v1', kind: 'Job', metadata: {id, name: id, version: '1.0.0'}, spec: {priority: 'normal', concurrency, steps: steps ?? [{id: 'run', action, requires: ['fixture'], ...(timeoutSeconds ? {timeoutSeconds} : {})}]}};
}
function setup(definitions: JobDefinition[], handlers: Record<string, ActionHandler>, capacity: number) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-scheduler-')), actions = new ActionRegistry();
  for (const [id, handler] of Object.entries(handlers)) actions.register(id, handler);
  const catalog = new JobCatalog(actions.ids()); for (const definition of definitions) catalog.addJob(definition);
  const workers = new WorkerRegistry().register({id: 'worker', capabilities: ['fixture'], health: 'healthy', capacity, active: 0, observedAt: new Date().toISOString()});
  const runtime = new JobRuntime(catalog, actions, workers, new RunLedger(path.join(root, 'ledger.json')), new ArtifactStore(path.join(root, 'artifacts')), new ResourceLockManager(path.join(root, 'locks.json')));
  return {root, runtime: Object.assign(runtime, {workParcels: {async tick() { return undefined; }}})};
}
function start(runtime: ReturnType<typeof setup>['runtime']) { return startJobScheduler(runtime as never, undefined, 5, error => { throw error; }); }

test('scheduler overlaps two independent Jobs when worker capacity is two', async t => {
  let active = 0, maximum = 0; const windows = new Map<string, {start: number; end?: number}>();
  const action = 'overlap@1.0.0', run = setup([job('one', action), job('two', action)], {[action]: async context => { const window = {start: Date.now(), end: undefined as number | undefined}; windows.set(context.run.jobId, window); active++; maximum = Math.max(maximum, active); await delay(120); window.end = Date.now(); active--; return {}; }}, 2);
  const a = run.runtime.createRun('one@1.0.0', {}, {type: 'manual', actor: 'test'}), b = run.runtime.createRun('two@1.0.0', {}, {type: 'manual', actor: 'test'}), stop = start(run.runtime);
  try { await until(() => run.runtime.ledger.get(a.id)?.status === 'SUCCEEDED' && run.runtime.ledger.get(b.id)?.status === 'SUCCEEDED'); const values = [...windows.values()]; const overlapMs = Math.min(...values.map(value => value.end!)) - Math.max(...values.map(value => value.start)); assert.equal(maximum, 2); assert.ok(overlapMs > 0); t.diagnostic(JSON.stringify({windows: Object.fromEntries(windows), overlapMs, maximumActive: maximum, capacity: 2})); } finally { stop(); fs.rmSync(run.root, {recursive: true, force: true}); }
});

test('step dependencies remain serialized inside one Job', async () => {
  const events: string[] = [], first = 'first@1.0.0', second = 'second@1.0.0';
  const definition = job('dependent', first, 'allow', undefined, [{id: 'first', action: first, requires: ['fixture']}, {id: 'second', action: second, requires: ['fixture'], dependsOn: ['first']}]);
  const run = setup([definition], {[first]: async () => { events.push('first:start'); await delay(80); events.push('first:end'); return {}; }, [second]: async () => { events.push('second:start'); return {}; }}, 2);
  const created = run.runtime.createRun('dependent@1.0.0', {}, {type: 'manual', actor: 'test'}), stop = start(run.runtime);
  try { await until(() => run.runtime.ledger.get(created.id)?.status === 'SUCCEEDED'); assert.deepEqual(events, ['first:start', 'first:end', 'second:start']); } finally { stop(); fs.rmSync(run.root, {recursive: true, force: true}); }
});

test('no-overlap serializes runs of the same Job', async t => {
  let active = 0, maximum = 0; const action = 'serial@1.0.0', windows: Array<{start: number; end?: number}> = [];
  const run = setup([job('serial', action, 'no-overlap')], {[action]: async () => { const window = {start: Date.now(), end: undefined as number | undefined}; windows.push(window); active++; maximum = Math.max(maximum, active); await delay(80); window.end = Date.now(); active--; return {}; }}, 2);
  const a = run.runtime.createRun('serial@1.0.0', {}, {type: 'manual', actor: 'test'}), b = run.runtime.createRun('serial@1.0.0', {}, {type: 'manual', actor: 'test'}), stop = start(run.runtime);
  try { await until(() => run.runtime.ledger.get(a.id)?.status === 'SUCCEEDED' && run.runtime.ledger.get(b.id)?.status === 'SUCCEEDED'); const overlapMs = Math.max(0, Math.min(...windows.map(value => value.end!)) - Math.max(...windows.map(value => value.start))); assert.equal(maximum, 1); assert.equal(overlapMs, 0); t.diagnostic(JSON.stringify({windows, overlapMs, maximumActive: maximum, policy: 'no-overlap'})); } finally { stop(); fs.rmSync(run.root, {recursive: true, force: true}); }
});

test('configured worker capacity is a hard scheduler bound', async () => {
  let active = 0, maximum = 0; const action = 'bounded@1.0.0', definitions = ['a', 'b', 'c'].map(id => job(id, action));
  const run = setup(definitions, {[action]: async () => { active++; maximum = Math.max(maximum, active); await delay(90); active--; return {}; }}, 2);
  const created = definitions.map(definition => run.runtime.createRun(`${definition.metadata.id}@1.0.0`, {}, {type: 'manual', actor: 'test'})), stop = start(run.runtime);
  try { await until(() => created.every(item => run.runtime.ledger.get(item.id)?.status === 'SUCCEEDED')); assert.equal(maximum, 2); } finally { stop(); fs.rmSync(run.root, {recursive: true, force: true}); }
});

test('one Job failure does not prevent an independent Job succeeding', async () => {
  const fail = 'fail@1.0.0', pass = 'pass@1.0.0', run = setup([job('fails', fail), job('passes', pass)], {[fail]: async () => { await delay(30); throw new Error('isolated_failure'); }, [pass]: async () => { await delay(60); return {}; }}, 2);
  const a = run.runtime.createRun('fails@1.0.0', {}, {type: 'manual', actor: 'test'}), b = run.runtime.createRun('passes@1.0.0', {}, {type: 'manual', actor: 'test'}), stop = start(run.runtime);
  try { await until(() => run.runtime.ledger.get(a.id)?.status === 'FAILED' && run.runtime.ledger.get(b.id)?.status === 'SUCCEEDED'); } finally { stop(); fs.rmSync(run.root, {recursive: true, force: true}); }
});

test('a timed-out Job releases a capacity-one slot for the next Job', async () => {
  const hang = 'hang@1.0.0', pass = 'after@1.0.0', timeoutJob = job('timeout', hang, 'allow', 1); timeoutJob.spec.priority = 'urgent';
  const run = setup([timeoutJob, job('after', pass)], {[hang]: async context => new Promise((_resolve, reject) => context.signal.addEventListener('abort', () => reject(new Error('cancelled')), {once: true})), [pass]: async () => ({})}, 1);
  const a = run.runtime.createRun('timeout@1.0.0', {}, {type: 'manual', actor: 'test'}), b = run.runtime.createRun('after@1.0.0', {}, {type: 'manual', actor: 'test'}), stop = start(run.runtime);
  try {
    await until(() => run.runtime.ledger.get(a.id)?.status === 'FAILED' && run.runtime.ledger.get(b.id)?.status === 'SUCCEEDED');
    assert.equal(run.runtime.ledger.get(a.id)?.steps[0].status, 'TIMED_OUT'); assert.equal(run.runtime.workers.list()[0].active, 0);
  } finally { stop(); fs.rmSync(run.root, {recursive: true, force: true}); }
});


test('uncertain cleanup retains capacity while scheduler timers remain responsive', async () => {
  const hang = 'unknown@1.0.0', pass = 'queued@1.0.0', blocked = job('unknown', hang, 'allow', 1); blocked.spec.priority = 'urgent';
  const run = setup([blocked, job('queued', pass)], {[hang]: async () => new Promise(() => undefined), [pass]: async () => ({})}, 1);
  const a = run.runtime.createRun('unknown@1.0.0', {}, {type: 'manual', actor: 'test'}), b = run.runtime.createRun('queued@1.0.0', {}, {type: 'manual', actor: 'test'}), stop = start(run.runtime);
  try {
    await until(() => run.runtime.ledger.get(a.id)?.status === 'CLEANUP_UNCERTAIN');
    await delay(40);
    assert.equal(run.runtime.workers.list()[0].active, 1);
    assert.equal(run.runtime.ledger.get(b.id)?.steps[0].status, 'WAITING_FOR_WORKER');
  } finally { stop(); fs.rmSync(run.root, {recursive: true, force: true}); }
});

test('released capacity schedules eligible work without waiting for a long timer interval',async()=>{
 let release!:()=>void;const wait=new Promise<void>(r=>{release=r;}),started:string[]=[];const action='immediate-progress@1.0.0';const s=setup([job('first-progress',action),job('second-progress',action)],{[action]:async context=>{started.push(context.run.jobId);if(context.run.jobId==='first-progress')await wait;return {};}},1);
 const first=s.runtime.createRun('first-progress@1.0.0',{}, {type:'manual',actor:'test'}),second=s.runtime.createRun('second-progress@1.0.0',{}, {type:'manual',actor:'test'});const stop=startJobScheduler(s.runtime as never,undefined,60000);
 try{await until(()=>started.length===1);release();await until(()=>s.runtime.ledger.get(second.id)?.status==='SUCCEEDED',2000);assert.equal(s.runtime.ledger.get(first.id)?.status,'SUCCEEDED');}finally{stop();fs.rmSync(s.root,{recursive:true,force:true});}
});

test('rejected dispatch completion releases scheduler capacity with bounded rescheduling',async()=>{let dispatches=0,success=false,errors=0;const runtime:any={tickSchedules:async()=>[],workParcels:{tick:async()=>undefined},schedulerConcurrencyLimit:()=>1,ledger:{get:()=>undefined},dispatch:()=>{dispatches++;if(dispatches===1)return {runId:'rejected',completion:Promise.reject(new Error('orchestration-failed'))};if(dispatches===2)return {runId:'following',completion:Promise.resolve({id:'following',status:'SUCCEEDED',steps:[]})};return undefined;}};const stop=startJobScheduler(runtime,(_id,status)=>{success=status==='SUCCEEDED';},60000,()=>{errors++;});try{await until(()=>success,2000);assert.equal(errors,1);}finally{stop();}});
test('repeated rejected dispatches do not create an immediate retry loop',async()=>{let dispatches=0;const runtime:any={tickSchedules:async()=>[],workParcels:{tick:async()=>undefined},schedulerConcurrencyLimit:()=>1,ledger:{get:()=>undefined},dispatch:()=>{dispatches++;return {runId:'rejected',completion:Promise.reject(new Error('repeat'))};}};const stop=startJobScheduler(runtime,undefined,60000,()=>{});await delay(100);assert.equal(dispatches,1);stop();await delay(300);assert.equal(dispatches,1);});
