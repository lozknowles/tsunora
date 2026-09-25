import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyDiagnosticEvent,annotateDiagnosticHistory} from './diagnostic-classification.js';
import type {DiagnosticEvent} from './diagnostic-types.js';
const at='2026-09-20T10:30:00.000Z';
test('event context distinguishes a failed operation from a quoted timeout option',()=>{
 const r=classifyDiagnosticEvent(`INFO:monitor:probe=remote duration=0.01s outcome=error result="Command ['ssh', '-o', 'ConnectTimeout=10'] failed"`,{PRIORITY:'6'},at);
 assert.equal(r.type,'ERROR');assert.equal(r.severity,'ERROR');assert.equal(r.classification.sourceSeverity,'INFO');assert.equal(r.classification.incidentStatus,'UNKNOWN');
});
test('service launch descriptions do not execute or classify embedded program exceptions',()=>{
 for(const verb of ['Starting','Started']){const r=classifyDiagnosticEvent(`${verb} sandbox.service - python -c "try: run(); except OSError: pass"`,{},at);assert.equal(r.type,'INFO');assert.equal(r.classification.disposition,'INFORMATIONAL');}
 assert.equal(classifyDiagnosticEvent('sandbox.service: Failed with result \'exit-code\'.',{},at).type,'ERROR');
});
test('negation and examples are narrow; mixed statements abstain and real errors remain',()=>{
 assert.equal(classifyDiagnosticEvent('No errors detected.').type,'INFO');
 assert.equal(classifyDiagnosticEvent('Example: "fatal GPU error"').type,'INFO');
 assert.equal(classifyDiagnosticEvent('No errors before, but operation failed').type,'UNKNOWN');
 assert.equal(classifyDiagnosticEvent('Operation failed: no errors were returned').type,'UNKNOWN');
 assert.equal(classifyDiagnosticEvent('failed to allocate context buffer').type,'ALLOCATION_FAILURE');
 assert.equal(classifyDiagnosticEvent('CUDA out of memory: allocation failed').type,'GPU_PRESSURE');
});
test('successful probes with adverse nested subject status abstain instead of declaring health',()=>{
 assert.equal(classifyDiagnosticEvent("probe=backup outcome=ok result={'status':'fail'}").type,'UNKNOWN');
 assert.equal(classifyDiagnosticEvent("probe=check outcome=ok result={'unhealthy_count':2}").type,'UNKNOWN');
 assert.equal(classifyDiagnosticEvent("probe=check outcome=ok result={'unhealthy_count':0}").type,'INFO');
});
test('explicit timeout and rejected operations are retained with explained severity',()=>{
 assert.equal(classifyDiagnosticEvent('unit.service: Failed with result \'timeout\'.').type,'TIMEOUT');
 const r=classifyDiagnosticEvent('task rejected by quota controller',{},at);assert.equal(r.classification.disposition,'FAILURE');assert.equal(r.severity,'WARNING');assert.equal(r.classification.incidentStatus,'UNKNOWN');
});
test('zero process exit is distinct from nonzero or missing details',()=>{
 assert.equal(classifyDiagnosticEvent('Main process exited, code=exited, status=0/SUCCESS').type,'INFO');
 assert.equal(classifyDiagnosticEvent('Main process exited, code=exited, status=137/KILL').type,'SERVICE_EXIT');
});
const event=(id:string,message:string,seconds:number,row:Record<string,unknown>={},sourceId='source-a'):DiagnosticEvent=>{const timestamp=new Date(Date.parse(at)+seconds*1000).toISOString(),r=classifyDiagnosticEvent(message,row,timestamp);return{id,timestamp,firstSeen:timestamp,lastSeen:timestamp,timeAuthority:'SOURCE',count:1,sourceId,componentId:'service:a',host:null,service:null,process:null,pid:null,container:null,severity:r.severity,type:r.type,resource:null,job:null,worker:null,lane:null,relatedService:null,message,fingerprint:id,evidenceRef:'evidence-'+id,sanitization:{version:'test',redactions:0,untrusted:true},classification:r.classification};};
test('recovery resolves only an explicitly matched operation and retains failure evidence',()=>{
 const failed=event('f','request failed',0,{requestId:'one'}),unrelated=event('u','retry succeeded',1,{requestId:'two'});annotateDiagnosticHistory([failed,unrelated]);assert.equal(failed.classification?.incidentStatus,'UNKNOWN');
 const recovered=event('r','retry succeeded',2,{requestId:'one'});annotateDiagnosticHistory([failed,recovered]);assert.equal(failed.classification?.incidentStatus,'RESOLVED');assert.deepEqual(failed.classification?.recoveryEvidenceRefs,['evidence-r']);assert.equal(failed.type,'ERROR');assert.equal(failed.severity,'ERROR');
});
test('a normal later start does not resolve a historical failure',()=>{
 const failed=event('f','unit failed',0),started=event('s','Started unit.service - worker',1);annotateDiagnosticHistory([failed,started]);assert.equal(failed.classification?.incidentStatus,'UNKNOWN');
});
test('mirrored records retain provenance without becoming independent witnesses',()=>{
 const a=event('a','connection refused',0),b=event('b','connection refused',0,{},'source-b');annotateDiagnosticHistory([a,b]);assert.equal(b.classification?.duplicateOf,'a');assert.notEqual(b.evidenceRef,a.evidenceRef);
 const c=event('c','connection refused',1,{},'source-b');annotateDiagnosticHistory([a,c]);assert.equal(c.classification?.duplicateOf,undefined);
});
test('unknown timestamps cannot create a current or resolved incident',()=>{
 const r=classifyDiagnosticEvent('failed');assert.equal(r.classification.temporal,'UNKNOWN');assert.equal(r.classification.incidentStatus,'UNKNOWN');assert.ok(r.classification.rationale.length);
});
