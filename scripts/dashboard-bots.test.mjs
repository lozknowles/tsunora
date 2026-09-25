import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/dashboard/dashboard-bots.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../assets/dashboard/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/dashboard/dashboard-bots.css', import.meta.url), 'utf8');
const context = {window: {}};
vm.runInNewContext(source, context);
const bots = context.window.AgentControlBots;

test('character runtime exports the complete shared state vocabulary and six non-colour identities', () => {
  assert.deepEqual([...bots.states], ['idle', 'queued', 'working', 'reviewing', 'waiting', 'awaiting_operator', 'blocked', 'resource_pressure', 'recovering', 'handing_over', 'completed', 'failed', 'cancelling', 'cancelled', 'offline', 'stale', 'unknown']);
  assert.deepEqual(Object.keys(bots.identities), ['lane-master', 'prompt-reviewer', 'parcel-coordinator', 'model-scout', 'resource-guardian', 'quality-inspector']);
  assert.equal(new Set(Object.values(bots.identities).map(identity => identity.accessory)).size, 6);
});

test('motion preference is user-controlled and system reduced motion safely caps Full', () => {
  assert.equal(bots.effectiveMotion('full', false), 'full');
  assert.equal(bots.effectiveMotion('full', true), 'reduced');
  assert.equal(bots.effectiveMotion('reduced', false), 'reduced');
  assert.equal(bots.effectiveMotion('off', false), 'off');
});

test('truthful idle state receives looking then sleeping presentation without changing state', () => {
  const now = Date.parse('2026-09-06T14:00:00.000Z');
  assert.equal(bots.idleDisposition({state: 'working', lastUpdatedAt: '2026-09-06T13:59:59.000Z'}, now), null);
  assert.equal(bots.idleDisposition({state: 'idle', lastUpdatedAt: '2026-09-06T13:59:30.001Z'}, now), 'looking');
  assert.equal(bots.idleDisposition({state: 'idle', lastUpdatedAt: '2026-09-06T13:59:15.000Z'}, now), 'sleeping');
  assert.equal(bots.idleDisposition({state: 'idle', lastUpdatedAt: null}, now), 'sleeping');
  assert.equal(bots.idleDisposition({state: 'idle', lastUpdatedAt: null, activity: {kind: 'SEARCHING'}}, now), null);
  assert.equal(bots.idleLookDurationMs, 45_000);
});

test('a sleeping character wakes once for recorded work without changing operational state', () => {
  const previous = {state: 'idle', rest: 'sleeping'}, current = {state: 'working', operationalState: 'EXECUTING', activity: {kind: 'CODING'}, animationCue: {expression: 'TYPING'}};
  assert.equal(bots.shouldWake(previous, current), true);
  assert.equal(bots.animationExpression(current, previous), 'WAKING');
  assert.equal(bots.animationExpression(current, {state: 'working', rest: null}), 'TYPING');
  assert.equal(current.operationalState, 'EXECUTING');
});

test('completion acknowledgement occurs only on a fresh live transition, never initial load or reconnect', () => {
  const working = {state: 'working', freshness: 'current'};
  const completed = {state: 'completed', freshness: 'current'};
  assert.equal(bots.shouldAcknowledge(undefined, completed, {initial: true, streamLive: true}), false);
  assert.equal(bots.shouldAcknowledge(working, completed, {initial: false, streamLive: false}), false);
  assert.equal(bots.shouldAcknowledge(working, {...completed, freshness: 'stale'}, {initial: false, streamLive: true}), false);
  assert.equal(bots.shouldAcknowledge(completed, completed, {initial: false, streamLive: true}), false);
  assert.equal(bots.shouldAcknowledge(working, completed, {initial: false, streamLive: true}), true);
});

test('dashboard positions navigable characters at real areas and isolates the simulated gallery', () => {
  for (const id of Object.keys(bots.identities)) assert.match(html, new RegExp(`data-bot-slot="${id}"`));
  assert.match(html, /data-view="crew">Crew/);
  assert.match(html, /Authoritative operational projection/);
  assert.match(html, /Work Parcel flow/);
  assert.match(html, /Baton transfers/);
  assert.match(html, /Discovery &amp; qualification/);
  assert.match(source, /Level 2 · Human explanation/);
  assert.match(html, /SIMULATED — PREVIEW ONLY/);
  assert.match(html, /data-bot-motion="full"/);
  assert.match(html, /data-bot-motion="reduced"/);
  assert.match(html, /data-bot-motion="off"/);
  assert.match(html, /data-bot-display="off"/);
});

test('visual layer has state text equivalents, role accessories, focus, mobile and motion safeguards', () => {
  for (const marker of ['bot-conductor', 'bot-editor', 'bot-dispatcher', 'bot-scout', 'bot-guardian', 'bot-inspector']) assert.match(source, new RegExp(marker));
  for (const state of bots.states) assert.match(source, new RegExp(`${state}:`));
  assert.match(css, /button\.bot-card:focus-visible/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /data-bot-page-active="false"/);
  assert.match(css, /\.agent-bot\.bot-offscreen/);
  assert.match(source, /suppressNextAcknowledgement/);
  assert.match(source, /RECONNECTING/);
  assert.match(source, /bot-sleep-eyes/);
  assert.match(source, /bot-sleep-signals/);
  for (const marker of ['bot-active-search', 'bot-active-code', 'bot-active-file', 'bot-active-browser', 'bot-active-remote', 'bot-active-test', 'bot-active-voice', 'bot-active-social', 'bot-active-model']) assert.match(source, new RegExp(marker));
  assert.match(source, /data-animation-authority="presentation-only"/);
  assert.match(source, /data-bot-render-key/);
  assert.match(source, /current\?\.dataset\?\.botRenderKey === desired\?\.dataset\?\.botRenderKey/);
  assert.match(source, /reconcileCardList/);
  assert.match(source, /data-operational-state/);
  assert.match(source, /data-baton-focus/);
  assert.match(source, /Open exact recorded reason/);
  assert.match(css, /bot-look-around/);
  assert.match(css, /bot-sleep-breathe/);
  assert.match(css, /bot-dream-z/);
  assert.match(css, /data-bot-motion="full".*bot-rest-looking/s);
  assert.match(css, /data-bot-motion="full".*bot-rest-sleeping/s);
  assert.match(css, /bot-expression-waking/);
  assert.match(css, /crew-baton\.active/);
  assert.match(css, /data-bot-motion="reduced".*crew-workflow-board/s);
  assert.match(css, /scroll-snap-type/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.doesNotMatch(css, /flash/i);
});

test('presentation script is served as a one-way projection and is absent from execution imports', () => {
  const application = fs.readFileSync(new URL('../src/control/application-service.ts', import.meta.url), 'utf8');
  const runtime = fs.readFileSync(new URL('../src/control/job-runtime.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(application, /dashboard-bots/);
  assert.doesNotMatch(runtime, /dashboard-bots|animationCue|bot-expression/);
  assert.match(source, /const previousRefresh = refresh/);
  assert.doesNotMatch(source, /fetch\([^)]*method:\s*['"]POST/i);
});

test('crew artwork keeps gradients local to each repeated portrait under the strict dashboard CSP',()=>{
  const ids=new Set();
  for(let copy=0;copy<2;copy++)for(const id of Object.keys(bots.identities)){
    const svg=bots.artwork({id,state:'working',activity:{tool:{kind:'CODE_EDIT'}}},'TYPING');
    assert.match(svg,/data-animation-authority="presentation-only"/);
    assert.match(svg,/data-art-style="morrow-crew"/);
    assert.doesNotMatch(svg,/\sstyle=/);
    const localIds=[...svg.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
    for(const paint of localIds){assert.equal(ids.has(paint),false,paint);ids.add(paint);}
    for(const reference of svg.matchAll(/url\(#([^)]+)\)/g))assert.ok(localIds.includes(reference[1]),reference[1]);
    assert.match(svg,/bot-active-code/);
  }
});
