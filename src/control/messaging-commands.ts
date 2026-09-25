import {createHash} from 'node:crypto';
import type {AgentControlService} from './application-service.js';
import type {JobDefinition, RunRecord} from './job-types.js';
import {effectiveParameters} from './job-catalog.js';

/** Channel-neutral, explicitly approved immutable job bindings. No executable chat text. */
export interface MessagingTemplate {
  kind?: 'legacy' | 'saved';
  name: string; jobId: string; definitionHash: string;
  parameters: Record<string, unknown>;
  arguments: Record<string, Array<string | number | boolean>>;
  maxActive: number; maxRunsPerHour: number;
}
export type MessagingCommand = {verb: 'help'} | {verb: 'jobs'} | {verb: 'run'; template: string; arguments: Record<string, unknown>} | {verb: 'status' | 'report' | 'cancel' | 'watch' | 'unwatch'; runId: string};
export const terminalMessagingRun = (run: {status:string}) => ['SUCCEEDED', 'SUCCEEDED_WITH_FINDINGS', 'FAILED', 'DEGRADED', 'CANCELLED', 'MISSED'].includes(run.status);
export const definitionHash = (job: JobDefinition) => createHash('sha256').update(JSON.stringify(job)).digest('hex');
export function parseMessagingCommand(text: string): MessagingCommand {
  if (text.length > 2048) throw new Error('command_too_long');
  const match = text.trim().match(/^(\S+)(?:\s+([\s\S]+))?$/);
  if (!match) throw new Error('command_required');
  const [, rawVerb, tail] = match;
  const verb = rawVerb.toLowerCase();
  if ((verb === 'help' || verb === 'jobs') && !tail) return {verb};
  if (['pause', 'resume'].includes(verb)) throw new Error('pause_resume_unsupported_use_dashboard');
  if (verb === 'run') {
    const args = tail?.match(/^([a-z0-9-]+)(?:\s+(\{[\s\S]*\}))?$/);
    if (!args) throw new Error('use_run_template_json_arguments');
    const parsed = args[2] ? JSON.parse(args[2]) : {};
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('arguments_object_required');
    return {verb, template: args[1], arguments: parsed};
  }
  if (['status','report','cancel','watch','unwatch'].includes(verb) && tail) {
    const short=tail.match(/^(?:job\s+|#)?([1-9][0-9]{0,8})$/i);
    if(short)return {verb:verb as 'status',runId:`job:${Number(short[1])}`};
  }
  if (['status', 'report', 'cancel', 'watch', 'unwatch'].includes(verb) && tail && /^(?:run-[a-z0-9-]+|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/.test(tail)) return {verb: verb as 'status', runId: tail};
  // NL can only produce a proposal. A fresh explicit deterministic command is required.
  throw new Error('clarify_with_help_then_send_explicit_command');
}
export function proposeMessagingCommand(text: string): string | undefined {
  const value = text.trim();
  if (/^(?:please )?(?:show|list) (?:my )?jobs[.!?]?$/i.test(value)) return 'jobs';
  const run = value.match(/^please run ([a-z0-9-]+)(\s+\{.*\})?$/);
  if (run) return `run ${run[1]}${run[2] ?? ''}`;
  const status = value.match(/^(?:please )?(?:show status of|report on|cancel|watch|unwatch) (run-[a-z0-9-]+)[.!?]?$/i);
  if (status) return `${/cancel/i.test(value)?'cancel':/unwatch/i.test(value)?'unwatch':/watch/i.test(value)?'watch':/report/i.test(value)?'report':'status'} ${status[1]}`;
  return undefined;
}
export function validateMessagingRun(service: Pick<AgentControlService, 'job' | 'runs'>, template: MessagingTemplate, args: Record<string, unknown>, now: number) {
  const projected = service.job(template.jobId);
  const job: JobDefinition = {apiVersion: projected.apiVersion, kind: projected.kind, metadata: projected.metadata, spec: projected.spec};
  if (definitionHash(job) !== template.definitionHash) throw new Error('template_definition_changed_reapprove_dashboard');
  if (job.spec.concurrency === 'replace-running') throw new Error('template_replacement_denied');
  for (const [key, value] of Object.entries(args)) if (!Object.hasOwn(template.arguments, key) || !template.arguments[key].includes(value as never)) throw new Error('argument_not_approved');
  const params = {...template.parameters, ...args};
  for (const key of Object.keys(params)) if (!Object.hasOwn(job.spec.parameters ?? {}, key) || job.spec.parameters?.[key].secretRef) throw new Error('parameter_not_approved');
  effectiveParameters(job, params);
  const runs = service.runs(template.jobId);
  if (runs.filter(run => !terminalMessagingRun(run)).length >= template.maxActive) throw new Error('active_job_budget_exceeded');
  if (runs.filter(run => Date.parse(run.requestedAt) > now - 3600000).length >= template.maxRunsPerHour) throw new Error('hourly_job_budget_exceeded');
  return effectiveParameters(job, params);
}
export function messagingReport(service: Pick<AgentControlService, 'modelInvocations'>, run: RunRecord, dashboardUrl: string, now = Date.now()) {
  const invocations = service.modelInvocations({runId: run.id, limit: 1000});
  const latest = invocations.at(-1);
  const total = (key: 'inputTokens' | 'outputTokens' | 'cachedInputTokens') => !invocations.length || invocations.length === 1000 || invocations.some(row => row.usage[key] === null || !['provider-reported', 'transport'].includes(row.usageSource)) ? 'unavailable' : `${invocations.reduce((sum, row) => sum + row.usage[key]!, 0)} measured`;
  const elapsed = Math.max(0, Math.floor(((run.endedAt ? Date.parse(run.endedAt) : now) - Date.parse(run.startedAt ?? run.requestedAt)) / 1000));
  const steps = run.steps.map(step => `${step.id}: ${step.status}`).join('; ');
  const costRows = invocations.map(row => row.costAccounting?.billingMode === 'API_METERED' && row.currency && row.costSource !== 'unknown' ? {amount:row.providerReportedCost ?? row.calculatedCost,currency:row.currency,estimated:row.costSource!=='reported'} : undefined);
  const currencies = new Set(costRows.map(row=>row?.currency));
  const cost = !invocations.length || invocations.length===1000 || costRows.some(row=>!row || row.amount===null) || currencies.size!==1 ? 'Cost: unavailable (subscription quota is not separately billed API cost).' : `API cost: ${costRows.reduce((sum,row)=>sum+row!.amount!,0).toFixed(6)} ${costRows[0]!.currency} ${costRows.some(row=>row!.estimated)?'estimated':'measured'}.`;
  return [`${run.id}: ${run.status}`, `Elapsed ${elapsed}s; activity ${run.updatedAt ?? run.requestedAt}`,
    `Lane ${latest?.laneId ?? 'unavailable'}; node ${run.selectedWorkers.join(', ') || 'unavailable'}; model ${latest?.model ?? run.trigger.modelRoute?.modelId ?? 'unavailable'}`,
    `Context occupancy: unavailable. Lifetime input ${total('inputTokens')}; output ${total('outputTokens')}; cached ${total('cachedInputTokens')}.`,
    cost,
    steps, `Evidence: ${run.artifacts.length} artifacts; tests: ${run.steps.flatMap(step => step.verification?.passed ?? []).length} recorded checks passed.`,
    `${dashboardUrl.replace(/\/$/, '')}/?messagingRun=${encodeURIComponent(run.id)}`].join('\n');
}
