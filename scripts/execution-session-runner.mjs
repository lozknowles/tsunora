#!/usr/bin/env node
import {spawn} from 'node:child_process';
import fs from 'node:fs';

const payloadPath = process.argv[2];
if (!payloadPath) throw new Error('execution_session_launch_payload_required');

let payload;
try {
  payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
} finally {
  // The owner-only launch record exists only long enough to cross the fixed
  // util-linux script boundary. It is not execution evidence.
  try { fs.unlinkSync(payloadPath); } catch { /* manager cleanup is the fallback */ }
}

if (!payload || typeof payload.command !== 'string' || !Array.isArray(payload.args) || payload.args.some(value => typeof value !== 'string') || typeof payload.cwd !== 'string') {
  throw new Error('execution_session_launch_payload_invalid');
}

const child = spawn(payload.command, payload.args, {cwd: payload.cwd, env: process.env, stdio: 'inherit', shell: false});
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => child.kill(signal));
child.once('error', error => { process.stderr.write(`execution_session_child_start_failed:${error.code ?? 'unknown'}\n`); process.exitCode = 127; });
child.once('exit', (code, signal) => {
  if (signal) { process.kill(process.pid, signal); return; }
  process.exitCode = code ?? 1;
});
