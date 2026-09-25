import assert from 'node:assert/strict';
import test from 'node:test';
import {ExecutionHostRegistry, hostsFromResources} from './hosts.js';

const arbitrary = hostsFromResources([
  {id: 'controller-a', name: 'Controller A', platform: 'linux', transport: {type: 'local'}, controller: true, capabilities: ['control-plane'], harnesses: ['codex']},
  {id: 'worker-foo', platform: 'linux', transport: {type: 'ssh', host: 'worker.example'}, capabilities: ['gpu'], harnesses: ['local-model']},
  {id: 'android-test', platform: 'android', transport: {type: 'ssh', host: 'android.example'}, capabilities: ['platform.android'], harnesses: []},
  {id: 'remote-bar', platform: 'remote', transport: {type: 'orca'}, capabilities: ['execution.remote'], harnesses: ['cli']},
]);

test('configured controller is selected by capability metadata rather than name', () => {
  const registry = new ExecutionHostRegistry();
  arbitrary.forEach(host => registry.register(host));
  assert.equal(registry.core()?.id, 'controller-a');
});

test('arbitrary remote resource exposes configured capability', () => {
  assert.deepEqual(arbitrary.find(host => host.id === 'worker-foo')?.capabilities, ['gpu']);
});

test('host harness requires health and declared harness', () => {
  const registry = new ExecutionHostRegistry();
  arbitrary.forEach(host => registry.register(host));
  assert.equal(registry.canRun('worker-foo', 'local-model'), false);
  registry.setHealth('worker-foo', 'healthy');
  assert.equal(registry.canRun('worker-foo', 'local-model'), true);
  assert.equal(registry.canRun('worker-foo', 'codex'), false);
});

test('fleet can mix local, SSH, Android and Orca transports without name semantics', () => {
  assert.deepEqual(arbitrary.map(host => host.transport), ['local', 'ssh', 'ssh', 'orca']);
});
