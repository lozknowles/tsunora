import assert from 'node:assert/strict';
import test from 'node:test';
import {prepareSpokenText,speechContentCoverage} from './speech-text.js';
test('speech content comparison rejects changed counts and reversed negation',()=>{
  assert.equal(speechContentCoverage('Three jobs await approval.','Four jobs await approval.').matched,false);
  assert.equal(speechContentCoverage('Publication is approved.','Publication is not approved.').matched,false);
  assert.equal(speechContentCoverage('No jobs are running.','Jobs are running.').matched,false);
  assert.equal(speechContentCoverage('3 jobs await approval.','Three jobs await approval.').matched,true);
  assert.equal(speechContentCoverage('Agent Control status. Waiting work is zero.','Agent control status, waiting work is zero.').matched,true);
});
test('speech rendering preserves an explicit spoken form without authority glyphs',()=>{
  assert.equal(prepareSpokenText('Waiting work: 0 (agent control)'),'Waiting work, zero.');
});

test('technical identifiers remain in text while speech uses a legible reference and version',()=>{
 const original='Version 4.0.0, commit 69ba1dbcf8279df3315a13f59d44992a433d3917. The working tree is clean.';
 assert.equal(prepareSpokenText(original),'Version four point zero point zero, commit identifier shown in the transcript. The working tree is clean.');assert.match(original,/69ba1dbcf8279df3315a13f59d44992a433d3917/);
});
test('spoken and transcribed thousands preserve actual regression totals',()=>{
 assert.equal(prepareSpokenText('1,070 tests passed after 15,011 ms.'),'one thousand seventy tests passed after fifteen thousand eleven ms.');
 assert.equal(speechContentCoverage('One thousand seventy tests passed.','1,070 tests passed.').matched,true);
 assert.equal(speechContentCoverage('One thousand seventy tests passed.','One, seventy tests passed.').matched,false);
 assert.equal(prepareSpokenText('One, two, three.'),'One, two, three.');
});

 test('spoken network identifiers stay in the transcript while versions remain readable',()=>{
 assert.equal(prepareSpokenText('The device `127.0.0.1:38931` was not found. Version 4.1.0 is configured.'),'The device address shown in the transcript was not found. Version four point one point zero is configured.');
});
test('clock times speak as clock times rather than independent numeric fields',()=>{
 assert.equal(prepareSpokenText('Scheduled at 09:00 UK and 15:05 UK.'),"Scheduled at nine o'clock UK and fifteen oh five UK.");
 assert.equal(prepareSpokenText('Starts at 00:00.'),'Starts at midnight.');
});
