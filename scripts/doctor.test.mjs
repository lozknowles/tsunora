import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {inspectDoctor} from './doctor.mjs';

function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'doctor-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));for(const name of ['tsx','undici','ws']){const dir=path.join(root,'node_modules',name);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'package.json'),'{}');}return root;}
const absent={status:null,error:{code:'ENOENT'},stdout:''};
test('CPU-only doctor is core-ready with absent optional executables and no providers',t=>{const root=fixture(t),calls=[];const result=inspectDoctor({root,cwd:root,environment:{},nodeVersion:'24.0.0',platform:'linux',run:(cmd,args)=>{calls.push([cmd,args]);return ['git','npm','bash'].includes(cmd)?{status:0,stdout:'version'}:absent;}});assert.equal(result.core,'CORE_READY');assert.equal(result.checks.find(c=>c.id==='nvidia-smi').state,'OPTIONAL_UNAVAILABLE');assert.equal(result.checks.find(c=>c.id==='execution-providers').state,'UNCONFIGURED');assert.ok(calls.every(([,args])=>!args.includes('login')&&!args.includes('start')));});
test('doctor fails core readiness for missing required runtime and dependencies',t=>{const root=fixture(t);fs.rmSync(path.join(root,'node_modules'),{recursive:true});const result=inspectDoctor({root,cwd:root,environment:{},nodeVersion:'20.0.0',run:()=>absent});assert.equal(result.core,'BLOCKED');assert.equal(result.checks.find(c=>c.id==='node').state,'BLOCKED');assert.equal(result.checks.find(c=>c.id==='locked-dependencies').state,'BLOCKED');});
for(const [reply,reason] of [[{status:1},'command_failed'],[{status:null,error:{code:'ETIMEDOUT'}},'command_timeout'],[{status:0,stdout:'garbage'},'malformed_output']])test(`optional GPU ${reason} cannot block core`,t=>{const root=fixture(t),result=inspectDoctor({root,cwd:root,environment:{},nodeVersion:'24.0.0',run:cmd=>cmd==='nvidia-smi'?reply:{status:0,stdout:'version'}});assert.equal(result.core,'CORE_READY');assert.equal(result.checks.find(c=>c.id==='nvidia-smi').state,'OPTIONAL_DEGRADED');assert.equal(result.checks.find(c=>c.id==='nvidia-smi').reason,reason);});
test('doctor never emits configured credential values or private endpoints',t=>{const root=fixture(t);fs.mkdirSync(path.join(root,'.agent-control'));fs.writeFileSync(path.join(root,'.agent-control/config.json'),JSON.stringify({providers:[{baseUrl:'https://private.invalid',token:'never-output-this'}]}));const result=inspectDoctor({root,cwd:root,environment:{},nodeVersion:'24.0.0',run:()=>absent});assert.equal(JSON.stringify(result).includes('never-output-this'),false);assert.equal(JSON.stringify(result).includes('private.invalid'),false);});

for (const checkout of [false,true]) test(`Git is required for a checkout, optional for a source archive: checkout=${checkout}`,t=>{
 const root=fixture(t);if(checkout)fs.writeFileSync(path.join(root,'.git'),'gitdir: metadata');
 const result=inspectDoctor({root,cwd:root,environment:{},nodeVersion:'24.21.0',platform:'linux',run:cmd=>cmd==='git'?absent:{status:0,stdout:'version'}});
 assert.equal(result.core,checkout?'BLOCKED':'CORE_READY');
 assert.equal(result.checks.find(c=>c.id==='git').classification,checkout?'CORE_REQUIRED':'OPTIONAL');
 assert.equal(result.checks.find(c=>c.id==='git').state,checkout?'BLOCKED':'OPTIONAL_UNAVAILABLE');
});
