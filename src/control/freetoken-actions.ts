import {execFile} from 'node:child_process';
import fs from 'node:fs';
import {promisify} from 'node:util';
import {ActionFailure, type ActionRegistry} from './job-runtime.js';

const execute = promisify(execFile);
async function command(file: string, args: string[]) { try { const result = await execute(file, args, {timeout: 10_000, maxBuffer: 1024 * 1024}); return result.stdout.trim(); } catch (error) { return `UNAVAILABLE:${error instanceof Error ? error.message : String(error)}`; } }
function modelRoot() { const value = String(process.env.AGENT_CONTROL_FREETOKEN_MODEL_ROOT ?? ''); if (!value.startsWith('/')) throw new ActionFailure('freetoken_model_root_not_configured', 'configuration'); return value; }
async function inventory(parameters: Record<string, unknown>) {
  const root = modelRoot();
  const gpu = await command('nvidia-smi', ['--query-gpu=name,memory.total,memory.used,memory.free,driver_version', '--format=csv,noheader,nounits']);
  const services = await command('systemctl', ['--user', '--no-pager', '--type=service', '--state=running']);
  const ports = await command('ss', ['-ltn']);
  const assets = fs.existsSync(root) ? fs.readdirSync(root).filter(name => !name.startsWith('.')).map(name => ({name, bytes: fs.statSync(`${root}/${name}`).size})) : [];
  return {observedAt: new Date().toISOString(), gpu, protectedServices: services.split('\n').filter(line => /llama|agent-control|qwen/i.test(line)).map(line => line.trim()), protectedPorts: ports.split('\n').filter(line => /:(?:8080|8081)\b/.test(line)).map(line => line.trim()), modelRoot: root, assets};
}

export function registerFreeTokenQualificationActions(actions: ActionRegistry) {
  actions.registerReadOnly('qualification.freetoken.inventory@1.0.0', async context => ({artifacts: [{name: 'inventory', value: await inventory(context.parameters)}], verification: ['freetoken-inventory-v1'], detail: 'Read-only GPU, service, port and existing-model inventory'}));
  actions.registerReadOnly('qualification.freetoken.gate@1.0.0', async context => {
    const result = await inventory(context.parameters), fields = result.gpu.split(',').map(value => value.trim()), freeMiB = Number(fields[3]), requiredMiB = Number(context.parameters.minimumFreeVramMiB ?? 8192), compatible = result.assets.some(asset => /(?:\.safetensors|\.ftw)$/i.test(asset.name));
    if (!Number.isFinite(freeMiB) || freeMiB < requiredMiB) throw new ActionFailure(`freetoken_capacity_gate_failed:free_vram_mib=${Number.isFinite(freeMiB) ? freeMiB : 'unknown'}:required=${requiredMiB}`, 'policy_rejection');
    if (!compatible) throw new ActionFailure('freetoken_asset_gate_failed:qwen_requires_hf_or_ftw_checkpoint:existing_assets_are_not_compatible', 'configuration');
    return {artifacts: [{name: 'gate', value: {...result, freeMiB, compatibleCheckpoint: true}}], verification: ['freetoken-capacity-safe', 'freetoken-compatible-checkpoint'], detail: 'Compatibility and workload gate passed'};
  });
  const unavailable = (stage: string) => async () => { throw new ActionFailure(`freetoken_${stage}_requires_successful_readiness_gate_and_isolated_runner`, 'policy_rejection'); };
  actions.registerReadOnly('qualification.freetoken.isolated@1.0.0', unavailable('isolated'));
  actions.registerReadOnly('qualification.freetoken.benchmark@1.0.0', unavailable('benchmark'));
  actions.registerReadOnly('qualification.freetoken.provider@1.0.0', unavailable('provider'));
  return actions;
}
