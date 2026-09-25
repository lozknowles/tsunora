import {createHash} from 'node:crypto';
import type {OpenWAAdapter} from './openwa.js';
import type {SocialChannelProvider,SocialIdentity,SocialMessage} from './social-voice-providers.js';
import type {SocialExecutionPort} from './social-voice.js';
import {validateMessagingRun,terminalMessagingRun} from './messaging-commands.js';

export class OpenWASocialProvider implements SocialChannelProvider {
  readonly id='openwa';
  constructor(private readonly adapter:OpenWAAdapter){}
  capabilities(){return {text:true,audio:true,artifacts:false,approvals:true};}
  async health(){const h=await this.adapter.checkHealth();return {state:h.state==='connected_verified'?'ready' as const:'unavailable' as const,checkedAt:new Date(h.checkedAt).toISOString(),...(h.state==='connected_verified'?{}:{reason:h.state})};}
  receive(input:unknown):SocialMessage {const m=input as SocialMessage;if(!m||!['text','audio'].includes(m.kind)||!m.identity||m.identity.channel!==this.id||m.identity.account!==this.adapter.config.sessionId||m.identity.sender!==m.identity.conversation)throw new Error('social_message_invalid');return structuredClone(m);}
  async send(identity:SocialIdentity,text:string,key:string){return this.adapter.queueSocial(identity,text,key);}
  sendStatus(identity:SocialIdentity,text:string,key:string){return this.send(identity,text,key);}
  sendApprovalRequest(identity:SocialIdentity,text:string,key:string){return this.send(identity,text,key);}
  async sendArtifact(identity:SocialIdentity,bytes:Uint8Array,mime:string,key:string){return this.adapter.queueSocial(identity,'',key,{bytes,mime});}
  downloadAudio(identity:SocialIdentity,id:string){return this.adapter.socialAudio(identity,id);}
}
export function openwaExecutionPort(adapter:OpenWAAdapter):SocialExecutionPort {
  const service=adapter.service;
  return {
    principal:identity=>adapter.socialPrincipal(identity),
    start(templateName,actor,key,request){
      const template=adapter.config.templates.find(t=>t.name===templateName);if(!template||template.kind==='saved')throw new Error('social_template_not_supported');
      // Recover the durable parcel before checking rolling limits again.
      const existing=service.parcels().find(p=>p.id===`parcel-social-${key}`&&p.actor===actor);if(existing)return existing;
      const now=Date.now(), runs=service.runs(template.jobId);
      const pending=service.parcels().filter(p=>p.id.startsWith('parcel-social-')&&p.stages.some(s=>s.job.startsWith(template.jobId+'@')&&!s.runId));
      if(runs.filter(r=>!terminalMessagingRun(r)).length+pending.filter(p=>!['SUCCEEDED','FAILED','CANCELLED','DEGRADED'].includes(p.status)).length>=template.maxActive)throw new Error('active_job_budget_exceeded');
      if(runs.filter(r=>Date.parse(r.requestedAt)>now-3600000).length+pending.filter(p=>Date.parse(p.createdAt)>now-3600000).length>=template.maxRunsPerHour)throw new Error('hourly_job_budget_exceeded');
      const parameters=validateMessagingRun(service,template,{},now);return service.createSocialParcel(template.jobId,parameters,actor,key,request.prompt,request.origin);
    },
    observe(id){const p=service.parcel(id),runId=p.stages.find(s=>s.runId)?.runId;return {status:p.status,runId,text:`${p.objective}: ${p.status}.\nWork Parcel: ${p.id}\n${p.stages.map(s=>`${s.name}: ${s.status}`).join('\n')}\nModels: ${p.audit.totals.models.join(', ')||'unavailable'}. Duration: ${Math.round(p.telemetry.elapsedMs/1000)} seconds.\n${adapter.config.dashboardUrl.replace(/\/$/,'')}/?parcel=${p.id}`,durationMs:p.telemetry.elapsedMs,model:p.audit.totals.models.join(', ')||undefined,node:p.stages.flatMap(s=>s.actualRoute?.workers??[]).join(', ')||undefined};},
    stop(id,actor){const parcel=service.parcel(id);const active=parcel.stages.filter(s=>s.runId&&!['SUCCEEDED','FAILED','CANCELLED'].includes(s.status));if(active.length)for(const step of active)service.cancelJobRun(step.runId!,actor);else service.cancelParcel(id,actor);},
    overview(kind,actor){
      if(kind==='status'){const parcels=service.parcels().filter(p=>p.actor===actor);return `Agent Control: ${parcels.filter(p=>!['SUCCEEDED','FAILED','CANCELLED'].includes(p.status)).length} active Social & Voice Work Parcels. ${parcels.length} total. Use jobs for your earlier WhatsApp jobs.`;}
      if(kind==='models'){try{return service.models().map(m=>m.id).join('\n')||'No models configured.';}catch{return 'No model registry available.';}}
      if(kind==='nodes')return service.workers().map(w=>w.id).join('\n')||'No workers configured.';
      return `Agent Control runtime available. Social channel: ${adapter.status().health.state}. Speech health is shown in the dashboard.`;
    },
    approvalSnapshot(parcel,runId,action){const p=service.parcel(parcel),run=service.run(runId);if(!p.stages.some(s=>s.runId===runId)||!run.steps.some(s=>s.status==='WAITING_FOR_APPROVAL'&&s.approval===action))throw new Error('approval_not_waiting');return createHash('sha256').update(JSON.stringify({parcel,run:runId,action,status:run.status,parameters:run.parameters,steps:run.steps.map(s=>[s.id,s.status,s.waitingReason])})).digest('hex');},
    decide(parcel,runId,action,approved,actor){if(approved)service.approveJobRun(runId,action,actor);else service.cancelParcel(parcel,actor);},
  };
}


