import assert from 'node:assert/strict';
import test from 'node:test';
import {deriveSystemReadiness} from './system-readiness.js';
import {ProviderRegistry} from './providers.js';
import {createInvocationObservation, createInvocationStart} from './harness-efficiency.js';
import type {WorkerRegistration} from './job-types.js';

const at = '2026-08-30T12:00:00.000Z';
const resource = {id: 'node-alpha', name: 'Node Alpha', platform: 'linux', transport: 'ssh', capabilities: ['remote.inspect']};
function worker(health: WorkerRegistration['health'], active = 0, capacity = 1): WorkerRegistration { return {id: 'node-alpha', capabilities: ['remote.inspect'], health, active, capacity, observedAt: at}; }
function machine(value?: WorkerRegistration) { return deriveSystemReadiness({resources: [resource], workers: value ? [value] : [], runs: [], invocations: []})[0]; }

test('registered reachable machine with execution capacity is AVAILABLE', () => { const value = machine(worker('healthy')); assert.equal(value.execution, 'AVAILABLE'); assert.equal(value.reachable, 'yes'); });
test('registered unreachable machine is OFFLINE', () => { const value = machine(worker('offline')); assert.equal(value.execution, 'OFFLINE'); assert.equal(value.reachable, 'no'); });
test('stale or unprobed machine remains UNKNOWN', () => { assert.equal(machine().execution, 'UNKNOWN'); });
test('every configured machine remains in inventory when none can be probed', () => {
  const resources = ['host-a','host-b','device-c'].map(id => ({id, name: id, platform: 'unknown', transport: 'ssh', capabilities: []}));
  const values = deriveSystemReadiness({resources, workers: [], runs: [], invocations: []});
  assert.deepEqual(values.map(value => value.id).sort(), ['device-c','host-a','host-b']); assert.ok(values.every(value => value.execution === 'UNKNOWN'));
});
test('partially usable machine is DEGRADED', () => { assert.equal(machine(worker('degraded')).execution, 'DEGRADED'); });
test('capacity exhausted machine is BUSY', () => { assert.equal(machine(worker('healthy', 1, 1)).execution, 'BUSY'); });

test('reachable provider with missing authentication is AUTH REQUIRED', () => {
  const providers = new ProviderRegistry(); providers.register({id:'ox',name:'Ox',kind:'responses',baseUrl:'http://provider.invalid/v1',requiresAuth:true,credentialConfigured:false,parallelism:1,costClass:'metered',capabilities:['model.execute'],qualificationModel:'ox-alpha',qualification:{status:'qualified'}}); providers.setHealth('ox','healthy','HTTP 200',12);
  const value = deriveSystemReadiness({providers,resources:[],workers:[],runs:[],invocations:[]})[0]; assert.equal(value.execution,'AUTH REQUIRED'); assert.equal(value.authentication,'required');
});

test('qualified reachable authenticated provider is AVAILABLE without exposing credential material', () => {
  const providers = new ProviderRegistry(); providers.register({id:'ox',name:'Ox',kind:'responses',requiresAuth:true,credentialConfigured:true,parallelism:1,costClass:'metered',capabilities:['model.execute'],qualificationModel:'ox-alpha',qualification:{status:'qualified'}}); providers.setHealth('ox','healthy','HTTP 200',8);
  const value = deriveSystemReadiness({providers,resources:[],workers:[],runs:[],invocations:[]})[0]; assert.equal(value.execution,'AVAILABLE'); assert.equal(value.authentication,'present'); assert.doesNotMatch(JSON.stringify(value),/token|password|secret|credentialConfigured/i);
});

test('authenticated external service is retained as UNKNOWN until probed and missing API key is AUTH REQUIRED', () => {
  const values = deriveSystemReadiness({resources:[],services:[{id:'ready-ref',name:'Ready ref',healthUrl:'https://service.example/health',optional:true,requiresAuth:true,credentialConfigured:true},{id:'missing-key',name:'Missing key',healthUrl:'https://service.example/health',optional:true,requiresAuth:true,credentialConfigured:false}],workers:[],runs:[],invocations:[]});
  assert.equal(values.find(value=>value.id==='ready-ref')?.execution,'UNKNOWN'); assert.equal(values.find(value=>value.id==='missing-key')?.execution,'AUTH REQUIRED');
});

test('active provider invocation is BUSY rather than UNKNOWN before a health probe', () => {
  const providers = new ProviderRegistry(); providers.register({id:'ox',name:'Ox',kind:'responses',requiresAuth:true,credentialConfigured:true,parallelism:1,costClass:'metered',capabilities:['model.execute'],qualificationModel:'ox-alpha',qualification:{status:'qualified'}});
  const invocation = createInvocationStart({jobId:'review',runId:'run-active',stepId:'review',taskId:'review',laneId:'job:run-active',model:'ox-alpha',provider:'ox',harnessProfile:'STANDARD',executionStrategy:'test',startedAt:at,recipeFingerprint:'active'});
  const value = deriveSystemReadiness({providers,resources:[],workers:[],runs:[],invocations:[invocation]})[0]; assert.equal(value.execution,'BUSY'); assert.equal(value.active,1); assert.match(value.blockingReason??'',/active invocation/);
});

test('successful provider invocation supplies current readiness and last successful Job evidence', () => {
  const providers = new ProviderRegistry(); providers.register({id:'ox',name:'Ox',kind:'responses',requiresAuth:true,credentialConfigured:true,parallelism:1,costClass:'metered',capabilities:['model.execute'],qualificationModel:'ox-alpha',qualification:{status:'qualified'}});
  providers.setHealth('ox','degraded','provider_health_http_404',10); providers.health('ox')!.checkedAt='2026-08-30T11:00:00.000Z';
  const completedAt='2026-08-30T12:00:05.000Z', invocation={...createInvocationObservation({jobId:'review',runId:'run-success',stepId:'review',taskId:'review',laneId:'job:run-success',model:'ox-alpha',provider:'ox',harnessProfile:'STANDARD',executionStrategy:'test',startedAt:at,completedAt,rawUsage:{input_tokens:10,output_tokens:2,total_tokens:12},recipeFingerprint:'success'}),finalJobResult:'SUCCEEDED' as const,verifierResult:'PASS' as const};
  const value = deriveSystemReadiness({providers,resources:[],workers:[],runs:[],invocations:[invocation]})[0]; assert.equal(value.execution,'AVAILABLE'); assert.equal(value.reachable,'yes'); assert.equal(value.lastSuccessfulJobAt,completedAt); assert.equal(value.lastError,null);
});
