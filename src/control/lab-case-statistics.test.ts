import test from 'node:test';
import assert from 'node:assert/strict';
import {labCaseStatistics} from './lab-case-statistics.js';
const attempt=(speed:number|null,quality='PASS',configuration:unknown={context:4096},caseSha256='a'.repeat(64))=>({caseSha256,configuration,quality,metrics:{generationTokPerSecond:speed}});
test('case comparison retains quality failures, variance and unavailable counters',()=>{
 const result=labCaseStatistics([attempt(10),attempt(20,'FAIL'),attempt(null,'UNKNOWN')]),g=result.groups[0]!;
 assert.deepEqual(g.quality,{passed:1,failed:1,unknown:1});assert.equal(g.measurements.generationTokPerSecond!.mean,15);assert.equal(g.measurements.generationTokPerSecond!.missing,1);
 assert.equal(g.measurements.generationTokPerSecond!.standardDeviation,Math.sqrt(50));assert.equal(g.measurements.promptTokPerSecond!.mean,null);
});
test('different cases and contexts never pool while configuration key ordering is irrelevant',()=>{
 const result=labCaseStatistics([attempt(1,'PASS',{context:4096,batch:128}),attempt(3,'PASS',{batch:128,context:4096}),attempt(99,'PASS',{context:8192,batch:128}),attempt(100,'PASS',{context:4096,batch:128},'b'.repeat(64))]);
 assert.equal(result.groups.length,3);assert.equal(result.groups.find(g=>g.attempts===2)!.measurements.generationTokPerSecond!.mean,2);
});
test('missing case or configuration identity remains ungrouped and zero is retained',()=>{
 const result=labCaseStatistics([attempt(0),attempt(99,'PASS',null),attempt(99,'PASS',{},'unknown')]);
 assert.equal(result.ungrouped,2);assert.equal(result.groups.length,1);assert.equal(result.groups[0]!.measurements.generationTokPerSecond!.mean,0);assert.equal(result.groups[0]!.measurements.generationTokPerSecond!.standardDeviation,null);
});
test('large finite source values cannot emit infinite statistics',()=>{
 const metric=labCaseStatistics([attempt(Number.MAX_VALUE),attempt(0)]).groups[0]!.measurements.generationTokPerSecond!;
 assert.ok(Number.isFinite(metric.mean));assert.equal(metric.standardDeviation,null);
 assert.ok(!JSON.stringify(metric).includes('Infinity'));
});
