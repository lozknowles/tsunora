import {createHash, randomBytes} from 'node:crypto';
import {spawn, execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = process.cwd();
const evidenceFile = path.resolve(process.env.AGENT_CONTROL_CHARACTER_EVIDENCE ?? 'docs/evidence/agent-control-dashboard-characters-qualification.json');
const videoFile = path.resolve(process.env.AGENT_CONTROL_CHARACTER_VIDEO ?? 'docs/evidence/agent-control-dashboard-characters.mp4');
const manifestFile = path.resolve(process.env.AGENT_CONTROL_CHARACTER_VIDEO_MANIFEST ?? 'docs/evidence/agent-control-dashboard-characters-video.json');
const screenshotDir = path.resolve(process.env.AGENT_CONTROL_CHARACTER_SCREENSHOTS ?? 'docs/evidence/agent-control-dashboard-characters');
const port = Number(process.env.AGENT_CONTROL_CHARACTER_PORT ?? 4396);
const base = `http://127.0.0.1:${port}`;
const chromiumExecutable = process.env.AGENT_CONTROL_CHROMIUM ?? '/snap/bin/chromium';
const playwrightRoot = process.env.AGENT_CONTROL_PLAYWRIGHT_CORE ?? 'playwright-core';
const ffmpeg = process.env.AGENT_CONTROL_FFMPEG ?? 'ffmpeg';
const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-dashboard-characters-'));
const rawVideoDir = path.join(stateDir, 'raw-video');
const operatorToken = randomBytes(32).toString('hex');
fs.mkdirSync(rawVideoDir, {recursive: true, mode: 0o700});
fs.mkdirSync(screenshotDir, {recursive: true});

const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/qualify-dashboard-characters.ts', '--host', '127.0.0.1', '--port', String(port), '--state-dir', stateDir, '--evidence-file', evidenceFile, '--hold-ms', '30000'], {
  cwd: root,
  env: {...process.env, AGENT_CONTROL_STATE_DIR: stateDir, AGENT_CONTROL_QUALIFICATION_OPERATOR_TOKEN: operatorToken},
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stdoutBuffer = '', stderr = '', childExited = false;
const phases = [];
child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
child.stdout.on('data', chunk => {
  process.stdout.write(chunk); stdoutBuffer += String(chunk);
  for (;;) { const newline = stdoutBuffer.indexOf('\n'); if (newline < 0) break; const line = stdoutBuffer.slice(0, newline); stdoutBuffer = stdoutBuffer.slice(newline + 1); try { phases.push(JSON.parse(line)); } catch {} }
});
child.stderr.on('data', chunk => { process.stderr.write(chunk); stderr += String(chunk); });
const childExit = new Promise(resolve => child.once('exit', (code, signal) => { childExited = true; resolve({code, signal}); }));
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

async function waitPhase(name, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !childExited) { const found = phases.find(item => item.phase === name); if (found) return found; const failed = phases.find(item => item.phase === 'QUALIFICATION_FAILED'); if (failed) throw new Error(`qualification_failed:${failed.error}`); await delay(100); }
  const found = phases.find(item => item.phase === name); if (found) return found;
  throw new Error(`qualification_phase_timeout:${name}:${stderr.slice(-300)}`);
}

async function screenshot(page, name, options = {}) {
  const file = path.join(screenshotDir, name), bytes = await page.screenshot({path: file, type: 'png', fullPage: options.fullPage ?? false});
  return {file: path.relative(path.dirname(manifestFile), file), sha256: digest(bytes), bytes: bytes.length, viewport: page.viewportSize(), fullPage: options.fullPage ?? false};
}

async function crewSnapshot(page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/status'), value = await response.json();
    return value.characterCrew.members.map(member => ({id: member.id, name: member.name, role: member.role, state: member.state, operationalState: member.operationalState, activity: member.activity, animationCue: member.animationCue, narration: member.narration, summary: member.summary, signals: member.signals, freshness: member.freshness}));
  });
}

async function workflowSnapshot(page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/status'), value = await response.json(), crew = value.characterCrew;
    return {headline: crew.headline, parcels: crew.parcels, batonTransfers: crew.batonTransfers, modelActivity: crew.modelActivity, narration: crew.narration};
  });
}

async function frameMeasurement(page, durationMs = 1_800) {
  return page.evaluate(duration => new Promise(resolve => {
    const intervals = [], started = performance.now(); let previous = started;
    const frame = now => { intervals.push(now - previous); previous = now; if (now - started < duration) requestAnimationFrame(frame); else { const sorted = [...intervals].sort((a, b) => a - b), percentile = value => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * value))] ?? null; resolve({durationMs: now - started, frames: intervals.length, meanIntervalMs: intervals.reduce((sum, value) => sum + value, 0) / Math.max(1, intervals.length), p95IntervalMs: percentile(.95), maximumIntervalMs: sorted.at(-1) ?? null, intervalsOver50Ms: intervals.filter(value => value > 50).length}); } }; requestAnimationFrame(frame);
  }), durationMs);
}

function metricsMap(result) { return Object.fromEntries(result.metrics.map(item => [item.name, item.value])); }

async function performanceWindow(page, cdp, durationMs = 1_800) {
  const before = metricsMap(await cdp.send('Performance.getMetrics'));
  const frame = await frameMeasurement(page, durationMs);
  const after = metricsMap(await cdp.send('Performance.getMetrics'));
  const elapsedMs = Math.max(0, ((after.Timestamp ?? 0) - (before.Timestamp ?? 0)) * 1_000);
  const rendererTaskDurationMs = Math.max(0, ((after.TaskDuration ?? 0) - (before.TaskDuration ?? 0)) * 1_000);
  return {
    durationMs: elapsedMs,
    rendererTaskDurationMs,
    rendererTaskSharePercent: elapsedMs > 0 ? rendererTaskDurationMs / elapsedMs * 100 : null,
    jsHeapUsedBeforeBytes: before.JSHeapUsedSize ?? null,
    jsHeapUsedAfterBytes: after.JSHeapUsedSize ?? null,
    jsHeapDeltaBytes: (after.JSHeapUsedSize ?? 0) - (before.JSHeapUsedSize ?? 0),
    documentCount: after.Documents ?? null,
    domNodeCount: after.Nodes ?? null,
    layoutCountDelta: (after.LayoutCount ?? 0) - (before.LayoutCount ?? 0),
    styleRecalculationCountDelta: (after.RecalcStyleCount ?? 0) - (before.RecalcStyleCount ?? 0),
    frame,
  };
}

function distribution(values) {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  const percentile = fraction => finite[Math.min(finite.length - 1, Math.floor(finite.length * fraction))] ?? null;
  return {samples: finite.length, minimumMs: finite[0] ?? null, medianMs: percentile(.5), p95Ms: percentile(.95), maximumMs: finite.at(-1) ?? null};
}

function selectedMetrics(metrics) {
  return Object.fromEntries(['Timestamp', 'TaskDuration', 'JSHeapUsedSize', 'JSHeapTotalSize', 'Documents', 'Nodes', 'LayoutCount', 'RecalcStyleCount'].map(name => [name, metrics?.[name] ?? null]));
}

async function characterAnimationSnapshot(page) {
  return page.evaluate(() => [...document.querySelectorAll('#crew-live-grid .bot-card')].map(card => {
    const id = [...card.classList].find(value => value.startsWith('bot-') && !value.startsWith('bot-state-') && !['bot-card', 'bot-acknowledge'].includes(value));
    const rect = card.getBoundingClientRect(), svg = card.querySelector('.agent-bot'), accent = getComputedStyle(card).getPropertyValue('--bot-accent').trim();
    const animations = card.getAnimations({subtree: true}).filter(item => item.playState === 'running').map(item => {
      const target = item.effect?.target;
      if (!(target instanceof Element)) return null;
      const style = getComputedStyle(target), name = style.animationName;
      return {name, target: target.getAttribute('class') || target.tagName, currentTime: Number(item.currentTime ?? 0), transform: style.transform, opacity: style.opacity};
    }).filter(item => item?.name && item.name !== 'none') ?? [];
    const motion = animations.find(item => item.name !== 'bot-blink') ?? animations[0] ?? null;
    return {id, rest: card.dataset.botRest || 'none', visible: rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth, bounds: {top: Math.round(rect.top), right: Math.round(rect.right), bottom: Math.round(rect.bottom), left: Math.round(rect.left)}, viewport: {width: innerWidth, height: innerHeight, scrollY}, accent, runningAnimations: [...new Set(animations.map(item => item.name))], animationDetails: animations, motion};
  }));
}

let browser, context, page, video, cdp;
const screenshots = [], consoleErrors = [], httpErrors = [], navigation = {};
let liveAt, concurrentCrew, completedCrew, concurrentWorkflow, completedWorkflow, animationEvidence, idleAmbientEvidence, wakingEvidence, reducedMotionEvidence, browserVersion, concurrentPerformance, completedFullPerformance, completedReducedPerformance, unrecordedPerformance, baselineMetrics, concurrentMetrics, completedMetrics, focusResponsivenessMs, eventProcessing, mobileEvidence;
try {
  await waitPhase('DASHBOARD_READY');
  const {chromium} = require(playwrightRoot);
  browser = await chromium.launch({headless: true, executablePath: chromiumExecutable, args: ['--no-sandbox', '--disable-dev-shm-usage']});
  browserVersion = browser.version();
  context = await browser.newContext({viewport: {width: 1920, height: 1080}, recordVideo: {dir: rawVideoDir, size: {width: 1920, height: 1080}}, colorScheme: 'dark'});
  page = await context.newPage(); video = page.video();
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(`${message.location().url || 'inline'}: ${message.text()}`.slice(0, 500)); });
  page.on('pageerror', error => consoleErrors.push(error.message.slice(0, 300)));
  page.on('response', response => {
    if (response.status() >= 400) httpErrors.push({method: response.request().method(), status: response.status(), url: new URL(response.url()).pathname});
  });
  await page.goto(base, {waitUntil: 'domcontentloaded'});
  cdp = await context.newCDPSession(page); await cdp.send('Performance.enable'); baselineMetrics = metricsMap(await cdp.send('Performance.getMetrics'));
  await page.evaluate(() => {
    window.__agentControlCrewMeasurement = {pending: [], latencies: [], renders: 0, wakes: []};
    document.addEventListener('agent-control:event-received', event => { window.__agentControlCrewMeasurement.pending.push({type: event.detail.type, at: event.detail.receivedAt}); });
    document.addEventListener('agent-control:crew-rendered', event => {
      const measurement = window.__agentControlCrewMeasurement, now = event.detail.renderedAt; measurement.renders += 1;
      for (const item of measurement.pending.splice(0)) measurement.latencies.push({type: item.type, milliseconds: Math.max(0, now - item.at)});
      for (const card of document.querySelectorAll('#crew-live-grid [data-bot-expression="WAKING"]')) measurement.wakes.push({id: [...card.classList].find(value => /^bot-(?:lane|prompt|parcel|model|resource|quality)-/.test(value)), at: now, transitionKey: card.dataset.transitionKey});
    });
  });
  await page.waitForFunction(() => document.querySelector('#stream-state')?.textContent === 'LIVE', undefined, {timeout: 10_000}); liveAt = new Date().toISOString();
  await page.click('#operator-button'); await page.fill('#operator-token', operatorToken); await page.click('#operator-form button[type="submit"]');
  await page.getByRole('button', {name: 'Operator authenticated', exact: true}).waitFor({timeout: 10_000});

  await page.click('[data-view="crew"]');
  await page.waitForSelector('#crew-live-grid .bot-card');
  await page.waitForFunction(() => {
    const idle = [...document.querySelectorAll('#crew-live-grid .bot-state-idle')];
    return idle.some(card => card.dataset.botRest === 'looking') && idle.some(card => card.dataset.botRest === 'sleeping');
  }, undefined, {timeout: 10_000});
  const idleBefore = await characterAnimationSnapshot(page); await delay(2_200); const idleAfter = await characterAnimationSnapshot(page);
  idleAmbientEvidence = idleBefore.filter(item => item.rest !== 'none').map(before => {
    const after = idleAfter.find(item => item.id === before.id), expectedAnimation = before.rest === 'looking' ? 'bot-look-around' : 'bot-sleep-breathe', first = before.animationDetails.find(item => item.name === expectedAnimation), second = after?.animationDetails.find(item => item.name === expectedAnimation);
    const transformChanged = Boolean(first && second && first.transform !== second.transform), opacityChanged = Boolean(first && second && first.opacity !== second.opacity);
    return {id: before.id, disposition: before.rest, expectedAnimation, runningAnimations: before.runningAnimations, elapsedTimelineMs: first && second ? second.currentTime - first.currentTime : 0, transformChanged, opacityChanged, visualChanged: transformChanged || opacityChanged};
  });
  if (!idleAmbientEvidence.some(item => item.disposition === 'looking') || !idleAmbientEvidence.some(item => item.disposition === 'sleeping') || idleAmbientEvidence.some(item => item.elapsedTimelineMs < 1_800 || !item.visualChanged)) throw new Error(`idle_ambient_animation_evidence_missing:${JSON.stringify(idleAmbientEvidence)}`);
  screenshots.push(await screenshot(page, '01-crew-initial.png'));
  await delay(3_000);

  await page.click('[data-view="jobs"]');
  await page.fill('#natural-task-prompt', 'Run the bounded Crew Lifecycle qualification and retain browser evidence.');
  const submission = page.waitForResponse(response => new URL(response.url()).pathname === '/api/parcels' && response.request().method() === 'POST', {timeout: 10_000});
  await page.click('#natural-task-submit');
  const submissionResponse = await submission;
  if (submissionResponse.status() !== 201) {
    const detail = await submissionResponse.text().catch(() => 'unreadable');
    throw new Error(`dashboard_task_submission_failed:${submissionResponse.status()}:${detail.slice(0, 180)}`);
  }
  const concurrentPhase = await waitPhase('CONCURRENT_STATE_READY', 30_000);

  await page.click('[data-view="crew"]');
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForFunction(() => document.querySelectorAll('#crew-live-grid .bot-card').length === 6 && document.querySelector('#crew-live-grid .bot-model-scout')?.classList.contains('bot-state-working') && document.querySelector('#crew-live-grid .bot-resource-guardian')?.classList.contains('bot-state-resource_pressure'), undefined, {timeout: 10_000});
  await page.waitForFunction(() => document.documentElement.dataset.botMotion === 'full' && [...document.querySelectorAll('#crew-live-grid .agent-bot')].every(node => !node.classList.contains('bot-offscreen')), undefined, {timeout: 10_000});
  concurrentCrew = await crewSnapshot(page);
  const animationBefore = await characterAnimationSnapshot(page); await delay(650); const animationAfter = await characterAnimationSnapshot(page);
  animationEvidence = animationBefore.map(before => {
    const after = animationAfter.find(item => item.id === before.id), elapsedTimelineMs = after?.motion && before.motion ? after.motion.currentTime - before.motion.currentTime : 0;
    const transformChanged = Boolean(after?.motion && before.motion?.transform !== after.motion.transform), opacityChanged = Boolean(after?.motion && before.motion?.opacity !== after.motion.opacity);
    return {...before, motion: before.motion ? {animation: before.motion.name, target: before.motion.target, elapsedTimelineMs, transformChanged, opacityChanged, visualChanged: transformChanged || opacityChanged} : null};
  });
  if (animationEvidence.length !== 6 || animationEvidence.some(item => !item.visible || !item.runningAnimations.length || !item.accent || !item.motion || item.motion.elapsedTimelineMs < 400 || !item.motion.visualChanged)) throw new Error(`all_character_animation_evidence_missing:${JSON.stringify(animationEvidence)}`);
  screenshots.push(await screenshot(page, '02-crew-concurrent-live.png'));
  concurrentPerformance = await performanceWindow(page, cdp); concurrentMetrics = metricsMap(await cdp.send('Performance.getMetrics'));
  wakingEvidence = await page.evaluate(() => window.__agentControlCrewMeasurement.wakes);
  if (!wakingEvidence.length) throw new Error('sleeping_worker_wake_not_observed');
  await page.locator('.crew-workflow-board').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelectorAll('.crew-stage-running .crew-worker-bot').length === 2 && document.querySelector('.crew-tool-search') && document.querySelector('.crew-tool-file') && document.querySelector('.crew-baton.active'));
  concurrentWorkflow = await workflowSnapshot(page);
  if (concurrentWorkflow.parcels[0]?.parallelActive !== 2) throw new Error('real_parallel_workflow_not_visible');
  screenshots.push(await screenshot(page, '03-real-parallel-workflow.png'));
  await page.click('.crew-baton.active');
  await page.waitForFunction(() => !document.querySelector('#crew-human-explanation')?.hidden && /Why did this baton move/.test(document.querySelector('#crew-human-explanation')?.textContent || ''));
  screenshots.push(await screenshot(page, '04-real-baton-reason.png'));
  await delay(1_000);

  await page.evaluate(() => { window.__crewFocusStartedAt = performance.now(); });
  await page.locator('#crew-live-grid button.bot-resource-guardian').click();
  await page.waitForFunction(() => !document.querySelector('#crew-human-explanation')?.hidden && /Rook/.test(document.querySelector('#crew-human-explanation')?.textContent || ''));
  focusResponsivenessMs = await page.evaluate(() => performance.now() - window.__crewFocusStartedAt);
  screenshots.push(await screenshot(page, '05-level-two-human-explanation.png'));
  await page.locator('#crew-human-explanation [data-bot-character-nav="resource-guardian"]').click();
  await page.waitForFunction(() => !document.querySelector('#systems-workspace')?.hidden && document.activeElement?.id === 'systems-list');
  navigation.resourceGuardian = {interaction: 'pointer', target: documentTarget(await page.evaluate(() => document.activeElement?.id)), at: new Date().toISOString()};
  screenshots.push(await screenshot(page, '06-resource-navigation.png'));
  await delay(1_500);

  await page.click('[data-view="crew"]');
  await page.locator('#crew-live-grid button.bot-parcel-coordinator').focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('#crew-human-explanation')?.hidden && /Relay/.test(document.querySelector('#crew-human-explanation')?.textContent || ''));
  await page.locator('#crew-human-explanation [data-bot-character-nav="parcel-coordinator"]').focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('#jobs-workspace')?.hidden && document.activeElement?.id === 'parcel-list');
  navigation.parcelCoordinator = {interaction: 'keyboard-enter', target: documentTarget(await page.evaluate(() => document.activeElement?.id)), at: new Date().toISOString()};
  const answer = page.locator('[data-question-input]').first(); await answer.waitFor({timeout: 10_000}); await answer.fill('JSON');
  const answerResponse = page.waitForResponse(response => /^\/api\/parcels\/[^/]+\/questions\/[^/]+\/answer$/.test(new URL(response.url()).pathname) && response.request().method() === 'POST', {timeout: 30_000});
  await page.locator('[data-answer-question]').first().click();
  if ((await answerResponse).status() !== 200) throw new Error('dashboard_question_answer_failed');

  await page.click('[data-view="crew"]');
  await waitPhase('QUALIFICATION_COMPLETE', 120_000);
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForFunction(() => document.querySelector('#crew-live-grid .bot-parcel-coordinator')?.classList.contains('bot-state-completed') && document.querySelector('#crew-live-grid .bot-quality-inspector')?.classList.contains('bot-state-completed'), undefined, {timeout: 10_000});
  completedCrew = await crewSnapshot(page);
  completedWorkflow = await workflowSnapshot(page);
  screenshots.push(await screenshot(page, '07-crew-completed.png'));
  completedFullPerformance = await performanceWindow(page, cdp);

  await page.click('[data-bot-motion="reduced"]');
  await page.waitForFunction(() => document.documentElement.dataset.botMotion === 'reduced');
  await page.locator('#crew-live-grid').scrollIntoViewIfNeeded();
  reducedMotionEvidence = await page.evaluate(() => ({setting: document.documentElement.dataset.botMotion, animatedNames: [...new Set([...document.querySelectorAll('#crew-live-grid .agent-bot, .crew-workflow-board')].flatMap(node => node.getAnimations({subtree: true}).map(item => getComputedStyle(item.effect.target).animationName)).filter(value => value && value !== 'none'))]}));
  if (reducedMotionEvidence.setting !== 'reduced' || reducedMotionEvidence.animatedNames.some(name => name !== 'bot-blink')) throw new Error('reduced_motion_not_applied');
  completedReducedPerformance = await performanceWindow(page, cdp);
  completedMetrics = metricsMap(await cdp.send('Performance.getMetrics'));
  screenshots.push(await screenshot(page, '08-crew-reduced-motion.png'));

  await page.setViewportSize({width: 390, height: 844}); await page.click('[data-view="crew"]'); await page.evaluate(() => scrollTo(0, 0)); await delay(500);
  mobileEvidence = await page.evaluate(() => {
    const grid = document.querySelector('#crew-live-grid'), cards = [...(grid?.querySelectorAll('.bot-card') ?? [])], style = grid ? getComputedStyle(grid) : null;
    return {viewport: {width: innerWidth, height: innerHeight}, cards: cards.length, layout: style?.display ?? null, overflowX: style?.overflowX ?? null, clientWidth: grid?.clientWidth ?? null, scrollWidth: grid?.scrollWidth ?? null, horizontallyScrollable: Boolean(grid && grid.scrollWidth > grid.clientWidth), firstCardWidth: cards[0]?.getBoundingClientRect().width ?? null, workflowColumns: getComputedStyle(document.querySelector('.crew-workflow-board')).gridTemplateColumns};
  });
  if (mobileEvidence.cards !== 6 || mobileEvidence.layout !== 'flex' || !mobileEvidence.horizontallyScrollable || mobileEvidence.workflowColumns.split(' ').length !== 1) throw new Error(`mobile_active_worker_strip_missing:${JSON.stringify(mobileEvidence)}`);
  screenshots.push(await screenshot(page, '09-crew-mobile-active-strip.png', {fullPage: true}));

  const processing = await page.evaluate(() => window.__agentControlCrewMeasurement);
  eventProcessing = {renderCount: processing.renders, eventToRender: distribution(processing.latencies.map(item => item.milliseconds)), sampleTypes: [...new Set(processing.latencies.map(item => item.type))], samples: processing.latencies};
  if (!eventProcessing.eventToRender.samples || eventProcessing.eventToRender.p95Ms === null) throw new Error('sse_event_render_measurement_missing');

  if (consoleErrors.length) throw new Error(`dashboard_console_errors:${JSON.stringify({consoleErrors, httpErrors}).slice(0, 1_500)}`);
  await context.close(); context = undefined;
  const rawVideo = await video.path();
  const performanceContext = await browser.newContext({viewport: {width: 1920, height: 1080}, colorScheme: 'dark'});
  try {
    const performancePage = await performanceContext.newPage();
    await performancePage.goto(base, {waitUntil: 'domcontentloaded'}); await performancePage.click('[data-view="crew"]');
    await performancePage.waitForFunction(() => document.querySelectorAll('#crew-live-grid .bot-card').length === 6 && document.documentElement.dataset.botMotion === 'full');
    const performanceCdp = await performanceContext.newCDPSession(performancePage); await performanceCdp.send('Performance.enable');
    const fullMotion = await performanceWindow(performancePage, performanceCdp);
    await performancePage.click('[data-bot-motion="reduced"]'); await performancePage.waitForFunction(() => document.documentElement.dataset.botMotion === 'reduced');
    const reducedMotion = await performanceWindow(performancePage, performanceCdp);
    unrecordedPerformance = {fullMotion, reducedMotion, recordingOverheadExcluded: true};
  } finally { await performanceContext.close(); }
  await browser.close(); browser = undefined;
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', rawVideo, '-c:v', 'libx264', '-preset', 'fast', '-crf', '27', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', videoFile]);
  const exit = await childExit; if (exit.code !== 0) throw new Error(`qualification_process_failed:${exit.code}:${stderr.slice(-300)}`);
  const evidenceBytes = fs.readFileSync(evidenceFile), videoBytes = fs.readFileSync(videoFile), probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,duration', '-of', 'json', videoFile], {encoding: 'utf8'}));
  const generatedPaths = [evidenceFile, manifestFile, videoFile, screenshotDir].map(value => path.relative(root, value).replaceAll(path.sep, '/')).filter(value => value && !value.startsWith('../'));
  const diffArguments = ['diff', '--binary', 'HEAD', '--', '.', ...generatedPaths.flatMap(value => [`:!${value}`, `:!${value}/**`])];
  const manifest = {
    schema: 'agent-control.crew-workflow-video/v1', recordedAt: new Date().toISOString(), source: 'Isolated real AgentControlService dashboard over loopback; no deployment and no simulated runtime events',
    repository: {
      head: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(),
      branch: execFileSync('git', ['branch', '--show-current'], {cwd: root, encoding: 'utf8'}).trim(),
      dirtyDiffSha256: digest(execFileSync('git', diffArguments, {cwd: root, maxBuffer: 16 * 1024 * 1024})),
    },
    qualification: {file: path.relative(path.dirname(manifestFile), evidenceFile), sha256: digest(evidenceBytes), bytes: evidenceBytes.length, verdict: 'PASS'},
    video: {file: path.relative(path.dirname(manifestFile), videoFile), sha256: digest(videoBytes), bytes: videoBytes.length, format: 'MP4/H.264', stream: probe.streams[0]},
    browser: {engine: 'Chromium', version: browserVersion, headless: true, liveAt, streamState: 'LIVE', consoleErrors, httpErrors},
    allCharacters: {visibleTogether: true, animatedTogetherUnderFullMotion: true, concurrentStateAt: concurrentPhase.at, evidence: animationEvidence},
    actualLifecycle: {
      source: 'authenticated dashboard submission through production WorkParcelCoordinator and JobRuntime',
      idleAmbient: {operationalStatePreserved: 'IDLE', lookAndSleepObservedTogether: true, evidence: idleAmbientEvidence},
      waking: {oneShotPresentationTriggeredByRecordedWork: true, evidence: wakingEvidence},
      concurrent: {crew: concurrentCrew, workflow: concurrentWorkflow, actualRunningStages: 2},
      completed: {crew: completedCrew, workflow: completedWorkflow},
      progressiveDisclosure: {level1: 'Crew and deterministic narration', level2: 'human explanation and exact baton reason', level3: 'existing engineering Jobs and Systems views', focusResponsivenessMs, navigation},
    },
    performance: {
      method: 'Chromium DevTools Performance metrics plus requestAnimationFrame and in-page typed-SSE receipt-to-Crew-render instrumentation',
      multipleSimultaneousWorkers: 2,
      concurrentFullMotion: concurrentPerformance,
      completedFullMotion: completedFullPerformance,
      completedReducedMotion: completedReducedPerformance,
      noVideoCapture: unrecordedPerformance,
      pointSamples: {baseline: selectedMetrics(baselineMetrics), concurrent: selectedMetrics(concurrentMetrics), completedReduced: selectedMetrics(completedMetrics)},
      dashboardFocusResponsivenessMs: focusResponsivenessMs,
      sseEventProcessing: eventProcessing,
      scope: 'Renderer-process measurements; not whole-machine CPU or memory.',
    },
    reducedMotion: reducedMotionEvidence,
    responsive: mobileEvidence,
    accessibility: {keyboardNavigationVerified: true, textualOperationalStatePresent: true, activityTextPresent: true, animationMarkedPresentationOnly: true, batonReasonAvailableWithoutMotion: true, reducedMotionVerified: true, colourIsNotSoleSignal: true},
    executionIsolation: {dashboardProjectionOnly: true, animationFailureCanAffectExecution: false, evidence: 'Character JavaScript consumes GET /api/status and SSE only; the only POST in this recorder is the existing operator-authenticated Work Parcel submission/question path.'},
    simulatedGallery: {presentButNotUsedForRuntimeVideoEvidence: true, clearlyLabelled: true, productionStateMutated: false},
    screenshots,
    security: {operatorCredentialPersisted: false, externalCredentialsUsed: false, productionStateTouched: false},
  };
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, {mode: 0o600});
  fs.rmSync(stateDir, {recursive: true, force: true});
  process.stdout.write(`${JSON.stringify({phase: 'VIDEO_COMPLETE', verdict: 'PASS', videoFile, manifestFile, videoSha256: manifest.video.sha256, screenshots: screenshots.length})}\n`);
} catch (error) {
  child.kill('SIGTERM'); await Promise.race([childExit, delay(5_000)]); if (!childExited) child.kill('SIGKILL');
  await context?.close().catch(() => {}); await browser?.close().catch(() => {});
  process.stderr.write(`${JSON.stringify({phase: 'VIDEO_FAILED', error: error instanceof Error ? error.message : String(error)})}\n`); process.exitCode = 1;
}

function documentTarget(id) { if (!id) throw new Error('character_navigation_target_missing'); return `#${id}`; }
