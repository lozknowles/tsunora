import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type {ResourceConfig} from './config.js';
import {JobCatalog} from './job-catalog.js';
import {ActionRegistry, ArtifactStore, JobRuntime, ResourceLockManager, RunLedger, WorkerRegistry} from './job-runtime.js';
import type {JobDefinition} from './job-types.js';
import {registerManagedNodeActions} from './managed-node-actions.js';
import {ManagedNodeManager, PROTECTED_WORKLOAD_OVERRIDE, type ManagedNodeObservation, type ManagedNodeRequest, type ManagedNodeTransport} from './managed-node.js';

const resource: ResourceConfig = {id: 'worker-generic', platform: 'linux', transport: {type: 'ssh', host: 'worker-generic.example'}, capabilities: [], managedNode: {enabled: true, approvedServices: ['workload.service'], workloads: [{id: 'protected-copy', capability: 'workload.copy', systemdUnit: 'workload.service', processExecutables: ['copy-worker'], protected: true}]}};
const observation = (active: boolean, at: string): ManagedNodeObservation => ({observedAt: at, hostname: 'worker-generic', os: {id: 'linux'}, cpu: {logical: 2}, memory: {totalBytes: 1000, availableBytes: 800}, uptimeSeconds: 10, load: {one: 0, five: 0, fifteen: 0}, storage: [], optical: [], network: [], temperatures: [], services: ['workload.service'], tools: ['sh', 'apt-get', 'systemctl', 'journalctl'], processes: active ? [{pid: 4, names: ['copy-worker'], unit: 'workload.service'}] : []});

class Transport implements ManagedNodeTransport {
  calls: ManagedNodeRequest[] = [];
  probeStates: boolean[];
  constructor(readonly active: boolean, probeStates: boolean[] = []) { this.probeStates = [...probeStates]; }
  async probe(_resource: ResourceConfig, at: string) { return observation(this.probeStates.shift() ?? this.active, at); }
  async execute(_resource: ResourceConfig, request: ManagedNodeRequest) { this.calls.push(request); return {exitCode: 0, stdout: 'typed result\n', stderr: ''}; }
}

function runtime(active: boolean, definition: JobDefinition, probeStates: boolean[] = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-managed-action-')), workers = new WorkerRegistry(), transport = new Transport(active, probeStates), manager = new ManagedNodeManager([resource], workers, transport, () => new Date('2026-08-26T08:00:00.000Z')), actions = registerManagedNodeActions(manager, new ActionRegistry()), catalog = new JobCatalog(actions.ids());
  catalog.addJob(definition);
  return {manager, transport, runtime: new JobRuntime(catalog, actions, workers, new RunLedger(path.join(root, 'ledger.json')), new ArtifactStore(path.join(root, 'artifacts')), new ResourceLockManager(path.join(root, 'locks.json')))};
}

const inspectJob: JobDefinition = {apiVersion: 'agent-control/v1', kind: 'Job', metadata: {id: 'inspect-node', name: 'Inspect node', version: '1.0.0'}, spec: {priority: 'normal', concurrency: 'queue', parameters: {operation: {type: 'string', default: 'system.identity'}}, steps: [{id: 'inspect', action: 'managed-node.inspect@1.0.0', requires: ['managed-node.inspect'], outputs: [{name: 'result', type: 'application/json', schema: 'agent-control.managed-node-result/v1', version: '1.0.0'}], verification: ['managed-node-result-v1']}]}};
const maintenanceJob: JobDefinition = {apiVersion: 'agent-control/v1', kind: 'Job', metadata: {id: 'maintain-node', name: 'Maintain node', version: '1.0.0'}, spec: {priority: 'high', concurrency: 'no-overlap', parameters: {operation: {type: 'string', default: 'service.restart'}, target: {type: 'string', default: 'workload.service'}}, steps: [{id: 'maintain', action: 'managed-node.maintain@1.0.0', requires: ['managed-node.maintenance'], resources: ['managed-node-maintenance'], approval: PROTECTED_WORKLOAD_OVERRIDE, outputs: [{name: 'result', type: 'application/json', schema: 'agent-control.managed-node-result/v1', version: '1.0.0'}], verification: ['managed-node-maintenance-result-v1']}]}};

test('harmless managed-node Job dispatches through capability placement and retains typed evidence', async () => {
  const setup = runtime(false, inspectJob); await setup.manager.poll(resource.id);
  const created = setup.runtime.createRun('inspect-node@1.0.0', {}, {type: 'manual', actor: 'test'}); await setup.runtime.tick();
  const run = setup.runtime.ledger.get(created.id)!; assert.equal(run.status, 'SUCCEEDED'); assert.deepEqual(run.selectedWorkers, [resource.id]); assert.equal(setup.transport.calls[0].operation, 'system.identity');
  const artifact = setup.runtime.artifacts.read(run.artifacts[0]) as {schema: string; stdout: string}; assert.equal(artifact.schema, 'agent-control.managed-node-result/v1'); assert.equal(artifact.stdout, 'typed result\n'); assert.match(run.provenance.map(item => item.detail).join('\n'), /Typed read-only operation/);
});

test('maintenance Job waits for named approval and that approval is the protected-workload override', async () => {
  const setup = runtime(true, maintenanceJob); await setup.manager.poll(resource.id);
  const created = setup.runtime.createRun('maintain-node@1.0.0', {}, {type: 'manual', actor: 'test'}); await setup.runtime.tick();
  assert.equal(setup.runtime.ledger.get(created.id)?.steps[0].status, 'WAITING_FOR_APPROVAL'); assert.equal(setup.transport.calls.length, 0);
  setup.runtime.approve(created.id, PROTECTED_WORKLOAD_OVERRIDE); await setup.runtime.tick();
  assert.equal(setup.runtime.ledger.get(created.id)?.status, 'SUCCEEDED'); assert.deepEqual(setup.transport.calls[0], {operation: 'service.restart', target: 'workload.service'});
});

test('Job audit records the final protected-workload revalidation rejection', async () => {
  const setup = runtime(false, maintenanceJob, [false, true]); await setup.manager.poll(resource.id);
  const created = setup.runtime.createRun('maintain-node@1.0.0', {}, {type: 'manual', actor: 'test'});
  await setup.runtime.tick(); setup.runtime.approve(created.id, PROTECTED_WORKLOAD_OVERRIDE); await setup.runtime.tick();
  const run = setup.runtime.ledger.get(created.id)!;
  assert.equal(run.status, 'FAILED'); assert.equal(setup.transport.calls.length, 0);
  assert.match(run.steps[0].error ?? '', /managed_node_protected_workload_changed/);
  assert.match(run.errors.join('\n'), /managed_node_protected_workload_changed/);
});
