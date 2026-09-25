import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {loadConfig} from './config.mjs';

const results = [];
const traceId = randomUUID();
const {config, configured, file: configFile} = loadConfig();

function record(result) {
  results.push(result);
  console.log(`${result.ok ? 'PASS' : result.skipped ? 'SKIP' : 'FAIL'} ${result.name}`);
  return result;
}

function run(name, command, args = [], options = {}) {
  const started = Date.now();
  const result = spawnSync(command, args, {encoding: 'utf8', timeout: options.timeout ?? 120000, env: {...process.env, AGENT_CONTROL_QUALIFICATION_TRACE_ID: traceId}});
  const text = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  return record({name, ok: result.status === 0 && (!options.expect || options.expect.test(text)), status: result.status, signal: result.signal ?? null, ms: Date.now() - started, stdout: (result.stdout ?? '').slice(-8000), stderr: (result.stderr ?? '').slice(-4000)});
}

async function health(name, url) {
  const started = Date.now();
  try {
    const response = await fetch(url, {signal: AbortSignal.timeout(5000)});
    const body = await response.text();
    return record({name, ok: response.ok, httpStatus: response.status, ms: Date.now() - started, responseBody: body.slice(-8000)});
  } catch (error) {
    return record({name, ok: false, ms: Date.now() - started, error: error instanceof Error ? error.message : String(error)});
  }
}

run('local-release-gate', 'npm', ['run', 'check']);
if (!configured) record({name: 'configured-infrastructure', ok: false, skipped: true, reason: `no configuration file at ${configFile}`});
for (const service of config.services) await health(`service-${service.id}`, service.healthUrl);
for (const resource of config.resources) {
  if (resource.transport.type === 'local') record({name: `resource-${resource.id}`, ok: true, evidence: 'configured local resource'});
  else if (resource.healthUrl) await health(`resource-${resource.id}`, resource.healthUrl);
  else record({name: `resource-${resource.id}`, ok: false, skipped: true, reason: 'no non-mutating health URL configured'});
}
for (const provider of config.providers) {
  if (!provider.baseUrl) record({name: `provider-${provider.id}`, ok: false, skipped: true, reason: 'no base URL configured'});
  else await health(`provider-${provider.id}`, `${provider.baseUrl.replace(/\/v1\/?$/, '')}/health`);
}
for (const target of (process.env.AGENT_CONTROL_REMOTE_CHECKS ?? '').split(',').filter(Boolean)) {
  const [name, host, command] = target.split('|');
  run(`remote-${name}`, 'ssh', [host, command || 'echo AGENT-CONTROL-REMOTE-PASS'], {expect: /AGENT-CONTROL-REMOTE-PASS/, timeout: 30000});
}

fs.mkdirSync('qualification-results', {recursive: true});
const evidenceFile = `qualification-results/qualification-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
const failed = results.filter(result => !result.ok && !result.skipped);
fs.writeFileSync(evidenceFile, `${JSON.stringify({at: new Date().toISOString(), traceId, configFile, configured, results}, null, 2)}\n`);
console.log(`RESULT ${failed.length ? 'FAIL' : 'PASS'} passed=${results.filter(result => result.ok).length} failed=${failed.length} skipped=${results.filter(result => result.skipped).length} trace=${traceId} evidence=${evidenceFile}`);
if (failed.length) process.exitCode = 1;
