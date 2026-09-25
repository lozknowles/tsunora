import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {createControlPlane} from './control-plane.mjs';

test('missing optional service executable does not crash or persist an invalid PID', async t => {
  const state=fs.mkdtempSync(path.join(os.tmpdir(),'agent-control-optional-spawn-'));
  t.after(()=>fs.rmSync(state,{recursive:true,force:true}));
  fs.writeFileSync(path.join(state,'config.json'),JSON.stringify({schemaVersion:1,resources:[],providers:[],lanes:[],services:[{id:'optional',optional:true,healthUrl:'http://127.0.0.1:1/health',start:{type:'command',command:path.join(state,'absent')}}]}));
  const plane=createControlPlane({environment:{...process.env,AGENT_CONTROL_STATE_DIR:state},fetchImpl:async()=>({ok:false,status:503})});
  const result=await plane.up();
  assert.equal(result.actions[0].status,'optional-unavailable');
  assert.equal(result.status.result,'READY');
  assert.equal(fs.existsSync(path.join(state,'run/owned-processes.json')),false);
});

test('no resources, providers or services starts safely as UNCONFIGURED', async () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-empty-'));
  const plane = createControlPlane({environment: {...process.env, AGENT_CONTROL_STATE_DIR: state}});
  const status = await plane.status();
  assert.equal(status.result, 'UNCONFIGURED');
  assert.deepEqual(status.resources, []);
  assert.deepEqual((await plane.up()).actions, []);
});

test('configured services may use non-original ports', async () => {
  const server = http.createServer((_request, response) => { response.writeHead(200); response.end('ok'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-port-'));
  const file = path.join(state, 'config.json');
  fs.writeFileSync(file, JSON.stringify({schemaVersion: 1, resources: [], providers: [], services: [{id: 'service-any', healthUrl: `http://127.0.0.1:${address.port}/health`}], lanes: []}));
  try {
    const status = await createControlPlane({environment: {...process.env, AGENT_CONTROL_STATE_DIR: state}}).status();
    assert.equal(status.result, 'READY');
    assert.equal(status.services[0].healthy, true);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('optional unavailable service does not fail the control plane', async () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-optional-'));
  fs.writeFileSync(path.join(state, 'config.json'), JSON.stringify({schemaVersion: 1, resources: [], providers: [], services: [{id: 'optional-a', healthUrl: 'http://127.0.0.1:19999/health', optional: true}], lanes: []}));
  const status = await createControlPlane({environment: {...process.env, AGENT_CONTROL_STATE_DIR: state}}).status();
  assert.equal(status.result, 'READY');
  assert.equal(status.services[0].state, 'UNAVAILABLE');
});
