import assert from 'node:assert/strict';
import test from 'node:test';
import { ControlPlane } from './control-plane.js';
import { defaultCapabilities, type LaneState, type WorkspaceState } from './state.js';

const now=()=>new Date().toISOString();
function lane(id:number,priority=1):LaneState{return {id,name:`Lane ${id}`,status:'waiting',model:'qwen',reasoning:'low',context:'0',lines:[],contract:{version:2,laneId:id,goal:`goal-${id}`,constraints:[],cwd:'/tmp',priority,mode:'auto',capabilities:defaultCapabilities(),resourceLocks:{},modelLock:null,sharedTaskIds:[],updatedAt:now()},baton:{version:1,laneId:id,revision:1,status:'working',progress:['one'],hypothesis:'h',evidence:['e'],changes:[],nextAction:'next',openQuestions:[],model:'qwen',reasoning:'low',updatedAt:now()},lease:{laneId:id,holder:null,acquiredAt:null,expiresAt:null}};}
function workspace():WorkspaceState{return {version:1,paused:false,lastRestorePoint:null,lanes:[lane(1,3),lane(2,1),lane(3,2)]};}

test('scheduler chooses highest priority waiting AUTO lane',()=>{const s=workspace();const cp=new ControlPlane(s);assert.equal(cp.chooseNextLane()?.id,1);s.lanes[0].contract.mode='manual';assert.equal(cp.chooseNextLane()?.id,3);});
test('lease is exclusive until released',()=>{const s=workspace();const cp=new ControlPlane(s);cp.acquireLease(s.lanes[0],'agent-a');assert.throws(()=>cp.acquireLease(s.lanes[0],'agent-b'));cp.releaseLease(s.lanes[0],'agent-a');cp.acquireLease(s.lanes[0],'agent-b');assert.equal(s.lanes[0].lease.holder,'agent-b');});
test('handoff transfers contract/baton and pauses source',()=>{const s=workspace();const cp=new ControlPlane(s);cp.acquireLease(s.lanes[0],'agent-a');const rev=s.lanes[0].baton.revision;cp.handoff(1,2,'agent-b');assert.equal(s.lanes[0].status,'paused');assert.equal(s.lanes[1].contract.goal,'goal-1');assert.equal(s.lanes[1].baton.revision,rev+2);assert.equal(s.lanes[1].lease.holder,'agent-b');});
test('clone leaves source active and copies transferable state',()=>{const s=workspace();const cp=new ControlPlane(s);s.lanes[0].status='working';cp.clone(1,2,'agent-b');assert.equal(s.lanes[0].status,'working');assert.equal(s.lanes[1].contract.goal,'goal-1');assert.equal(s.lanes[1].lease.holder,'agent-b');});
test('shared task links lanes and accepts structured entries',()=>{const s=workspace();const cp=new ControlPlane(s);const shared=cp.createSharedTask('release investigation',[1,2]);cp.addSharedEntry(shared.id,1,'finding','cache mismatch');assert.ok(s.lanes[0].contract.sharedTaskIds.includes(shared.id));assert.equal(shared.entries[0].text,'cache mismatch');assert.throws(()=>cp.addSharedEntry(shared.id,3,'finding','not allowed'));});
