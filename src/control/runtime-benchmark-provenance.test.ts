import {execFileSync} from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import {assessRuntimeExecution} from './runtime-benchmark-provenance.js';
const p={component:'agent-control-runtime',worker:'worker',adapter:'linux',target:'target',environment:'guest',transport:'local',runId:'run',stepId:'step',provenance:'AGENT_CONTROL_RUNTIME_EVIDENCE'};
const events=()=>['runtime.request_received','admission.memory','runtime.started','inference.completed','service.restoration','runtime.result_retained'].map(type=>({schema:'agent-control.runtime-lifecycle/v1',type,at:new Date().toISOString(),producer:p,data:{allowed:true,restored:true}}));
test('complete product transcript earns canonical native classification',()=>assert.equal(assessRuntimeExecution(p,events(),{pid:123,exitCode:0},'a'.repeat(64)).classification,'AGENT_CONTROL_RUNTIME_EVIDENCE'));
test('external harness action and caller native label cannot earn native provenance',()=>{const harness=events().map(e=>({...e,producer:{...p,component:'external-harness'}}));assert.equal(assessRuntimeExecution(p,harness,{pid:123,exitCode:0},'a'.repeat(64)).classification,'UNVERIFIED_EXECUTION');});
test('missing lifecycle, wrong run, failed restoration or transport fail closed',()=>{for(const rows of [[],events().filter(e=>e.type!=='runtime.started'),events().map(e=>({...e,producer:{...p,runId:'different'}})),events().map(e=>({...e,data:{allowed:true,restored:false}}))])assert.equal(assessRuntimeExecution(p,rows,{pid:123,exitCode:0},'a'.repeat(64)).classification,'UNVERIFIED_EXECUTION');assert.equal(assessRuntimeExecution(p,events(),{pid:123,exitCode:1},'a'.repeat(64)).classification,'UNVERIFIED_EXECUTION');});

test('controlled external process cannot turn a native claim into owned execution proof',()=>{
 // Explicit test-fixture escape: actual external process, no target or model access.
 const claim=JSON.parse(execFileSync(process.execPath,['-e','process.stdout.write(JSON.stringify({provenance:"AGENT_CONTROL_RUNTIME_EVIDENCE",output:"READY"}))'],{encoding:'utf8'}));
 assert.equal(claim.provenance,'AGENT_CONTROL_RUNTIME_EVIDENCE');
 assert.equal(assessRuntimeExecution(p,[],{pid:0,exitCode:0},'a'.repeat(64)).classification,'UNVERIFIED_EXECUTION');
});
