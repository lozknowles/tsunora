import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import type {ExecutionResourceSample, ExecutionResourceSummary} from './resource-telemetry.js';

export interface ProcessIdentity {pid: number; identityToken: string;}
export interface CommandObservation {status: number | null; stdout: string;}
export type CommandSampler = (command: string, args: string[]) => CommandObservation;

const defaultCommandSampler: CommandSampler = (command, args) => {
  const result = spawnSync(command, args, {encoding: 'utf8', timeout: 4_000});
  return {status: result.status, stdout: String(result.stdout ?? '')};
};

export function linuxProcessIdentity(pid: number, procRoot = '/proc'): ProcessIdentity {
  const stat = fs.readFileSync(`${procRoot}/${pid}/stat`, 'utf8');
  return {pid, identityToken: stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]};
}

export function parseNvidiaProcessCsv(text: string, pid: number): number | null {
  let totalMiB = 0, found = false;
  for (const line of text.trim().split(/\r?\n/)) {
    const [rawPid = '', rawMiB = ''] = line.split(',').map(value => value.trim());
    if (Number(rawPid) !== pid) continue;
    const value = Number(rawMiB.replace(/\s*MiB$/i, ''));
    if (Number.isFinite(value)) { totalMiB += value; found = true; }
  }
  return found ? totalMiB * 1024 * 1024 : null;
}

export class LinuxNvidiaProcessResourceAdapter {
  constructor(readonly procRoot = '/proc', readonly command: CommandSampler = defaultCommandSampler) {}
  identity(pid: number) { return linuxProcessIdentity(pid, this.procRoot); }
  sample(identity: ProcessIdentity, startedMs: number): ExecutionResourceSample {
    const observedAt = new Date().toISOString(), elapsedMs = Date.now() - startedMs;
    let state: ExecutionResourceSample['process']['state'] = 'absent', rssBytes: number | null = null, peakRssBytes: number | null = null;
    try {
      const current = this.identity(identity.pid);
      state = current.identityToken === identity.identityToken ? 'same' : 'reused';
      if (state === 'same') {
        const status = fs.readFileSync(`${this.procRoot}/${identity.pid}/status`, 'utf8');
        const rss = Number(status.match(/^VmRSS:\s+(\d+)\s+kB$/m)?.[1]);
        const peak = Number(status.match(/^VmHWM:\s+(\d+)\s+kB$/m)?.[1]);
        rssBytes = Number.isFinite(rss) ? rss * 1024 : null;
        peakRssBytes = Number.isFinite(peak) ? peak * 1024 : null;
      }
    } catch { /* An absent process is retained as unknown, never coerced to zero. */ }
    const applications = this.command('nvidia-smi', ['--query-compute-apps=pid,used_memory', '--format=csv,noheader,nounits']);
    const device = this.command('nvidia-smi', ['--query-gpu=memory.used,utilization.gpu', '--format=csv,noheader,nounits']);
    const [deviceMiB, utilization] = device.stdout.trim().split(',').map(value => Number(value.trim()));
    const limitations = ['accelerator_process_memory_is_device_allocation_not_resident_working_set', 'host_rss_includes_mapped_runtime_and_allocator_state'];
    if (applications.status !== 0) limitations.push('process_accelerator_attribution_unavailable');
    if (device.status !== 0) limitations.push('device_accelerator_counters_unavailable');
    return {
      observedAt, elapsedMs,
      process: {pid: identity.pid, identityToken: identity.identityToken, state, rssBytes, peakRssBytes},
      accelerator: {
        processBytes: applications.status === 0 ? parseNvidiaProcessCsv(applications.stdout, identity.pid) : null,
        deviceUsedBytes: device.status === 0 && Number.isFinite(deviceMiB) ? deviceMiB * 1024 * 1024 : null,
        utilizationPercent: device.status === 0 && Number.isFinite(utilization) ? utilization : null,
        source: 'linux-procfs+nvidia-smi', limitations,
      },
    };
  }
}

export function summarizeExecutionResources(samples: ExecutionResourceSample[], samplingIntervalMs: number, baseline?: ExecutionResourceSample): ExecutionResourceSummary {
  if (!Number.isFinite(samplingIntervalMs) || samplingIntervalMs <= 0) throw new Error('execution_resource_sampling_interval_invalid');
  const attributed = samples.filter(sample => sample.process.state === 'same');
  const maximum = (values: Array<number | null>) => { const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)); return finite.length ? Math.max(...finite) : null; };
  const peakRamBytes = maximum(attributed.flatMap(sample => [sample.process.rssBytes, sample.process.peakRssBytes]));
  const peakVramBytes = maximum(attributed.map(sample => sample.accelerator.processBytes));
  const devicePeakVramBytes = maximum(samples.map(sample => sample.accelerator.deviceUsedBytes));
  const limitations = [...new Set(samples.flatMap(sample => sample.accelerator.limitations))];
  if (peakVramBytes === null && devicePeakVramBytes !== null) limitations.push('device_vram_not_attributed_to_process');
  return {
    cpuMs: null, gpuMs: null, peakRamBytes, peakVramBytes, energyWh: null,
    authority: peakRamBytes !== null || peakVramBytes !== null ? 'MEASURED' : 'UNAVAILABLE',
    sampleCount: samples.length, attributedSampleCount: attributed.length, samplingIntervalMs,
    baseline: {
      ramBytes: baseline?.process.state === 'same' ? baseline.process.rssBytes : null,
      processVramBytes: baseline?.process.state === 'same' ? baseline.accelerator.processBytes : null,
      deviceVramBytes: baseline?.accelerator.deviceUsedBytes ?? null,
    },
    devicePeakVramBytes,
    source: 'linux-procfs+nvidia-smi',
    limitations: [...new Set(limitations)],
  };
}
