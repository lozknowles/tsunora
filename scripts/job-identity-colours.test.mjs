import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../assets/dashboard/job-identity.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/dashboard/dashboard-theme.css',import.meta.url),'utf8');
function load(){const context={window:{},TextEncoder};runInNewContext(source,context);return context.window.AgentControlIdentity;}
const identity=load();
const event=(entityId,kind='MODEL')=>({entityId,kind});
const entities=[{id:'worker:a',runId:'run-a'},{id:'tool:a',runId:'run-a'}];

test('same immutable Run ID receives the same slot',()=>assert.equal(identity.run('run-a').slot,identity.run('run-a').slot));
test('renaming a Job cannot change the Run identity colour',()=>assert.equal(identity.run('run-a').slot,identity.run('run-a','old title').slot));
test('ordering Jobs cannot change their assigned slots',()=>{const ids=['run-a','run-b','run-c'],a=Object.fromEntries(ids.map(id=>[id,identity.run(id).slot]));ids.reverse();assert.deepEqual(Object.fromEntries(ids.map(id=>[id,identity.run(id).slot])),a);});
test('restart reproduces the mapping',()=>assert.equal(load().run('run-a').slot,identity.run('run-a').slot));
test('unrelated Runs have distinct canonical identities even if palette slots collide',()=>assert.notEqual(identity.run('run-a').key,identity.run('run-b').key));
test('hash spreads a large Run set across the restrained palette',()=>{assert.equal(identity.paletteSize,12);const counts=Array.from({length:identity.paletteSize},()=>0);for(let i=0;i<800;i++)counts[identity.run(`run-${i}`).slot]++;assert.ok(counts.every(count=>count>=45&&count<=90),counts.join(','));});
test('interleaved A B A events retain A identity',()=>{const events=[event('job:run-a'),event('job:run-b'),event('job:run-a')];assert.deepEqual(events.map(e=>identity.run(identity.eventRunId(e)).key),['run:run-a','run:run-b','run:run-a']);});
test('worker and tool events inherit the linked parent Run',()=>{assert.equal(identity.eventRunId(event('worker:a'),entities),'run-a');assert.equal(identity.eventRunId(event('tool:a','TOOL'),entities),'run-a');});
test('unlinked events remain uncoloured rather than claiming a Job',()=>assert.equal(identity.eventRunId(event('worker:unknown'),entities),null));
test('filtering is a view operation that leaves retained evidence untouched',()=>{const events=[event('job:run-a'),event('job:run-b'),event('job:run-a')],before=JSON.stringify(events),visible=identity.filterEvents(events,'run-a');assert.deepEqual(Array.from(visible,e=>e.entityId),['job:run-a','job:run-a']);assert.equal(JSON.stringify(events),before);});
test('reloaded retained events resolve the same Run mapping',()=>{const events=JSON.parse(JSON.stringify([event('job:run-a')]));assert.equal(identity.run(identity.eventRunId(events[0])).slot,load().run('run-a').slot);});
test('Mallow conversation identity and background Run identity have separate namespaces',()=>assert.notEqual(identity.conversation('same-id').key,identity.run('same-id').key));
test('video manifest bindings use the dashboard slot for each recorded Run',()=>{const frames=[{projection:{entities:[{kind:'job',runId:'run-a'},{kind:'worker',runId:'run-a'}]}},{projection:{entities:[{kind:'job',runId:'run-b'},{kind:'job',runId:'run-a'}]}}];const bindings=identity.videoBindings(frames);assert.equal(bindings.length,2);assert.equal(bindings[0].slot,identity.run('run-a').slot);assert.equal(bindings[1].slot,identity.run('run-b').slot);});
test('video bindings retain a Job referenced by an event even when its entity was omitted',()=>{const frames=[{projection:{entities:[],events:[event('job:run-omitted')]}}];assert.equal(identity.videoBindings(frames)[0].slot,identity.run('run-omitted').slot);});

function luminance(hex){const values=hex.match(/[0-9a-f]{2}/gi).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return values[0]*.2126+values[1]*.7152+values[2]*.0722;}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
test('all identity text colours meet 4.5:1 contrast on light and dark surfaces',()=>{const literals=[...css.matchAll(/--ac-identity-\d+:\s*(#[0-9a-f]{6})/gi)].map(m=>m[1]);assert.equal(literals.length,24);for(const [index,colour] of literals.entries())assert.ok(contrast(colour,index<12?'#ffffff':'#101b26')>=4.5,`${colour} has insufficient contrast`);});
test('identity styling uses a rail and badge while status tokens remain separate',()=>{assert.match(css,/\.job-identity-rail\s*\{[^}]*border-inline-start/);assert.match(css,/\.job-identity-badge::before/);assert.doesNotMatch(css,/--ac-(success|warning|error|blocked):var\(--ac-identity/);});
