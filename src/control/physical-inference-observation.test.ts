import {test} from 'node:test';
import assert from 'node:assert/strict';
import {physicalInferenceMeasurements,physicalInferenceMarkdown} from './physical-inference-observation.js';
const reference={id:'artifact-test',sha256:'abc'};
test('missing physical counters remain unavailable, including resource samples',()=>{const [r]=physicalInferenceMeasurements({schema:'agent-control.physical-inference-experiment/v1',invocations:[{}]},reference);assert.equal(r.input,null);assert.equal(r.cached,null);assert.equal(r.peakVramMiB,null);assert.match(physicalInferenceMarkdown([r]),/Cached input: unavailable/);});
test('measured zero cache is retained and new input is derived only from known counters',()=>{const [r]=physicalInferenceMeasurements({schema:'agent-control.physical-inference-experiment/v1',invocations:[{usage:{prompt_tokens:42,prompt_tokens_details:{cached_tokens:0},completion_tokens:3},timings:{prompt_per_second:9,predicted_per_second:4}}]},reference);assert.equal(r.cached,0);assert.equal(r.newInput,42);assert.equal(r.generationTokPerSecond,4);});
test('physical resource peaks use only samples within the invocation interval',()=>{const [r]=physicalInferenceMeasurements({schema:'agent-control.physical-inference-experiment/v1',invocations:[{startedAt:'2026-09-15T01:00:00Z',endedAt:'2026-09-15T01:00:02Z'}],samples:[{at:'2026-09-15T00:00:00Z',metrics:{gpuMemoryUsedMiB:16000,gpuTemperatureC:90}},{at:'2026-09-15T01:00:01Z',metrics:{gpuMemoryUsedMiB:10000,gpuTemperatureC:65}}]},reference);assert.equal(r.peakVramMiB,10000);assert.equal(r.peakTemperatureC,65);assert.equal(r.sampleCount,1);});
test('other artifacts do not acquire inferred measurements',()=>assert.deepEqual(physicalInferenceMeasurements({invocations:[{usage:{prompt_tokens:9}}]},reference),[]));
test('malformed invocation and sample members cannot break the retained-evidence view',()=>{
 const rows=physicalInferenceMeasurements({schema:'agent-control.physical-inference-experiment/v1',invocations:[null,42,[],{startedAt:'2026-09-15T01:00:00Z',endedAt:'2026-09-15T01:00:02Z'}],samples:[null,42,{}, {at:'2026-09-15T01:00:01Z',metrics:{gpuMemoryUsedMiB:-1}}]},reference);
 assert.equal(rows.length,1);assert.equal(rows[0].peakVramMiB,null);
 assert.doesNotThrow(()=>physicalInferenceMeasurements({schema:'agent-control.physical-inference-experiment/v1',invocations:[{startedAt:{toString:null,valueOf:null}}]},reference));
});
test('sample binding compares instants across time zones and rejects invalid intervals',()=>{
 const value={schema:'agent-control.physical-inference-experiment/v1',invocations:[{startedAt:'2026-09-15T02:00:00+01:00',endedAt:'2026-09-15T02:00:02+01:00'}],samples:[{at:'2026-09-15T01:00:01Z',metrics:{gpuMemoryUsedMiB:123}}]};
 assert.equal(physicalInferenceMeasurements(value,reference)[0].peakVramMiB,123);
 value.invocations[0].startedAt='invalid';assert.equal(physicalInferenceMeasurements(value,reference)[0].peakVramMiB,null);
});
