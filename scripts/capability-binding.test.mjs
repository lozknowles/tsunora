import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveCapabilities, assessReadiness, DEFAULT_RULES, validateRules} from './capability-binding.mjs';
const now = new Date('2026-09-13T10:00:00Z');
const rule = (capability,kind='TOOL') => ({id:capability.replaceAll('.','-'),capability,kind,adapter:'trusted-probe',method:capability,ttlSeconds:3600,attributes:['probePassed']});
const rules = ['evidence.report','gpu.inspect','model.invoke','connector.mail','credential.mail'].map(c=>rule(c));
function item(capability,nodeId='node-a',attributes={}) {
  return {id:`${nodeId}:${capability}`,nodeId,kind:'TOOL',health:'HEALTHY',lifecycle:'DISCOVERED',operationalState:'AVAILABLE',fingerprint:'immutable-observation',
    attributes:{probePassed:true,...attributes},provenance:[{adapter:'trusted-probe',method:capability,authority:'AUTHORITATIVE',observedAt:now.toISOString()}]};
}
const scan = (...items) => ({schema:'agent-control.environment-discovery/v1',id:'scan-1',status:'COMPLETED',completedAt:now.toISOString(),items});
const job = (extra={}) => ({spec_version:'1.0.0',id:'example',version:'1.0.0',sha256:'a'.repeat(64),pattern:'Worker Augmentation',description:'Inspect input.',capabilities:['evidence.report'],models:{required:[]},platforms:['any'],connectors:[],credentials:[],resources:[],inputs:{required:['scenario']},permissions:[{kind:'read-only',scope:'bound-inputs'},{kind:'local-mutation',scope:'run-output'}],approval:{required:false},risk:'low',evidence:{max_age_seconds:300},qualification:{status:'NOT_YET_QUALIFIED'},...extra});
const assess = (j,s,options={})=>assessReadiness(j,s,{now,rules,...options});

test('an observed or configured declaration is not executable proof',()=>{
  const i=item('evidence.report'); i.provenance[0].authority='CONFIGURED'; i.attributes.capabilities='model.invoke';
  const d=deriveCapabilities(scan(i),{now,rules});
  assert.equal(d.bindings.find(b=>b.capability==='evidence.report').confidence,'OBSERVED');
  assert.equal(d.bindings.find(b=>b.capability==='model.invoke').confidence,'DECLARED');
  assert.equal(assess(job(),scan(i)).technicalReadiness,'UNSUPPORTED');
});
test('successful evidence yields verified binding with full trace and no lifecycle mutation',()=>{
  const s=scan(item('evidence.report')); const before=JSON.stringify(s);
  const b=deriveCapabilities(s,{now,rules}).bindings[0];
  assert.equal(b.confidence,'VERIFIED'); assert.equal(b.evidence.observationId,s.items[0].id);
  assert.equal(b.evidence.expiresAt,'2026-09-13T11:00:00.000Z'); assert.ok(b.ruleDigest);
  assert.equal(JSON.stringify(s),before); assert.equal(b.qualification,'NOT_ASSESSED');
});
test('capability TTL permits stable probes beyond result freshness but blocks expired or future evidence',()=>{
  const s=scan(item('evidence.report')); s.items[0].provenance[0].observedAt='2026-09-13T09:30:00Z';
  assert.equal(assess(job(),s).primaryState,'READY');
  for (const at of ['2026-09-13T08:00:00Z','2026-09-13T11:00:00Z','invalid']) {
    s.items[0].provenance[0].observedAt=at; assert.equal(assess(job(),s).primaryState,'BLOCKED');
  }
});
test('failed probe remains failed even if inventory lifecycle says ACTIVE',()=>{
  const i=item('evidence.report','node-a',{probePassed:false}); i.lifecycle='ACTIVE';
  const result=assess(job(),scan(i)); assert.equal(result.primaryState,'BLOCKED');
  assert.equal(result.requirements[0].evidence[0].confidence,'FAILED');
});
test('missing capability is explained independently of required launch inputs',()=>{
  const s=scan(item('evidence.report'));
  const ready=assess(job({resources:[{id:'target',required:true,count:1}]}),s);
  assert.equal(ready.primaryState,'READY'); assert.equal(ready.runtimeInputs[0].state,'REQUIRED');
  assert.deepEqual(ready.runtimeInputs[1].candidateNodeIds,['node-a']);
  assert.equal(assess(job({capabilities:['model.invoke']}),s).reasons[0].code,'capability_missing');
});
test('authority remains orthogonal and consequential permissions cannot be hidden by approval false',()=>{
  const s=scan(item('evidence.report'));
  const a=assess(job(),s); assert.equal(a.authority.state,'NO_APPROVAL_REQUIRED');
  const b=assess(job({approval:{required:true}}),s); assert.equal(b.primaryState,'READY'); assert.equal(b.authority.state,'APPROVAL_REQUIRED');
  const c=assess(job({permissions:[{kind:'deployment',scope:'target'}]}),s); assert.equal(c.authority.state,'APPROVAL_REQUIRED');
  for (const r of [a,b,c]) {assert.equal(r.authorityGranted,false); assert.equal(r.authority.executionGrant,'NOT_EVALUATED'); assert.equal(r.execution,'NOT_STARTED'); assert.equal(r.qualification,'NOT_YET_QUALIFIED');}
});
test('connector installed is insufficient; configured authenticated capability evidence is required',()=>{
  const c=item('connector.mail','node-a',{installed:true}); const j=job({connectors:['mail']});
  assert.equal(assess(j,scan(item('evidence.report'),c)).primaryState,'CONNECTOR_REQUIRED');
  Object.assign(c.attributes,{configured:true,authenticationState:'AUTHENTICATED'});
  assert.equal(assess(j,scan(item('evidence.report'),c)).primaryState,'READY');
});
test('credential presence does not prove scoped authorization; output contains no credential attributes',()=>{
  const j=job({credentials:['mail'],permissions:[{kind:'credential-use',scope:'inbox'}]});
  const c=item('credential.mail','node-a',{present:true});
  assert.equal(assess(j,scan(item('evidence.report'),c)).primaryState,'CREDENTIAL_REQUIRED');
  Object.assign(c.attributes,{authorizationState:'VERIFIED',authorizedScopes:'other'});
  assert.equal(assess(j,scan(item('evidence.report'),c)).primaryState,'CREDENTIAL_REQUIRED');
  c.attributes.authorizedScopes='inbox';
  const r=assess(j,scan(item('evidence.report'),c)); assert.equal(r.primaryState,'READY'); assert.ok(!JSON.stringify(r).includes('authorizedScopes'));
});
test('distributed estate works only with explicit reviewed digest-bound placement',()=>{
  const j=job({capabilities:['evidence.report','gpu.inspect']}); const s=scan(item('evidence.report'),item('gpu.inspect','node-b'));
  assert.equal(assess(j,s).primaryState,'UNSUPPORTED');
  const contract={schema:'agent-control.readiness-contract/v1',jobDigest:j.sha256,reviewed:true,placement:'DISTRIBUTED'};
  const r=assess(j,s,{contract}); assert.equal(r.primaryState,'READY'); assert.equal(r.compatibleResources.length,2);
  assert.throws(()=>assess(j,s,{contract:{...contract,jobDigest:'b'.repeat(64)}}),/invalid_readiness_contract/);
  assert.throws(()=>assess(j,s,{contract:{...contract,reviewed:false}}),/invalid_readiness_contract/);
});
test('operator configuration is distinct from target and input choice',()=>{
  const j=job(),s=scan(item('evidence.report'));
  const contract={schema:'agent-control.readiness-contract/v1',jobDigest:j.sha256,reviewed:true,placement:'COLOCATED',configuration:['endpoint']};
  assert.equal(assess(j,s,{contract}).primaryState,'CONFIGURATION_REQUIRED');
  assert.equal(assess(j,s,{contract,configuration:{endpoint:'https://example.invalid'}}).primaryState,'READY');
});
test('provider-neutral model capability does not choose or depend on resource labels',()=>{
  const j=job({capabilities:['model.invoke']}),i=item('model.invoke','unrelated-estate'); i.label='independent runtime';
  const r=assess(j,scan(i)); assert.equal(r.primaryState,'READY'); assert.ok(!('routing' in r));
});
test('all requirement decisions carry machine-readable reasons or traceable evidence',()=>{
  const r=assess(job({capabilities:['evidence.report','model.invoke'],connectors:['mail']}),scan(item('evidence.report')));
  for (const q of r.requirements) {if(q.satisfied) assert.ok(q.candidates.every(c=>c.evidence.fingerprint)); else assert.ok(r.reasons.some(e=>e.requirement===q.requirement));}
});
test('malformed rules fail closed, including arbitrary code, duplicates and unbounded TTL',()=>{
  for (const r of [[{...rules[0],ttlSeconds:Infinity}],[{...rules[0],execute:'danger'}],[rules[0],rules[0]],[{...rules[0],attributes:[{}]}]]) assert.throws(()=>validateRules(r),/invalid_capability_rule/);
  validateRules(DEFAULT_RULES);
});
test('partial discovery blocks readiness even with successful capabilities',()=>{
  const s=scan(item('evidence.report')); s.status='PARTIAL'; assert.equal(assess(job(),s).primaryState,'BLOCKED');
});
test('multiple target resources require enough compatible machines',()=>{
  assert.equal(assess(job({resources:[{id:'targets',required:true,count:2}]}),scan(item('evidence.report'))).primaryState,'UNSUPPORTED');
});
test('connectors and credentials must share a feasible node when colocation is required',()=>{
  const j=job({connectors:['mail'],credentials:['mail'],permissions:[{kind:'credential-use',scope:'inbox'}]});
  const s=scan(item('evidence.report'),item('evidence.report','node-b'),
    item('connector.mail','node-a',{installed:true,configured:true,authenticationState:'AUTHENTICATED'}),
    item('credential.mail','node-b',{present:true,authorizationState:'VERIFIED',authorizedScopes:'inbox'}));
  assert.equal(assess(j,s).primaryState,'UNSUPPORTED');
  const contract={schema:'agent-control.readiness-contract/v1',jobDigest:j.sha256,reviewed:true,placement:'DISTRIBUTED'};
  assert.equal(assess(j,s,{contract}).primaryState,'READY');
});
test('the public catalogue evaluator exposes technical readiness and preserves explicit legacy replay',async()=>{
  const api=await import('./external-job-catalogue.mjs');
  assert.equal(api.assessReadiness,assessReadiness);
  assert.equal(typeof api.assessLegacyReadiness,'function');
  assert.equal(api.assessReadiness(job(),scan(item('evidence.report')),{now,rules}).primaryState,'READY');
});
