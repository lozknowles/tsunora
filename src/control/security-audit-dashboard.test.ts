import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const script=fs.readFileSync('assets/dashboard/dashboard-security-audits.js','utf8');
const page=fs.readFileSync('assets/dashboard/index.html','utf8');

test('security-audit dashboard projects authoritative evidence read-only',()=>{
  for(const marker of ['Security Audits','Governed phases','Coverage ledger','Candidates and independent verification','Findings and verdicts','Sandbox assurance and provenance','View human-readable report','View findings JSON'])assert.match(script,new RegExp(marker.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')));
  assert.match(script,/Operator authentication required/);
  assert.match(script,/Authorization:`Bearer \$\{state\.token\}`/);
  assert.doesNotMatch(script,/method\s*:\s*['\"](?:POST|PUT|PATCH|DELETE)['\"]/);
  assert.match(page,/dashboard-security-audits\.js/);
  assert.match(script,/security-phases/);
});

test('security-audit dashboard distinguishes verdicts and model-free telemetry',()=>{
  for(const marker of ['Confirmed','Needs validation','Rejected','Finder','Verifier','independence','model/provider tokens and cost are not applicable'])assert.match(script,new RegExp(marker.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&'),'i'));
  assert.match(script,/const esc=/);
  assert.doesNotMatch(script,/innerHTML\s*=\s*value\.(?:content|stdout|stderr)/);
});
test('security-audit dashboard selects the latest retained verifier record',()=>{assert.match(script,/\[\.\.\.value\.verifications\]\.reverse\(\)\.find/);assert.match(script,/retainedFindingHistory/);});

test('dashboard shell contains no CSP-blocked inline style attributes',()=>{assert.doesNotMatch(page,/\sstyle=/i);assert.match(fs.readFileSync('assets/dashboard/dashboard.css','utf8'),/\.watch-full-width\{grid-column:1\/-1\}/);});

test('live shell reuses the authenticated dashboard event stream',()=>{
  const liveShell=fs.readFileSync('assets/dashboard/dashboard-live-shell.js','utf8');
  assert.doesNotMatch(liveShell,/new EventSource\(['"]\/api\/events/);
  assert.match(liveShell,/agent-control:event-received/);
  assert.match(liveShell,/execution\.session_changed/);
});
