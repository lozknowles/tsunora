import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectAndroid} from './android-standalone.mjs';
const options={platform:'android',architecture:'arm64',version:'26.4.0',cwd:'.',probe:()=>({status:0}),statfs:()=>({bavail:2**20,bsize:4096})};
test('Android bootstrap accepts observed Termux ARM64 and rejects unsupported dependency/platform',()=>{
 assert.equal(inspectAndroid(options).failures.length,0);
 for(const extra of [{platform:'linux'},{architecture:'x64'},{version:'22.0.0'},{probe:()=>({status:1})},{statfs:()=>{throw Error('unavailable');}},{statfs:()=>({bavail:1,bsize:4096})}])
  assert.ok(inspectAndroid({...options,...extra}).failures.length);
});
