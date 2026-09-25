import {createHash} from 'node:crypto';
import type {AgentControlService} from './application-service.js';
import {safeHistoryText} from './execution-history.js';
import {terminalMessagingRun, type MessagingTemplate} from './messaging-commands.js';

export type MessagingObservedRun = ReturnType<AgentControlService['run']> | ReturnType<AgentControlService['parameterizedRun']>;
export function savedMessagingTemplateHash(service: Pick<AgentControlService,'exportSavedJob'|'jobDefinition'>,id:string) {
  const job=service.exportSavedJob(id);
  if(job.definition.follow!=='pinned')throw new Error('saved_template_definition_must_be_pinned');
  const definition=service.jobDefinition(job.definition.id,job.definition.version);
  return createHash('sha256').update(JSON.stringify({job,definition})).digest('hex');
}
export function validateSavedMessagingRun(service: Pick<AgentControlService,'exportSavedJob'|'jobDefinition'> & {parameterizedRuns(id?:string):Array<{status:string;requestedAt:string}>},template:MessagingTemplate,args:Record<string,unknown>,now:number){
  if(Object.keys(args).length || Object.keys(template.parameters).length || Object.keys(template.arguments).length)throw new Error('argument_not_approved');
  if(savedMessagingTemplateHash(service,template.jobId)!==template.definitionHash)throw new Error('template_definition_changed_reapprove_dashboard');
  const runs=service.parameterizedRuns(template.jobId);
  if(runs.filter(run=>!terminalMessagingRun(run)).length>=template.maxActive)throw new Error('active_job_budget_exceeded');
  if(runs.filter(run=>Date.parse(run.requestedAt)>now-3600000).length>=template.maxRunsPerHour)throw new Error('hourly_job_budget_exceeded');
}
export function savedMessagingReport(run:ReturnType<AgentControlService['parameterizedRun']>,dashboardUrl:string,now=Date.now()){
  const entries=run.executionHistory.entries;
  const measured=entries.filter(entry=>entry.telemetry).at(-1),telemetry=measured?.telemetry;
  const latestModel=entries.filter(entry=>entry.model).at(-1);
  const metric=(value:number|null|undefined)=>value===null||value===undefined?'unavailable':String(value);
  const elapsed=Math.max(0,Math.floor(((run.completedAt?Date.parse(run.completedAt):now)-Date.parse(run.startedAt??run.requestedAt))/1000));
  const route=run.modelRoute;
  // Context occupancy and per-run lifetime usage remain distinct sources and authority labels.
  return [`${run.id}: ${run.status}`,`Elapsed ${elapsed}s; activity ${run.transitions.at(-1)?.at??run.requestedAt}`,
    `Lane ${latestModel?.laneId??'unavailable'}; node ${route?.nodeId??'unavailable'}; latest recorded model ${latestModel?.model??route?.modelId??'unavailable'}.`,
    `Current context: ${metric(telemetry?.contextTokens)} / ${metric(telemetry?.contextLimitTokens)} tokens (${telemetry?.contextAuthority??'unavailable'}).`,
    `Lifetime input ${metric(run.usage.inputTokens)}; output ${metric(run.usage.outputTokens)}; cached ${metric(run.usage.cachedInputTokens)} (${run.usage.source}).`,
    `Cost: ${metric(run.usage.cost)} ${run.usage.currency??''} (${run.usage.source==='provider'?'measured provider report; billing mode unavailable':run.usage.source==='calculated'?'estimated; billing mode unavailable':'unavailable'}). Subscription quota is not separately billed API cost.`,
    `Runtime detail: ${safeHistoryText(run.transitions.at(-1)?.detail??run.recovery?.reason??'none recorded',400)}. Telemetry observed ${measured?.at??'unavailable'}.`,
    `Final verdict: ${run.result?.verdict??'not yet verified'}; ${run.evidence.length} evidence references.`,
    `${dashboardUrl.replace(/\/$/,'')}/?messagingRun=${encodeURIComponent(run.id)}`].join('\n');
}
/** Only the existing durable, authoritative history projection can supply these notifications. */
export function savedMessagingMilestones(run:ReturnType<AgentControlService['parameterizedRun']>){
  return run.executionHistory.entries.filter(entry=>
    (entry.type==='HANDOFF_COMPLETED' && entry.outcome==='SUCCEEDED') ||
    ['HANDOFF_FAILED','HANDOFF_REQUESTED','HANDOFF_RECOMMENDED'].includes(entry.type)
  ).map(entry=>({id:entry.id,text:`${run.id}: ${entry.title}\n${safeHistoryText(entry.content,900)}\nRecorded ${entry.at}`}));
}
