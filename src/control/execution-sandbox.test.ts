import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {LinuxBubblewrapSandboxAdapter} from './execution-sandbox.js';
import {OwnedProcessManager} from './owned-process.js';

const supported=process.platform==='linux'&&fs.existsSync('/usr/bin/bwrap')&&fs.existsSync('/usr/bin/systemd-run')&&Boolean(process.env.XDG_RUNTIME_DIR);

test('linux adapter proves every containment control and retains no credential fixture',{skip:!supported,timeout:30_000},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-control-sandbox-test-')),source=path.join(root,'source'),state=path.join(root,'state');fs.mkdirSync(source);fs.writeFileSync(path.join(source,'package.json'),'{}\n');const before=fs.readFileSync(path.join(source,'package.json'),'utf8'),owned=new OwnedProcessManager();process.env.AGENT_CONTROL_SANDBOX_TEST_SECRET='sk-proj-this-must-not-enter-evidence';
 try{const result=await new LinuxBubblewrapSandboxAdapter().qualify({sourceRoot:source,stateRoot:state,ownedExecution:owned});assert.equal(result.status,'PASS');assert.equal(result.cleanupVerified,true);assert.equal(result.controls.length,13);assert.deepEqual(result.controls.filter(item=>item.status!=='PASS'),[]);assert.equal(result.networkPolicy.default,'DENY');assert.equal(result.networkPolicy.allowlist.length,0);assert.equal(fs.readFileSync(path.join(source,'package.json'),'utf8'),before);assert.equal(fs.existsSync(result.scratchRoot),false);assert.equal(owned.activePids().length,0);assert.doesNotMatch(JSON.stringify(result),/this-must-not-enter-evidence/);}
 finally{delete process.env.AGENT_CONTROL_SANDBOX_TEST_SECRET;await owned.terminateAll('test-finished');fs.rmSync(root,{recursive:true,force:true});}
});

test('linux adapter fails closed when its enforcement dependency is unavailable',async()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-control-sandbox-missing-')),source=path.join(root,'source'),state=path.join(root,'state');fs.mkdirSync(source);const owned=new OwnedProcessManager();try{await assert.rejects(()=>new LinuxBubblewrapSandboxAdapter('/missing/bwrap').qualify({sourceRoot:source,stateRoot:state,ownedExecution:owned}),/sandbox_dependency_unavailable/);}finally{await owned.terminateAll('test-finished');fs.rmSync(root,{recursive:true,force:true});}});
