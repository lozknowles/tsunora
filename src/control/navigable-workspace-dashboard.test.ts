import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const script=fs.readFileSync('assets/dashboard/dashboard-workspaces.js','utf8');
const css=fs.readFileSync('assets/dashboard/dashboard-workspaces.css','utf8');
const page=fs.readFileSync('assets/dashboard/index.html','utf8');

test('workspace UI progressively navigates authoritative records without granting control',()=>{
  for(const marker of ['Workspaces','Find project, repository, device, environment, runtime, worker, run, invocation or artifact','Add favourite','Workspace path','Opening this workspace grants no control authority.','Where and how this ran','Related authoritative context','Governed session access','Token and cache evidence','Invocation input and output','Open human-readable evidence','Open protected artifact','Ask Mallow','AgentControlArtifacts'])assert.match(script,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(script,/workspace-preferences\/favourite/);
  assert.doesNotMatch(script,/api\/(?:jobs|runs|targets)[^'"`]*(?:run|execute|reset)/);
  assert.match(script,/Operator authentication required/);
  assert.doesNotMatch(script,/file:\/\/|sourcePath|snapshotPath/);
  assert.match(page,/dashboard-workspaces\.js/);
  assert.match(page,/dashboard-workspaces\.css/);
});

test('workspace UI uses progressive mobile disclosure and respects reduced motion',()=>{
  assert.match(css,/@media\(max-width:620px\)/);
  assert.match(css,/@media\(max-width:390px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(script,/End of recorded path/);
});
