import http from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createAdbLocal} from './adb-local.mjs';

const exec = promisify(execFile);
const HOST = process.env.AGENT_CONTROL_NODE_HOST || '127.0.0.1';
const PORT = Number(process.env.AGENT_CONTROL_NODE_PORT || 8788);
const TOKEN = process.env.AGENT_CONTROL_NODE_TOKEN || '';
const RESOURCE_ID = process.env.AGENT_CONTROL_RESOURCE_ID || 'android-resource';
const VERSION = process.env.AGENT_CONTROL_VERSION || '3.9.0-dev';
const BASE_CAPABILITIES = ['platform.android', 'device.physical', 'harness.termux', 'harness.codex', 'observe.android.logcat', 'android.adb.status', 'android.adb.ensure-connected'];
const adbLocal = createAdbLocal();

function send(response, status, body) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(body));
}

function auth(request) { return TOKEN && request.headers.authorization === `Bearer ${TOKEN}`; }

async function props() {
  const keys = ['ro.product.manufacturer', 'ro.product.model', 'ro.product.device', 'ro.build.version.release', 'ro.build.version.sdk'];
  const output = {};
  for (const key of keys) {
    try { output[key] = (await exec('getprop', [key], {timeout: 2_000})).stdout.trim(); }
    catch { output[key] = ''; }
  }
  return output;
}

async function logs(lines) {
  const count = Math.max(1, Math.min(Number(lines) || 30, 200));
  const result = await exec('logcat', ['-d', '-t', String(count), '-v', 'threadtime'], {timeout: 5_000, maxBuffer: 1024 * 1024});
  return {count, output: result.stdout};
}

async function capabilities() {
  const status = await adbLocal.status();
  return [...BASE_CAPABILITIES, ...(status.usableLocalDeviceConnected && status.verification?.qualified ? ['android.adb.local', 'transport.adb'] : [])];
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') return send(response, 200, {status: 'ok', node: RESOURCE_ID, version: VERSION});
  if (request.method === 'GET' && request.url === '/v2/resource') {
    if (!auth(request)) return send(response, 401, {error: 'unauthorized'});
    return send(response, 200, {schema: 'agent-control.resource/v2', resource: {id: RESOURCE_ID, type: 'host', health: 'healthy', capabilities: (await capabilities()).map(id => ({id}))}});
  }
  if (request.method === 'POST' && request.url === '/v2/jobs') {
    if (!auth(request)) return send(response, 401, {error: 'unauthorized'});
    let raw = '';
    for await (const chunk of request) raw += chunk;
    let body;
    try { body = JSON.parse(raw || '{}'); }
    catch { return send(response, 400, {error: 'invalid_json'}); }
    const allowed = ['android.observe.logs', 'android.adb.status', 'android.adb.ensure-connected'];
    if (!allowed.includes(body.type)) return send(response, 403, {error: 'capability_not_authorized', allowed});
    try {
      if (body.type === 'android.observe.logs') {
        const evidence = await logs(body.lines);
        return send(response, 200, {status: 'completed', type: body.type, resource: RESOURCE_ID, device: await props(), evidence: {command: ['logcat', '-d', '-t', String(evidence.count), '-v', 'threadtime'], output: evidence.output}});
      }
      const evidence = body.type === 'android.adb.status' ? await adbLocal.status() : await adbLocal.ensureConnected();
      const qualified = evidence.usableLocalDeviceConnected && evidence.verification?.qualified;
      return send(response, 200, {status: qualified ? 'completed' : 'review-required', type: body.type, resource: RESOURCE_ID, device: await props(), evidence});
    } catch {
      return send(response, 500, {error: 'job_failed', message: 'android_adb_operation_failed'});
    }
  }
  return send(response, 404, {error: 'not_found'});
});

function stop() {
  adbLocal.stop('android-node-stopping');
  server.close(() => { process.exitCode = 0; });
}

process.once('SIGINT', stop);
process.once('SIGTERM', stop);
server.listen(PORT, HOST, () => console.log(`agent-control-node ${RESOURCE_ID} listening http://${HOST}:${PORT}`));
// Startup reconnection is bounded and owned by this node lifecycle. It never
// starts pairing, and stop() aborts any in-flight ADB child before shutdown.
// Qualification may defer it so an unpaired state is observed before the
// separate, human-approved local pairing ceremony.
if (process.env.AGENT_CONTROL_ADB_STARTUP_RECONNECT !== 'false') void adbLocal.ensureConnected().catch(() => undefined);
