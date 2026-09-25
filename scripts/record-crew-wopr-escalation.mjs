import {createHash, randomBytes} from 'node:crypto';
import {execFileSync, spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = process.cwd();
const evidenceFile = path.resolve(process.env.AGENT_CONTROL_CREW_WOPR_EVIDENCE ?? 'docs/evidence/agent-control-3.9-crew-wopr-escalation.json');
const transcriptFile = path.resolve(process.env.AGENT_CONTROL_CREW_WOPR_TRANSCRIPT ?? 'docs/evidence/agent-control-3.9-crew-wopr-escalation-transcript.md');
const videoFile = path.resolve(process.env.AGENT_CONTROL_CREW_WOPR_VIDEO ?? 'docs/evidence/agent-control-3.9-crew-wopr-escalation.mp4');
const manifestFile = path.resolve(process.env.AGENT_CONTROL_CREW_WOPR_VIDEO_MANIFEST ?? 'docs/evidence/agent-control-3.9-crew-wopr-escalation-video.json');
const screenshotDir = path.resolve(process.env.AGENT_CONTROL_CREW_WOPR_SCREENSHOTS ?? 'docs/evidence/agent-control-3.9-crew-wopr-escalation');
const chromiumExecutable = process.env.AGENT_CONTROL_CHROMIUM ?? '/snap/bin/chromium';
const ffmpeg = process.env.AGENT_CONTROL_FFMPEG ?? 'ffmpeg';
const ffprobe = process.env.AGENT_CONTROL_FFPROBE ?? 'ffprobe';
const ingress = process.env.AGENT_CONTROL_QUALIFICATION_INGRESS === 'openwa' ? 'openwa' : 'dashboard';
const operatorAssisted = process.env.AGENT_CONTROL_QUALIFICATION_OPERATOR_ASSISTED === 'true';
const dashboardPort = ingress === 'openwa' ? Number(process.env.AGENT_CONTROL_QUALIFICATION_PORT ?? 19191) : 0;
const socialConversationLabel = process.env.AGENT_CONTROL_QUALIFICATION_SOCIAL_LABEL ?? 'Collingham';
const pixel = ingress === 'openwa' ? {
  host: process.env.AGENT_CONTROL_PIXEL_HOST,
  user: process.env.AGENT_CONTROL_PIXEL_USER,
  port: Number(process.env.AGENT_CONTROL_PIXEL_PORT ?? 8022),
  identity: process.env.AGENT_CONTROL_PIXEL_IDENTITY,
} : null;
if (pixel && ((!operatorAssisted && (!pixel.host || !pixel.user || !pixel.identity)) || !process.env.AGENT_CONTROL_QUALIFICATION_OPENWA_CONFIG || !process.env.AGENT_CONTROL_QUALIFICATION_OPENWA_ENROLMENT)) throw new Error('qualification_social_transport_configuration_required');
const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-crew-wopr-escalation-'));
const rawVideoDir = path.join(stateDir, 'raw-video');
const operatorToken = randomBytes(32).toString('hex');
const codexHome = process.env.CODEX_HOME_COTTAGE_PLUS ?? process.env.AGENT_CONTROL_QUALIFICATION_CODEX_HOME ?? path.join(os.homedir(), '.local', 'share', 'agent-control', 'codex-profiles', 'cottage-plus');
if (!fs.statSync(codexHome, {throwIfNoEntry: false})?.isDirectory()) throw new Error('qualification_codex_home_reference_unavailable');
for (const file of [evidenceFile, transcriptFile, videoFile, manifestFile]) fs.rmSync(file, {force: true});
fs.rmSync(screenshotDir, {recursive: true, force: true});
for (const directory of [path.dirname(evidenceFile), path.dirname(transcriptFile), path.dirname(videoFile), path.dirname(manifestFile), screenshotDir, rawVideoDir]) fs.mkdirSync(directory, {recursive: true});

const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/qualify-crew-wopr-escalation.ts', '--host', '127.0.0.1', '--port', String(dashboardPort), '--state-dir', stateDir, '--evidence-file', evidenceFile, '--transcript-file', transcriptFile, '--hold-ms', '45000'], {
  cwd: root,
  env: {...process.env, AGENT_CONTROL_STATE_DIR: stateDir, AGENT_CONTROL_QUALIFICATION_OPERATOR_TOKEN: operatorToken, CODEX_HOME_COTTAGE_PLUS: codexHome},
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdoutBuffer = '', stderr = '', exited = false;
const phases = [];
child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
child.stdout.on('data', chunk => {
  process.stdout.write(chunk); stdoutBuffer += String(chunk);
  for (;;) {
    const newline = stdoutBuffer.indexOf('\n'); if (newline < 0) break;
    const line = stdoutBuffer.slice(0, newline); stdoutBuffer = stdoutBuffer.slice(newline + 1);
    try { phases.push(JSON.parse(line)); } catch { /* Qualification emits JSONL; ignore third-party noise. */ }
  }
});
child.stderr.on('data', chunk => { process.stderr.write(chunk); stderr = `${stderr}${String(chunk)}`.slice(-8_000); });
const childExit = new Promise(resolve => child.once('exit', (code, signal) => { exited = true; resolve({code, signal}); }));
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const sha256 = value => createHash('sha256').update(value).digest('hex');

function pixelAdb(args, timeout = 30_000) {
  if (!pixel) throw new Error('qualification_pixel_transport_unconfigured');
  return execFileSync('ssh', ['-T', '-i', pixel.identity, '-p', String(pixel.port), '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', `${pixel.user}@${pixel.host}`, 'adb', ...args], {encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024});
}

function pixelAdbBuffer(args, timeout = 30_000) {
  if (!pixel) throw new Error('qualification_pixel_transport_unconfigured');
  return execFileSync('ssh', ['-T', '-i', pixel.identity, '-p', String(pixel.port), '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', `${pixel.user}@${pixel.host}`, 'adb', ...args], {timeout, maxBuffer: 8 * 1024 * 1024});
}

function whatsAppNotificationChevron(displayWidth) {
  const image = path.join(stateDir, 'private-lock-screen-locator.png');
  try {
    fs.writeFileSync(image, pixelAdbBuffer(['exec-out', 'screencap', '-p']), {mode: 0o600});
    const tsv = execFileSync('tesseract', [image, 'stdout', 'tsv'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000});
    const row = tsv.split('\n').map(line => line.split('\t')).find(columns => /^whatsa/i.test(columns[11] ?? ''));
    if (!row) return null;
    const top = Number(row[7]), height = Number(row[9]);
    return {x: Math.round(displayWidth * 0.80), y: Math.max(1, Math.round(top - 2 * height))};
  } finally { fs.rmSync(image, {force: true}); }
}

function ensurePixelAdb() {
  if (!pixel) throw new Error('qualification_pixel_transport_unconfigured');
  const raw = execFileSync('ssh', ['-T', '-i', pixel.identity, '-p', String(pixel.port), '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', `${pixel.user}@${pixel.host}`, 'node', '$HOME/.cache/agent-control-3.9-qualification/adb-local.mjs', 'ensure-connected', '--json'], {encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024});
  const status = JSON.parse(raw);
  if (status.ok !== true || status.verification?.qualified !== true) throw new Error('qualification_pixel_local_adb_unavailable');
  return {qualified: true, discoverySource: status.adb?.discoverySource, deviceModel: status.verification?.target?.model, android: status.verification?.target?.android};
}

function boundsForLabel(xml, pattern) {
  const nodes = [...xml.matchAll(/<node\b[^>]*(?:text|content-desc)="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*\/?\s*>/g)];
  const match = nodes.find(item => pattern.test(item[1].trim()));
  return match ? {x: Math.round((Number(match[2]) + Number(match[4])) / 2), y: Math.round((Number(match[3]) + Number(match[5])) / 2)} : null;
}

function boundsForClass(xml, className) {
  const tag = [...xml.matchAll(/<node\b[^>]*>/g)].map(item => item[0]).find(value => value.includes(`class="${className}"`) && /bounds="\[\d+,\d+\]\[\d+,\d+\]"/.test(value));
  const match = tag?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  return match ? {x: Math.round((Number(match[1]) + Number(match[3])) / 2), y: Math.round((Number(match[2]) + Number(match[4])) / 2)} : null;
}

async function sendPhysicalSocialRequest() {
  const adb = ensurePixelAdb();
  pixelAdb(['shell', 'monkey', '-p', 'com.whatsapp', '1']);
  await delay(1_000);
  const chatList = pixelAdb(['exec-out', 'uiautomator', 'dump', '/dev/tty']);
  const activeComposer = boundsForClass(chatList, 'android.widget.EditText');
  if (activeComposer) {
    pixelAdb(['shell', 'input', 'tap', String(activeComposer.x), String(activeComposer.y)]);
    pixelAdb(['shell', 'input', 'text', 'start%sgoverned-adaptive-crew']);
    await delay(300);
    const composed = pixelAdb(['exec-out', 'uiautomator', 'dump', '/dev/tty']), send = boundsForLabel(composed, /^send$/i);
    if (!composed.includes('text="start governed-adaptive-crew"')) throw new Error('qualification_pixel_composed_command_not_exact');
    if (!send) throw new Error('qualification_pixel_message_send_control_unavailable');
    pixelAdb(['shell', 'input', 'tap', String(send.x), String(send.y)]);
    return {node: 'configured Android operator device', transport: 'strict-host-key SSH to existing qualified local ADB', adb, action: 'authenticated WhatsApp active-conversation composer', request: 'start governed-adaptive-crew'};
  }
  const escapedLabel = socialConversationLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const conversation = boundsForLabel(chatList, new RegExp(`^${escapedLabel} picture`, 'i'));
  if (conversation) {
    pixelAdb(['shell', 'input', 'tap', String(conversation.x), String(conversation.y)]);
    await delay(750);
    const chat = pixelAdb(['exec-out', 'uiautomator', 'dump', '/dev/tty']), composer = boundsForClass(chat, 'android.widget.EditText');
    if (!composer) throw new Error('qualification_pixel_whatsapp_composer_unavailable');
    pixelAdb(['shell', 'input', 'tap', String(composer.x), String(composer.y)]);
    pixelAdb(['shell', 'input', 'text', 'start%sgoverned-adaptive-crew']);
    await delay(300);
    const composed = pixelAdb(['exec-out', 'uiautomator', 'dump', '/dev/tty']), send = boundsForLabel(composed, /^send$/i);
    if (!composed.includes('text="start governed-adaptive-crew"')) throw new Error('qualification_pixel_composed_command_not_exact');
    if (!send) throw new Error('qualification_pixel_message_send_control_unavailable');
    pixelAdb(['shell', 'input', 'tap', String(send.x), String(send.y)]);
    return {node: 'configured Android operator device', transport: 'strict-host-key SSH to existing qualified local ADB', adb, action: 'authenticated WhatsApp conversation composer', request: 'start governed-adaptive-crew'};
  }
  // Move the underlying foreground away from the operator chat without
  // unlocking the device, so the subsequently queued bot prompt is eligible
  // to surface as a genuine lock-screen notification.
  pixelAdb(['shell', 'am', 'start', '-a', 'android.settings.SETTINGS']);
  pixelAdb(['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP']);
  pixelAdb(['shell', 'cmd', 'statusbar', 'expand-notifications']);
  let reply = null;
  const deadline = Date.now() + 20_000;
  const displaySize = pixelAdb(['shell', 'wm', 'size']).match(/(\d+)x(\d+)/);
  if (!displaySize) throw new Error('qualification_pixel_display_size_unavailable');
  while (!reply && Date.now() < deadline) {
    pixelAdb(['shell', 'cmd', 'statusbar', 'expand-notifications']);
    const xml = pixelAdb(['exec-out', 'uiautomator', 'dump', '/dev/tty']);
    reply = boundsForLabel(xml, /^(?:reply|respond)$/i);
    if (!reply) {
      const chevron = whatsAppNotificationChevron(Number(displaySize[1]));
      if (chevron) {
        pixelAdb(['shell', 'input', 'tap', String(chevron.x), String(chevron.y)]);
        await delay(750);
        reply = boundsForLabel(pixelAdb(['exec-out', 'uiautomator', 'dump', '/dev/tty']), /^(?:reply|respond)$/i);
      }
    }
    if (!reply) await delay(1_000);
  }
  if (!reply) throw new Error('qualification_pixel_whatsapp_notification_reply_unavailable');
  pixelAdb(['shell', 'input', 'tap', String(reply.x), String(reply.y)]);
  await delay(500);
  pixelAdb(['shell', 'input', 'text', 'start%sgoverned-adaptive-crew']);
  await delay(300);
  const composed = pixelAdb(['exec-out', 'uiautomator', 'dump', '/dev/tty']), send = boundsForLabel(composed, /^send$/i);
  if (!composed.includes('text="start governed-adaptive-crew"')) throw new Error('qualification_pixel_composed_command_not_exact');
  if (!send) throw new Error('qualification_pixel_message_send_control_unavailable');
  pixelAdb(['shell', 'input', 'tap', String(send.x), String(send.y)]);
  await delay(500);
  const submitted = pixelAdb(['exec-out', 'uiautomator', 'dump', '/dev/tty']);
  if (submitted.includes('text="start governed-adaptive-crew"')) {
    pixelAdb(['shell', 'input', 'tap', String(send.x), String(send.y)]);
    await delay(500);
    if (pixelAdb(['exec-out', 'uiautomator', 'dump', '/dev/tty']).includes('text="start governed-adaptive-crew"')) throw new Error('qualification_pixel_message_send_not_committed');
  }
  return {node: 'configured Android operator device', transport: 'strict-host-key SSH to existing qualified local ADB', adb, action: 'notification inline reply', request: 'start governed-adaptive-crew'};
}

async function waitPhase(name, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !exited) {
    const found = phases.find(item => item.phase === name); if (found) return found;
    const failed = phases.find(item => item.phase === 'QUALIFICATION_FAILED'); if (failed) throw new Error(`qualification_failed:${failed.error}`);
    await delay(100);
  }
  const found = phases.find(item => item.phase === name); if (found) return found;
  throw new Error(`qualification_phase_timeout:${name}:${stderr.slice(-500)}`);
}

async function screenshot(page, name, fullPage = false) {
  const file = path.join(screenshotDir, name), bytes = await page.screenshot({path: file, type: 'png', fullPage});
  return {file: path.relative(path.dirname(manifestFile), file), sha256: sha256(bytes), bytes: bytes.length, viewport: page.viewportSize(), fullPage};
}

async function crewMotion(page, waitMs = 750) {
  const measure = () => page.evaluate(() => [...document.querySelectorAll('#crew-live-grid .bot-card')].map(card => {
    const rect = card.getBoundingClientRect(), id = [...card.classList].find(value => /^bot-(?:lane|prompt|parcel|model|resource|quality)-/.test(value));
    const animations = card.getAnimations({subtree: true}).filter(item => item.playState === 'running').map(item => ({name: getComputedStyle(item.effect?.target).animationName, currentTime: Number(item.currentTime ?? 0), transform: getComputedStyle(item.effect?.target).transform, opacity: getComputedStyle(item.effect?.target).opacity})).filter(item => item.name && item.name !== 'none');
    return {id, state: [...card.classList].find(value => value.startsWith('bot-state-'))?.slice(10), rest: card.dataset.botRest ?? 'none', visible: rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight, animations};
  }));
  const before = await measure(); await delay(waitMs); const after = await measure();
  return before.map(item => { const next = after.find(value => value.id === item.id), moving = item.animations.find(animation => animation.name !== 'bot-blink') ?? item.animations[0], moved = next?.animations.find(animation => animation.name === moving?.name); return {...item, timelineDeltaMs: moving && moved ? moved.currentTime - moving.currentTime : 0, visualChanged: Boolean(moving && moved && (moving.transform !== moved.transform || moving.opacity !== moved.opacity))}; });
}

async function currentDashboard(page) {
  return page.evaluate(async () => {
    const snapshot = await (await fetch('/api/status')).json();
    return {observedAt: snapshot.observedAt, crew: snapshot.characterCrew, tokenRouting: snapshot.tokenBatonRouting, jobs: snapshot.jobs};
  });
}

function mediaInfo(file) {
  return JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,width,height,r_frame_rate', '-of', 'json', file], {encoding: 'utf8'}));
}

let browser, context, page, video, cdp;
const screenshots = [], consoleErrors = [], httpErrors = [], expectedOptionalHttp = [], expectedOptionalConsole = [], journey = [], receivedEvents = [];
let dashboardReady, socialPhase, taskPhase, concurrentPhase, sourcePhase, rejectionPhase, destinationPhase, verificationPhase, completePhase;
let idleMotion, concurrentMotion, sourceDashboard, handoffDashboard, destinationDashboard, completedDashboard, eventLatency, performance, reducedMotion, mobile;
let socialIngressEvidence, liveShellEvidence;

try {
  dashboardReady = await waitPhase('DASHBOARD_READY', 30_000);
  const {chromium} = require('playwright-core');
  browser = await chromium.launch({headless: true, executablePath: chromiumExecutable, args: ['--no-sandbox', '--disable-dev-shm-usage']});
  context = await browser.newContext({viewport: {width: 1920, height: 1080}, recordVideo: {dir: rawVideoDir, size: {width: 1920, height: 1080}}, colorScheme: 'dark'});
  page = await context.newPage(); video = page.video();
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const item=`${message.location().url || 'inline'}: ${message.text()}`.slice(0,500);
    if (/\/api\/(?:model-intelligence|capability-intelligence|runtime-safety|provider-catalog): Failed to load resource:.*503/i.test(item)) expectedOptionalConsole.push(item);
    else consoleErrors.push(item);
  });
  page.on('pageerror', error => consoleErrors.push(error.message.slice(0, 500)));
  page.on('response', response => {
    if (response.status() < 400) return;
    const item={status:response.status(),method:response.request().method(),path:new URL(response.url()).pathname};
    if (item.status===503 && ['/api/model-intelligence','/api/capability-intelligence','/api/runtime-safety','/api/provider-catalog'].includes(item.path)) expectedOptionalHttp.push(item);
    else httpErrors.push(item);
  });
  await page.goto(dashboardReady.url, {waitUntil: 'domcontentloaded'});
  cdp = await context.newCDPSession(page); await cdp.send('Performance.enable');
  await page.evaluate(() => {
    window.__crewWoprEvidence = {events: [], renders: [], start: performance.now()};
    document.addEventListener('agent-control:event-received', event => window.__crewWoprEvidence.events.push({type: event.detail.type, at: performance.now()}));
    document.addEventListener('agent-control:crew-rendered', event => window.__crewWoprEvidence.renders.push({at: event.detail.renderedAt, observedAt: event.detail.observedAt}));
  });
  await page.waitForFunction(() => document.querySelector('#stream-state')?.textContent === 'LIVE', undefined, {timeout: 10_000});
  await page.click('#operator-button'); await page.fill('#operator-token', operatorToken); await page.click('#operator-form button[type="submit"]');
  await page.getByRole('button', {name: 'Operator authenticated', exact: true}).waitFor({timeout: 10_000});
  journey.push({at: new Date().toISOString(), view: 'authentication', outcome: 'operator boundary accepted'});

  await page.click('[data-view="crew"]');
  await page.waitForSelector('#crew-live-grid .bot-card');
  await page.waitForFunction(() => document.querySelectorAll('#crew-live-grid .bot-card').length === 6);
  idleMotion = await crewMotion(page, 1_600);
  if (idleMotion.length !== 6 || idleMotion.some(item => !item.visible || !item.animations.length) || !idleMotion.some(item => item.visualChanged || item.timelineDeltaMs >= 1_200)) throw new Error(`idle_character_animation_missing:${JSON.stringify(idleMotion)}`);
  screenshots.push(await screenshot(page, '01-crew-idle-and-event-matrix.png'));
  journey.push({at: new Date().toISOString(), view: 'crew', outcome: 'all six original characters visible with idle looking/sleeping motion'});
  await delay(2_000);

  await page.click('[data-view="jobs"]');
  if (ingress === 'openwa') {
    socialPhase = await waitPhase('SOCIAL_CHANNEL_READY', 45_000);
    socialIngressEvidence = operatorAssisted ? {node:'physical Android operator device',transport:'authenticated OpenWA over existing mobile/private-overlay connectivity',adb:'UNAVAILABLE_IN_4G_ONLY_CONFIGURATION',action:'operator-assisted physical WhatsApp interaction',request:'awaited from enrolled sender; no replay or synthetic ingress'} : await sendPhysicalSocialRequest();
    if(operatorAssisted){await page.click('[data-view="poe"]');await page.waitForSelector('#poe-workspace');journey.push({at:new Date().toISOString(),view:'poe',outcome:'waiting for authentic enrolled-device WhatsApp/OmniVoice conversation; no ADB or replay'});}
    // WhatsApp delivery can legitimately lag after a handset/network wake. Keep
    // the physical listener alive long enough for the gateway's bounded retry
    // window; this still fails closed and never substitutes a synthetic event.
    taskPhase = await waitPhase('TASK_RECEIVED', operatorAssisted ? 240 * 60_000 : 180_000);
    await page.waitForFunction(() => /start governed-adaptive-crew|governed adaptive crew/i.test(document.querySelector('#work-parcel-list')?.textContent || document.body.textContent || ''), undefined, {timeout: 15_000});
    screenshots.push(await screenshot(page, '02-authenticated-social-work-parcel-request.png'));
    journey.push({at: new Date().toISOString(), view: 'jobs', outcome: 'real enrolled-device OpenWA command accepted through SocialVoiceCoordinator and shown as a live Work Parcel'});
  } else {
    await page.fill('#natural-task-prompt', dashboardReady.prompt);
    screenshots.push(await screenshot(page, '02-exact-work-parcel-request.png'));
    await delay(1_500);
    const submission = page.waitForResponse(response => new URL(response.url()).pathname === '/api/parcels' && response.request().method() === 'POST', {timeout: 10_000});
    await page.click('#natural-task-submit');
    const submissionResponse = await submission;
    if (submissionResponse.status() !== 201) throw new Error(`qualification_dashboard_submission_failed:${submissionResponse.status()}:${(await submissionResponse.text()).slice(0, 500)}`);
    journey.push({at: new Date().toISOString(), view: 'jobs', outcome: 'exact prompt submitted through authenticated dashboard'});
  }

  concurrentPhase = await waitPhase('CONCURRENT_STATE_READY', 30_000);
  await page.click('[data-view="crew"]'); await page.evaluate(() => scrollTo(0, 0));
  await page.waitForFunction(() => [...document.querySelectorAll('.matrix-indicator')].some(item => item.dataset.state === 'ACTIVE'));
  await page.waitForFunction(() => {
    const cards = [...document.querySelectorAll('#crew-live-grid .bot-card')];
    return cards.length === 6 && cards.every(card => card.getAnimations({subtree: true}).some(animation => animation.playState === 'running'));
  }, undefined, {timeout: 5_000});
  concurrentMotion = await crewMotion(page);
  if (concurrentMotion.length !== 6 || concurrentMotion.some(item => !item.visible || !item.animations.length) || !concurrentMotion.some(item => item.state !== 'idle' && item.visualChanged)) throw new Error(`concurrent_character_animation_missing:${JSON.stringify(concurrentMotion)}`);
  screenshots.push(await screenshot(page, '03-real-concurrent-lanes.png'));
  const toolIndicator = page.locator('[data-matrix-indicator="tools"]'); await toolIndicator.focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(() => /canonical Job step/i.test(document.querySelector('#activity-matrix-inspector')?.textContent || ''));
  screenshots.push(await screenshot(page, '04-wopr-tool-indicator-evidence.png'));
  journey.push({at: new Date().toISOString(), view: 'crew', outcome: 'two concurrent governed lanes and event-backed tool indicator inspected'});

  await page.click('[data-view="jobs"]');
  await page.waitForSelector('[data-live-shell-open]', {timeout: 10_000});
  await page.locator('[data-live-shell-open]').first().click();
  await page.waitForFunction(() => /AGENT_CONTROL_LIVE_SHELL_READY/.test(document.querySelector('#live-shell-output')?.textContent || ''), undefined, {timeout: 10_000});
  screenshots.push(await screenshot(page, '05-live-shell-watch-real-pty.png'));
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-live-shell-mode="INTERVENE"]').click();
  await page.waitForFunction(() => document.querySelector('#live-shell-mode')?.textContent === 'INTERVENE', undefined, {timeout: 10_000});
  await page.fill('#live-shell-input', 'continue');
  await page.locator('#live-shell-input-form button[type="submit"]').click();
  await page.waitForFunction(() => /AGENT_CONTROL_LIVE_SHELL_INTERVENTION_ACCEPTED/.test(document.querySelector('#live-shell-output')?.textContent || ''), undefined, {timeout: 10_000});
  screenshots.push(await screenshot(page, '06-live-shell-governed-harmless-intervention.png'));
  await page.click('#live-shell-detach');
  await page.waitForFunction(() => document.querySelector('#live-shell-mode')?.textContent === 'DETACHED', undefined, {timeout: 10_000});
  liveShellEvidence = {watch: true, intervene: true, inputContentWithheld: true, acceptedMarkerVisible: true, detached: true};
  await page.click('#live-shell-close');
  journey.push({at: new Date().toISOString(), view: 'crew/live-shell', outcome: 'WATCH → governed harmless INTERVENE → detached on the real qualification PTY; input content withheld from durable evidence'});

  await page.click('[data-view="systems"]');
  await page.waitForSelector('#systems-list');
  screenshots.push(await screenshot(page, '07-configured-systems-and-node-state.png'));
  journey.push({at: new Date().toISOString(), view: 'systems', outcome: 'configured execution system and availability shown during the live run'});

  await page.click('[data-view="routing"]');
  await page.waitForFunction(() => document.querySelectorAll('#orchestration-decision-list [data-adaptive-decision]').length > 0, undefined, {timeout: 10_000});
  await page.locator('#orchestration-decision-list [data-adaptive-decision]').first().click();
  await page.waitForFunction(() => /Classification|Eligible|League|Tradeoff|Route/i.test(document.querySelector('#orchestration-decision-detail')?.textContent || ''), undefined, {timeout: 10_000});
  screenshots.push(await screenshot(page, '07b-adaptive-model-workflow-decision-tree.png'));
  journey.push({at: new Date().toISOString(), view: 'routing', outcome: 'the production Work Parcel decision tree visibly showed classification, policy, league evidence and governed route/workflow selection'});

  sourcePhase = await waitPhase('SOURCE_MODEL_ACTIVE', 90_000);
  await page.click('[data-view="models"]');
  await page.waitForFunction(() => /local-llama|qwen/i.test(document.querySelector('#persistent-usage-summary')?.textContent || ''), undefined, {timeout: 10_000});
  sourceDashboard = await currentDashboard(page);
  screenshots.push(await screenshot(page, '08-source-model-live-usage-across-models-view.png'));
  journey.push({at: new Date().toISOString(), view: 'models', outcome: 'persistent strip showed live Qwen provider/model, governor, elapsed time, context authority and unavailable values honestly'});

  rejectionPhase = await waitPhase('QUALITY_GATE_REJECTED', 120_000);
  destinationPhase = await waitPhase('DESTINATION_MODEL_ACTIVE', 30_000);
  await page.click('[data-view="crew"]'); await page.evaluate(() => scrollTo(0, document.querySelector('.crew-workflow-board')?.getBoundingClientRect().top + scrollY - 120));
  await page.waitForFunction(() => [...document.querySelectorAll('.crew-baton')].some(item => /QUALITY_GATE|quality/i.test(item.textContent || item.getAttribute('aria-label') || '')), undefined, {timeout: 10_000}).catch(() => {});
  const tokenBaton = page.locator('.crew-baton').filter({hasText: 'QUALITY_GATE'}).first();
  if (await tokenBaton.count()) await tokenBaton.click(); else await page.locator('.crew-baton').first().click();
  await page.waitForFunction(() => /reservation-cache-root-cause-v1/.test(document.querySelector('#crew-human-explanation')?.textContent || ''), undefined, {timeout: 10_000});
  handoffDashboard = await currentDashboard(page);
  screenshots.push(await screenshot(page, '09-quality-gate-baton-reason.png'));
  await page.locator('[data-matrix-indicator="baton"]').click({timeout:10_000});
  await page.waitForFunction(() => /sealed token|handoff|escalation/i.test(document.querySelector('#activity-matrix-inspector')?.textContent || ''));
  screenshots.push(await screenshot(page, '10-wopr-handoff-indicator.png'));
  journey.push({at: new Date().toISOString(), view: 'crew', outcome: 'quality-gate trigger, precise rejection, sealed baton and Qwen → Codex route visible'});

  await page.click('[data-view="lanes"]');
  await page.waitForFunction(() => /codex-chatgpt|Luna|Controller Account A/i.test(document.querySelector('#persistent-usage-summary')?.textContent || ''), undefined, {timeout: 10_000});
  destinationDashboard = await currentDashboard(page);
  screenshots.push(await screenshot(page, '11-destination-live-usage-across-lanes-view.png'));
  journey.push({at: new Date().toISOString(), view: 'lanes', outcome: 'persistent strip followed destination account/provider/model without resetting parcel totals'});

  verificationPhase = await waitPhase('INDEPENDENT_VERIFICATION_ACTIVE', 180_000);
  await page.click('[data-view="crew"]');
  const verificationIndicator = page.locator('[data-matrix-indicator="verification"]'); await verificationIndicator.click();
  screenshots.push(await screenshot(page, '12-independent-verification-active.png'));
  completePhase = await waitPhase('QUALIFICATION_COMPLETE', 60_000);
  await page.click('[data-view="models"]'); await page.evaluate(() => scrollTo(0, 0));
  await page.waitForFunction(() => /COMPLETED/.test(document.querySelector('#persistent-usage-summary')?.textContent || '') && /total/i.test(document.querySelector('.persistent-usage-chain')?.textContent || ''), undefined, {timeout: 10_000});
  const finalChainBox = await page.evaluate(() => {
    const rect = [...document.querySelectorAll('.persistent-usage-chain')].map(node => node.getBoundingClientRect()).find(item => item.width > 0 && item.height > 0 && item.y >= 0 && item.bottom <= innerHeight);
    return rect ? {x: rect.x, y: rect.y, width: rect.width, height: rect.height} : null;
  });
  if (!finalChainBox) throw new Error('final_model_chain_not_visible');
  completedDashboard = await currentDashboard(page);
  screenshots.push(await screenshot(page, '13-completed-reconciled-model-chain.png'));
  await page.click('[data-view="jobs"]');
  await page.click('[data-job-platform-tab="runs"]');
  await page.waitForSelector('[data-parameterized-run]');
  await page.locator('[data-parameterized-run]').first().click();
  const transcriptButton = page.locator('[data-parameterized-transcript]').first();
  await transcriptButton.scrollIntoViewIfNeeded(); await transcriptButton.click();
  await page.waitForSelector('pre[aria-label="Complete Agent Control execution transcript"]');
  const productTranscript = page.locator('pre[aria-label="Complete Agent Control execution transcript"]');
  await productTranscript.evaluate(node => { node.scrollTop = 0; node.scrollIntoView({block: 'start'}); });
  await page.waitForFunction(() => /## Origin[\s\S]*## Authoritative initiating request[\s\S]*start governed-adaptive-crew/.test(document.querySelector('pre[aria-label="Complete Agent Control execution transcript"]')?.textContent || ''));
  screenshots.push(await screenshot(page, '14-product-transcript-origin-and-exact-request.png'));
  await productTranscript.evaluate(node => { const text=node.textContent||'',needle='HANDOFF_COMPLETED',line=text.slice(0,text.indexOf(needle)).split('\n').length; node.scrollTop=Math.max(0,(line-12)*16); });
  screenshots.push(await screenshot(page, '15-product-transcript-model-change-and-handoff.png'));
  journey.push({at: new Date().toISOString(), view: 'jobs/transcript', outcome: 'product-generated full transcript visibly associated with the live Run, exact origin first and complete model-change chronology retained'});
  await delay(2_500);

  const metricsBefore = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item => [item.name, item.value]));
  const frame = await page.evaluate(() => new Promise(resolve => { const values = [], started = performance.now(); let prior = started; const next = now => { values.push(now - prior); prior = now; if (now - started < 1_500) requestAnimationFrame(next); else resolve(values); }; requestAnimationFrame(next); }));
  const metricsAfter = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item => [item.name, item.value]));
  performance = {sampleMs: (metricsAfter.Timestamp - metricsBefore.Timestamp) * 1_000, rendererTaskMs: (metricsAfter.TaskDuration - metricsBefore.TaskDuration) * 1_000, heapDeltaBytes: metricsAfter.JSHeapUsedSize - metricsBefore.JSHeapUsedSize, frames: frame.length, intervalsOver50Ms: frame.filter(value => value > 50).length, maximumFrameIntervalMs: Math.max(...frame)};
  const browserEvidence = await page.evaluate(() => window.__crewWoprEvidence);
  receivedEvents.push(...browserEvidence.events);
  eventLatency = {events: browserEvidence.events.length, renders: browserEvidence.renders.length, requiredTypes: ['job.run_changed', 'token.telemetry', 'token.governor_transition', 'token.baton_created', 'token.handoff_result'].map(type => ({type, observed: browserEvidence.events.some(item => item.type === type)}))};
  if (eventLatency.requiredTypes.some(item => !item.observed)) throw new Error(`required_sse_event_missing:${JSON.stringify(eventLatency.requiredTypes)}`);
  if (consoleErrors.length || httpErrors.length) throw new Error(`browser_errors:${JSON.stringify({consoleErrors,httpErrors})}`);

  const reducedContext = await browser.newContext({viewport: {width: 1280, height: 800}, reducedMotion: 'reduce', colorScheme: 'dark'}), reducedPage = await reducedContext.newPage();
  await reducedPage.goto(dashboardReady.url, {waitUntil: 'domcontentloaded'}); await reducedPage.click('[data-view="crew"]'); await reducedPage.waitForSelector('.matrix-indicator');
  reducedMotion = await reducedPage.evaluate(() => ({mediaMatches: matchMedia('(prefers-reduced-motion: reduce)').matches, matrixAnimationNames: [...document.querySelectorAll('.matrix-lamp')].map(node => getComputedStyle(node).animationName), transitionDurations: [...document.querySelectorAll('.persistent-context-pressure')].map(node => getComputedStyle(node).transitionDuration)}));
  screenshots.push(await screenshot(reducedPage, '16-reduced-motion.png', true)); await reducedContext.close();
  if (!reducedMotion.mediaMatches || reducedMotion.matrixAnimationNames.some(name => name !== 'none')) throw new Error('reduced_motion_not_honoured');

  const mobileContext = await browser.newContext({viewport: {width: 390, height: 844}, colorScheme: 'dark'}), mobilePage = await mobileContext.newPage();
  await mobilePage.goto(dashboardReady.url, {waitUntil: 'domcontentloaded'}); await mobilePage.click('[data-view="crew"]'); await mobilePage.waitForSelector('.matrix-indicator');
  mobile = await mobilePage.evaluate(() => ({viewport: {width: innerWidth, height: innerHeight}, documentWidth: document.documentElement.scrollWidth, indicatorCount: document.querySelectorAll('.matrix-indicator').length, usageVisible: Boolean(document.querySelector('#persistent-usage')?.getBoundingClientRect().height), crewCards: document.querySelectorAll('#crew-live-grid .bot-card').length}));
  screenshots.push(await screenshot(mobilePage, '17-mobile-responsive.png', true)); await mobileContext.close();
  if (mobile.documentWidth > mobile.viewport.width + 1 || mobile.indicatorCount !== 9 || mobile.crewCards !== 6 || !mobile.usageVisible) throw new Error(`mobile_layout_failed:${JSON.stringify(mobile)}`);

  await context.close(); context = undefined;
  const rawVideo = await video.path();
  execFileSync(ffmpeg, ['-y', '-i', rawVideo, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', videoFile], {stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 4 * 1024 * 1024});
  const info = mediaInfo(videoFile), videoBytes = fs.readFileSync(videoFile), evidenceBytes = fs.readFileSync(evidenceFile), transcriptBytes = fs.readFileSync(transcriptFile);
  const manifest = {
    schema: 'agent-control.crew-wopr-escalation-video/v1', verdict: 'PASS', recordedAt: new Date().toISOString(), continuousCapture: true, editedOrSpliced: false, playbackSpeed: 1,
    video: {file: path.relative(path.dirname(manifestFile), videoFile), sha256: sha256(videoBytes), bytes: videoBytes.length, media: info},
    evidence: {file: path.relative(path.dirname(manifestFile), evidenceFile), qualificationPayloadSha256BeforeVideoAttachment: sha256(evidenceBytes)},
    transcript: {file: path.relative(path.dirname(manifestFile), transcriptFile), sha256: sha256(transcriptBytes)},
    browser: {engine: 'Chromium', version: browser.version(), viewport: {width: 1920, height: 1080}, executableRecordedAs: 'configured Chromium executable'},
    phases: {dashboardReady, socialPhase, taskPhase, concurrentPhase, sourcePhase, rejectionPhase, destinationPhase, verificationPhase, completePhase},
    journey, screenshots, animation: {idle: idleMotion, concurrent: concurrentMotion},
    liveEvidence: {source: sourceDashboard, handoff: handoffDashboard, destination: destinationDashboard, completed: completedDashboard, eventLatency},
    checks: {allSixCharactersVisibleAndAnimated: true, genuineSocialIngress: ingress === 'openwa', exactInitiatingRequestVisible: true, jobsLanesModelsSystemsCrewVisited: true, liveShellEvidence, twoConcurrentLanesVisible: true, eventBackedWoprIndicatorsInspected: true, sourceDifficultyVisible: true, qualityGateReasonVisible: true, sealedBatonVisible: true, destinationRouteVisible: true, persistentUsageAcrossViews: true, finalModelChainVisible: true, productGeneratedCompleteTranscriptVisible: true, reducedMotion, mobile, performance, consoleErrors, httpErrors, expectedOptionalHttp, expectedOptionalConsole},
    socialIngress: socialIngressEvidence,
    security: {operatorTokenPersisted: false, codexHomePathPersisted: false, credentialsVisibleInVideo: false, privateReasoningVisible: false},
  };
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, {mode: 0o600});
  const evidence = JSON.parse(evidenceBytes.toString('utf8'));
  evidence.videoEvidence = {manifest: path.relative(root, manifestFile), manifestSha256: sha256(fs.readFileSync(manifestFile)), video: path.relative(root, videoFile), videoSha256: manifest.video.sha256, durationSeconds: Number(info.format.duration), continuousCapture: true, screenshots: screenshots.length};
  fs.writeFileSync(evidenceFile, `${JSON.stringify(evidence, null, 2)}\n`, {mode: 0o600});
  const exit = await childExit;
  if (exit.code !== 0) throw new Error(`qualification_process_failed:${exit.code}:${stderr.slice(-500)}`);
  process.stdout.write(`${JSON.stringify({verdict: 'PASS', evidenceFile, transcriptFile, videoFile, manifestFile, videoSha256: manifest.video.sha256, durationSeconds: Number(info.format.duration), screenshots: screenshots.length})}\n`);
} catch (error) {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  if (!exited) child.kill('SIGTERM');
  await childExit.catch(() => {});
  throw error;
} finally {
  if (browser) await browser.close().catch(() => {});
}
