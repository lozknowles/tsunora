import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLabourCliOutput} from './labour-ai-backend.js';
test('native AI parser excludes echoed requested output and accepts only the generated answer',()=>{
 const prompt='Return {"value":"requested"}';
 assert.deepEqual(parseLabourCliOutput('banner\n> '+prompt+'\n\n{"value":"actual"}\n\n[ Prompt: 10 t/s ]\nExiting...\n',prompt),{value:'actual'});
 assert.equal(parseLabourCliOutput('banner\n> '+prompt+'\n\n\n[ Prompt: 10 t/s ]',prompt),null);
 assert.equal(parseLabourCliOutput('{"value":"requested"}',prompt),null);
 assert.deepEqual(parseLabourCliOutput('> '+prompt+'\n\n```json\n{"value":2}\n```\n[ Prompt: 1 ]',prompt),{value:2});
 assert.equal(parseLabourCliOutput('> '+prompt+'\nExplanation {"value":2}\n[ Prompt: 1 ]',prompt),null);
});
