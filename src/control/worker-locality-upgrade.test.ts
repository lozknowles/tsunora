import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {loadConfig, type ResourceConfig} from './config.js';
import {AgentResourceDiscoveryAdapter, ConfiguredResourceDiscoveryAdapter, EnvironmentDiscoveryRuntime, type DiscoveryProbe} from './environment-discovery.js';
import {projectEstateMap} from './estate-map.js';
import {buildJobRuntime} from './job-bootstrap.js';
import {WorkerRegistry} from './job-runtime.js';
import type {WorkerRegistration} from './job-types.js';
import {OPERATOR_OBSERVATION_CAPABILITY, OPERATOR_OBSERVATION_WORKER_ID} from './poe-observation-job.js';
import {deriveRuntimeActionIntent, RuntimeSafetySupervisor} from './runtime-safety-supervisor.js';

const observedAt = '2026-09-13T06:00:00.000Z';
const worker = (id: string, capabilities = ['system.inspect'], labels: Record<string, string> = {}): WorkerRegistration => ({id, capabilities, health: 'healthy', capacity: 1, active: 0, labels, observedAt});
const resource = (id: string, transport: ResourceConfig['transport'], extra: Partial<ResourceConfig> = {}): ResourceConfig => ({id, platform: 'linux', transport, capabilities: ['system.inspect'], ...extra});

test('worker registry derives locality from trusted registration provenance rather than labels or names', () => {
  const registry = WorkerRegistry.fromConfig([
    resource('controller-node', {type: 'local'}, {controller: true}),
    resource('local-helper', {type: 'local'}),
    resource('remote-node', {type: 'ssh', host: 'remote.invalid'}, {controller: true, metadata: {locality: 'CONTROLLER_LOCAL', origin: 'agent-control-built-in'}}),
  ]);
  registry.registerControllerInternal(worker('agent-control:internal-reader'));
  registry.register(worker('controller', ['system.inspect'], {origin: 'agent-control-built-in', scope: 'controller-local'}));
  registry.observe({id: 'remote-node', capabilities: ['system.inspect'], health: 'healthy', capacity: 1, labels: {locality: 'CONTROLLER_LOCAL'}, observedAt});

  assert.deepEqual(registry.executionIdentity('controller-node'), {workerId: 'controller-node', nodeId: 'controller-node', locality: 'CONTROLLER_LOCAL', authority: 'CONFIGURED_RESOURCE', controllerRelationship: 'CONTROLLER_RESOURCE'});
  assert.deepEqual(registry.executionIdentity('local-helper'), {workerId: 'local-helper', nodeId: 'local-helper', locality: 'LOCAL_WORKER', authority: 'CONFIGURED_RESOURCE', controllerRelationship: 'CONTROLLER_HOST_RESOURCE'});
  assert.deepEqual(registry.executionIdentity('remote-node'), {workerId: 'remote-node', nodeId: 'remote-node', locality: 'REMOTE_WORKER', authority: 'CONFIGURED_RESOURCE', controllerRelationship: 'REMOTE_RESOURCE'});
  assert.deepEqual(registry.executionIdentity('agent-control:internal-reader'), {workerId: 'agent-control:internal-reader', nodeId: 'controller-node', locality: 'CONTROLLER_LOCAL', authority: 'AGENT_CONTROL_INTERNAL', controllerRelationship: 'CONTROLLER_INTERNAL'});
  assert.equal(registry.executionIdentity('controller').locality, 'UNKNOWN');
});

test('runtime safety admits established local workers while remote, unknown and spoofed identities remain governed fail-closed', () => {
  const configured = WorkerRegistry.fromConfig([
    resource('controller-node', {type: 'local'}, {controller: true}),
    resource('local-helper', {type: 'local'}),
    resource('remote-node', {type: 'ssh', host: 'remote.invalid'}, {metadata: {locality: 'CONTROLLER_LOCAL'}}),
  ]);
  configured.registerControllerInternal(worker('agent-control:internal-reader'));
  const unverified = new WorkerRegistry().register(worker('controller', ['system.inspect'], {origin: 'agent-control-built-in'}));
  const derive = (registry: WorkerRegistry, workerId: string, runId: string) => deriveRuntimeActionIntent({runId, stepId: 'inspect', actor: 'operator', action: 'system.inspect@1.0.0', goal: 'Inspect registered state', parameters: {}, requestedCapabilities: ['system.inspect'], resources: [], workerId, workerIdentity: registry.executionIdentity(workerId), effectDeclaration: {mode: 'READ_ONLY'}});
  const policy = new RuntimeSafetySupervisor({id: 'locality-policy', approvedRemoteNodes: ['remote-node']});

  const internal = derive(configured, 'agent-control:internal-reader', 'internal');
  assert.deepEqual(internal.categories, ['READ_ONLY']);
  assert.deepEqual(internal.remoteNodeIds, []);
  assert.equal(policy.assess(internal).outcome, 'ALLOW');

  const local = derive(configured, 'local-helper', 'local');
  assert.deepEqual(local.categories, ['READ_ONLY']);
  assert.equal(policy.assess(local).outcome, 'ALLOW');

  const remote = derive(configured, 'remote-node', 'remote');
  assert.deepEqual(remote.categories, ['REMOTE_NODE']);
  assert.deepEqual(remote.remoteNodeIds, ['remote-node']);
  assert.equal(policy.assess(remote).outcome, 'ALLOW_WITH_AUDIT');

  const remoteDenied = new RuntimeSafetySupervisor({id: 'deny-remote', approvedRemoteNodes: ['different-node']}).assess({...remote, runId: 'remote-denied'});
  assert.equal(remoteDenied.outcome, 'DENY');
  assert.match(remoteDenied.reason, /outside configured scope/);

  const spoofed = derive(unverified, 'controller', 'spoofed');
  assert.deepEqual(spoofed.categories, ['UNKNOWN']);
  assert.equal(policy.assess(spoofed).outcome, 'DENY');
  assert.equal(spoofed.workerIdentityAuthority, 'UNVERIFIED');
});

test('supported pre-4.5 configuration upgrades without reset and completes the governed observation job', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-v4.1-upgrade-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const config = loadConfig(path.resolve('src/control/fixtures/v4.1-existing-configuration.json'));
  const runtime = buildJobRuntime(config, root, path.join(root, 'no-extra-jobs'));

  assert.deepEqual(config.resources.map(item => item.id), ['local-observer', 'controller']);
  assert.equal(runtime.workers.executionIdentity(OPERATOR_OBSERVATION_WORKER_ID).locality, 'CONTROLLER_LOCAL');
  assert.equal(runtime.workers.executionIdentity(OPERATOR_OBSERVATION_WORKER_ID).nodeId, 'controller');

  const created = runtime.createRun('operator-system-observation@1.1.0', {}, {type: 'manual', actor: 'existing-configuration-upgrade-test'});
  for (let attempt = 0; attempt < 8 && runtime.ledger.get(created.id)?.status !== 'SUCCEEDED'; attempt++) await runtime.tick();
  const completed = runtime.ledger.get(created.id)!;
  assert.equal(completed.status, 'SUCCEEDED', JSON.stringify(completed, null, 2));
  assert.deepEqual(completed.steps.map(step => [step.id, step.status, step.placement?.selected]), [
    ['observe', 'SUCCEEDED', OPERATOR_OBSERVATION_WORKER_ID],
    ['verify', 'SUCCEEDED', OPERATOR_OBSERVATION_WORKER_ID],
  ]);
  assert.ok(runtime.safety?.list().every(decision => decision.outcome === 'ALLOW'));
  assert.ok(runtime.safety?.list().every(decision => decision.workerLocality === 'CONTROLLER_LOCAL'));
  assert.ok(runtime.safety?.list().every(decision => !decision.categories.includes('REMOTE_NODE')));
});

test('Estate discovery places the internal observer beneath the configured controller with consistent identity semantics', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-v4.1-estate-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const config = loadConfig(path.resolve('src/control/fixtures/v4.1-existing-configuration.json'));
  const runtime = buildJobRuntime(config, path.join(root, 'runtime'), path.join(root, 'no-extra-jobs'));
  const probe: DiscoveryProbe = {command: async () => ({ok: false, stdout: '', stderr: 'not-used'}), json: async () => ({ok: false, status: 0, body: null})};
  const discovery = new EnvironmentDiscoveryRuntime({
    file: path.join(root, 'inventory.json'), config: () => config, configurationRevision: () => 'v4.1-fixture', probe,
    adapters: [new ConfiguredResourceDiscoveryAdapter(), new AgentResourceDiscoveryAdapter()],
    runtimeInventory: () => ({
      jobs: runtime.catalog.listJobs().map(job => ({id: job.metadata.id, name: job.metadata.name, version: job.metadata.version})),
      agents: runtime.workers.list().map(item => ({id: item.id, health: item.health, capabilities: [...item.capabilities], executionIdentity: runtime.workers.executionIdentity(item.id)})),
      tools: [], skills: [], mcpServers: [], plugins: [],
    }),
  });
  const scan = await discovery.discover({mode: 'FULL_DISCOVERY', includeRemote: true});
  const observer = scan.items.find(item => item.kind === 'AGENT' && item.configuredId === OPERATOR_OBSERVATION_WORKER_ID)!;
  assert.equal(observer.nodeId, 'controller');
  assert.equal(observer.attributes.executionLocality, 'CONTROLLER_LOCAL');
  assert.equal(observer.attributes.identityAuthority, 'AGENT_CONTROL_INTERNAL');
  assert.equal(observer.attributes.controllerRelationship, 'CONTROLLER_INTERNAL');
  const estate = projectEstateMap(scan, scan.completedAt);
  const projectedObserver=estate.nodes.find(node=>node.id===observer.id)!;
  assert.ok(projectedObserver.parentId);
  assert.ok(estate.edges.some(edge=>edge.from===projectedObserver.parentId&&edge.to===observer.id&&edge.kind==='contains'));
  assert.ok(projectedObserver.parentId==='machine:controller'||estate.edges.some(edge=>edge.from==='machine:controller'&&edge.to===projectedObserver.parentId&&edge.kind==='contains'));
  assert.equal(estate.nodes.find(node => node.id === observer.id)?.detail.executionLocality, 'CONTROLLER_LOCAL');
  assert.equal(JSON.stringify(estate).includes('remote estate node'), false);
  assert.deepEqual(runtime.workers.executionIdentity('local-observer'), {workerId: 'local-observer', nodeId: 'local-observer', locality: 'LOCAL_WORKER', authority: 'CONFIGURED_RESOURCE', controllerRelationship: 'CONTROLLER_HOST_RESOURCE'});
});
