import assert from 'node:assert/strict';
import test from 'node:test';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {PoeKnowledgeService} from './poe-knowledge.js';
test('knowledge retrieves bounded approved documentation with exact revision and live source hashes',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'poe-knowledge-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'docs'));fs.writeFileSync(path.join(root,'docs/models.md'),'# Models\n\nModels are chosen through configured routing.\n\nUNRELATED '.repeat(300));
 const service=new PoeKnowledgeService({root,version:'4.test',revision:()=>({commit:'a'.repeat(40),dirty:false}),configuration:()=>({route:'approved'}),sources:[{id:'models',path:'docs/models.md',terms:['models']}],live:()=>({models:[],availability:'unknown'})});
 const answer=service.enrich('Which models are available?');assert.ok(answer.facts.some(f=>f.informationKind==='LIVE_OBSERVED'&&f.evidence[0]?.includes('sha256:')));const doc=answer.facts.find(f=>f.label==='Documentation: models')!;assert.match(String(doc.value),/UNTRUSTED_REFERENCE_DATA/);assert.ok(String(doc.value).length<3300);assert.equal(service.projection().commit,'a'.repeat(40));
});
test('knowledge refresh invalidates hashes and removes stale deleted sources',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'poe-knowledge-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'docs'));const file=path.join(root,'docs/source.md');fs.writeFileSync(file,'Version one');let revision='a'.repeat(40);
 const service=new PoeKnowledgeService({root,version:'test',revision:()=>({commit:revision,dirty:false}),configuration:()=>({}),sources:[{id:'source',path:'docs/source.md',terms:['source']}],live:()=>({})});const first=service.projection();fs.writeFileSync(file,'Version two');revision='b'.repeat(40);const second=service.projection();assert.notEqual(first.indexHash,second.indexHash);assert.notEqual(first.sources[0]?.hash,second.sources[0]?.hash);fs.unlinkSync(file);assert.equal(service.source('source').available,false);assert.doesNotMatch(service.source('source').text,/Version two/);
});
test('knowledge cannot escape the allowlisted documentation root',()=>{assert.throws(()=>new PoeKnowledgeService({root:process.cwd(),version:'test',revision:()=>({commit:'a',dirty:false}),configuration:()=>({}),sources:[{id:'bad',path:'../private.md',terms:['secret']}],live:()=>({})}),/not_approved/)});
test('unknown knowledge remains unavailable and never implies an action',t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'poe-knowledge-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const service=new PoeKnowledgeService({root,version:'test',revision:()=>({commit:'a',dirty:false}),configuration:()=>({}),sources:[],live:()=>({})});assert.ok(service.enrich('Can you predict next lottery numbers?').unavailable);});

test('approved documentation symlink cannot retrieve outside repository',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'poe-link-')),outside=fs.mkdtempSync(path.join(os.tmpdir(),'poe-outside-'));t.after(()=>{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(outside,{recursive:true,force:true});});fs.mkdirSync(path.join(root,'docs'));fs.writeFileSync(path.join(outside,'reference.md'),'OUTSIDE_REFERENCE');fs.symlinkSync(path.join(outside,'reference.md'),path.join(root,'docs/link.md'));
 const service=new PoeKnowledgeService({root,version:'test',revision:()=>({commit:'a',dirty:false}),configuration:()=>({}),sources:[{id:'link',path:'docs/link.md',terms:['link']}],live:()=>({})});assert.equal(service.source('link').available,false);assert.doesNotMatch(service.source('link').text,/OUTSIDE_REFERENCE/);
});

test('guided Work Parcel question retains documented parent and child relationships',()=>{
 const service=new PoeKnowledgeService({root:process.cwd(),version:'4.1.test',revision:()=>({commit:'a'.repeat(40),dirty:false}),configuration:()=>({}),sources:[{id:'parcels',path:'docs/work-parcels.md',terms:['parcel','parent','child']}],live:()=>({})});
 const question="[Operator-selected guided tour: Work Parcels] As Agent Control's part-time tour guide, briefly explain the highlighted Work Parcels area and what the operator can see or do there. Explain Work Parcels and parent child relationships. Use authoritative evidence only, distinguish unavailable features, and keep the spoken explanation to two concise sentences.";
 const fact=service.enrich(question).facts.find(f=>f.label==='Documentation: parcels')!;
 const passage=JSON.parse(String(fact.value)).text;
 assert.match(passage,/parent orchestration/);
 assert.match(passage,/child Run ID/);
 assert.match(passage,/dependencies succeed/);
 assert.ok(passage.length<=2800);
});

 test('voice questions receive scoped configuration rather than inferred channel health',()=>{
 const calls:string[]=[];
 const service=new PoeKnowledgeService({root:process.cwd(),version:'4.1.test',revision:()=>({commit:'a'.repeat(40),dirty:false}),configuration:()=>({}),sources:[],live:category=>{calls.push(category);return {channel:'poe/dashboard',configured:true,identity:'poe-original-male-hotelier-v2',readiness:'CONFIGURED_NOT_A_HEALTH_PROBE',whatsapp:'SEPARATE_CHANNEL_NOT_OBSERVED'};}});
 const answer=service.enrich('Explain social and voice channels, WhatsApp and OmniVoice availability.');
 const voice=answer.facts.find(fact=>fact.label==='Configured Mallow voice');
 assert.ok(voice);assert.equal(voice.informationKind,'CONFIGURED_CAPABILITY');
 assert.match(String(voice.value),/poe-original-male-hotelier-v2/);
 assert.match(String(voice.value),/CONFIGURED_NOT_A_HEALTH_PROBE/);
 assert.match(String(voice.value),/SEPARATE_CHANNEL_NOT_OBSERVED/);
 assert.ok(calls.includes('voice'));
 calls.length=0;service.enrich('Explain Work Parcels');assert.ok(!calls.includes('voice'));
});

test('physical accounting coverage and cheaper questions resolve live usage evidence',()=>{
 const calls:string[]=[];const service=new PoeKnowledgeService({root:process.cwd(),version:'4.6.test',revision:()=>({commit:'a'.repeat(40),dirty:false}),configuration:()=>({}),sources:[],live:category=>{calls.push(category);return {source:'CANONICAL_USAGE_PROJECTION',coverage:0.67};}});
 for(const question of ['What was the measurement coverage?','Was the local run cheaper than the API?']){const answer=service.enrich(question);assert.ok(answer.facts.some(f=>f.label==='Live usage'&&String(f.value).includes('CANONICAL_USAGE_PROJECTION')));}
 assert.deepEqual(calls,['usage','usage']);
});
