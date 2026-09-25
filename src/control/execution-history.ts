import type {LaneState} from '../state.js';
import type {RouteDecision} from './routing.js';
import type {ParameterizedJobRun, SavedJob} from './parameterized-job-types.js';
import {DEFAULT_TOKEN_GOVERNOR_POLICY, governorFor, type ContextLifecycleRecord, type TokenGovernorPolicy, type VerifiedBaton, type TokenRoutingDecision, type ThreadTokenRecord} from './token-aware-baton-routing.js';
import type {WorkParcel} from './work-parcels.js';
import {redactSensitiveText} from './security-redaction.js';
import type {GovernedRequestOrigin} from './request-origin.js';

export type ExecutionHistoryActor = 'OPERATOR' | 'SYSTEM EVENT' | 'AGENT / PROVIDER' | 'TOOL / ACTION' | 'GOVERNOR' | 'BATON' | 'ERROR';
export type ExecutionHistoryOutcome = 'INFO' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'RECOMMENDED' | 'UNAVAILABLE';

export interface ExecutionHistoryTelemetry {
  inputTokens: number | null;
  freshInputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  contextTokens: number | null;
  contextLimitTokens: number | null;
  contextPercent: number | null;
  contextAuthority: 'authoritative' | 'estimated' | 'unavailable';
  cost: number | null;
  currency: string | null;
  costAuthority: 'authoritative' | 'estimated' | 'unavailable';
  governorState: string | null;
}

export interface ExecutionHistoryEntry {
  id: string;
  at: string;
  actor: ExecutionHistoryActor;
  type: string;
  title: string;
  content: string;
  outcome: ExecutionHistoryOutcome;
  jobRunId?: string;
  workParcelId?: string;
  laneId?: number;
  provider?: string;
  accountLabel?: string;
  model?: string;
  route?: string;
  evidenceRefs?: string[];
  telemetry?: ExecutionHistoryTelemetry;
}

export interface ExecutionHistoryProjection {
  schema: 'agent-control.execution-history/v1';
  jobRunId: string;
  savedJobId: string | null;
  jobName: string;
  workParcelIds: string[];
  origin?: GovernedRequestOrigin;
  entries: ExecutionHistoryEntry[];
  retention: {mode: 'derived-durable' | 'complete-durable'; maximumEntries: number | null; source: string};
}

export interface TokenHistoryEvidence {
  policy?: TokenGovernorPolicy;
  threads: ThreadTokenRecord[];
  batons: VerifiedBaton[];
  decisions: TokenRoutingDecision[];
  contextLifecycle?: ContextLifecycleRecord[];
}

export interface ExecutionHistoryOptions {mode?: 'dashboard' | 'complete';}

const MAX_ENTRIES = 160;
const SECRET_VALUE = /\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}\b/g;
const AUTH_VALUE = /\bbearer\s+[^\s,;]+|\b(?:authorization|access[_ -]?token|refresh[_ -]?token|api[_ -]?key|password|secret)\s*[:=]\s*[^\s,;]+/gi;
const CODEX_PATH = /\bCODEX_HOME\s*[:=]\s*[^\s,;]+|[A-Za-z]:\\Users\\[^\s]+\\(?:\.local\\share\\agent-control\\)?codex-profiles\\[^\s]+/gi;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

export function safeHistoryText(value: unknown, maximum = 1_600) {
  const text = redactSensitiveText(String(value ?? '')).replace(SECRET_VALUE, '[REDACTED]').replace(AUTH_VALUE, '[REDACTED]').replace(CODEX_PATH, '[REDACTED]').replace(EMAIL, '[REDACTED]').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim();
  return text.length <= maximum ? text : `${text.slice(0, maximum - 1)}…`;
}

export function safeTranscriptText(value: unknown, maximum = 65_536) {
  const text = redactSensitiveText(String(value ?? '')).replace(SECRET_VALUE, '[REDACTED]').replace(AUTH_VALUE, '[REDACTED]').replace(CODEX_PATH, '[REDACTED]').replace(EMAIL, '[REDACTED]').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  return text.length <= maximum ? text : `${text.slice(0, maximum - 1)}…`;
}

export function projectParameterizedRunHistory(input: {run: ParameterizedJobRun; savedJob?: SavedJob; parcels: WorkParcel[]; tokenEvidence?: TokenHistoryEvidence; options?: ExecutionHistoryOptions}): ExecutionHistoryProjection {
  const {run, savedJob} = input, complete = input.options?.mode === 'complete';
  const parcels = input.parcels.filter(parcel => run.workParcelIds.includes(parcel.id) || parcel.provenance.some(item => item.type === 'job-run' && item.detail === run.id));
  const parcelIds = new Set([...run.workParcelIds, ...parcels.map(parcel => parcel.id)]), threads = (input.tokenEvidence?.threads ?? []).filter(thread => parcelIds.has(thread.parcelId));
  const origin = run.trigger.origin ?? parcels.find(parcel => parcel.origin)?.origin;
  const batons = (input.tokenEvidence?.batons ?? []).filter(baton => parcelIds.has(baton.parcelId));
  const decisions = (input.tokenEvidence?.decisions ?? []).filter(decision => parcelIds.has(decision.parcelId));
  const entries: ExecutionHistoryEntry[] = [];
  const add = (entry: ExecutionHistoryEntry) => entries.push({...entry, title: safeHistoryText(entry.title, 240), content: complete ? safeTranscriptText(entry.content, 2_097_152) : safeHistoryText(entry.content), accountLabel: entry.accountLabel ? safeHistoryText(entry.accountLabel, 120) : undefined, route: entry.route ? safeHistoryText(entry.route, 320) : undefined, evidenceRefs: entry.evidenceRefs?.map(value => safeHistoryText(value, 256))});
  const jobName = savedJob?.name ?? run.definition.displayName;

  add({id: `${run.id}:requested`, at: run.requestedAt, actor: 'OPERATOR', type: 'JOB_REQUEST', title: `${jobName} requested`, content: `${run.definition.description} Scope ${String(run.resolvedParameters.scope ?? 'configured')}; requested ref ${String(run.resolvedParameters.ref ?? 'configured')}.`, outcome: 'INFO', jobRunId: run.id});
  if (complete) add({id: `${run.id}:operator-objective`, at: run.requestedAt, actor: 'OPERATOR', type: 'OPERATOR_OBJECTIVE', title: 'Exact governed review instruction', content: run.definition.template.instruction, outcome: 'INFO', jobRunId: run.id});
  for (const transition of run.transitions) add({id: `${run.id}:transition:${transition.at}:${transition.status}`, at: transition.at, actor: transition.status === 'FAILED' ? 'ERROR' : 'SYSTEM EVENT', type: `JOB_${transition.status}`, title: transitionTitle(transition.status), content: transition.detail ? transitionDetail(transition.detail) : transitionSummary(transition.status), outcome: transitionOutcome(transition.status), jobRunId: run.id});

  if (run.repository) add({id: `${run.id}:repository`, at: run.startedAt ?? run.requestedAt, actor: 'TOOL / ACTION', type: 'REPOSITORY_SNAPSHOT', title: 'Immutable repository revision resolved', content: `${run.repository.name} at ${run.repository.reviewedSha}; requested ref ${run.repository.requestedRef}; ${run.repository.dirty ? 'frozen dirty state recorded' : 'snapshot clean'}.`, outcome: 'SUCCEEDED', jobRunId: run.id, evidenceRefs: [run.repository.reviewedSha]});
  if (run.context) add({id: `${run.id}:context`, at: run.startedAt ?? run.requestedAt, actor: 'TOOL / ACTION', type: 'CONTEXT_COMPILED', title: `${run.context.profile} review context compiled`, content: `${run.context.chunks.length} bounded chunk(s), ${run.context.files.length} file(s), ${run.context.omittedFiles.length} omitted file(s). Redacted submitted queries and accepted final outputs are retained per invocation when available; historical runs may contain only the frozen context manifest.`, outcome: 'SUCCEEDED', jobRunId: run.id, evidenceRefs: run.context.chunks.map(chunk => chunk.sha256)});
  if (run.modelRoute) {
    const route = routeLabel(run);
    const purpose = run.modelRoute.purpose ?? 'EXECUTION';
    const caveat = purpose === 'QUALIFICATION' ? ' A qualification-purpose selection does not grant production routing admission.' : '';
    add({id: `${run.id}:route`, at: run.startedAt ?? run.requestedAt, actor: 'SYSTEM EVENT', type: 'ROUTE_SELECTED', title: purpose === 'QUALIFICATION' ? 'Governed qualification route selected' : 'Governed provider route selected', content: `${route}. Route purpose ${purpose}; qualification evidence ${run.modelRoute.qualificationVersion}; initial route fallback ${run.modelRoute.fallback ? `yes — ${run.modelRoute.fallbackReason ?? 'reason unavailable'}` : 'no'}.${caveat}`, outcome: 'SUCCEEDED', jobRunId: run.id, provider: run.modelRoute.providerId, accountLabel: run.modelRoute.accountLabel ?? undefined, model: run.modelRoute.modelId, route});
    add({id: `${run.id}:provider-request`, at: run.startedAt ?? run.requestedAt, actor: 'AGENT / PROVIDER', type: 'PROVIDER_REQUEST', title: 'Read-only structured review requested', content: `${run.definition.template.instruction.split('\n')[0]} Input used ${run.context?.chunks.length ?? 0} frozen context chunk(s). Credentials, environment values, hidden reasoning, and raw prompt payloads are not retained in this human-readable projection.`, outcome: run.status === 'RUNNING' ? 'RUNNING' : 'INFO', jobRunId: run.id, provider: run.modelRoute.providerId, accountLabel: run.modelRoute.accountLabel ?? undefined, model: run.modelRoute.modelId, route});
  }

  for (const parcel of parcels) {
    if (complete) {
      add({id: `${run.id}:parcel:${parcel.id}:created`, at: parcel.createdAt, actor: 'SYSTEM EVENT', type: 'WORK_PARCEL_CREATED', title: `Work Parcel ${parcel.id} created`, content: `Objective: ${parcel.objective}\nPlanner: ${parcel.planner.kind} — ${parcel.planner.reason}\nExecution owner: ${parcel.executionOwner ?? 'legacy/unreported'}\nCurrent durable status at transcript projection: ${parcel.status}`, outcome: 'INFO', jobRunId: run.id, workParcelId: parcel.id});
      for (const stage of parcel.stages) {
        const requested = stage.requestedRoute ? `Requested route: provider ${stage.requestedRoute.provider ?? 'policy-selected'}; account ${stage.requestedRoute.accountProfile ?? 'policy-selected'}; model ${stage.requestedRoute.model ?? 'policy-selected'}; role ${stage.requestedRoute.modelRole ?? 'policy-selected'}; fallback ${stage.requestedRoute.allowFallback === false ? 'disabled' : 'allowed'}; purpose ${stage.requestedRoute.purpose ?? 'EXECUTION'}.` : 'Requested route: normal Agent Control policy.';
        const actual = stage.actualRoute ? `Actual route: provider ${stage.actualRoute.provider ?? 'none'}; account ${stage.actualRoute.accountLabel ?? stage.actualRoute.accountProfile ?? 'default'}; model ${stage.actualRoute.model ?? 'none'}; workload node ${stage.actualRoute.workloadNodeId ?? 'unreported'}; execution node ${stage.actualRoute.providerExecutionNodeId ?? stage.actualRoute.workers[0] ?? 'unreported'}.` : 'Actual route: not yet resolved.';
        add({id: `${run.id}:parcel:${parcel.id}:stage:${stage.id}`, at: stage.endedAt ?? stage.startedAt ?? parcel.createdAt, actor: stage.status === 'FAILED' ? 'ERROR' : 'SYSTEM EVENT', type: `STAGE_${stage.status}`, title: `${stage.name}: ${stage.status}`, content: `Job ${stage.job}. Dependencies: ${stage.dependsOn.join(', ') || 'none'}. Required capabilities: ${stage.requiredCapabilities.join(', ') || 'none'}. ${requested} ${actual}${stage.waitingReason ? ` Waiting reason: ${stage.waitingReason}.` : ''}${stage.error ? ` Error: ${stage.error}.` : ''}`, outcome: stage.status === 'FAILED' ? 'FAILED' : stage.status === 'SUCCEEDED' ? 'SUCCEEDED' : stage.status === 'RUNNING' ? 'RUNNING' : 'INFO', jobRunId: run.id, workParcelId: parcel.id, provider: stage.actualRoute?.provider, accountLabel: stage.actualRoute?.accountLabel, model: stage.actualRoute?.model});
      }
      for (const invocation of parcel.audit.invocations) {
        if (invocation.exchange) {
          for (const [kind, content, at] of [['MODEL_INPUT', invocation.exchange.input, invocation.startedAt], ['MODEL_OUTPUT', invocation.exchange.output, invocation.completedAt ?? invocation.startedAt]] as const) {
            add({id: `${run.id}:invocation:${invocation.id}:${kind}`, at, actor: 'AGENT / PROVIDER', type: kind, title: `${kind === 'MODEL_INPUT' ? 'Submitted model query' : 'Accepted model output'} · ${invocation.providerModel ?? invocation.model}`, content: `${invocation.exchange.truncated ? 'LIMITATION: retained exchange truncated.\n' : ''}${content}`, outcome: 'INFO', jobRunId: run.id, workParcelId: parcel.id, provider: invocation.provider, model: invocation.providerModel ?? invocation.model, evidenceRefs: [invocation.id]});
          }
        }

        const route = `${invocation.provider} / ${invocation.accountLabel ?? invocation.accountProfileId ?? 'default account'} / ${invocation.model} @ ${invocation.providerExecutionNodeId ?? invocation.node ?? 'unreported'}`;
        add({id: `${run.id}:parcel:${parcel.id}:invocation:${invocation.id}`, at: invocation.completedAt ?? invocation.startedAt, actor: 'AGENT / PROVIDER', type: 'MODEL_INVOCATION_ACCOUNTED', title: `${invocation.provider}/${invocation.model} invocation accounted`, content: `Outcome ${invocation.outcome}; verifier ${invocation.verifierResult}; harness profile ${invocation.profile}; provider invocation profile ${invocation.invocationProfile ?? 'provider-default'}; request dispatched ${invocation.requestDispatched === null || invocation.requestDispatched === undefined ? 'unavailable' : invocation.requestDispatched ? 'yes' : 'no'}; usage authority ${invocation.usageAuthority ?? 'unavailable'}; elapsed ${number(invocation.elapsedMs)} ms. Lifetime usage ${number(invocation.inputTokens)} input (${number(invocation.freshInputTokens)} fresh + ${number(invocation.cachedInputTokens)} cached + ${number(invocation.cacheWriteTokens)} cache write), ${number(invocation.outputTokens)} output, ${number(invocation.reasoningTokens)} reasoning, ${number(invocation.totalTokens)} total. Provider cost ${money(invocation.providerReportedCost, invocation.currency)}; calculated cost ${money(invocation.calculatedCost, invocation.currency)}; selected basis ${invocation.costBasis}.`, outcome: invocation.outcome.toLowerCase().includes('fail') ? 'FAILED' : 'SUCCEEDED', jobRunId: run.id, workParcelId: parcel.id, provider: invocation.provider, accountLabel: invocation.accountLabel ?? undefined, model: invocation.model, route, evidenceRefs: [invocation.id]});
      }
      for (const provenance of parcel.provenance) add({id: `${run.id}:parcel:${parcel.id}:provenance:${provenance.at}:${provenance.type}:${entries.length}`, at: provenance.at, actor: 'SYSTEM EVENT', type: `PROVENANCE_${provenance.type.toUpperCase().replaceAll('.', '_')}`, title: `Provenance: ${provenance.type}`, content: provenance.detail, outcome: provenance.type.includes('failed') ? 'FAILED' : 'INFO', jobRunId: run.id, workParcelId: parcel.id, evidenceRefs: [provenance.detail]});
    }
    for (const event of parcel.audit.timeline) add({id: `${run.id}:parcel:${event.id}`, at: event.at, actor: parcelActor(event.type), type: `PARCEL_${event.type.toUpperCase().replaceAll('.', '_')}`, title: event.summary, content: event.detail, outcome: parcelEventOutcome(event.type), jobRunId: run.id, workParcelId: parcel.id});
  }

  for (const thread of threads) {
    const first = thread.samples[0], last = thread.latest, route = threadRoute(thread);
    const policy = input.tokenEvidence?.policy ?? DEFAULT_TOKEN_GOVERNOR_POLICY, firstGovernor = governorFor(first.contextPercent, policy).state, lastGovernor = governorFor(last.contextPercent, policy).state;
    if (complete) {
      thread.samples.forEach((point, index) => {
        const governor = governorFor(point.contextPercent, policy).state;
        add({id: `${run.id}:telemetry:${thread.id}:${index}`, at: point.at, actor: 'SYSTEM EVENT', type: index === 0 ? 'TELEMETRY_STARTED' : 'TELEMETRY_SAMPLE', title: index === 0 ? (point.context.authority === 'unavailable' ? 'Live token measurement pending provider completion' : 'Live token measurement started') : `Live telemetry sample ${index + 1}`, content: telemetryText(point, governor, index === 0), outcome: point.context.authority === 'unavailable' && index === 0 ? 'UNAVAILABLE' : 'INFO', jobRunId: run.id, workParcelId: thread.parcelId, provider: thread.providerId, accountLabel: thread.accountLabel, model: thread.modelId, route, telemetry: telemetry(point, governor)});
      });
    } else {
      add({id: `${run.id}:telemetry-start:${thread.id}`, at: first.at, actor: 'SYSTEM EVENT', type: 'TELEMETRY_STARTED', title: first.context.authority === 'unavailable' ? 'Live token measurement pending provider completion' : 'Live token measurement started', content: telemetryText(first, firstGovernor, true), outcome: first.context.authority === 'unavailable' ? 'UNAVAILABLE' : 'INFO', jobRunId: run.id, workParcelId: thread.parcelId, provider: thread.providerId, accountLabel: thread.accountLabel, model: thread.modelId, route, telemetry: telemetry(first, firstGovernor)});
      if (last.at !== first.at || last.cumulative.totalTokens !== first.cumulative.totalTokens) add({id: `${run.id}:telemetry-end:${thread.id}`, at: last.at, actor: 'SYSTEM EVENT', type: 'TELEMETRY_RECORDED', title: 'Provider usage and context estimate recorded', content: telemetryText(last, lastGovernor, false), outcome: 'SUCCEEDED', jobRunId: run.id, workParcelId: thread.parcelId, provider: thread.providerId, accountLabel: thread.accountLabel, model: thread.modelId, route, telemetry: telemetry(last, lastGovernor)});
    }
  }

  if (complete) for (const lifecycle of (input.tokenEvidence?.contextLifecycle ?? []).filter(item => parcelIds.has(item.parcelId))) {
    const thread = threads.find(item => item.id === lifecycle.threadId);
    add({id: `${run.id}:context-lifecycle:${lifecycle.id}`, at: lifecycle.at, actor: 'GOVERNOR', type: `CONTEXT_${lifecycle.kind}`, title: `Context lifecycle: ${lifecycle.kind}`, content: `Context ${lifecycle.contextId ?? 'identity unavailable'}; authority ${lifecycle.authority}; source ${lifecycle.source}. Work Parcel lifetime usage at this boundary remained ${number(lifecycle.cumulative.totalTokens)} total tokens and was not reset.`, outcome: 'SUCCEEDED', jobRunId: run.id, workParcelId: lifecycle.parcelId, provider: thread?.providerId, accountLabel: thread?.accountLabel, model: thread?.modelId, route: thread ? threadRoute(thread) : undefined, evidenceRefs: [lifecycle.id]});
  }

  for (const decision of decisions) add(governorEntry(run.id, decision, threads.find(thread => thread.id === decision.threadId)));
  for (const baton of batons) add({id: `${run.id}:baton:${baton.id}`, at: baton.createdAt, actor: 'BATON', type: 'BATON_CREATED', title: 'Verified baton created and sealed', content: `Objective: ${baton.objective}. Next action: ${baton.nextAction}. SHA-256 ${baton.sha256}. Creation does not by itself mean dispatch, acceptance, destination execution, or completed handoff.`, outcome: 'SUCCEEDED', jobRunId: run.id, workParcelId: baton.parcelId, provider: baton.providerId, accountLabel: baton.accountLabel, model: baton.modelId, evidenceRefs: [baton.id, baton.sha256]});

  if (complete) {
    for (const execution of run.providerExecutions ?? []) {
      const route = `${execution.providerId} / ${execution.accountProfileId ?? 'default account'} / ${execution.modelId} @ ${execution.providerExecutionNodeId}`;
      add({id: `${run.id}:execution:${execution.id}`, at: execution.observedAt, actor: execution.state === 'FAILED' ? 'ERROR' : 'AGENT / PROVIDER', type: `PROVIDER_EXECUTION_${execution.state}`, title: `Route-bound provider attempt ${execution.sequence}: ${execution.state}`, content: `Execution ${execution.id}; started ${execution.startedAt}; workload node ${execution.workloadNodeId}; provider execution node ${execution.providerExecutionNodeId}; credential node ${execution.credentialNodeId ?? 'provider default'}; active turn ${execution.activeTurnId ?? 'not reported'}.`, outcome: execution.state === 'FAILED' ? 'FAILED' : execution.state === 'COMPLETED' ? 'SUCCEEDED' : execution.state === 'RUNNING' || execution.state === 'STARTING' ? 'RUNNING' : 'INFO', jobRunId: run.id, provider: execution.providerId, model: execution.modelId, route, evidenceRefs: [execution.id]});
    }
    for (const retry of run.retryHistory) add({id: `${run.id}:retry:${retry.at}:${retry.attempt}`, at: retry.at, actor: 'SYSTEM EVENT', type: 'RETRY_SCHEDULED', title: `Bounded same-route retry ${retry.attempt} scheduled`, content: `Classification ${retry.kind ?? 'unreported'}; reason ${retry.reason}; next attempt ${retry.nextAttemptAt ?? 'immediate/unreported'}. This retry retained the sealed route identity.`, outcome: 'RECOMMENDED', jobRunId: run.id});
    for (const [index, fallback] of run.fallbackHistory.entries()) add({id: `${run.id}:fallback:${fallback.at}:${index}`, at: fallback.at, actor: 'GOVERNOR', type: 'GOVERNED_FALLBACK_RECORDED', title: `Governed fallback selected ${fallback.selectedModel}`, content: `Reason ${fallback.reason}; provider ${fallback.selectedProvider ?? 'unreported'}; failure classification ${fallback.failureKind ?? 'not applicable'}; baton ${fallback.batonId ?? 'not recorded for initial route fallback'}.`, outcome: 'SUCCEEDED', jobRunId: run.id, provider: fallback.selectedProvider, model: fallback.selectedModel, evidenceRefs: fallback.batonId ? [fallback.batonId] : []});
    for (const [index, error] of run.errors.entries()) add({id: `${run.id}:error:${index}`, at: run.completedAt ?? run.transitions.at(-1)?.at ?? run.requestedAt, actor: 'ERROR', type: 'RUN_ERROR', title: `Recorded run error ${index + 1}`, content: error, outcome: 'FAILED', jobRunId: run.id});
  }

  if (run.providerResponseIds.length || run.evidence.some(value => value.startsWith('provider_response_'))) {
    const refs = [...new Set([...run.providerResponseIds, ...run.evidence.filter(value => value.startsWith('provider_response_'))])];
    const schemaError = run.errors.find(value => /repository_review_provider_(?:json|schema)_invalid/.test(value)), failedSchema = Boolean(schemaError);
    const diagnostic = schemaError?.startsWith('repository_review_provider_schema_invalid:') ? ` Safe failing constraints: ${schemaError.split(':').slice(1).join(':')}.` : failedSchema ? ' This historical record predates path-level schema diagnostics, so the exact rejected field is unavailable.' : '';
    add({id: `${run.id}:provider-response`, at: run.completedAt ?? run.transitions.at(-1)?.at ?? run.requestedAt, actor: failedSchema ? 'ERROR' : 'AGENT / PROVIDER', type: failedSchema ? 'PROVIDER_RESPONSE_REJECTED' : 'PROVIDER_RESPONSE', title: failedSchema ? 'Provider output rejected by the validation boundary' : 'Provider output recorded', content: failedSchema ? `The provider returned output and accounting evidence was retained, but the response did not satisfy the repository-review schema. Agent Control failed closed.${diagnostic} Raw rejected output is not exposed through the transcript.` : run.result ? run.result.executiveSummary : 'Provider response evidence was retained by hash; no validated human-readable result is available.', outcome: failedSchema ? 'FAILED' : 'SUCCEEDED', jobRunId: run.id, provider: run.modelRoute?.providerId, accountLabel: run.modelRoute?.accountLabel ?? undefined, model: run.modelRoute?.modelId, evidenceRefs: refs});
  }

  if (complete && run.result) {
    add({id: `${run.id}:validated-result`, at: run.completedAt ?? run.transitions.at(-1)?.at ?? run.requestedAt, actor: 'AGENT / PROVIDER', type: 'VALIDATED_RESULT', title: `Validated repository-review result: ${run.result.verdict}`, content: `${run.result.executiveSummary}\n\nAreas reviewed: ${run.result.areasReviewed.join(', ') || 'none reported'}\nAreas not reviewed: ${run.result.areasNotReviewed.join(', ') || 'none'}\nPositive observations: ${run.result.positiveObservations.join('; ') || 'none reported'}`, outcome: ['PASS','PASS_WITH_FINDINGS'].includes(run.result.verdict) ? 'SUCCEEDED' : 'FAILED', jobRunId: run.id, provider: run.modelRoute?.providerId, accountLabel: run.modelRoute?.accountLabel ?? undefined, model: run.modelRoute?.modelId, evidenceRefs: run.providerResponseIds});
    for (const finding of run.result.findings) add({id: `${run.id}:finding:${finding.id}`, at: run.completedAt ?? run.transitions.at(-1)?.at ?? run.requestedAt, actor: 'AGENT / PROVIDER', type: 'VALIDATED_FINDING', title: `${finding.severity.toUpperCase()} — ${finding.title}`, content: `Location: ${finding.file ?? 'repository-level'}${finding.startLine ? `:${finding.startLine}${finding.endLine ? `-${finding.endLine}` : ''}` : ''}\nCategory: ${finding.category}\nEvidence: ${finding.evidence}\nOperational reasoning: ${finding.reasoning}\nImpact: ${finding.impact}\nSuggested remediation: ${finding.suggestedRemediation}\nConfidence: ${finding.confidence}\nValidation: ${finding.validation.state} — ${finding.validation.reasons.join('; ') || 'no additional reasons'}`, outcome: finding.validation.state === 'REJECTED' ? 'FAILED' : 'INFO', jobRunId: run.id, evidenceRefs: [finding.id]});
  }

  if ((run.usage.accountedInvocations ?? 0) > 0 || run.usage.totalTokens !== undefined || run.usage.cost !== undefined || parcels.some(parcel => parcel.audit.invocations.length > 0)) {
    const parcelTotal = sumParcelUsage(parcels);
    const reconciled = run.usage.totalTokens !== undefined && parcelTotal.totalTokens !== null && parcelTotal.totalTokens === run.usage.totalTokens && amountsEqual(parcelTotal.cost, run.usage.cost ?? null) && (run.usage.unknownUsageInvocations ?? 0) === 0;
    const parcelInput = parcelTotal.inputTokens === null
      ? `${number(parcelTotal.freshInputTokens)} reported/fresh input; cached-input component unavailable`
      : `${number(parcelTotal.inputTokens)} input (${number(parcelTotal.freshInputTokens)} fresh + ${number(parcelTotal.cachedInputTokens)} cached)`;
    const jobInput = run.usage.freshInputTokens === undefined || run.usage.cachedInputTokens === undefined ? `${number(run.usage.inputTokens)} input; fresh/cache split unavailable` : `${number(run.usage.inputTokens)} input (${number(run.usage.freshInputTokens)} fresh + ${number(run.usage.cachedInputTokens)} cached)`;
    add({id: `${run.id}:ledger`, at: run.completedAt ?? run.transitions.at(-1)?.at ?? run.requestedAt, actor: 'SYSTEM EVENT', type: 'LEDGER_RECONCILIATION', title: reconciled ? 'Job and Work Parcel accounting reconcile' : 'Accounting reconciliation incomplete', content: `Job ledger: ${jobInput} + ${number(run.usage.outputTokens)} output = ${number(run.usage.totalTokens)} total; ${money(run.usage.cost ?? null, run.usage.currency ?? null)}. Work Parcel ledger: ${parcelInput} + ${number(parcelTotal.outputTokens)} output = ${number(parcelTotal.totalTokens)} total; ${money(parcelTotal.cost, parcelTotal.currency)}. Accounted invocations ${number(run.usage.accountedInvocations)}; invocations with unavailable token usage ${number(run.usage.unknownUsageInvocations)}.${reconciled ? '' : ' Agent Control does not manufacture exact aggregate usage when any dispatched attempt lacks authoritative usage.'}`, outcome: reconciled ? 'SUCCEEDED' : 'UNAVAILABLE', jobRunId: run.id, evidenceRefs: run.workParcelIds});
  }

  const ordered = entries.map((entry, sequence) => ({entry, sequence})).sort((left, right) => left.entry.at.localeCompare(right.entry.at) || left.sequence - right.sequence).map(item => item.entry);
  const retained = complete ? ordered : ordered.slice(-MAX_ENTRIES);
  return {schema: 'agent-control.execution-history/v1', jobRunId: run.id, savedJobId: run.savedJobId ?? null, jobName, workParcelIds: [...parcelIds], ...(origin?{origin:structuredClone(origin)}:{}), entries: retained, retention: {mode: complete ? 'complete-durable' : 'derived-durable', maximumEntries: complete ? null : MAX_ENTRIES, source: complete ? 'Complete deterministic projection of Job Run + Work Parcel audit/provenance + every retained token/governor/baton record' : 'Job Run + Work Parcel audit + token/governor/baton evidence'}};
}

export function projectLaneHistory(lane: LaneState, route?: RouteDecision): ExecutionHistoryEntry[] {
  const at = lane.contract.updatedAt || lane.baton.updatedAt;
  const entries: ExecutionHistoryEntry[] = [{id: `lane:${lane.id}:objective`, at, actor: 'OPERATOR', type: 'LANE_OBJECTIVE', title: `${lane.name} objective`, content: safeHistoryText(lane.contract.goal), outcome: lane.contract.goal === 'Await task' ? 'UNAVAILABLE' : 'INFO', laneId: lane.id}];
  lane.lines.forEach((line, index) => entries.push({id: `lane:${lane.id}:line:${index}`, at, actor: line.startsWith('>') ? 'OPERATOR' : 'SYSTEM EVENT', type: 'LANE_ACTIVITY', title: line.startsWith('>') ? 'Task instruction' : 'Lane activity', content: safeHistoryText(line.replace(/^>\s*/, '')), outcome: 'INFO', laneId: lane.id}));
  entries.push({id: `lane:${lane.id}:baton:${lane.baton.revision}`, at: lane.baton.updatedAt, actor: 'BATON', type: 'LANE_BATON_STATE', title: `Baton revision ${lane.baton.revision}`, content: `${lane.baton.status}. Next action: ${lane.baton.nextAction}. This is lane baton state, not proof of a completed provider handoff.`, outcome: 'INFO', laneId: lane.id});
  if (route) entries.push({id: `lane:${lane.id}:route`, at, actor: 'SYSTEM EVENT', type: 'LANE_ROUTE', title: 'Lane route selected', content: route.rationale.map(item => item.detail).join('; '), outcome: 'INFO', laneId: lane.id, provider: route.selected.providerId, model: route.selected.model, route: route.selected.id});
  if (lane.verification?.failureReasons.length) entries.push({id: `lane:${lane.id}:verification-error`, at, actor: 'ERROR', type: 'VERIFICATION_FAILED', title: 'Verification failed closed', content: lane.verification.failureReasons.join('; '), outcome: 'FAILED', laneId: lane.id});
  return entries.map(entry => ({...entry, title: safeHistoryText(entry.title, 240), content: safeHistoryText(entry.content), route: entry.route ? safeHistoryText(entry.route, 320) : undefined})).sort((left, right) => left.at.localeCompare(right.at) || left.id.localeCompare(right.id)).slice(-MAX_ENTRIES);
}

function governorEntry(runId: string, decision: TokenRoutingDecision, thread?: ThreadTokenRecord): ExecutionHistoryEntry {
  const route = thread ? threadRoute(thread) : undefined;
  let type = 'GOVERNOR_DECISION', title = `Governor ${decision.state}: ${decision.action}`, outcome: ExecutionHistoryOutcome = 'INFO';
  let clarification = '';
  if (decision.state === 'HANDOFF' && decision.action !== 'BATON_AND_HANDOFF') { type = 'HANDOFF_RECOMMENDED'; title = 'Handoff threshold reached; handoff not performed'; outcome = 'RECOMMENDED'; clarification = ' HANDOFF is the governor recommendation state; the selected action retained continuation on the current route.'; }
  if (decision.action === 'BATON_AND_HANDOFF' && decision.outcome === 'RECORDED') { type = 'HANDOFF_REQUESTED'; title = 'Governed handoff requested'; outcome = 'RECOMMENDED'; clarification = ' A request is not proof of dispatch, acceptance, destination execution, or completion.'; }
  if (decision.action === 'BATON_AND_HANDOFF' && decision.outcome === 'SUCCEEDED') { type = 'HANDOFF_COMPLETED'; title = 'Governed handoff completed'; outcome = 'SUCCEEDED'; }
  if (decision.outcome === 'FAILED') { type = 'HANDOFF_FAILED'; title = 'Governed handoff failed; source remains recoverable'; outcome = 'FAILED'; clarification = ' The handoff is not marked complete and the source thread remains recoverable.'; }
  return {id: `${runId}:governor:${decision.id}`, at: decision.at, actor: 'GOVERNOR', type, title, content: `State ${decision.state}; action ${decision.action}; outcome ${decision.outcome}; reason ${decision.reason}.${clarification}`, outcome, jobRunId: runId, workParcelId: decision.parcelId, provider: thread?.providerId, accountLabel: thread?.accountLabel, model: thread?.modelId, route, evidenceRefs: [decision.id, ...(decision.batonId ? [decision.batonId] : [])]};
}

function telemetry(point: ThreadTokenRecord['latest'], governorState: string): ExecutionHistoryTelemetry { return {inputTokens: point.cumulative.inputTokens, freshInputTokens: point.cumulative.freshInputTokens, cachedInputTokens: point.cumulative.cachedInputTokens, outputTokens: point.cumulative.outputTokens, totalTokens: point.cumulative.totalTokens, contextTokens: point.context.tokens, contextLimitTokens: point.context.limitTokens, contextPercent: point.contextPercent, contextAuthority: point.context.authority, cost: point.cost.amount, currency: point.cost.currency, costAuthority: point.cost.authority, governorState}; }
function telemetryText(point: ThreadTokenRecord['latest'], governorState: string, initial: boolean) { const context = point.context.tokens === null ? `current context unavailable (${point.context.source})` : `${number(point.context.tokens)} / ${number(point.context.limitTokens)} tokens, ${point.contextPercent === null ? 'percentage unavailable' : `${point.contextPercent.toFixed(2)}% displayed`}, ${point.context.authority}`; const clamp = point.context.authority === 'estimated' && point.context.tokens !== null && point.context.limitTokens !== null && point.context.tokens > point.context.limitTokens ? ' The displayed percentage is an Agent Control estimate clamped at 100%, not an exact provider-reported occupancy.' : ''; return `${initial ? 'Initial sample' : 'Latest sample'}: ${context}.${clamp} Lifetime usage: ${number(point.cumulative.inputTokens)} input (${number(point.cumulative.freshInputTokens)} fresh + ${number(point.cumulative.cachedInputTokens)} cached), ${number(point.cumulative.outputTokens)} output, ${number(point.cumulative.totalTokens)} total. Cached input remains part of total input and is not subtracted from context occupancy. Cost ${money(point.cost.amount, point.cost.currency)} (${point.cost.authority}). Governor ${governorState}.`; }
function routeLabel(run: ParameterizedJobRun) { const route = run.modelRoute!; return `${route.providerId} / ${route.accountLabel ?? route.accountProfileId ?? 'default account'} / ${route.modelId} @ ${route.providerExecutionNodeId}`; }
function threadRoute(thread: ThreadTokenRecord) { return `${thread.providerId} / ${thread.accountLabel ?? thread.accountProfileId ?? 'default account'} / ${thread.modelId} @ ${thread.providerExecutionNodeId ?? thread.nodeId ?? 'controller'}`; }
function transitionTitle(status: ParameterizedJobRun['status']) { return ({QUEUED: 'Job queued', SCHEDULED: 'Job scheduled', RESOLVING: 'Resolving immutable target and route', RUNNING: 'Provider execution started', VALIDATING: 'Independent validation started', SUCCEEDED: 'Job completed successfully', SUCCEEDED_WITH_FINDINGS: 'Job completed with validated findings', FAILED: 'Job failed closed', CANCELLED: 'Job cancelled', DEGRADED: 'Job completed with degraded verification'} as Record<string, string>)[status] ?? status; }
function transitionSummary(status: ParameterizedJobRun['status']) { return ({QUEUED: 'Awaiting the governed scheduler.', RESOLVING: 'Resolving the immutable repository revision, execution node, provider route, and bounded context.', RUNNING: 'The selected provider is executing the read-only structured review.', VALIDATING: 'Agent Control is validating provider output independently.', SUCCEEDED: 'The validated result passed.', SUCCEEDED_WITH_FINDINGS: 'The validated result contains findings.', FAILED: 'Agent Control stopped and retained evidence.', CANCELLED: 'Execution stopped through the governed cancellation path.', DEGRADED: 'Verification could not fully accept the result.'} as Record<string, string>)[status] ?? status; }
function transitionDetail(detail: string) { if (detail.startsWith('repository_review_provider_schema_invalid')) { const paths = detail.split(':').slice(1).join(':'); return `Provider output existed but did not satisfy the required repository-review schema${paths ? ` at ${paths}` : ''}; Agent Control failed closed and retained accounting/evidence hashes.`; } return detail.replaceAll('_', ' '); }
function transitionOutcome(status: ParameterizedJobRun['status']): ExecutionHistoryOutcome { if (status === 'FAILED' || status === 'CANCELLED') return 'FAILED'; if (status === 'SUCCEEDED' || status === 'SUCCEEDED_WITH_FINDINGS') return 'SUCCEEDED'; if (status === 'RUNNING' || status === 'VALIDATING') return 'RUNNING'; return 'INFO'; }
function parcelActor(type: string): ExecutionHistoryActor { if (type.includes('invocation')) return 'AGENT / PROVIDER'; if (type.includes('failed')) return 'ERROR'; if (type.includes('verification') || type.includes('route')) return 'SYSTEM EVENT'; return 'TOOL / ACTION'; }
function parcelEventOutcome(type: string): ExecutionHistoryOutcome { return type.includes('failed') ? 'FAILED' : type.includes('completed') || type.includes('found') || type.includes('resolved') ? 'SUCCEEDED' : 'INFO'; }
function sumParcelUsage(parcels: WorkParcel[]) { const sum = (values: Array<number | null>) => values.length && values.every((value): value is number => value !== null) ? values.reduce((total, value) => total + value, 0) : null; const currencies = [...new Set(parcels.map(parcel => parcel.telemetry.currency).filter((value): value is string => Boolean(value)))]; const freshInputTokens = sum(parcels.map(parcel => parcel.telemetry.freshInputTokens)); const cachedInputTokens = sum(parcels.map(parcel => parcel.telemetry.cachedInputTokens)); const recordedInput = sum(parcels.map(parcel => parcel.telemetry.inputTokens === undefined ? parcel.telemetry.freshInputTokens === null || parcel.telemetry.cachedInputTokens === null ? null : parcel.telemetry.freshInputTokens + parcel.telemetry.cachedInputTokens : parcel.telemetry.inputTokens)); return {freshInputTokens, cachedInputTokens, inputTokens: recordedInput, outputTokens: sum(parcels.map(parcel => parcel.telemetry.outputTokens)), totalTokens: sum(parcels.map(parcel => parcel.telemetry.totalTokens)), cost: sum(parcels.map(parcel => parcel.telemetry.cost)), currency: currencies.length === 1 ? currencies[0] : null}; }
function number(value?: number | null) { return value === null || value === undefined ? 'unavailable' : value.toLocaleString('en-GB'); }
function money(value: number | null, currency: string | null) { return value === null ? 'unavailable' : `${value.toFixed(6)} ${currency ?? ''}`.trim(); }
function amountsEqual(left: number | null, right: number | null) { return left === right || left !== null && right !== null && Math.abs(left - right) < 1e-12; }
