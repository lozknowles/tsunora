import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {workspaceId} from './navigable-workspace.js';
import {WorkspacePreferenceStore} from './workspace-preferences.js';

test('workspace favourites are durable, operator scoped and validate opaque identities',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ac-workspace-preferences-')),file=path.join(root,'preferences.json'),id=workspaceId({kind:'DEVICE',parts:['pixel']});
 const store=new WorkspacePreferenceStore(file,()=> '2026-09-20T10:00:00.000Z');assert.deepEqual(store.list('operator-a').favourites,[]);
 assert.equal(store.set('operator-a',id,true).favourites[0]?.workspaceId,id);assert.deepEqual(store.list('operator-b').favourites,[]);
 assert.equal(new WorkspacePreferenceStore(file).list('operator-a').favourites.length,1);assert.equal(store.set('operator-a',id,false).favourites.length,0);
 assert.throws(()=>store.set('operator-a','not-a-workspace',true),/workspace_identity_invalid/);
});
