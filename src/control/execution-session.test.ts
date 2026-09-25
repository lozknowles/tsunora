import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, {type TestContext} from 'node:test';
import {ContractExecutionRuntime} from './contract-runtime.js';
import {ExecutionSessionRuntime, type ExecutionSessionCapabilities, type ExecutionSessionControl, type ExecutionSessionScope} from './execution-session.js';

const operator = {actorId: 'human:operator', roles: ['operator' as const]};
const scope = (extra: Partial<ExecutionSessionScope> = {}): ExecutionSessionScope => ({runId: 'run:one', jobId: 'job', jobVersion: '1.0.0', stepId: 'step', actionId: 'test.action@1.0.0', workerId: 'worker', nodeId: 'controller', parcelId: 'parcel:one', crewRole: 'quality-inspector', ...extra});
const capabilities = (extra: Partial<ExecutionSessionCapabilities> = {}): ExecutionSessionCapabilities => ({observableOutput: true, interactiveInput: true, terminal: 'pty', resize: true, signals: ['INTERRUPT', 'TERMINATE'], suspendResume: false, persistent: false, reconnectable: false, remoteTransport: false, modes: {watch: true, intervene: true, takeControl: false}, limitations: [], ...extra});

function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-execution-session-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  return {root, runtime: new ExecutionSessionRuntime(root)};
}

test('WATCH streams genuine adapter output, supports multiple viewers and cannot write', async t => {
  const {runtime} = fixture(t), writes: string[] = [], id = 'session:watch', incarnation = 'incarnation:watch';
  const control: ExecutionSessionControl = {prove: async () => ({sessionId: id, incarnation, state: 'RUNNING', pid: 101}), write: async value => { writes.push(value); }};
  runtime.create({id, incarnation, adapterId: 'fixture-pty', scope: scope(), command: 'real-program', cwd: '/workspace', pid: 101, capabilities: capabilities(), control});
  const first = await runtime.attach(id, 'WATCH', operator), second = await runtime.attach(id, 'WATCH', {actorId: 'human:second', roles: ['operator']});
  runtime.appendOutput(id, 'terminal', 'genuine process output\n'); runtime.flushOutput(id);
  assert.equal(runtime.events(id).find(event => event.type === 'output')?.text, 'genuine process output\n');
  await assert.rejects(runtime.input(id, first.id, 'forbidden\n', operator), /execution_session_watch_read_only/);
  assert.deepEqual(writes, []); assert.equal(runtime.get(id).attachments.filter(item => !item.detachedAt).length, 2);
  runtime.detach(id, first.id, operator); runtime.detach(id, second.id, {actorId: 'human:second', roles: ['operator']});
  assert.equal(runtime.get(id).state, 'RUNNING');
});

test('INTERVENE is explicit, exclusive and withholds human input while redacting echoed sensitive data', async t => {
  const {runtime, root} = fixture(t), writes: string[] = [], secret = `nvapi-fixture-${'x'.repeat(24)}`, id = 'session:intervene', incarnation = 'incarnation:intervene';
  runtime.create({id, incarnation, adapterId: 'fixture-pty', scope: scope(), command: 'interactive-program', cwd: '/workspace', pid: 102, capabilities: capabilities(), control: {prove: async () => ({sessionId: id, incarnation, state: 'RUNNING', pid: 102}), write: async value => { writes.push(value); }}});
  const attachment = await runtime.attach(id, 'INTERVENE', operator);
  await assert.rejects(runtime.attach(id, 'INTERVENE', {actorId: 'human:second', roles: ['operator']}), /execution_session_interactive_attachment_held/);
  const accepted = await runtime.input(id, attachment.id, `${secret}\n`, operator, true); assert.deepEqual(accepted, {accepted: true, bytes: Buffer.byteLength(`${secret}\n`), recordedContent: false});
  runtime.appendOutput(id, 'terminal', secret.slice(0, 11)); runtime.appendOutput(id, 'terminal', `${secret.slice(11)}\naccepted\n`); runtime.flushOutput(id);
  assert.deepEqual(writes, [`${secret}\n`]);
  const durable = `${fs.readFileSync(path.join(root, 'sessions.json'), 'utf8')}\n${fs.readFileSync(path.join(root, 'events', `${id}.jsonl`), 'utf8')}\n${runtime.transcript(id)}`;
  assert.equal(durable.includes(secret), false); assert.match(durable, /REDACTED/); assert.match(durable, /sensitive;bytes=/); assert.doesNotMatch(durable, /human\.input[\s\S]*nvapi-fixture/);
});

test('late output retains credential redaction through teardown and is dropped after retirement', async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-control-execution-late-output-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const runtime=new ExecutionSessionRuntime(root,undefined,()=>new Date().toISOString(),8*1024*1024,20),secret=`synthetic-late-${'s'.repeat(24)}`,id='session:late-output',incarnation='incarnation:late-output';
  runtime.create({id,incarnation,adapterId:'fixture-pty',scope:scope(),command:'delayed-program',cwd:'/workspace',capabilities:capabilities(),runtimeCredentials:[secret],control:{prove:async()=>({sessionId:id,incarnation,state:'RUNNING'})}});
  runtime.finish(id,{exitCode:0,signal:null});runtime.appendOutput(id,'terminal',`delayed ${secret}\n`);runtime.flushOutput(id);
  const durable=fs.readFileSync(path.join(root,'events',`${id}.jsonl`),'utf8');assert.equal(durable.includes(secret),false);assert.match(durable,/REDACTED/);
  await new Promise(resolve=>setTimeout(resolve,35));const before=runtime.events(id).length;runtime.appendOutput(id,'terminal',`too-late ${secret}\n`);runtime.flushOutput(id);assert.equal(runtime.events(id).length,before);
});

test('resize and signals call only the proven exact session while stale PID identity fails closed', async t => {
  const {runtime} = fixture(t), calls: string[] = [], id = 'session:controls', incarnation = 'incarnation:controls';
  runtime.create({id, incarnation, adapterId: 'fixture-pty', scope: scope(), command: 'interactive-program', cwd: '/workspace', pid: 103, capabilities: capabilities(), control: {prove: async () => ({sessionId: id, incarnation, state: 'RUNNING', pid: 103}), resize: async (columns, rows) => { calls.push(`resize:${columns}x${rows}`); }, signal: async signal => { calls.push(`signal:${signal}`); }, write: async () => {}}});
  const attachment = await runtime.attach(id, 'INTERVENE', operator); await runtime.resize(id, attachment.id, 140, 42, operator); await runtime.signal(id, attachment.id, 'INTERRUPT', operator);
  assert.deepEqual(calls, ['resize:140x42', 'signal:INTERRUPT']);
  runtime.bindControl(id, {prove: async () => ({sessionId: id, incarnation, state: 'RUNNING', pid: 999}), write: async () => {}});
  await assert.rejects(runtime.input(id, attachment.id, 'x', operator), /execution_session_identity_mismatch/); assert.equal(runtime.get(id).state, 'UNKNOWN');
});

test('TAKE CONTROL delegates writer fencing and requires reconciliation before autonomous return', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-execution-takeover-')); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const contracts = new ContractExecutionRuntime(path.join(root, 'contracts.json')), contractId = 'contract:takeover';
  contracts.create({id: contractId, laneId: 'lane:one', operatorActorId: operator.actorId, objective: 'Complete governed work', completionCriteria: ['verified'], authority: ['repository.write'], active: {actorId: 'agent:worker', agentId: 'worker', runtimeId: 'runtime', nodeId: 'controller'}, baton: {nextAction: 'continue'}, process: {id: 'process:one', pid: 104}, ptyId: 'pty:one', permissions: {capabilities: ['repository.write'], filesystem: 'write', network: 'none', production: false}});
  contracts.attach(contractId, {actorId: 'agent:worker', kind: 'agent'}, 'write');
  const runtime = new ExecutionSessionRuntime(path.join(root, 'sessions'), contracts), id = 'session:takeover', incarnation = 'incarnation:takeover', controlCalls: string[] = [];
  runtime.create({id, incarnation, adapterId: 'fenced-persistent-pty', scope: scope({contractId}), command: 'coding-agent', cwd: '/workspace', pid: 104, capabilities: capabilities({persistent: true, reconnectable: true, modes: {watch: true, intervene: true, takeControl: true}}), control: {prove: async () => ({sessionId: id, incarnation, state: 'RUNNING', pid: 104}), write: async () => {}, takeControl: async actor => { controlCalls.push(`take:${actor}`); }, returnControl: async actor => { controlCalls.push(`return:${actor}`); }}});
  const attachment = await runtime.attach(id, 'TAKE_CONTROL', operator); assert.equal(contracts.get(contractId).pty.writeOwner, operator.actorId); assert.equal(runtime.get(id).control.owner, 'human');
  assert.throws(() => runtime.detach(id, attachment.id, operator), /execution_session_control_return_required/);
  await runtime.returnControl(id, attachment.id, operator, {summary: 'Reviewed the live edit and restored autonomous execution.', batonId: 'baton:reconciled'});
  assert.equal(contracts.get(contractId).pty.writeOwner, 'agent:worker'); assert.equal(runtime.get(id).control.owner, 'agent'); assert.deepEqual(controlCalls, ['take:human:operator', 'return:human:operator']);
  assert.match(runtime.transcript(id), /reconciliation\.recorded/); assert.match(runtime.transcript(id), /baton:reconciled/);
});

test('controller restart never reconnects a nonpersistent session and proves persistent identity before reconnect', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-execution-restart-')); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const first = new ExecutionSessionRuntime(root), id = 'session:restart', incarnation = 'incarnation:restart';
  first.create({id, incarnation, adapterId: 'persistent-fixture', adapterReference: 'opaque:reference', scope: scope(), command: 'remote-agent', cwd: '/workspace', pid: 105, capabilities: capabilities({persistent: true, reconnectable: true}), control: {prove: async () => ({sessionId: id, incarnation, state: 'RUNNING', pid: 105})}});
  const restarted = new ExecutionSessionRuntime(root); assert.equal(restarted.get(id).state, 'UNKNOWN');
  restarted.registerAdapter({id: 'persistent-fixture', reconnect: async (record, output) => { output('terminal', 'reconnected output\n'); return {prove: async () => ({sessionId: record.id, incarnation: record.incarnation, state: 'RUNNING', pid: 105})}; }});
  assert.equal((await restarted.reconcile(id)).state, 'RUNNING'); restarted.flushOutput(id); assert.match(restarted.transcript(id), /reconnected output/);
  const nonpersistentRoot = path.join(root, 'nonpersistent'), nonpersistent = new ExecutionSessionRuntime(nonpersistentRoot);
  nonpersistent.create({id: 'session:pipe', incarnation: 'incarnation:pipe', adapterId: 'local-pipe', scope: scope(), command: 'build', cwd: '/workspace', pid: 106, capabilities: capabilities({interactiveInput: false, terminal: 'pipe', resize: false, persistent: false, reconnectable: false, modes: {watch: true, intervene: false, takeControl: false}}), control: {prove: async () => ({sessionId: 'session:pipe', incarnation: 'incarnation:pipe', state: 'RUNNING', pid: 106})}});
  assert.equal(new ExecutionSessionRuntime(nonpersistentRoot).get('session:pipe').state, 'DISCONNECTED');
});

test('secret-bearing durable metadata is rejected instead of silently persisted', t => {
  const {runtime} = fixture(t);
  assert.throws(() => runtime.create({adapterId: 'fixture', scope: scope(), command: `tool --api_key=sk-proj-${'z'.repeat(24)}`, cwd: '/workspace', capabilities: capabilities()}), /execution_session_secret_material_forbidden/);
});

test('WATCH_ONLY scope rejects an adapter that attempts to expose intervention capability', t => {
  const {runtime} = fixture(t);
  assert.throws(() => runtime.create({adapterId: 'fixture', scope: scope({interactionPolicy:'WATCH_ONLY'}), command: 'protected-action', cwd: '/workspace', capabilities: capabilities()}), /execution_session_policy_capability_escalation/);
  assert.doesNotThrow(() => runtime.create({id:'session:protected-watch',adapterId:'fixture',scope:scope({interactionPolicy:'WATCH_ONLY'}),command:'protected-action',cwd:'/workspace',capabilities:capabilities({interactiveInput:false,resize:false,signals:[],modes:{watch:true,intervene:false,takeControl:false},limitations:['protected action is watch-only']})}));
});
