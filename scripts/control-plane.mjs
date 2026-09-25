#!/usr/bin/env node
import {spawn, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadConfig, expandUserPath} from './config.mjs';
import {reconcileOwnedEntries} from './owned-processes.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function createControlPlane({environment = process.env, cwd = process.cwd(), execute = spawnSync, launch = spawn, fetchImpl = fetch} = {}) {
  const loaded = loadConfig({environment, cwd});
  const config = loaded.config;
  const stateDir = path.resolve(environment.AGENT_CONTROL_STATE_DIR || path.join(cwd, '.agent-control'));
  const runDir = path.join(stateDir, 'run');
  const manifestFile = path.join(runDir, 'owned-processes.json');
  fs.mkdirSync(runDir, {recursive: true});

  const owned = () => {
    try { return JSON.parse(fs.readFileSync(manifestFile, 'utf8')); }
    catch { return []; }
  };
  const save = items => fs.writeFileSync(manifestFile, `${JSON.stringify(items, null, 2)}\n`, {mode: 0o600});
  const reconcileOwned = () => {
    const entries = owned();
    const reconciled = reconcileOwnedEntries(entries, {
      isAlive: pid => { try { process.kill(pid, 0); return true; } catch { return false; } },
      terminate: pid => { try { process.kill(-pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch {} } },
    });
    if (reconciled.length !== entries.length) save(reconciled);
    return reconciled;
  };

  async function http(url, ms = 1500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      const response = await fetchImpl(url, {signal: controller.signal});
      return {ok: response.ok, status: response.status};
    } catch {
      return {ok: false};
    } finally {
      clearTimeout(timer);
    }
  }

  async function inspectService(service) {
    const health = await http(service.healthUrl);
    return {id: service.id, optional: service.optional === true, healthUrl: service.healthUrl, healthy: health.ok, httpStatus: health.status, state: health.ok ? 'READY' : 'UNAVAILABLE'};
  }

  function sshArgs(resource, command) {
    const transport = resource.transport;
    const args = ['-o', 'PasswordAuthentication=no', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5'];
    if (transport.identityFile) args.push('-i', expandUserPath(transport.identityFile, environment));
    if (transport.port) args.push('-p', String(transport.port));
    args.push(`${transport.user ? `${transport.user}@` : ''}${transport.host}`, command);
    return args;
  }

  async function inspectResource(resource) {
    if (resource.healthUrl) {
      const health = await http(resource.healthUrl);
      return {id: resource.id, platform: resource.platform, transport: resource.transport.type, state: health.ok ? 'READY' : 'UNAVAILABLE', healthy: health.ok, httpStatus: health.status};
    }
    if (resource.transport.type === 'local') return {id: resource.id, platform: resource.platform, transport: 'local', state: 'READY', healthy: true};
    if (resource.transport.type === 'ssh') {
      const result = execute('ssh', sshArgs(resource, 'echo AGENT-CONTROL-TRANSPORT-READY'), {encoding: 'utf8', timeout: 7000, env: environment});
      return {id: resource.id, platform: resource.platform, transport: 'ssh', state: result.status === 0 ? 'READY' : 'UNAVAILABLE', healthy: result.status === 0};
    }
    return {id: resource.id, platform: resource.platform, transport: resource.transport.type, state: 'CONFIGURED', healthy: true, detail: 'transport health is provider-managed'};
  }

  async function status() {
    const services = await Promise.all(config.services.map(inspectService));
    const resources = await Promise.all(config.resources.map(inspectResource));
    const requiredFailures = services.filter(item => !item.optional && !item.healthy).length;
    const configuredItems = services.length + resources.length + config.providers.length;
    const result = configuredItems === 0 ? 'UNCONFIGURED' : requiredFailures ? 'DEGRADED' : 'READY';
    return {
      schema: 'agent-control.bootstrap/v4',
      at: new Date().toISOString(),
      result,
      configured: loaded.configured,
      configFile: loaded.file,
      ready: `${services.filter(item => item.healthy).length + resources.filter(item => item.healthy).length}/${services.length + resources.length}`,
      services,
      resources,
      providers: config.providers.map(provider => ({id: provider.id, state: 'CONFIGURED'})),
      owned: reconcileOwned(),
    };
  }

  async function waitHealthy(service, tries = 20) {
    for (let i = 0; i < tries; i++) {
      if ((await inspectService(service)).healthy) return true;
      await sleep(250);
    }
    return false;
  }

  async function up() {
    const list = reconcileOwned(), actions = [];
    for (const service of config.services) {
      const current = await inspectService(service);
      if (current.healthy) { actions.push({id: service.id, action: 'reuse', status: 'healthy'}); continue; }
      if (!service.start) { actions.push({id: service.id, action: 'manual', status: service.optional ? 'optional-unavailable' : 'unavailable'}); continue; }
      if (service.start.type === 'systemd-user') {
        const result = execute('systemctl', ['--user', 'start', service.start.unit], {encoding: 'utf8', timeout: 15000, env: environment});
        actions.push({id: service.id, action: 'systemd-user-start', unit: service.start.unit, status: result.status === 0 && await waitHealthy(service) ? 'healthy-after-start' : 'failed'});
        continue;
      }
      const child = launch(service.start.command, service.start.args ?? [], {cwd, env: environment, detached: true, stdio: 'ignore'});
      const launched = await new Promise(resolve => {
        child.once('error', () => resolve(false));
        child.once('spawn', () => resolve(true));
      });
      if (!launched || !child.pid) {
        actions.push({id: service.id, action: 'configured-command-start', status: service.optional ? 'optional-unavailable' : 'failed', reason: 'command_launch_failed'});
        continue;
      }
      child.unref();
      list.push({id: service.id, pid: child.pid, startedAt: new Date().toISOString(), command: [service.start.command, ...(service.start.args ?? [])].join(' ')});
      save(list);
      actions.push({id: service.id, action: 'configured-command-start', status: await waitHealthy(service) ? 'healthy-after-start' : 'start-not-yet-healthy'});
    }
    return {actions, status: await status()};
  }

  async function down() {
    const list = reconcileOwned(), actions = [];
    for (const entry of list) {
      try { process.kill(-entry.pid, 'SIGTERM'); actions.push({id: entry.id, pid: entry.pid, action: 'stopped'}); }
      catch { actions.push({id: entry.id, pid: entry.pid, action: 'already-gone'}); }
    }
    save([]);
    return {actions, status: await status()};
  }

  return {config, loaded, status, up, down};
}

export async function main(argv = process.argv.slice(2)) {
  const mode = argv[0] || 'status';
  const plane = createControlPlane();
  const result = mode === 'up' ? await plane.up() : mode === 'down' ? await plane.down() : mode === 'status' ? await plane.status() : null;
  if (!result) { console.error('usage: control-plane.mjs up|status|down'); return 2; }
  console.log(JSON.stringify(result, null, 2));
  const summary = result.status ?? result;
  console.log(`RESULT ${summary.result} ${summary.ready}`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = await main();
}
