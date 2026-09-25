import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn, execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const require = createRequire(import.meta.url), root = process.cwd();
const expectedHead = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
if (!/^[a-f0-9]{40}$/.test(expectedHead)) throw new Error('qualification_head_invalid');
const branch = 'feature/3.9-resilient-execution', windowsHost = process.env.AGENT_CONTROL_WINDOWS_HOST, windowsUser = process.env.AGENT_CONTROL_WINDOWS_USER, windowsKey = process.env.AGENT_CONTROL_WINDOWS_IDENTITY, windowsNodeId = process.env.AGENT_CONTROL_WINDOWS_NODE_ID;
if (!windowsHost || !windowsUser || !windowsKey || !windowsNodeId) throw new Error('windows_qualification_transport_configuration_required');
if (!/^[a-z0-9][a-z0-9._-]*$/i.test(windowsNodeId)) throw new Error('windows_qualification_node_id_invalid');
const controllerSshPort = Number(process.env.AGENT_CONTROL_CONTROLLER_SSH_PORT ?? 22), remotePort = Number(process.env.AGENT_CONTROL_WINDOWS_QUALIFICATION_PORT ?? 4391);
const outputRoot = path.resolve(process.env.AGENT_CONTROL_WINDOWS_EVIDENCE_ROOT ?? '.agent-control/qualification-3.9-windows');
const evidenceFile = path.join(outputRoot, 'windows-cleanup-qualification.json'), videoFile = path.join(outputRoot, 'windows-cleanup-dashboard.mp4'), manifestFile = path.join(outputRoot, 'windows-cleanup-dashboard-video.json');
const chromiumExecutable = process.env.AGENT_CONTROL_CHROMIUM ?? '/snap/bin/chromium', playwrightRoot = process.env.AGENT_CONTROL_PLAYWRIGHT_CORE ?? 'playwright-core';
fs.mkdirSync(outputRoot, {recursive: true, mode: 0o700});

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function runState(runId) {
  const response = await fetch(`${base}/api/runs/${encodeURIComponent(runId)}`, {cache: 'no-store'});
  if (!response.ok) throw new Error(`dashboard_run_fetch_failed:${response.status}`);
  const run = await response.json();
  return {status: run.status, stepStatus: run.steps[0].status};
}
async function waitForRunState(runId, status, timeoutMs, trace) {
  const deadline = Date.now() + timeoutMs;
  do {
    const observed = await runState(runId);
    const prior = trace.at(-1);
    if (!prior || prior.status !== observed.status || prior.stepStatus !== observed.stepStatus) trace.push({...observed, at: new Date().toISOString()});
    if (observed.status === status) return observed;
    await delay(50);
  } while (Date.now() < deadline);
  throw new Error(`dashboard_run_state_timeout:${status}:${JSON.stringify(trace)}`);
}
async function freePort() { return new Promise((resolve, reject) => { const server = net.createServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const address = server.address(); if (!address || typeof address === 'string') return reject(new Error('local_port_unavailable')); const port = address.port; server.close(error => error ? reject(error) : resolve(port)); }); }); }
const localPort = await freePort(), base = `http://127.0.0.1:${localPort}`;
const remoteRootName = `agent-control-winqual-${expectedHead.slice(0, 12)}`;
const ps = [
  "$ErrorActionPreference = 'Stop'", "$ProgressPreference = 'SilentlyContinue'", 'Set-StrictMode -Version Latest',
  `$expected = '${expectedHead}'`, `$branch = '${branch}'`, `$remotePort = ${remotePort}`, `$allowedOrigin = 'http://127.0.0.1:${localPort}'`, `$rootName = '${remoteRootName}'`, `$nodeId = '${windowsNodeId}'`,
  "$git = (Get-Command git.exe -ErrorAction Stop).Source",
  "$openAiRoot = Join-Path $env:LOCALAPPDATA 'OpenAI'",
  "$nodes = @(Get-ChildItem -LiteralPath $openAiRoot -Filter node.exe -File -Recurse -ErrorAction SilentlyContinue | ForEach-Object { try { $version = (& $_.FullName --version 2>$null); if ($LASTEXITCODE -eq 0 -and $version -match '^v[0-9]+\\.') { [pscustomobject]@{Path=$_.FullName;Version=$version;WriteTime=$_.LastWriteTimeUtc} } } catch {} } | Sort-Object @{Expression='Version';Descending=$true}, @{Expression='WriteTime';Descending=$true}, @{Expression='Path';Descending=$false})",
  "if ($nodes.Count -lt 1) { throw 'qualified_node_executable_unavailable' }", "$node = $nodes[0].Path", "$npm = Join-Path (Split-Path -Parent $node) 'npm.cmd'", "if (-not (Test-Path -LiteralPath $npm -PathType Leaf)) { throw 'qualified_npm_executable_unavailable' }", "$env:PATH = (Split-Path -Parent $node) + ';' + $env:PATH",
  "$qualificationRoot = Join-Path $env:TEMP $rootName", "if (Test-Path -LiteralPath $qualificationRoot) { throw 'qualification_directory_already_exists' }", "New-Item -ItemType Directory -Path $qualificationRoot | Out-Null", "$repo = Join-Path $qualificationRoot 'repo'", "$state = Join-Path $qualificationRoot 'state'", "$evidence = Join-Path $qualificationRoot 'windows-cleanup.json'",
  'try {', "  & $git clone --quiet --branch $branch --single-branch 'https://github.com/lozknowles/agent-control.git' $repo", "  if ($LASTEXITCODE -ne 0) { throw 'qualification_clone_failed' }", '  Set-Location -LiteralPath $repo', "  $actual = (& $git rev-parse HEAD).Trim()", "  if ($LASTEXITCODE -ne 0 -or $actual -ne $expected) { throw 'qualification_source_identity_mismatch' }", "  & $npm install --no-package-lock --ignore-scripts --silent", "  if ($LASTEXITCODE -ne 0) { throw 'qualification_dependency_install_failed' }", "  & $node --import tsx scripts/qualify-windows-cleanup.ts --state-dir $state --evidence-file $evidence --host 127.0.0.1 --port $remotePort --allowed-origin $allowedOrigin --hold-ms 4000 --node-id $nodeId", "  if ($LASTEXITCODE -ne 0) { throw 'windows_cleanup_qualification_failed' }", "  $encoded = [Convert]::ToBase64String([IO.File]::ReadAllBytes($evidence))", "  [Console]::Out.WriteLine('EVIDENCE_BASE64:' + $encoded)", '}', 'finally {', "  Set-Location -LiteralPath $env:TEMP", "  if ((Split-Path -Leaf $qualificationRoot) -eq $rootName -and (Split-Path -Parent $qualificationRoot) -eq $env:TEMP) { Remove-Item -LiteralPath $qualificationRoot -Recurse -Force -ErrorAction SilentlyContinue }", '}',
].join('\n');
const bootstrap = Buffer.from(['$ErrorActionPreference = "Stop"', '$payload = [Console]::In.ReadLine()', '$source = [Console]::In.ReadToEnd()', '& ([ScriptBlock]::Create($source)) $payload', ''].join('\n'), 'utf16le').toString('base64');

const ssh = spawn('ssh', ['-T', '-i', windowsKey, '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', '-L', `127.0.0.1:${localPort}:127.0.0.1:${remotePort}`, `${windowsUser}@${windowsHost}`, 'powershell.exe', '-NoProfile', '-NonInteractive', '-EncodedCommand', bootstrap], {stdio: ['pipe','pipe','pipe']});
ssh.stdin.end(`qualification\n${ps}\n`); ssh.stdout.setEncoding('utf8'); ssh.stderr.setEncoding('utf8');
let stdoutRemainder = '', stderrTail = '', exited = false, exitCode = null, evidenceBase64 = null, operatorToken = null;
const phases = new Map();
function accept(value) { if (!value?.phase) return; if (typeof value.operatorToken === 'string') operatorToken = value.operatorToken; const safe = {...value}; delete safe.operatorToken; phases.set(value.phase, safe); }
function line(value) { if (value.startsWith('EVIDENCE_BASE64:')) { evidenceBase64 = value.slice('EVIDENCE_BASE64:'.length); return; } try { accept(JSON.parse(value)); } catch {} }
ssh.stdout.on('data', chunk => { stdoutRemainder += chunk; const lines = stdoutRemainder.split(/\r?\n/); stdoutRemainder = lines.pop() ?? ''; for (const value of lines) line(value); });
ssh.stderr.on('data', chunk => { stderrTail = (stderrTail + chunk).slice(-4_096); });
const sshExit = new Promise(resolve => ssh.once('exit', code => { exited = true; exitCode = code; resolve(code); }));
function classifyRemoteFailure(source) {
  const known = ['qualification_directory_already_exists','qualification_clone_failed','qualification_source_identity_mismatch','qualification_dependency_install_failed','qualified_node_executable_unavailable','qualified_npm_executable_unavailable','windows_cleanup_qualification_failed'];
  const explicit = source.match(/"phase":"QUALIFICATION_FAILED","error":"([^"\\]{1,240})"/); if (explicit) return explicit[1];
  return known.find(value => source.includes(value)) ?? 'remote_execution_failed';
}
async function waitPhase(name, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  do { if (phases.has(name)) return phases.get(name); const failed = phases.get('QUALIFICATION_FAILED'); if (failed) throw new Error(`windows_qualification_failed:${failed.error ?? 'unspecified'}`); if (exited) throw new Error(`governed_ssh_exited_before_${name}:${exitCode}:${classifyRemoteFailure(stderrTail)}`); await delay(100); } while (Date.now() < deadline);
  throw new Error(`qualification_phase_timeout:${name}`);
}

let browser, context, page, video;
const rawVideoDir = path.join(outputRoot, 'raw-video'); fs.mkdirSync(rawVideoDir, {recursive: true, mode: 0o700});
const reload = {requestedAt: null, before: null, liveRestoredAt: null, after: null}, cancelStatusTrace = [];
try {
  await waitPhase('DASHBOARD_READY', 300_000); await waitPhase('CANCEL_READY', 30_000); assert.ok(operatorToken, 'qualification_operator_token_missing');
  const {chromium} = require(playwrightRoot); browser = await chromium.launch({headless: true, executablePath: chromiumExecutable, args: ['--no-sandbox','--disable-dev-shm-usage']});
  context = await browser.newContext({viewport: {width: 1920, height: 1080}, recordVideo: {dir: rawVideoDir, size: {width: 1920, height: 1080}}, colorScheme: 'dark'}); page = await context.newPage(); video = page.video();
  await page.goto(base, {waitUntil: 'domcontentloaded'}); await page.waitForFunction(() => document.querySelector('#stream-state')?.textContent === 'LIVE', undefined, {timeout: 10_000});
  await page.click('#operator-button'); await page.fill('#operator-token', operatorToken); await page.click('#operator-form button[type="submit"]'); await page.getByRole('button', {name: 'Operator authenticated', exact: true}).waitFor({timeout: 10_000}); await page.click('[data-view="jobs"]');
  const cancel = phases.get('CANCEL_READY'); const cancelLink = page.locator(`[data-run="${cancel.runId}"]:visible`).first(); await cancelLink.waitFor({timeout: 10_000}); await cancelLink.click(); await page.locator('#job-detail').getByText(`Run ${cancel.runId}`, {exact: true}).waitFor({timeout: 10_000}); const cancelButton = page.locator('[data-run-command="cancel"]:visible'); await cancelButton.waitFor(); assert.equal(await cancelButton.count(), 1, 'dashboard_cancel_control_ambiguous');
  const cancelPath = `/api/runs/${encodeURIComponent(cancel.runId)}/cancel`, cancelResponsePromise = page.waitForResponse(response => new URL(response.url()).pathname === cancelPath && response.request().method() === 'POST', {timeout: 5_000});
  const confirmation = new Promise((resolve, reject) => page.once('dialog', dialog => { if (dialog.type() !== 'confirm') { reject(new Error(`dashboard_cancel_dialog_invalid:${dialog.type()}`)); return; } dialog.accept().then(resolve, reject); }));
  await cancelButton.click(); await confirmation; const cancelResponse = await cancelResponsePromise; assert.equal(cancelResponse.status(), 202, `dashboard_cancel_rejected:${cancelResponse.status()}`);
  await waitForRunState(cancel.runId, 'CANCELLING', 5_000, cancelStatusTrace);
  reload.requestedAt = new Date().toISOString(); reload.before = await page.evaluate(async id => { const [run, locks, workers] = await Promise.all([fetch(`/api/runs/${id}`).then(value => value.json()), fetch('/api/resources').then(value => value.json()), fetch('/api/workers').then(value => value.json())]); return {status: run.status, stepStatus: run.steps[0].status, lockHeld: locks.some(item => item.runId === id), workerActive: workers.find(item => item.id === 'windows-native')?.active}; }, cancel.runId);
  await page.reload({waitUntil: 'domcontentloaded'}); await page.waitForFunction(() => document.querySelector('#stream-state')?.textContent === 'LIVE', undefined, {timeout: 10_000}); reload.liveRestoredAt = new Date().toISOString();
  reload.after = await page.evaluate(async id => { const [run, locks, workers] = await Promise.all([fetch(`/api/runs/${id}`).then(value => value.json()), fetch('/api/resources').then(value => value.json()), fetch('/api/workers').then(value => value.json())]); return {status: run.status, stepStatus: run.steps[0].status, lockHeld: locks.some(item => item.runId === id), workerActive: workers.find(item => item.id === 'windows-native')?.active}; }, cancel.runId);
  const expectedPending = {status: 'CANCELLING', stepStatus: 'CANCEL_PENDING', lockHeld: true, workerActive: 1};
  if (JSON.stringify(reload.before) !== JSON.stringify(expectedPending)) throw new Error(`dashboard_pre_reload_state_mismatch:${JSON.stringify(reload.before)}`);
  if (JSON.stringify(reload.after) !== JSON.stringify(reload.before)) throw new Error(`dashboard_post_reload_state_mismatch:${JSON.stringify(reload.after)}`);
  await waitPhase('CANCEL_COMPLETE', 15_000); await waitForRunState(cancel.runId, 'CANCELLED', 10_000, cancelStatusTrace);
  for (const phase of ['TIMEOUT_COMPLETE','UNCERTAINTY_COMPLETE']) { const value = await waitPhase(phase, 20_000), link = page.locator(`[data-run="${value.runId}"]:visible`).first(); await link.waitFor({timeout: 10_000}); await link.click(); await delay(2_500); }
  await waitPhase('QUALIFICATION_COMPLETE', 10_000); await delay(2_000); await context.close(); context = undefined; const rawVideo = await video.path(); await browser.close(); browser = undefined;
  execFileSync(process.env.AGENT_CONTROL_FFMPEG ?? 'ffmpeg', ['-y','-loglevel','error','-i',rawVideo,'-c:v','libx264','-preset','fast','-crf','27','-pix_fmt','yuv420p','-movflags','+faststart',videoFile]); fs.rmSync(rawVideo, {force: true});
  const code = await sshExit; if (code !== 0 || !evidenceBase64) throw new Error(`governed_windows_qualification_failed:${code}:${stderrTail.replace(/[A-Z]:\\[^\s]+/gi, '[REDACTED_PATH]').slice(-500)}`);
  const evidenceBytes = Buffer.from(evidenceBase64, 'base64'); fs.writeFileSync(evidenceFile, evidenceBytes, {mode: 0o600}); const parsed = JSON.parse(evidenceBytes.toString('utf8')); assert.equal(parsed.repository.head, expectedHead); assert.equal(parsed.verdict, 'PASS');
  const videoBytes = fs.readFileSync(videoFile), browserVersion = await require(playwrightRoot).chromium.launch({headless: true, executablePath: chromiumExecutable}).then(async instance => { const version = instance.version(); await instance.close(); return version; });
  const manifest = {schema: 'agent-control.windows-cleanup-dashboard-video/v1', recordedAt: new Date().toISOString(), sourceCommit: expectedHead, topology: {controller: 'configured Linux controller', controllerSshPort, executionNode: windowsNodeId, executionNodeSshPort: 22, dashboard: 'Windows-node loopback through governed SSH local-forward'}, evidence: {file: path.basename(evidenceFile), sha256: createHash('sha256').update(evidenceBytes).digest('hex')}, video: {file: path.basename(videoFile), sha256: createHash('sha256').update(videoBytes).digest('hex'), bytes: videoBytes.length, format: 'MP4/H.264', resolution: '1920x1080'}, browser: {engine: 'Chromium', version: browserVersion, headless: true}, dashboard: {streamState: 'LIVE', operatorCancellationSubmittedThroughDashboard: true, cancellationStatusTrace: cancelStatusTrace, reloadDuringCancellation: reload}, ssh: {hostKeyPolicy: 'strict', authentication: 'dedicated opaque identity reference', fixedRemoteCommand: 'powershell.exe -NoProfile -NonInteractive -EncodedCommand <fixed-stdin-bootstrap>', variableDataChannel: 'stdin'}, qualificationExitCode: exitCode};
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, {mode: 0o600});
  process.stdout.write(`${JSON.stringify({verdict: 'PASS', evidenceFile, videoFile, manifestFile, evidenceSha256: manifest.evidence.sha256, videoSha256: manifest.video.sha256})}\n`);
} catch (error) {
  ssh.kill('SIGTERM'); await Promise.race([sshExit, delay(5_000)]); await context?.close().catch(() => {}); await browser?.close().catch(() => {}); if (!exited) ssh.kill('SIGKILL');
  process.stderr.write(`${JSON.stringify({verdict: 'FAIL', error: error instanceof Error ? error.message : String(error)})}\n`); process.exitCode = 1;
}
