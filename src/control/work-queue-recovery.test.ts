import assert from 'node:assert/strict';
import test from 'node:test';
import {WorkQueue,type WorkItem} from './work-queue.js';

const item=(id:string,status:WorkItem['status'],dependsOn:string[]=[]):WorkItem=>({id,type:'test',class:'priority',status,capabilities:{requires:[]},createdAt:new Date(0).toISOString(),batchable:false,preemptible:false,dependsOn,attempts:0,maxAttempts:2});

test('blocked dependency is reconsidered after its prerequisite recovers',()=>{
  const q=new WorkQueue();
  q.enqueue(item('a','completed'));
  q.enqueue(item('b','blocked',['a']));
  assert.equal(q.reconcileDependencies(),1);
  assert.equal(q.get('b')?.status,'queued');
});
