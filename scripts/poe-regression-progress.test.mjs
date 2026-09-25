import test from 'node:test';import assert from 'node:assert/strict';import {ingestRegressionLine} from './poe-regression-progress.mjs';
test('live regression counts follow runner events and exact final totals',()=>{const record={phase:'start',phases:[],passed:0,failed:0,skipped:0,total:null,remaining:null},cursor={summary:false};
 for(const line of ['> agent-control@4.0.0 check:neutrality','✔ first gate','ℹ tests 1','ℹ pass 1','> agent-control@4.0.0 test','✔ first test','✖ second test'])ingestRegressionLine(record,line,cursor);
 assert.equal(record.passed,1);assert.equal(record.failed,1);assert.equal(record.remaining,null);assert.equal(record.total,null);
 for(const line of ['ℹ tests 3','ℹ pass 1','ℹ fail 1','ℹ skipped 1','✖ failing tests:','✖ second test'])ingestRegressionLine(record,line,cursor);
 assert.equal(record.total,3);assert.equal(record.passed,1);assert.equal(record.failed,1);assert.equal(record.skipped,1);assert.equal(record.remaining,0);assert.equal(record.phase,'test');
});
