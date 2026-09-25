import { appendEvent, saveWorkspace, touchBaton, type LaneState, type WorkspaceState } from './state.js';

export type SharedRole = 'participant' | 'observer';
export interface SharedEntry { id: string; at: string; laneId: number; kind: 'finding'|'decision'|'question'|'artifact'|'status'; text: string; }
export interface SharedTask { id: string; title: string; members: Record<number, SharedRole>; entries: SharedEntry[]; updatedAt: string; }
export interface ModelResource { id: string; label: string; available: boolean; busyLaneId: number|null; capabilities: string[]; }

export class ControlPlane {
  readonly shared = new Map<string, SharedTask>();
  readonly models = new Map<string, ModelResource>();
  constructor(readonly state: WorkspaceState) {}

  registerModel(model: ModelResource) { this.models.set(model.id, model); appendEvent('model.registered', model); }
  acquireLease(lane: LaneState, holder: string, ttlMs=60_000) {
    if (lane.lease.holder && Date.parse(lane.lease.expiresAt ?? '') > Date.now()) throw new Error(`lane ${lane.id} lease held by ${lane.lease.holder}`);
    lane.lease={laneId:lane.id,holder,acquiredAt:new Date().toISOString(),expiresAt:new Date(Date.now()+ttlMs).toISOString()};
    appendEvent('lease.acquired',{laneId:lane.id,holder}); saveWorkspace(this.state);
  }
  releaseLease(lane: LaneState, holder?: string) {
    if (holder && lane.lease.holder!==holder) throw new Error('lease holder mismatch');
    appendEvent('lease.released',{laneId:lane.id,holder:lane.lease.holder}); lane.lease={laneId:lane.id,holder:null,acquiredAt:null,expiresAt:null}; saveWorkspace(this.state);
  }
  createSharedTask(title: string, laneIds: number[]) {
    const id=`shared-${Date.now().toString(36)}`; const members:Record<number,SharedRole>={}; laneIds.forEach(i=>members[i]='participant');
    const task:SharedTask={id,title,members,entries:[],updatedAt:new Date().toISOString()}; this.shared.set(id,task);
    for(const idn of laneIds){const lane=this.state.lanes.find(l=>l.id===idn);if(lane&&!lane.contract.sharedTaskIds.includes(id))lane.contract.sharedTaskIds.push(id);}
    appendEvent('shared.created',{id,title,laneIds}); saveWorkspace(this.state); return task;
  }
  addSharedEntry(taskId:string,laneId:number,kind:SharedEntry['kind'],text:string){const t=this.shared.get(taskId);if(!t)throw new Error('shared task not found');if(!t.members[laneId])throw new Error('lane not member');const e={id:`e-${Date.now().toString(36)}`,at:new Date().toISOString(),laneId,kind,text};t.entries.push(e);t.updatedAt=e.at;appendEvent('shared.updated',{taskId,laneId,kind});return e;}
  handoff(fromId:number,toId:number,holder:string){const from=this.mustLane(fromId),to=this.mustLane(toId);touchBaton(from,{status:`Handoff to lane ${toId}`,nextAction:from.baton.nextAction});this.releaseLease(from);to.contract.goal=from.contract.goal;to.contract.constraints=[...from.contract.constraints];to.contract.sharedTaskIds=[...new Set([...to.contract.sharedTaskIds,...from.contract.sharedTaskIds])];to.baton={...from.baton,laneId:to.id,revision:from.baton.revision+1,status:`Received from lane ${fromId}`,updatedAt:new Date().toISOString()};from.status='paused';to.status='working';this.acquireLease(to,holder);appendEvent('baton.handoff',{fromId,toId,revision:to.baton.revision});saveWorkspace(this.state);}
  clone(fromId:number,toId:number,holder:string){const from=this.mustLane(fromId),to=this.mustLane(toId);to.contract={...from.contract,laneId:to.id,sharedTaskIds:[...from.contract.sharedTaskIds],updatedAt:new Date().toISOString()};to.baton={...from.baton,laneId:to.id,revision:from.baton.revision+1,status:`Cloned from lane ${fromId}`,updatedAt:new Date().toISOString()};to.status='working';this.acquireLease(to,holder);appendEvent('baton.cloned',{fromId,toId,revision:to.baton.revision});saveWorkspace(this.state);}
  chooseNextLane(){return this.state.lanes.filter(l=>l.status==='waiting'&&l.contract.mode==='auto').sort((a,b)=>b.contract.priority-a.contract.priority||Date.parse(a.baton.updatedAt)-Date.parse(b.baton.updatedAt))[0]??null;}
  private mustLane(id:number){const l=this.state.lanes.find(x=>x.id===id);if(!l)throw new Error(`lane ${id} not found`);return l;}
}
