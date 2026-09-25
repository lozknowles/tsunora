import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const existingState = process.env.AGENT_CONTROL_STATE_DIR?.trim();
const existingTelemetry = process.env.AGENT_CONTROL_TELEMETRY_DIR?.trim();
if (!existingState || !existingTelemetry) {
  const prefix = path.join(os.tmpdir(), 'agent-control-test-state-');
  const root = fs.mkdtempSync(prefix);
  if (!existingState) process.env.AGENT_CONTROL_STATE_DIR = path.join(root, 'state');
  if (!existingTelemetry) process.env.AGENT_CONTROL_TELEMETRY_DIR = path.join(root, 'telemetry');
  process.once('exit', () => {
    if (root.startsWith(prefix)) fs.rmSync(root, {recursive: true, force: true});
  });
}
