import assert from 'node:assert/strict';
import test from 'node:test';
import type {ResourceConfig} from './config.js';
import {SshManagedNodeTransport, type SshExecutor} from './managed-node-ssh.js';

const resource: ResourceConfig = {id: 'remote-one', platform: 'linux', transport: {type: 'ssh', host: 'remote-one.example', user: 'operator', port: 2202, identityFile: '/keys/managed-node'}, capabilities: [], managedNode: {enabled: true}};
const encoded = (key: string, value: string) => `${key}\t${Buffer.from(value).toString('base64')}`;
const probeOutput = [encoded('protocol', 'agent-control.managed-node-probe/v1'), encoded('hostname', 'remote-one'), encoded('cpu_logical', '2'), encoded('probe_complete', 'true')].join('\n');

test('SSH probe streams one fixed read-only script without a shell command escape hatch', async () => {
  let call: {command: string; args: string[]; input: string} | undefined;
  const execute: SshExecutor = async (command, args, input) => { call = {command, args, input}; return {status: 0, stdout: probeOutput, stderr: ''}; };
  const transport = new SshManagedNodeTransport(execute, {probe: '# fixed probe', action: '# fixed action'});
  const observation = await transport.probe(resource, '2026-08-26T08:00:00.000Z');
  assert.equal(observation.hostname, 'remote-one'); assert.equal(call?.command, 'ssh'); assert.ok(call?.args.includes('BatchMode=yes')); assert.ok(call?.args.includes('ClearAllForwardings=yes')); assert.deepEqual(call?.args.slice(-3), ['operator@remote-one.example', 'sh', '-s']); assert.equal(call?.input, '# fixed probe'); assert.equal(call?.args.includes('-c'), false);
});

test('typed action transport passes only validated operation fields to the fixed action script', async () => {
  let args: string[] = [], input = '';
  const execute: SshExecutor = async (_command, received, script) => { args = received; input = script; return {status: 0, stdout: 'ok\n', stderr: ''}; };
  const transport = new SshManagedNodeTransport(execute, {probe: '# fixed probe', action: '# fixed action'});
  const result = await transport.execute(resource, {operation: 'service.status', target: 'example.service'});
  assert.equal(result.exitCode, 0); assert.deepEqual(args.slice(-7), ['operator@remote-one.example', 'sh', '-s', '--', 'service.status', 'example.service', '__none__']); assert.equal(input, '# fixed action');
});


test('SSH probe deadline is explicit and bounded for slower execution environments', async () => {
  const deadlines: number[] = [];
  const execute: SshExecutor = async (_command, _args, _input, options) => {deadlines.push(options.timeoutMs); return {status: 0, stdout: probeOutput, stderr: ''};};
  const transport = new SshManagedNodeTransport(execute);
  await transport.probe(resource, new Date().toISOString());
  await transport.probe({...resource, managedNode: {probeTimeoutSeconds: 90}}, new Date().toISOString());
  assert.deepEqual(deadlines, [20000, 90000]);
  for (const value of [0, -1, 121, 1.5, NaN, Infinity]) {
    await assert.rejects(transport.probe({...resource, managedNode: {probeTimeoutSeconds: value}}, new Date().toISOString()), /timeout_invalid/);
  }
  assert.equal(deadlines.length, 2);
});

test('SSH probe failures retain timeout authentication transport command and capability distinctions', async () => {
  const cases = [
    [{status:255,stdout:'',stderr:'Permission denied (publickey).'}, 'AUTHENTICATION'],
    [{status:255,stdout:'',stderr:'connect to host example port 22: Connection refused'}, 'TRANSPORT'],
    [{status:127,stdout:'',stderr:'sh: not found'}, 'CAPABILITY_ABSENCE'],
    [{status:2,stdout:'',stderr:'probe command failed'}, 'COMMAND'],
    [{status:255,stdout:'',stderr:'',timedOut:true}, 'TIMEOUT'],
  ] as const;
  for (const [result, classification] of cases) {
    const execute: SshExecutor = async () => result;
    const transport = new SshManagedNodeTransport(execute);
    await assert.rejects(transport.probe(resource, new Date().toISOString()), error => (error as {classification?:string}).classification === classification);
  }
});
