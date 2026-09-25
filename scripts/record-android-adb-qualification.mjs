import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {execFileSync, spawn, spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const require = createRequire(import.meta.url), root = process.cwd();
const expectedHead = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
if (!/^[a-f0-9]{40}$/.test(expectedHead) || execFileSync('git', ['status', '--short'], {cwd: root, encoding: 'utf8'}).trim()) throw new Error('android_qualification_requires_clean_source');
const pixelHost = process.env.AGENT_CONTROL_PIXEL_HOST, pixelUser = process.env.AGENT_CONTROL_PIXEL_USER, pixelIdentity = process.env.AGENT_CONTROL_PIXEL_IDENTITY;
if (!pixelHost || !pixelUser || !pixelIdentity) throw new Error('android_qualification_transport_configuration_required');
const pixelPort = Number(process.env.AGENT_CONTROL_PIXEL_PORT ?? 8022), controllerNodeId = process.env.AGENT_CONTROL_CONTROLLER_NODE_ID ?? 'controller', controllerSshPort = Number(process.env.AGENT_CONTROL_CONTROLLER_SSH_PORT ?? 2222), resourceId = process.env.AGENT_CONTROL_PIXEL_RESOURCE_ID ?? 'pixel';
const outputRoot = path.resolve(process.env.AGENT_CONTROL_ANDROID_EVIDENCE_ROOT ?? '.agent-control/qualification-3.9-android-adb');
if (fs.existsSync(outputRoot)) throw new Error('android_qualification_evidence_directory_already_exists');
fs.mkdirSync(outputRoot, {recursive: true, mode: 0o700});
const evidenceFile = path.join(outputRoot, 'android-adb-qualification.json'), videoFile = path.join(outputRoot, 'android-adb-dashboard.mp4'), manifestFile = path.join(outputRoot, 'android-adb-dashboard-video.json'), stateDir = path.join(outputRoot, 'state'), rawVideoDir = path.join(outputRoot, 'raw-video');
fs.mkdirSync(rawVideoDir, {recursive: true, mode: 0o700});
const chromiumExecutable = process.env.AGENT_CONTROL_CHROMIUM ?? '/snap/bin/chromium', playwrightRoot = process.env.AGENT_CONTROL_PLAYWRIGHT_CORE ?? 'playwright-core', ffmpeg = process.env.AGENT_CONTROL_FFMPEG ?? 'ffmpeg';
const remoteRoot = '.cache/agent-control-3.9-qualification', remoteFiles = ['adb-local.mjs', 'node-server.mjs', 'resource-agent.sh'];
const sshBase = ['-T', '-i', pixelIdentity, '-p', String(pixelPort), '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10'];
const target = `${pixelUser}@${pixelHost}`;
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const freePort = () => new Promise((resolve, reject) => { const server = net.createServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const address = server.address(); if (!address || typeof address === 'string') return reject(new Error('android_qualification_port_unavailable')); const port = address.port; server.close(error => error ? reject(error) : resolve(port)); }); });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function fixedSsh(command) {
  const result = spawnSync('ssh', [...sshBase, target, ...command], {encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024});
  if (result.status !== 0) throw new Error(`android_qualification_ssh_failed:${result.status}`);
  return result.stdout;
}

fixedSsh(['mkdir', '-p', remoteRoot]);
for (const file of remoteFiles) {
  const local = path.resolve('android', file), temporary = `${remoteRoot}/${file}.candidate`;
  const copied = spawnSync('scp', ['-P', String(pixelPort), '-i', pixelIdentity, '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes', local, `${target}:${temporary}`], {encoding: 'utf8', timeout: 30_000});
  if (copied.status !== 0) throw new Error(`android_qualification_stage_failed:${file}`);
  fixedSsh(['chmod', file.endsWith('.sh') || file.endsWith('.mjs') ? '700' : '600', temporary]); fixedSsh(['mv', temporary, `${remoteRoot}/${file}`]);
  const remoteHash = fixedSsh(['sha256sum', `${remoteRoot}/${file}`]).trim().split(/\s+/)[0];
  assert.equal(remoteHash, hash(fs.readFileSync(local)), `android_qualification_remote_hash_mismatch:${file}`);
}

const nodeLocalPort = await freePort(), dashboardPort = await freePort(), remoteNodePort = 20000 + Math.floor(Math.random() * 20000), token = randomUUID(), nodeUrl = `http://127.0.0.1:${nodeLocalPort}`;
const remoteScript = [
  'set -eu',
  'printf "AGENT_CONTROL_REMOTE_PID=%s\\n" "$$"',
  `export AGENT_CONTROL_NODE_PORT=${remoteNodePort}`,
  `export AGENT_CONTROL_NODE_TOKEN=${token}`,
  `export AGENT_CONTROL_RESOURCE_ID=${resourceId}`,
  `export AGENT_CONTROL_VERSION=3.9.0-qualification-${expectedHead.slice(0, 12)}`,
  'export AGENT_CONTROL_ADB_STARTUP_RECONNECT=false',
  `exec node "$HOME/${remoteRoot}/node-server.mjs"`,
  '',
].join('\n');
const tunnel = spawn('ssh', [...sshBase, '-L', `127.0.0.1:${nodeLocalPort}:127.0.0.1:${remoteNodePort}`, target, 'bash', '-s'], {stdio: ['pipe', 'pipe', 'pipe']});
tunnel.stdin.end(remoteScript); tunnel.stdout.setEncoding('utf8'); tunnel.stderr.setEncoding('utf8'); let tunnelTail = '', tunnelExited = false, tunnelExitCode = null, remoteNodePid = null;
tunnel.stdout.on('data', chunk => { tunnelTail = (tunnelTail + chunk).slice(-2048); const match = tunnelTail.match(/AGENT_CONTROL_REMOTE_PID=(\d+)/); if (match) remoteNodePid = Number(match[1]); }); tunnel.stderr.on('data', chunk => { tunnelTail = (tunnelTail + chunk).slice(-2048); });
const tunnelExit = new Promise(resolve => tunnel.once('exit', code => { tunnelExited = true; tunnelExitCode = code; resolve(code); }));
const healthDeadline = Date.now() + 30_000;
while (Date.now() < healthDeadline) { try { if ((await fetch(`${nodeUrl}/health`)).ok) break; } catch {} if (tunnelExited) throw new Error(`android_node_tunnel_exited:${tunnelExitCode}`); await delay(200); }
if (!(await fetch(`${nodeUrl}/health`).catch(() => null))?.ok) throw new Error('android_node_health_timeout');

const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/qualify-android-adb-3.9.ts', '--mode', 'qualification', '--state-dir', stateDir, '--session-file', path.join(stateDir, 'android-adb-session.json'), '--evidence-file', evidenceFile, '--node-url', nodeUrl, '--host', '127.0.0.1', '--port', String(dashboardPort), '--pixel-host', pixelHost, '--pixel-user', pixelUser, '--pixel-port', String(pixelPort), '--pixel-identity', pixelIdentity, '--resource-id', resourceId, '--remote-agent', `~/${remoteRoot}/resource-agent.sh`, '--controller-node-id', controllerNodeId, '--controller-ssh-port', String(controllerSshPort), '--pairing-timeout-ms', String(Number(process.env.AGENT_CONTROL_ANDROID_PAIRING_TIMEOUT_MS ?? 600_000)), '--endpoint-change-timeout-ms', String(Number(process.env.AGENT_CONTROL_ANDROID_ENDPOINT_CHANGE_TIMEOUT_MS ?? 300_000)), '--phase-delay-ms', '3000'], {cwd: root, env: {...process.env, AGENT_CONTROL_ANDROID_NODE_TOKEN: token}, stdio: ['ignore', 'pipe', 'pipe']});
child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8'); let remainder = '', stderrTail = '', childExited = false, childExitCode = null, operatorToken = null; const phases = new Map();
child.stdout.on('data', chunk => { remainder += chunk; const lines = remainder.split(/\r?\n/); remainder = lines.pop() ?? ''; for (const line of lines) { try { const value = JSON.parse(line); if (!value.phase) continue; if (typeof value.operatorToken === 'string') operatorToken = value.operatorToken; const safe = {...value}; delete safe.operatorToken; delete safe.evidenceFile; phases.set(value.phase, safe); process.stdout.write(`${JSON.stringify(safe)}\n`); } catch {} } });
child.stderr.on('data', chunk => { stderrTail = (stderrTail + chunk).slice(-4096); });
const childExit = new Promise(resolve => child.once('exit', code => { childExited = true; childExitCode = code; resolve(code); }));
async function waitPhase(name, timeoutMs = 60_000) { const deadline = Date.now() + timeoutMs; do { if (phases.has(name)) return phases.get(name); if (childExited) throw new Error(`android_qualification_exited_before_${name}:${childExitCode}:${stderrTail.slice(-300)}`); await delay(100); } while (Date.now() < deadline); throw new Error(`android_qualification_phase_timeout:${name}`); }

let browser, context, page, video; const dashboard = {streamState: null, prePairCapabilities: [], initialCapabilities: [], withdrawnCapabilities: [], restoredCapabilities: [], reloadWhileWithdrawn: false};
try {
  const ready = await waitPhase('DASHBOARD_READY'); assert.ok(operatorToken); const base = `http://127.0.0.1:${ready.port}`;
  const {chromium} = require(playwrightRoot); browser = await chromium.launch({headless: true, executablePath: chromiumExecutable, args: ['--no-sandbox', '--disable-dev-shm-usage']});
  context = await browser.newContext({viewport: {width: 1920, height: 1080}, recordVideo: {dir: rawVideoDir, size: {width: 1920, height: 1080}}, colorScheme: 'dark'}); page = await context.newPage(); video = page.video();
  await page.goto(base, {waitUntil: 'domcontentloaded'}); await page.waitForFunction(() => document.querySelector('#stream-state')?.textContent === 'LIVE', undefined, {timeout: 10_000}); dashboard.streamState = 'LIVE';
  await page.click('[data-view="systems"]'); const card = page.locator(`[data-system="${resourceId}"]`); await card.waitFor({timeout: 10_000}); await card.click();
  await waitPhase('PAIRING_REQUIRED', 30_000); await page.waitForFunction(() => !document.querySelector('#system-detail')?.textContent?.includes('transport.adb'), undefined, {timeout: 10_000}); dashboard.prePairCapabilities = await page.locator('#system-detail .system-section').last().textContent();
  process.stdout.write(`${JSON.stringify({actionRequired: 'On the Pixel, leave the System pairing-code dialog open, run the staged helper pair command in local Termux, and enter the PIN only at its hidden prompt'})}\n`);
  await waitPhase('PAIRING_COMPLETED', Number(process.env.AGENT_CONTROL_ANDROID_PAIRING_TIMEOUT_MS ?? 600_000) + 30_000);
  await waitPhase('INITIAL_QUALIFIED'); await page.waitForFunction(() => document.querySelector('#system-detail')?.textContent?.includes('transport.adb'), undefined, {timeout: 15_000}); dashboard.initialCapabilities = await page.locator('#system-detail .system-section').last().textContent();
  await waitPhase('CAPABILITY_WITHDRAWN'); await page.waitForFunction(() => !document.querySelector('#system-detail')?.textContent?.includes('transport.adb'), undefined, {timeout: 15_000}); dashboard.withdrawnCapabilities = await page.locator('#system-detail .system-section').last().textContent();
  await page.reload({waitUntil: 'domcontentloaded'}); await page.waitForFunction(() => document.querySelector('#stream-state')?.textContent === 'LIVE', undefined, {timeout: 10_000}); await page.click('[data-view="systems"]'); await page.locator(`[data-system="${resourceId}"]`).click(); await page.waitForFunction(() => !document.querySelector('#system-detail')?.textContent?.includes('transport.adb'), undefined, {timeout: 10_000}); dashboard.reloadWhileWithdrawn = true;
  await waitPhase('SAME_ENDPOINT_RECONNECTED', 150_000); await page.waitForFunction(() => document.querySelector('#system-detail')?.textContent?.includes('transport.adb'), undefined, {timeout: 15_000}); dashboard.restoredCapabilities = await page.locator('#system-detail .system-section').last().textContent();
  await waitPhase('ENDPOINT_CHANGE_REQUIRED'); process.stdout.write(`${JSON.stringify({actionRequired: 'Toggle Wireless debugging off, then on, on the Pixel; no PIN is required'})}\n`);
  await waitPhase('CHANGED_ENDPOINT_RECONNECTED', Number(process.env.AGENT_CONTROL_ANDROID_ENDPOINT_CHANGE_TIMEOUT_MS ?? 300_000) + 90_000); await page.waitForFunction(() => document.querySelector('#system-detail')?.textContent?.includes('transport.adb'), undefined, {timeout: 15_000});
  await waitPhase('PERSISTED_SESSION_RESUMED', 90_000); await page.click('[data-view="jobs"]'); await delay(3_000); const complete = await waitPhase('QUALIFICATION_COMPLETE', 30_000); assert.equal(complete.verdict, 'PASS');
  await context.close(); context = undefined; const rawVideo = await video.path(); await browser.close(); browser = undefined;
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', rawVideo, '-c:v', 'libx264', '-preset', 'fast', '-crf', '27', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', videoFile]); fs.rmSync(rawVideo, {force: true});
  const code = await childExit; if (code !== 0) throw new Error(`android_qualification_failed:${code}:${stderrTail.slice(-300)}`);
  const evidenceBytes = fs.readFileSync(evidenceFile), evidence = JSON.parse(evidenceBytes.toString('utf8')); assert.equal(evidence.verdict, 'PASS'); assert.equal(evidence.source.commit, expectedHead);
  const videoBytes = fs.readFileSync(videoFile), probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,duration', '-of', 'json', videoFile], {encoding: 'utf8'}));
  const manifest = {schema: 'agent-control.android-adb-dashboard-video/v1', recordedAt: new Date().toISOString(), sourceCommit: expectedHead, topology: {controller: controllerNodeId, controllerSshPort, pixel: resourceId, pixelSshPort: pixelPort, node: 'Pixel loopback through strict-host-key SSH local-forward'}, stagedFiles: Object.fromEntries(remoteFiles.map(file => [file, hash(fs.readFileSync(path.resolve('android', file)))])), evidence: {file: path.basename(evidenceFile), sha256: hash(evidenceBytes), bytes: evidenceBytes.length}, video: {file: path.basename(videoFile), sha256: hash(videoBytes), bytes: videoBytes.length, format: 'MP4/H.264', stream: probe.streams[0]}, browser: {engine: 'Chromium', headless: true}, dashboard, security: {nodeTokenPersisted: false, pairingPinObserved: false, rawSshStreamsPersisted: false}, qualificationExitCode: code};
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, {mode: 0o600}); fs.rmSync(stateDir, {recursive: true, force: true}); fs.rmSync(rawVideoDir, {recursive: true, force: true});
  process.stdout.write(`${JSON.stringify({verdict: 'PASS', evidenceFile, videoFile, manifestFile, evidenceSha256: manifest.evidence.sha256, videoSha256: manifest.video.sha256})}\n`);
} catch (error) {
  child.kill('SIGTERM'); await Promise.race([childExit, delay(3_000)]); if (!childExited) child.kill('SIGKILL'); await context?.close().catch(() => {}); await browser?.close().catch(() => {});
  process.stderr.write(`${JSON.stringify({verdict: 'FAIL', error: error instanceof Error ? error.message : String(error)})}\n`); process.exitCode = 1;
} finally {
  if (Number.isSafeInteger(remoteNodePid) && remoteNodePid > 0) {
    try {
      const command = fixedSsh(['ps', '-p', String(remoteNodePid), '-o', 'args=']).trim();
      if (command.includes(`${remoteRoot}/node-server.mjs`)) fixedSsh(['kill', '-TERM', String(remoteNodePid)]);
    } catch { /* The remote candidate already stopped or transport closed. */ }
  }
  tunnel.kill('SIGTERM'); await Promise.race([tunnelExit, delay(3_000)]); if (!tunnelExited) tunnel.kill('SIGKILL');
}
