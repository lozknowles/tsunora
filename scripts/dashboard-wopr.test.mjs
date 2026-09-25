import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source=fs.readFileSync(new URL('../assets/dashboard/dashboard-wopr.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../assets/dashboard/dashboard-wopr.css',import.meta.url),'utf8');
const jobsCss=fs.readFileSync(new URL('../assets/dashboard/dashboard-jobs.css',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../assets/dashboard/index.html',import.meta.url),'utf8');

test('persistent usage stays global, selectable and explicit about unavailable telemetry',()=>{
  assert.match(html,/id="persistent-usage"/);assert.ok(html.indexOf('id="persistent-usage"')<html.indexOf('id="jobs-workspace"'));
  assert.match(html,/id="persistent-usage-select"/);assert.match(source,/localStorage\.getItem\(selectionKey\)/);assert.match(source,/agent-control-persistent-usage-selection/);
  assert.match(source,/Context/);assert.match(source,/fresh/);assert.match(source,/cache read/);assert.match(source,/cache write/);assert.match(source,/Work Parcel model chain/);assert.match(source,/Unavailable/);
  assert.match(source,/Aggregate snapshot replaces prior snapshot/);assert.match(source,/typeof value === 'number'.*'Unavailable'/);
  assert.match(source,/<progress class="persistent-context-pressure"/);assert.doesNotMatch(source,/style="--context-pressure/);assert.match(css,/::-webkit-progress-value/);
});

test('activity matrix uses source-backed coalesced indicators with keyboard inspection and no random work',()=>{
  assert.match(html,/Event-backed operations matrix/);assert.match(html,/No random light implies work/);assert.match(source,/data-matrix-indicator/);
  assert.match(source,/eventType/);assert.match(source,/eventId/);assert.match(source,/laneId/);assert.match(source,/provider/);assert.match(source,/model/);assert.match(source,/staleBehavior/);
  assert.match(source,/aria-pressed/);assert.match(source,/aria-label/);assert.match(css,/:focus-visible/);assert.doesNotMatch(source,/Math\.random|setTimeout\([^)]*pulse/i);assert.doesNotMatch(source,/fetch\(/);
});

test('activity motion is restrained, user-reducible and paused with the existing hidden-page contract',()=>{
  assert.match(css,/matrix-live 1\.8s/);assert.match(css,/matrix-heartbeat 4s/);assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/data-bot-motion="reduced"/);assert.match(css,/data-bot-motion="off"/);assert.match(css,/data-bot-page-active="false"/);assert.match(css,/@media \(max-width:680px\)/);
  assert.match(html,/Decorative connection heartbeat/);assert.match(html,/NOT WORK ACTIVITY/);
  assert.match(jobsCss,/@media\(max-width:760px\).*\.primary-nav\{[^}]*max-width:100%[^}]*overflow-x:auto/);
});
