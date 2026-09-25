import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('browser Back to a non-workspace entry closes the workspace without fetching or changing authority',()=>{
  const events=new Map(),documentEvents=new Map();
  let closed=0,fetches=0;
  const dialog={open:true,setAttribute(){},close(){this.open=false;closed++;}};
  const document={createElement:tag=>tag==='dialog'?dialog:{dataset:{}},body:{append(){}},querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(name,fn)=>documentEvents.set(name,fn)};
  const state={operatorAuth:'authenticated',token:'test-reference'};
  vm.runInNewContext(fs.readFileSync(new URL('../assets/dashboard/dashboard-workspaces.js',import.meta.url),'utf8'),{
    document,state,window:{},location:{search:''},URLSearchParams,TextEncoder,
    MutationObserver:class{observe(){}},addEventListener:(name,fn)=>events.set(name,fn),
    fetch:()=>{fetches++;throw Error('unexpected request');},
  });
  documentEvents.get('DOMContentLoaded')();
  events.get('popstate')({state:null});
  assert.equal(dialog.open,false);assert.equal(closed,1);assert.equal(fetches,0);
  assert.deepEqual(state,{operatorAuth:'authenticated',token:'test-reference'});
  events.get('popstate')({state:{unrelated:true}});assert.equal(closed,1);
});
