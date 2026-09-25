import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {formatAuthoritativeStatus, readAuthoritativeStatus, resolveStatusTarget, STATUS_CLIENT_SCHEMA, STATUS_SCHEMA, statusExitCode} from './status-client.mjs';

const snapshot = (health = 'healthy') => ({
  schema: STATUS_SCHEMA,
  authority: 'AgentControlService',
  version: '3.1.0-test', health, paused: false,
  scheduler: {nextLaneId: 1, waiting: 1, active: 0, paused: 0},
  lanes: [{id: 1, name: 'Primary', priority: 7, status: 'waiting', task: 'safe task'}],
  providers: [{id: 'provider', name: 'Provider', health: 'healthy', capabilities: ['text']}],
  resources: [
    {id: 'controller', name: 'Controller', platform: 'linux', transport: 'local', capabilities: ['control-plane'], health: 'healthy', capacity: 2, active: 1, observedAt: '2026-08-26T00:00:00.000Z'},
    {id: 'managed-a', name: 'Managed A', platform: 'linux', transport: 'ssh', capabilities: ['managed-node.inspect', 'transport.secure-overlay'], health: 'healthy', observedAt: '2026-08-26T00:00:00.000Z', node: {state: 'IDLE', lastHeartbeatAt: '2026-08-26T00:00:00.000Z', uptimeSeconds: 90061, cpu: {load: {one: .1, five: .2, fifteen: .3}}, memory: {totalBytes: 8_000_000_000, availableBytes: 6_000_000_000}, storage: [{mount: '/', availableBytes: 50_000_000_000, usedPercent: 50}], currentWorkload: null, maintenance: {state: 'APPROVAL_REQUIRED'}, connectivity: [{label: 'Private overlay', state: 'RUNNING'}]}},
  ],
  outstandingApprovals: 2, lastRestorePoint: null, observedAt: '2026-08-26T00:00:00.000Z',
  jobs: {total: 3, enabled: 2, queued: 1, running: 1, failed: 0, succeeded: 1, schedulesEnabled: 1},
});

const missingConfigEnvironment = root => ({...process.env, AGENT_CONTROL_STATUS_CONFIG: path.join(root, 'missing.json')});

test('controller-local status returns the exact dashboard projection', async t => {
  const value = snapshot();
  const server = http.createServer((_request, response) => { response.writeHead(200, {'Content-Type': 'application/json'}); response.end(JSON.stringify(value)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const result = await readAuthoritativeStatus({environment: {...missingConfigEnvironment(os.tmpdir()), AGENT_CONTROL_STATUS_URL: `http://127.0.0.1:${address.port}/api/status`}});
  assert.deepEqual(result.snapshot, value);
  assert.equal(result.source.transport, 'http');
});

test('remote status uses one fixed SSH localhost request and does not expose the dashboard listener', async () => {
  const value = snapshot();
  let invocation;
  const execute = (command, args, options) => {
    invocation = {command, args, options};
    return {status: 0, stdout: JSON.stringify(value), stderr: ''};
  };
  const result = await readAuthoritativeStatus({environment: {...missingConfigEnvironment(os.tmpdir()), AGENT_CONTROL_STATUS_SSH_HOST: 'controller.tailnet'}, execute});
  assert.deepEqual(result.snapshot, value);
  assert.equal(invocation.command, 'ssh');
  assert.deepEqual(invocation.args.slice(-7), ['controller.tailnet', 'curl', '-fsS', '--max-time', '5', '--', 'http://127.0.0.1:4310/api/status']);
  assert.equal(invocation.options.input, undefined);
  assert.ok(invocation.args.includes('PasswordAuthentication=no'));
});

test('node-scoped client configuration makes the command independent of cwd', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-status-config-')), file = path.join(root, 'client.json');
  fs.writeFileSync(file, JSON.stringify({schema: STATUS_CLIENT_SCHEMA, controller: {transport: 'ssh', host: 'controller.tailnet', user: 'operator', port: 2222, statusPort: 4311}}));
  const target = resolveStatusTarget({environment: {...process.env, AGENT_CONTROL_STATUS_CONFIG: file}, homeDirectory: root});
  assert.equal(target.transport, 'ssh');
  assert.equal(target.host, 'controller.tailnet');
  assert.equal(target.port, 2222);
  assert.equal(target.statusPort, 4311);
  assert.equal(target.configuredBy, file);
});

test('client configuration refuses stored credentials and non-local SSH status targets', () => {
  const load = controller => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-status-reject-')), file = path.join(root, 'client.json');
    fs.writeFileSync(file, JSON.stringify({schema: STATUS_CLIENT_SCHEMA, controller}));
    return () => resolveStatusTarget({environment: {...process.env, AGENT_CONTROL_STATUS_CONFIG: file}, homeDirectory: root});
  };
  assert.throws(load({transport: 'http', url: 'http://localhost:4310', token: 'forbidden'}), /secret material is forbidden/);
  assert.throws(load({transport: 'http', url: 'http://controller.tailnet:4310'}), /must remain loopback-local/);
  assert.throws(load({transport: 'ssh', host: 'controller.tailnet', statusHost: 'worker.tailnet'}), /must remain controller-local/);
});

test('human output reflects dashboard scheduler, lanes, providers, resources and jobs', () => {
  const output = formatAuthoritativeStatus(snapshot(), {transport: 'ssh', controller: 'controller.tailnet'});
  for (const expected of ['AGENT CONTROL 3.1.0-test  HEALTHY', 'Scheduler ACTIVE', 'Jobs total 3', 'Primary', 'Provider', 'Controller', 'Managed A', 'heartbeat 2026-08-26', 'workload none', 'Private overlay:RUNNING', 'Approvals 2']) assert.match(output, new RegExp(expected));
  assert.equal(statusExitCode(snapshot()), 0);
  assert.equal(statusExitCode(snapshot('degraded')), 1);
});
