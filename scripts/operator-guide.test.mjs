import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync('docs/Agent-Control-3.1.0-Operator-Guide.md', 'utf8');
const releaseMarkdown = fs.readFileSync('assets/releases/3.1.0/Agent-Control-3.1.0-Operator-Guide.md', 'utf8');
const architecture = fs.readFileSync('ARCHITECTURE.md', 'utf8');
const pdf = fs.readFileSync('assets/releases/3.1.0/Agent-Control-3.1.0-Operator-Guide.pdf');
const pdfText = pdf.toString('latin1');
const windowsQualification = fs.readFileSync('scripts/qualify-openai-windows-harness.ts', 'utf8');

test('3.1 operator guide covers the dashboard and scheduler authority boundary', () => {
  assert.match(source, /^# Agent Control 3\.1\.0 Operator Guide/m);
  assert.match(source, /^## Web dashboard$/m);
  assert.match(source, /^## Scheduler operation$/m);
  assert.match(source, /^## Adaptive harness execution$/m);
  assert.match(source, /^## Windows OpenAI return-data example$/m);
  assert.match(source, /ToolInvocationGateway/);
  assert.match(source, /verification-pending/);
  assert.match(source, /SUPPORTED\+QUALIFIED/);
  assert.match(source, /Both switchable routes are `SUPPORTED\+QUALIFIED`/);
  assert.match(source, /OPENAI_AUTH_MODE=auto/);
  assert.match(source, /Agent Control does not ship a ChatGPT desktop-window bridge/);
  assert.match(source, /npm run qualify:openai-windows/);
  assert.match(source, /The dashboard requests; Agent Control authorises/);
  assert.match(source, /OS cron and the browser are not authoritative schedulers/);
  assert.match(source, /`npm run init` creates a schema-valid empty configuration only when none exists/);
  assert.match(source, /config\/implementation-status\.json/);
  assert.match(source, /npm run check:status/);
  assert.match(source, /qualified `HarnessJobAgentAction` is the sole model-backed Job bridge/);
  assert.doesNotMatch(source, /cp config\/agent-control\.example\.json/);
  assert.doesNotMatch(source, /Copy-Item config\/agent-control\.example\.json/);
  assert.match(architecture, /default Jobs workspace is an operational projection, not an additional scheduler/);
});

test('3.1 release PDF is a non-empty versioned operator guide artifact', () => {
  assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.ok(pdf.length > 10_000);
  assert.match(pdfText, /\/Title \(Agent Control 3\.1\.0 Operator Guide\)/);
  assert.match(pdfText, /%%EOF\s*$/);
});

test('3.1 release assets include the canonical Markdown operator guide', () => {
  assert.equal(releaseMarkdown, source);
});

test('Windows OpenAI qualification uses a valid economic routing intent', () => {
  assert.match(windowsQualification, /intent: 'NORMAL'/);
  assert.doesNotMatch(windowsQualification, /intent: 'QUALITY'/);
});
