import assert from'node:assert/strict';import test from'node:test';import{proveResponsesProvider}from'./responses-client.js';
test('proof client rejects non Responses providers',async()=>{await assert.rejects(()=>proveResponsesProvider({id:'x',name:'x',kind:'local',requiresAuth:false,parallelism:1,costClass:'free',capabilities:[]}));});
