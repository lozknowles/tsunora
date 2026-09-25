import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PassThrough} from 'node:stream';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {createAdbLocal, createFileAttemptStore, createMemoryAttemptStore, createRawMdnsQuery, parseDevices, parseMdnsServices, parseRawMdnsServices, readPairingCode} from './adb-local.mjs';

const service = (endpoint, name = 'adb-device-one') => ({endpoint, name});
const mdns = (pairing = [], connect = []) => [
  'List of discovered mdns services',
  ...pairing.map(value => `${value.name} _adb-tls-pairing._tcp ${value.endpoint}`),
  ...connect.map(value => `${value.name} _adb-tls-connect._tcp ${value.endpoint}`),
].join('\n');
const devices = entries => ['List of devices attached', ...entries.map(([serial, state = 'device']) => `${serial}\t${state} product:test model:test`), ''].join('\n');

function fixture({available = true, pairing = [], connect = [], connected = [], pairCode = 0, connectCodes = [0], rotateTo, leak, attemptState = createMemoryAttemptStore(), nativeMdnsCode = 0, rawServices = [], targetSerial = 'device-one'} = {}) {
  const calls = [];
  let endpoints = [...connect], current = [...connected], connects = 0, pairs = 0, discoveries = 0;
  const run = async (_command, args, options = {}) => {
    calls.push({args: [...args], input: options.input});
    if (args[0] === 'version') return available ? {code: 0, stdout: 'Android Debug Bridge version 1.0.41\n', stderr: ''} : {code: 127, stdout: '', stderr: 'missing'};
    if (args[0] === 'mdns') return {code: nativeMdnsCode, stdout: nativeMdnsCode ? '' : mdns(pairing, endpoints), stderr: nativeMdnsCode ? 'unsupported' : ''};
    if (args[0] === 'devices') return {code: 0, stdout: devices(current), stderr: ''};
    if (args[0] === '-s' && args[2] === 'get-state') {
      const found = current.find(([endpoint, state = 'device']) => endpoint === args[1] && state === 'device');
      return found ? {code: 0, stdout: 'device\n', stderr: ''} : {code: 1, stdout: '', stderr: 'not connected'};
    }
    if (args[0] === '-s' && args[2] === 'shell' && args[3] === 'getprop') {
      const values = {'ro.product.manufacturer': 'Fixture', 'ro.product.model': 'Fixture Phone', 'ro.product.device': 'fixture', 'ro.build.version.release': '17', 'ro.build.version.sdk': '37', 'ro.serialno': targetSerial};
      const value = values[args[4]];
      return value ? {code: 0, stdout: `${value}\n`, stderr: ''} : {code: 1, stdout: '', stderr: 'property unavailable'};
    }
    if (args[0] === 'pair') { pairs++; return {code: pairCode, stdout: pairCode ? '' : `Successfully paired ${leak ?? ''}`, stderr: pairCode ? `failed ${leak ?? ''}` : ''}; }
    if (args[0] === 'connect') {
      connects++;
      const code = connectCodes[Math.min(connects - 1, connectCodes.length - 1)] ?? 0;
      if (rotateTo && connects === 1) endpoints = [rotateTo];
      if (code === 0) current = [[args[1], 'device']];
      return {code, stdout: code ? '' : 'connected', stderr: code ? 'failed' : ''};
    }
    throw new Error(`unexpected:${args.join(' ')}`);
  };
  const discoverServices = async () => { discoveries++; return {available: true, services: rawServices, reason: null}; };
  return {helper: createAdbLocal({run, wait: async () => {}, attempts: 2, localAddresses: ['192.0.2.2'], attemptState, discoverServices}), calls, counts: () => ({connects, pairs}), discoveries: () => discoveries, attemptState};
}

function dnsName(name) { return Buffer.concat([...name.split('.').map(label => Buffer.concat([Buffer.from([Buffer.byteLength(label)]), Buffer.from(label)])), Buffer.from([0])]); }
function dnsRecord(name, type, data) { const header = Buffer.alloc(10); header.writeUInt16BE(type, 0); header.writeUInt16BE(1, 2); header.writeUInt32BE(120, 4); header.writeUInt16BE(data.length, 8); return Buffer.concat([dnsName(name), header, data]); }
function rawMdnsPacket() {
  const type = '_adb-tls-connect._tcp.local', instance = `adb-device-one.${type}`, host = 'android-device.local', srv = Buffer.alloc(6); srv.writeUInt16BE(45231, 4);
  const records = [dnsRecord(type, 12, dnsName(instance)), dnsRecord(instance, 33, Buffer.concat([srv, dnsName(host)])), dnsRecord(host, 1, Buffer.from([192, 0, 2, 2]))], header = Buffer.alloc(12); header.writeUInt16BE(0x8400, 2); header.writeUInt16BE(records.length, 6);
  return Buffer.concat([header, ...records]);
}

test('parses pairing/connect services with a stable service identity and connected devices', () => {
  const parsed = parseMdnsServices(mdns([service('192.0.2.2:37101', 'adb-device-one-QXjCrW')], [service('192.0.2.2:37102', 'adb-device-one-TnSdi9')]));
  assert.deepEqual(parsed.map(value => value.type), ['_adb-tls-pairing._tcp', '_adb-tls-connect._tcp']);
  assert.equal(parsed[0].deviceIdentity, parsed[1].deviceIdentity);
  assert.equal(parsed[0].deviceIdentity, 'adb-device-one');
  assert.equal(parseDevices(devices([['192.0.2.2:37102']]))[0].state, 'device');
});

test('direct DNS-SD fallback parses PTR, SRV and local A records without setting the QU bit', () => {
  const query = createRawMdnsQuery(), marker = Buffer.from([0, 12, 0, 1]);
  assert.notEqual(query.indexOf(marker), -1);
  assert.notEqual(query.indexOf(marker, query.indexOf(marker) + marker.length), -1);
  assert.equal(query.indexOf(Buffer.from([0, 12, 0, 0x81])), -1);
  assert.deepEqual(parseRawMdnsServices([{packet: rawMdnsPacket(), remoteAddress: '192.0.2.2'}], ['192.0.2.2']), [{type: '_adb-tls-connect._tcp', endpoint: '192.0.2.2:45231', name: 'adb-device-one', deviceIdentity: 'adb-device-one'}]);
  assert.deepEqual(parseRawMdnsServices([{packet: rawMdnsPacket(), remoteAddress: '192.0.2.2'}], ['198.51.100.7']), []);
});

test('native ADB discovery remains preferred and unsupported builds use direct DNS-SD', async () => {
  const native = fixture({connect: [service('192.0.2.2:45231')]}), direct = fixture({nativeMdnsCode: 1, rawServices: [{...service('192.0.2.2:45231'), type: '_adb-tls-connect._tcp', deviceIdentity: 'adb-device-one'}]});
  assert.equal((await native.helper.status()).adb.discoverySource, 'adb-mdns');
  assert.equal(native.discoveries(), 0);
  const fallback = await direct.helper.status();
  assert.equal(fallback.adb.discoverySource, 'direct-mdns');
  assert.equal(fallback.discovery.connect[0].endpoint, '192.0.2.2:45231');
  assert.equal(direct.discoveries(), 1);
});

test('adb unavailable and absent discovery remain explicit', async () => {
  assert.equal((await fixture({available: false}).helper.status()).state, 'adb-unavailable');
  assert.equal((await fixture().helper.discover()).state, 'undiscovered');
});

test('pairing and connection services are distinct and ports are never assumed', async () => {
  assert.equal((await fixture({pairing: [service('192.0.2.2:37101')]}).helper.status()).state, 'pairing-required');
  const value = await fixture({connect: [service('192.0.2.2:45231')]}).helper.status();
  assert.equal(value.state, 'disconnected');
  assert.equal(value.discovery.connect[0].endpoint, '192.0.2.2:45231');
});

test('non-local and ambiguous services are never selected', async () => {
  const nonLocal = fixture({connect: [service('198.51.100.7:45231')]});
  assert.equal((await nonLocal.helper.ensureConnected()).reason, 'connect-unavailable');
  assert.equal(nonLocal.counts().connects, 0);
  const ambiguous = fixture({connect: [service('192.0.2.2:40001', 'adb-one'), service('192.0.2.2:40002', 'adb-two')]});
  assert.equal((await ambiguous.helper.ensureConnected()).reason, 'ambiguous-device-services');
  assert.equal(ambiguous.counts().connects, 0);
});

test('an already connected endpoint is verified idempotently with target get-state', async () => {
  const value = fixture({connect: [service('192.0.2.2:45231')], connected: [['192.0.2.2:45231']]});
  const result = await value.helper.ensureConnected();
  assert.equal(result.action, 'already-connected');
  assert.equal(result.verification.qualified, true);
  assert.equal(result.verification.target.model, 'Fixture Phone');
  assert.match(result.verification.target.serialSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.paired, false);
  assert.equal(value.attemptState.current().pairingSucceeded, false);
  assert.ok(value.calls.some(call => call.args.join(' ') === '-s 192.0.2.2:45231 get-state'));
  assert.deepEqual(value.counts(), {connects: 0, pairs: 0});
});

test('a reachable ADB endpoint whose fixed properties do not match the advertised service fails closed', async () => {
  const value = fixture({connect: [service('192.0.2.2:45231', 'adb-another-device')], connected: [['192.0.2.2:45231']], targetSerial: 'device-one'});
  const result = await value.helper.status();
  assert.equal(result.usableLocalDeviceConnected, false);
  assert.equal(result.verification.qualified, false);
  assert.equal(result.verification.reason, 'service-device-identity-mismatch');
});

test('changed connection endpoint is rediscovered only for the same service identity', async () => {
  const value = fixture({connect: [service('192.0.2.2:40001', 'adb-device-one-QXjCrW')], connectCodes: [1, 0], rotateTo: service('192.0.2.2:40002', 'adb-device-one-TnSdi9')});
  const result = await value.helper.ensureConnected();
  assert.equal(result.ok, true);
  assert.equal(result.connectionEndpoint, '192.0.2.2:40002');
  assert.equal(value.counts().connects, 2);
});

test('a changed endpoint with a different service identity fails closed', async () => {
  const value = fixture({connect: [service('192.0.2.2:40001', 'adb-intended')], connectCodes: [1, 0], rotateTo: service('192.0.2.2:40002', 'adb-unrelated')});
  const result = await value.helper.ensureConnected();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'matching-device-service-unavailable');
  assert.equal(value.counts().connects, 1);
});

test('invalid PIN is rejected before ADB or state mutation', async () => {
  const value = fixture({pairing: [service('192.0.2.2:37101')]});
  assert.equal((await value.helper.pair('12345')).reason, 'invalid-pairing-code');
  assert.equal(value.calls.length, 0);
  assert.equal(value.attemptState.current(), null);
});

test('successful pairing connects the matching endpoint and verifies usability', async () => {
  const value = fixture({pairing: [service('192.0.2.2:37101', 'adb-device-one-QXjCrW')], connect: [service('192.0.2.2:37102', 'adb-device-one-TnSdi9')]});
  const result = await value.helper.pair('123456');
  assert.equal(result.ok, true);
  assert.equal(result.paired, true);
  assert.equal(result.usableLocalDeviceConnected, true);
  assert.equal(result.verification.qualified, true);
  assert.deepEqual(value.counts(), {connects: 1, pairs: 1});
  assert.equal(JSON.stringify(value.attemptState.current()).includes('123456'), false);
});

test('pair success without connection proof remains paired but unusable', async () => {
  const value = fixture({pairing: [service('192.0.2.2:37101')]});
  const result = await value.helper.pair('123456');
  assert.equal(result.paired, true);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'pair-succeeded-connect-failed');
  assert.equal(result.usableLocalDeviceConnected, false);
  assert.equal(value.attemptState.current().phase, 'paired-disconnected');
});

test('pairing code never appears in returned evidence, errors, or persisted attempt state', async () => {
  const value = fixture({pairing: [service('192.0.2.2:37101')], pairCode: 1, leak: '123456'});
  const result = await value.helper.pair('123456');
  assert.equal(JSON.stringify(result).includes('123456'), false);
  assert.equal(JSON.stringify(value.attemptState.current()).includes('123456'), false);
  const pair = value.calls.find(call => call.args[0] === 'pair');
  assert.equal(pair.args.includes('123456'), false);
  assert.equal(pair.input, '123456\n');
});

test('interactive pairing input disables terminal echo and never writes the PIN', async () => {
  const input = new PassThrough(), output = new PassThrough(), rawModes = [];
  input.isTTY = true; input.isRaw = false; input.setRawMode = value => { rawModes.push(value); input.isRaw = value; return input; };
  let displayed = ''; output.on('data', chunk => { displayed += chunk; });
  const pending = readPairingCode(input, output);
  input.write('123456\n');
  assert.equal(await pending, '123456');
  assert.deepEqual(rawModes, [true, false]);
  assert.equal(displayed, 'Pairing code: \n');
  assert.equal(displayed.includes('123456'), false);
});

test('active PIN entry owns the attempt lease and suppresses reconnect/discovery work', async () => {
  const attemptState = createMemoryAttemptStore(), first = fixture({pairing: [service('192.0.2.2:37101')], attemptState}), second = fixture({connect: [service('192.0.2.2:37102')], attemptState});
  const prepared = await first.helper.preparePairing();
  assert.equal(prepared.ready, true);
  assert.equal(attemptState.current().phase, 'awaiting-pin');
  const reconnect = await second.helper.ensureConnected();
  assert.equal(reconnect.state, 'attempt-active');
  assert.equal(reconnect.reason, 'pairing-attempt-in-progress');
  assert.equal(second.calls.length, 0);
  prepared.cancel();
});

test('a live PIN owner is not displaced merely because the stale-age threshold passes', async () => {
  let now = new Date('2026-09-05T10:00:00Z');
  const attemptState = createMemoryAttemptStore({clock: () => now, staleMs: 1}), first = fixture({pairing: [service('192.0.2.2:37101')], attemptState}), second = fixture({connect: [service('192.0.2.2:37102')], attemptState});
  const prepared = await first.helper.preparePairing();
  assert.equal(prepared.ready, true);
  now = new Date('2026-09-05T11:00:00Z');
  const reconnect = await second.helper.ensureConnected();
  assert.equal(reconnect.state, 'attempt-active');
  assert.equal(reconnect.reason, 'pairing-attempt-in-progress');
  prepared.cancel();
});

test('a dead stale owner is recovered without reusing its lease identity', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-adb-attempt-')), statePath = path.join(directory, 'state.json');
  try {
    fs.writeFileSync(statePath, JSON.stringify({schema: 'agent-control.android-adb-attempt/v1', active: true, kind: 'pairing', phase: 'awaiting-pin', startedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ownerId: 'dead-owner', ownerPid: 2147483647, ownerStartToken: '1'}));
    const store = createFileAttemptStore({statePath});
    const acquired = store.acquire('reconnect');
    assert.equal(acquired.ok, true);
    assert.equal(acquired.recoveredStaleAttempt, true);
    assert.notEqual(acquired.lease.ownerId, 'dead-owner');
    store.release(acquired.lease, {phase: 'idle'});
  } finally { fs.rmSync(directory, {recursive: true, force: true}); }
});

test('Android node exposes only fixed ADB status/reconnect operations and gates capabilities on verification', () => {
  const source = fs.readFileSync(new URL('./node-server.mjs', import.meta.url), 'utf8');
  assert.match(source, /android\.adb\.status/);
  assert.match(source, /android\.adb\.ensure-connected/);
  assert.match(source, /verification\?\.qualified/);
  assert.doesNotMatch(source, /android\.adb\.pair/);
  assert.doesNotMatch(source, /adbLocal\.(?:pair)|adb\s+shell/);
});

test('Android node supervises startup reconnect and boot never initiates pairing', () => {
  const node = fs.readFileSync(new URL('./node-server.mjs', import.meta.url), 'utf8');
  const boot = fs.readFileSync(new URL('./termux-boot-agent-control.sh', import.meta.url), 'utf8');
  assert.match(node, /adbLocal\.ensureConnected\(\)/);
  assert.match(node, /AGENT_CONTROL_ADB_STARTUP_RECONNECT/);
  assert.match(node, /adbLocal\.stop/);
  assert.doesNotMatch(`${node}\n${boot}`, /adbLocal\.pair|adb-local\.mjs pair|adb pair/);
});

test('legacy resource projection never advertises ADB transport from executable presence alone', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'adb-resource-agent-'));
  try {
    const bin = path.join(root, 'bin'); fs.mkdirSync(bin);
    const adb = path.join(bin, 'adb'), node = path.join(bin, 'node');
    fs.writeFileSync(adb, '#!/bin/sh\nexit 0\n', {mode: 0o700});
    fs.writeFileSync(node, '#!/bin/sh\nprintf \'%s\\n\' \'{"usableLocalDeviceConnected":false,"verification":{"qualified":false}}\'\n', {mode: 0o700});
    const script = fileURLToPath(new URL('./resource-agent.sh', import.meta.url));
    const unavailable = spawnSync('bash', [script], {encoding:'utf8', env:{...process.env, PATH:`${bin}:${process.env.PATH}`}});
    assert.equal(unavailable.status, 0, unavailable.stderr); assert.match(unavailable.stdout, /"adb":true/); assert.doesNotMatch(unavailable.stdout, /transport\.adb|android\.adb\.local/);
    fs.writeFileSync(node, '#!/bin/sh\nprintf \'%s\\n\' \'{"usableLocalDeviceConnected":true,"verification":{"qualified":true}}\'\n', {mode: 0o700});
    const qualified = spawnSync('bash', [script], {encoding:'utf8', env:{...process.env, PATH:`${bin}:${process.env.PATH}`}});
    assert.equal(qualified.status, 0, qualified.stderr); assert.match(qualified.stdout, /android\.adb\.local/); assert.match(qualified.stdout, /transport\.adb/);
  } finally { fs.rmSync(root, {recursive:true, force:true}); }
});
