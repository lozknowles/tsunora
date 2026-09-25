import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {LinuxNvidiaProcessResourceAdapter, parseNvidiaProcessCsv, summarizeExecutionResources} from './execution-resource-sampler.js';

test('Linux/NVIDIA adapter attributes memory to an exact process identity', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-resource-sampler-'));
  try {
    fs.mkdirSync(path.join(root, '42'));
    fs.writeFileSync(path.join(root, '42', 'stat'), `42 (fixture process) S 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 777 20`);
    fs.writeFileSync(path.join(root, '42', 'status'), 'VmRSS:\t123 kB\nVmHWM:\t456 kB\n');
    const command = (_command: string, args: string[]) => args[0]?.includes('compute-apps') ? {status: 0, stdout: '42, 128\n11, 64\n42, 32\n'} : {status: 0, stdout: '512, 67\n'};
    const adapter = new LinuxNvidiaProcessResourceAdapter(root, command), identity = adapter.identity(42), baseline = adapter.sample(identity, Date.now()), sample = adapter.sample(identity, Date.now());
    assert.equal(parseNvidiaProcessCsv('42, 128\n42, 32\n', 42), 160 * 1024 * 1024);
    assert.equal(sample.process.rssBytes, 123 * 1024);
    assert.equal(sample.accelerator.processBytes, 160 * 1024 * 1024);
    const summary = summarizeExecutionResources([sample], 500, baseline);
    assert.equal(summary.peakRamBytes, 456 * 1024);
    assert.equal(summary.peakVramBytes, 160 * 1024 * 1024);
    assert.equal(summary.baseline.deviceVramBytes, 512 * 1024 * 1024);
    assert.equal(summary.authority, 'MEASURED');
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('PID reuse and device-only counters stay explicitly unattributed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-resource-reuse-'));
  try {
    fs.mkdirSync(path.join(root, '42'));
    fs.writeFileSync(path.join(root, '42', 'stat'), `42 (fixture) S 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 777 20`);
    fs.writeFileSync(path.join(root, '42', 'status'), 'VmRSS:\t123 kB\nVmHWM:\t456 kB\n');
    const adapter = new LinuxNvidiaProcessResourceAdapter(root, (_command, args) => args[0]?.includes('compute-apps') ? {status: 0, stdout: '11, 64\n'} : {status: 0, stdout: '512, 2\n'});
    const identity = adapter.identity(42);
    fs.writeFileSync(path.join(root, '42', 'stat'), `42 (fixture) S 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 778 20`);
    const sample = adapter.sample(identity, Date.now()), summary = summarizeExecutionResources([sample], 500);
    assert.equal(sample.process.state, 'reused');
    assert.equal(summary.peakRamBytes, null);
    assert.equal(summary.peakVramBytes, null);
    assert.equal(summary.authority, 'UNAVAILABLE');
    assert.ok(summary.limitations.includes('device_vram_not_attributed_to_process'));
    assert.throws(() => summarizeExecutionResources([sample], 0), /sampling_interval_invalid/);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});
