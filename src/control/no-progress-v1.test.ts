import assert from 'node:assert/strict';
import test from 'node:test';
import {NoProgressDetector, interactionFingerprints, type NoProgressEvidence} from './no-progress-v1.js';

const key=Buffer.alloc(32,7);
const read=(url='https://example.test/items',result:unknown='[]')=>({toolId:'generic.fetch',input:{method:'GET',url,params:'{"b":2,"a":1}'},result,effect:'READ' as const});

test('canonical fingerprints ignore object order and transport metadata, but preserve domain data',()=>{
  const a=interactionFingerprints({toolId:'fetch',input:{method:'get',url:'https://EXAMPLE.test/items?b=2&a=1',params:'{"b":2,"a":1}'},result:{data:{value:2,timestamp:'2026-01-01'},metadata:{requestId:'first',timestamp:'now'}}},key);
  const b=interactionFingerprints({toolId:'fetch',input:{params:'{"a":1,"b":2}',url:'https://example.test/items?a=1&b=2',method:'GET'},result:{metadata:{timestamp:'later',requestId:'second'},data:{timestamp:'2026-01-01',value:2}}},key);
  assert.equal(a.requestFingerprint,b.requestFingerprint); assert.equal(a.resultFingerprint,b.resultFingerprint); assert.equal(a.pairFingerprint,b.pairFingerprint);
  const changed=interactionFingerprints({toolId:'fetch',input:{method:'GET',url:'https://example.test/items?a=1&b=2',params:'{"a":1,"b":2}'},result:{data:{value:2,timestamp:'2026-01-02'}}},key);
  assert.notEqual(a.resultFingerprint,changed.resultFingerprint);
});

test('identical read/result escalates through visible thresholds without altering requests',()=>{
  const events:NoProgressEvidence[]=[]; const detector=new NoProgressDetector({key,record:e=>events.push(e)});
  const original=read(); const statuses=Array.from({length:10},()=>detector.observe(original).status);
  assert.deepEqual(statuses,['PROGRESS','OBSERVING_REPEAT','NO_PROGRESS_WARNING','NO_PROGRESS_WARNING','RECOVERY_REQUIRED','REPLANNING','REPLANNING','ESCALATION_REQUIRED','ESCALATION_REQUIRED','TERMINATED_NO_PROGRESS']);
  assert.deepEqual(original.input,{method:'GET',url:'https://example.test/items',params:'{"b":2,"a":1}'});
  assert.equal(events.length,10); assert.equal(events[4].repeatCount,5); assert.equal(events[4].recoveryLevel,2);
  assert.ok(events.every(e=>!JSON.stringify(e).includes('example.test/items')));
});

test('two- and three-operation cycles are detected without treating novel calls as repeats',()=>{
  for(const [names,expected] of [[['A','B'],['PROGRESS','PROGRESS','OBSERVING_REPEAT','OBSERVING_REPEAT','NO_PROGRESS_WARNING','NO_PROGRESS_WARNING']],[['A','B','C'],['PROGRESS','PROGRESS','PROGRESS','OBSERVING_REPEAT','OBSERVING_REPEAT','OBSERVING_REPEAT','NO_PROGRESS_WARNING','NO_PROGRESS_WARNING','NO_PROGRESS_WARNING']]] as const){
    const detector=new NoProgressDetector({key}); const statuses:string[]=[];
    for(let i=0;i<expected.length;i++)statuses.push(detector.observe(read(`https://example.test/${names[i%names.length]}`)).status);
    assert.deepEqual(statuses,expected);
  }
});

test('polling, pagination, transient retry and deliberate repetition never trigger this detector',()=>{
  for(const exception of ['POLLING','PAGINATION','TRANSIENT_RETRY','MONITORING','INTENTIONAL_REPEAT'] as const){
    const detector=new NoProgressDetector({key});
    for(let i=0;i<12;i++)assert.equal(detector.observe({...read(),exception}).status,'EXEMPT');
  }
});

test('state and result changes reset repetition; unconfirmed writes fail open',()=>{
  const detector=new NoProgressDetector({key});
  detector.observe(read()); assert.equal(detector.observe(read()).status,'OBSERVING_REPEAT');
  assert.equal(detector.observe({...read(),result:'[1]'}).status,'PROGRESS');
  assert.equal(detector.observe({...read(),result:'[1]',progress:['STATE_CHANGE']}).status,'PROGRESS');
  assert.equal(detector.observe({...read(),result:'[1]'}).status,'PROGRESS');
  for(let i=0;i<12;i++)assert.equal(detector.observe({toolId:'send',input:{to:'x'},result:{ok:true},effect:'WRITE'}).status,'EXEMPT');
});

test('new error information is progress and summaries contain only observed facts',()=>{
  const detector=new NoProgressDetector({key});
  detector.observe({...read(),result:{error:{code:404}}});
  const event=detector.observe({...read(),result:{error:{code:429}}});
  assert.equal(event.status,'PROGRESS'); assert.ok(event.progressKinds.includes('NEW_ERROR_INFORMATION'));
  assert.match(detector.summary(['generic.fetch','finish_work']),/generic.fetch/);
  assert.doesNotMatch(detector.summary(['generic.fetch']),/correct answer|verifier/i);
});

test('ledger evidence retains only keyed fingerprints, not request or result payloads',()=>{
  const detector=new NoProgressDetector({key});
  const event=detector.observe({toolId:'generic.fetch',input:{method:'GET',url:'https://example.test/items?credential=private-marker',body:{value:'private-marker'}},result:{data:'private-marker'},effect:'READ'});
  const retained=JSON.stringify(event);
  assert.doesNotMatch(retained,/private-marker|credential|example\.test/);
  assert.match(event.requestFingerprint,/^[a-f0-9]{64}$/);
  assert.match(event.resultFingerprint,/^[a-f0-9]{64}$/);
  assert.match(event.pairFingerprint,/^[a-f0-9]{64}$/);
  assert.doesNotMatch(detector.summary(['generic.fetch']),/credential=private-marker/);
});
