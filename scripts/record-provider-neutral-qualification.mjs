import {createHash} from 'node:crypto';
import {spawn, execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = process.cwd();
const stateDir = path.resolve(process.env.AGENT_CONTROL_QUALIFICATION_STATE_DIR ?? '.agent-control/qualification-3.9');
const evidenceFile = path.resolve(process.env.AGENT_CONTROL_QUALIFICATION_EVIDENCE ?? 'docs/evidence/agent-control-3.9-provider-neutral-qualification.json');
const videoFile = path.resolve(process.env.AGENT_CONTROL_QUALIFICATION_VIDEO ?? 'docs/evidence/agent-control-3.9-provider-neutral-dashboard.mp4');
const manifestFile = path.resolve(process.env.AGENT_CONTROL_QUALIFICATION_VIDEO_MANIFEST ?? 'docs/evidence/agent-control-3.9-provider-neutral-dashboard-video.json');
const port = Number(process.env.AGENT_CONTROL_QUALIFICATION_PORT ?? 4390);
const base = `http://127.0.0.1:${port}`;
const playwrightRoot = process.env.AGENT_CONTROL_PLAYWRIGHT_CORE ?? 'playwright-core';
const chromiumExecutable = process.env.AGENT_CONTROL_CHROMIUM;
const operatorToken = process.env.AGENT_CONTROL_QUALIFICATION_OPERATOR_TOKEN;
if (!chromiumExecutable) throw new Error('qualification_recorder_runtime_required');
if (!operatorToken) throw new Error('qualification_operator_token_required');

fs.mkdirSync(stateDir, {recursive: true, mode: 0o700});
fs.mkdirSync(path.dirname(videoFile), {recursive: true});
const rawVideoDir = path.join(stateDir, 'dashboard-recording');
fs.mkdirSync(rawVideoDir, {recursive: true, mode: 0o700});

const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/qualify-provider-neutral-3.9.ts', '--state-dir', stateDir, '--evidence-file', evidenceFile, '--host', '127.0.0.1', '--port', String(port), '--hold-ms', '30000'], {cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe']});
let qualificationComplete = false, childFailure = '', childExited = false, childExitCode = null;
child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
child.stdout.on('data', chunk => { process.stdout.write(chunk); if (String(chunk).includes('QUALIFICATION_COMPLETE')) qualificationComplete = true; });
child.stderr.on('data', chunk => { process.stderr.write(chunk); childFailure += String(chunk); });
const childExit = new Promise(resolve => child.once('exit', (code, signal) => { childExited = true; childExitCode = code; resolve({code, signal}); }));

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function waitForDashboard() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && !childExited) {
    try { const response = await fetch(`${base}/api/status`, {signal: AbortSignal.timeout(1_000)}); if (response.ok) return; } catch {}
    await delay(250);
  }
  throw new Error(`qualification_dashboard_not_ready:${childFailure.slice(-240)}`);
}
async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !childExited) { if (predicate()) return true; await delay(250); }
  return predicate();
}

let browser, context, page, video, liveObservedAt;
const views = [];
try {
  await waitForDashboard();
  const {chromium} = require(playwrightRoot);
  browser = await chromium.launch({headless: true, executablePath: chromiumExecutable, args: ['--no-sandbox', '--disable-dev-shm-usage']});
  context = await browser.newContext({viewport: {width: 1920, height: 1080}, recordVideo: {dir: rawVideoDir, size: {width: 1920, height: 1080}}, colorScheme: 'dark'});
  page = await context.newPage(); video = page.video();
  await page.goto(base, {waitUntil: 'networkidle'});
  await page.waitForFunction(() => document.querySelector('#stream-state')?.textContent === 'LIVE', undefined, {timeout: 10_000});
  liveObservedAt = new Date().toISOString();
  await page.click('#operator-button'); await page.fill('#operator-token', operatorToken); await page.click('#operator-form button[type="submit"]');
  await page.waitForFunction(() => document.querySelector('#operator-button')?.textContent?.includes('enabled') || document.querySelector('#operator-button')?.textContent?.includes('authenticated'), undefined, {timeout: 10_000}).catch(() => {});

  async function show(view, milliseconds, target) {
    await page.click(`[data-view="${view}"]`); await delay(750);
    views.push({view, at: new Date().toISOString(), target: target ?? null});
    const deadline = Date.now() + milliseconds;
    do {
      if (target) await page.locator(target).first().scrollIntoViewIfNeeded().catch(() => {});
      await delay(Math.min(250, Math.max(0, deadline - Date.now())));
    } while (Date.now() < deadline);
  }

  await page.waitForSelector('.question-panel', {timeout: 30_000});
  await show('jobs', 7_000, '.question-panel');
  await show('models', 12_000, '.model-intelligence-board');
  await show('lanes', 8_000, '#token-routing');
  await show('jobs', 8_000, '.parcel-context-board');
  while (!qualificationComplete && !childExited) {
    await show('models', 8_000, '#model-history');
    if (!qualificationComplete && !childExited) await show('lanes', 6_000, '#token-routing');
  }
  if (qualificationComplete) {
    await show('jobs', 5_000, '.parcel-list');
    await show('models', 6_000, '.model-intelligence-board');
  }
  await context.close(); context = undefined;
  const rawVideo = await video.path();
  await browser.close(); browser = undefined;
  const ffmpeg = process.env.AGENT_CONTROL_FFMPEG ?? 'ffmpeg';
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', rawVideo, '-c:v', 'libx264', '-preset', 'fast', '-crf', '27', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', videoFile]);
  fs.rmSync(rawVideo, {force: true});
  const exit = await childExit;
  if (exit.code !== 0) throw new Error(`qualification_process_failed:${exit.code}:${childFailure.slice(-300)}`);
  const videoBytes = fs.readFileSync(videoFile), evidenceBytes = fs.readFileSync(evidenceFile), browserVersion = await require(playwrightRoot).chromium.launch({headless: true, executablePath: chromiumExecutable}).then(async instance => { const value = instance.version(); await instance.close(); return value; });
  const manifest = {schema: 'agent-control.dashboard-video-evidence/v1', recordedAt: new Date().toISOString(), source: 'Real Agent Control dashboard over a loopback observer endpoint', qualificationEvidence: {file: path.basename(evidenceFile), sha256: createHash('sha256').update(evidenceBytes).digest('hex')}, video: {file: path.basename(videoFile), sha256: createHash('sha256').update(videoBytes).digest('hex'), bytes: videoBytes.length, format: 'MP4/H.264', resolution: '1920x1080'}, browser: {engine: 'Chromium', version: browserVersion, headless: true}, dashboard: {streamState: 'LIVE', observedAt: liveObservedAt}, views, qualificationExitCode: exit.code};
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, {mode: 0o600});
  process.stdout.write(`${JSON.stringify({phase: 'VIDEO_COMPLETE', videoFile, manifestFile, sha256: manifest.video.sha256, bytes: manifest.video.bytes})}\n`);
} catch (error) {
  child.kill('SIGTERM'); await waitFor(() => childExited, 5_000); if (!childExited) child.kill('SIGKILL');
  await context?.close().catch(() => {}); await browser?.close().catch(() => {});
  process.stderr.write(`${JSON.stringify({phase: 'VIDEO_FAILED', error: error instanceof Error ? error.message : String(error)})}\n`);
  process.exitCode = 1;
}
