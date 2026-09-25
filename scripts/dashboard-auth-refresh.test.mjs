import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../assets/dashboard/dashboard.js',import.meta.url),'utf8');
function setup(){const events=[],button={classList:{toggle(){}}};const context=vm.createContext({fetch:()=>{},sessionStorage:{getItem:()=>''},document:{addEventListener(){},querySelector:selector=>selector==='#operator-button'?button:null,dispatchEvent:e=>events.push(e)},CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail;}},setTimeout,clearTimeout});vm.runInContext(source,context);return {context,events};}
test('an older in-flight unauthenticated refresh cannot overwrite a newly authenticated session',async()=>{
 const {context}=setup();let finish;context.fetch=()=>new Promise(resolve=>{finish=resolve;});vm.runInContext("operatorAuthentication=async()=> 'authentication_required';render=()=>{};",context);
 const pending=vm.runInContext('refresh()',context);vm.runInContext("state.token='new-session';state.operatorAuth='authenticated'",context);
 finish({ok:true,json:async()=>({lanes:[]})});await pending;
 assert.equal(vm.runInContext('state.operatorAuth',context),'authenticated');
});
test('authentication changes publish state without the credential and avoid redundant events',()=>{
 const {context,events}=setup();vm.runInContext("state.token='private-test-token';state.operatorAuth='authenticated';renderOperatorAuth();renderOperatorAuth();state.operatorAuth='authentication_required';renderOperatorAuth()",context);
 assert.equal(events.length,2);assert.equal(events[0].type,'agent-control:authentication-changed');assert.equal(events[0].detail.state,'authenticated');assert.ok(!JSON.stringify(events).includes('private-test-token'));
});
