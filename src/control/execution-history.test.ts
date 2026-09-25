import assert from 'node:assert/strict';
import test from 'node:test';
import {projectLaneHistory, projectParameterizedRunHistory, safeHistoryText} from './execution-history.js';
import {repositoryCodeReviewDefinition} from './repository-review-definition.js';
import type {ParameterizedJobRun, SavedJob} from './parameterized-job-types.js';
import type {ThreadTokenRecord, TokenRoutingDecision, VerifiedBaton} from './token-aware-baton-routing.js';
import type {WorkParcel} from './work-parcels.js';
import type {LaneState} from '../state.js';

const at = (second: number) => `2026-09-04T12:00:${String(second).padStart(2, '0')}.000Z`;

function run(id = 'run-a', parcelId = 'parcel-a'): ParameterizedJobRun {
  return {
    schema: 'agent-control.job-run/v1', id, occurrenceId: `occurrence-${id}`, savedJobId: 'review-a', definition: repositoryCodeReviewDefinition,
    resolvedParameters: {node: 'controller', repository: '/safe/repository', ref: 'main', scope: 'full'}, trigger: {type: 'manual', actor: 'operator'}, status: 'FAILED',
    transitions: [{status: 'QUEUED', at: at(0)}, {status: 'RUNNING', at: at(3)}, {status: 'FAILED', at: at(9), detail: 'repository_review_provider_schema_invalid'}], requestedAt: at(0), startedAt: at(2), completedAt: at(9),
    repository: {identity: 'repo-a', name: 'agent-control', nodeId: 'controller', requestedRef: 'main', reviewedSha: 'a'.repeat(40), dirty: false, dirtyPaths: [], snapshotPath: '/snapshot', snapshotKind: 'local-shared-clone'},
    modelRoute: {requestedModel: 'sol', requestedRole: null, modelId: 'sol', providerId: 'openai', accountProfileId: 'profile-a', accountLabel: 'Primary', accountPlan: 'Pro', accountPlanAuthority: 'operator-configured', accountQualification: 'QUALIFIED', accountAvailability: 'AVAILABLE', providerModel: 'gpt-5', workloadNodeId: 'controller', providerExecutionNodeId: 'msi', credentialNodeId: 'msi', nodeId: 'msi', qualificationVersion: 'q1', fallback: false, fallbackReason: null, considered: []},
    context: {profile: 'STANDARD', files: ['src/a.ts'], changedFiles: [], omittedFiles: [], chunks: [{id: 'chunk-1', files: ['src/a.ts'], sha256: 'b'.repeat(64)}], truncated: false},
    workParcelIds: [parcelId], evidence: ['provider_response_sha256:' + 'c'.repeat(64)], providerResponseIds: ['provider_response_sha256:' + 'c'.repeat(64)], usage: {inputTokens: 100, outputTokens: 20, totalTokens: 120, cost: .25, currency: 'USD', source: 'calculated'}, errors: ['repository_review_provider_schema_invalid'], fallbackHistory: [], retryHistory: [], immutable: true,
  };
}

function saved(): SavedJob {
  return {schema: 'agent-control.saved-job/v1', id: 'review-a', name: 'Complete repository review', definition: {id: repositoryCodeReviewDefinition.id, version: 1, follow: 'latest-compatible'}, parameters: {}, contextProfile: 'STANDARD', concurrency: 'forbid-overlap', enabled: true, revision: 1, createdAt: at(0), updatedAt: at(0)};
}

function parcel(id = 'parcel-a'): WorkParcel {
  return {
    id, prompt: 'Review the immutable repository.', objective: 'Review the immutable repository.', actor: 'operator', executionOwner: 'direct-repository-review-executor', status: 'FAILED', planner: {kind: 'deterministic', reason: 'Registered Job'}, stages: [], createdAt: at(1), updatedAt: at(9), endedAt: at(9),
    telemetry: {freshInputTokens: 80, cachedInputTokens: 20, outputTokens: 20, reasoningTokens: 5, totalTokens: 120, cost: .25, currency: 'USD', elapsedMs: 7000},
    decision: {outcome: 'FAIL_CLOSED', title: 'Provider schema rejected', summary: 'Invalid structured output', evidence: [], blockedStages: [], authority: 'Agent Control'},
    audit: {schema: 'agent-control.work-parcel-audit/v1', recordedAt: at(1), classification: 'repository-review', selectedExecution: 'Work Parcel', planningRationale: 'Registered Job', planner: {kind: 'deterministic', provider: null, model: null}, alternatives: [], timeline: [{id: 'event-1', at: at(1), type: 'task.received', summary: 'Task accepted', detail: 'Durably associated with this parcel'}, {id: 'event-2', at: at(8), type: 'invocation.completed', summary: 'Provider invocation accounted', detail: 'Usage and response hash retained'}], invocations: [], totals: {models: ['openai/profile-a/sol'], invocations: 1, freshInputTokens: 80, cachedInputTokens: 20, outputTokens: 20, reasoningTokens: 5, totalTokens: 120, providerReportedCost: null, calculatedCost: .25, cost: .25, costBasis: 'calculated', currency: 'USD', modelExecutionMs: 7000, wallClockMs: 8000}},
    provenance: [{at: at(1), type: 'submitted', detail: 'Accepted'}],
  };
}

function thread(id = 'thread-a', parcelId = 'parcel-a'): ThreadTokenRecord {
  const initial = {at: at(4), elapsedMs: 0, cumulative: {inputTokens: 0, freshInputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: null, outputTokens: 0, totalTokens: 0}, context: {tokens: null, limitTokens: 128, authority: 'unavailable' as const, source: 'provider_reports_only_at_completion'}, contextPercent: null, cost: {amount: null, currency: null, authority: 'unavailable' as const, source: 'provider_not_reported'}};
  const latest = {at: at(7), elapsedMs: 3000, cumulative: {inputTokens: 100, freshInputTokens: 80, cachedInputTokens: 20, cacheWriteTokens: null, outputTokens: 20, totalTokens: 120}, context: {tokens: 140, limitTokens: 128, authority: 'estimated' as const, source: 'single_turn_usage_fallback'}, contextPercent: 100, cost: {amount: .25, currency: 'USD', authority: 'estimated' as const, source: 'configured_pricing'}};
  return {id, parcelId, agentId: 'agent-a', providerId: 'openai', modelId: 'sol', accountProfileId: 'profile-a', accountLabel: 'Primary', providerExecutionNodeId: 'msi', startedAt: at(4), updatedAt: at(7), active: false, recoverable: true, governor: {state: 'HANDOFF', currentThreshold: 90, nextThreshold: null, reason: 'context_handoff_threshold_reached'}, latest, samples: [initial, latest]};
}

function decision(parcelId = 'parcel-a'): TokenRoutingDecision {
  return {id: 'decision-a', at: at(7), threadId: 'thread-a', parcelId, state: 'HANDOFF', action: 'COMPACT_AND_CONTINUE', reason: 'no_cheaper_qualified_route', contextPercent: 100, outcome: 'SUCCEEDED'};
}

function baton(parcelId = 'parcel-a'): VerifiedBaton {
  const source = thread('thread-a', parcelId);
  return {schema: 'agent-control.token-baton/v1', id: 'baton-a', threadId: source.id, parcelId, providerId: 'openai', modelId: 'sol', accountProfileId: 'profile-a', accountLabel: 'Primary', providerExecutionNodeId: 'msi', objective: 'Finish review', completedWork: ['Inspected context'], decisions: ['Continue safely'], filesChanged: [], git: {sha: 'a'.repeat(40), dirty: false, diffSummary: 'clean'}, testsAndEvidence: ['context compiled'], unresolvedIssues: ['Validate output'], nextAction: 'Validate structured response', tokenState: source.latest, parcelTotals: {parcelId, threads: [source.id], byModel: [], inputTokens: 100, freshInputTokens: 80, cachedInputTokens: 20, cacheWriteTokens: null, outputTokens: 20, totalTokens: 120, cost: .25, currency: 'USD'}, createdAt: at(7), sha256: 'd'.repeat(64)};
}

test('derived Job Run history is ordered, isolated, correlated and represents fail-closed provider output', () => {
  const projection = projectParameterizedRunHistory({run: run(), savedJob: saved(), parcels: [parcel(), parcel('parcel-other')], tokenEvidence: {threads: [thread(), thread('thread-other', 'parcel-other')], decisions: [decision(), decision('parcel-other')], batons: [baton(), baton('parcel-other')]}});
  assert.equal(projection.jobRunId, 'run-a');
  assert.deepEqual(projection.workParcelIds, ['parcel-a']);
  assert.ok(projection.entries.every((entry, index, values) => index === 0 || values[index - 1].at <= entry.at));
  assert.ok(projection.entries.filter(entry => entry.workParcelId).every(entry => entry.workParcelId === 'parcel-a'));
  assert.equal(projection.entries.some(entry => entry.type === 'PROVIDER_REQUEST'), true);
  assert.equal(projection.entries.some(entry => entry.type === 'PROVIDER_RESPONSE_REJECTED' && entry.outcome === 'FAILED'), true);
  assert.equal(projection.entries.some(entry => entry.type === 'HANDOFF_RECOMMENDED' && /not performed/.test(entry.title)), true);
  assert.equal(projection.entries.some(entry => entry.type === 'HANDOFF_COMPLETED'), false);
  assert.equal(projection.entries.some(entry => entry.type === 'BATON_CREATED' && /not by itself/.test(entry.content)), true);
  assert.equal(projection.entries.some(entry => entry.type === 'LEDGER_RECONCILIATION' && entry.outcome === 'SUCCEEDED'), true);
});

test('telemetry keeps lifetime and context distinct and explains completion-only and clamped estimates', () => {
  const entries = projectParameterizedRunHistory({run: run(), parcels: [parcel()], tokenEvidence: {threads: [thread()], decisions: [], batons: []}}).entries;
  const initial = entries.find(entry => entry.type === 'TELEMETRY_STARTED')!, final = entries.find(entry => entry.type === 'TELEMETRY_RECORDED')!;
  assert.equal(initial.telemetry?.contextAuthority, 'unavailable');
  assert.equal(initial.telemetry?.governorState, 'CONTINUE');
  assert.equal(initial.telemetry?.totalTokens, 0);
  assert.match(initial.content, /provider_reports_only_at_completion/);
  assert.equal(final.telemetry?.contextTokens, 140);
  assert.equal(final.telemetry?.contextPercent, 100);
  assert.equal(final.telemetry?.freshInputTokens, 80);
  assert.equal(final.telemetry?.cachedInputTokens, 20);
  assert.equal(final.telemetry?.totalTokens, 120);
  assert.match(final.content, /clamped at 100%/);
  assert.match(final.content, /80 fresh \+ 20 cached/);

  const reported = thread();
  reported.latest = {...reported.latest, context: {tokens: 64, limitTokens: 128, authority: 'authoritative', source: 'provider'}, contextPercent: 50};
  reported.samples = [reported.samples[0], reported.latest];
  const reportedEntry = projectParameterizedRunHistory({run: run(), parcels: [parcel()], tokenEvidence: {threads: [reported], decisions: [], batons: []}}).entries.find(entry => entry.type === 'TELEMETRY_RECORDED')!;
  assert.equal(reportedEntry.telemetry?.contextAuthority, 'authoritative');
  assert.equal(reportedEntry.telemetry?.contextPercent, 50);
  assert.doesNotMatch(reportedEntry.content, /clamped/);
});

test('history redaction excludes credentials, account emails and CODEX_HOME paths after persistence reload', () => {
  const contaminated = run();
  contaminated.definition = {...contaminated.definition, description: 'Bearer super-secret-value Authorization=token123 password=hunter2 user@example.com CODEX_HOME=C:\\Users\\Example\\.local\\share\\agent-control\\codex-profiles\\primary'};
  const persisted = JSON.parse(JSON.stringify({run: contaminated, parcel: parcel(), thread: thread()}));
  const projection = projectParameterizedRunHistory({run: persisted.run, parcels: [persisted.parcel], tokenEvidence: {threads: [persisted.thread], decisions: [], batons: []}});
  const wire = JSON.stringify(projection);
  assert.doesNotMatch(wire, /super-secret|token123|hunter2|user@example|codex-profiles|C:\\\\Users/i);
  assert.match(wire, /REDACTED/);
  assert.doesNotMatch(safeHistoryText('sk-abcdefghijklmnopqrstuvwxyz'), /abcdefghijklmnopqrstuvwxyz/);
});

test('a successful baton handoff is only shown when the durable decision says it succeeded', () => {
  const completed: TokenRoutingDecision = {...decision(), action: 'BATON_AND_HANDOFF', batonId: 'baton-a', outcome: 'SUCCEEDED'};
  const entry = projectParameterizedRunHistory({run: run(), parcels: [parcel()], tokenEvidence: {threads: [thread()], decisions: [completed], batons: [baton()]}}).entries.find(item => item.type === 'HANDOFF_COMPLETED');
  assert.equal(entry?.outcome, 'SUCCEEDED');
  const failed = {...completed, id: 'decision-failed', outcome: 'FAILED' as const};
  const failedEntry = projectParameterizedRunHistory({run: run(), parcels: [parcel()], tokenEvidence: {threads: [thread()], decisions: [failed], batons: [baton()]}}).entries.find(item => item.type === 'HANDOFF_FAILED');
  assert.equal(failedEntry?.outcome, 'FAILED');
  assert.match(failedEntry?.content ?? '', /source thread remains recoverable/);
});

test('lane history stays lane-local and labels baton state without claiming handoff completion', () => {
  const lane = {id: 3, name: 'Qualification', model: 'sol', reasoning: 'high', status: 'paused', lines: ['> Review this lane', 'Waiting for provider'], contract: {goal: 'Qualify history', mode: 'manual', priority: 50, sharedTaskIds: [], updatedAt: at(1)}, baton: {revision: 2, status: 'checkpointed', nextAction: 'Resume', updatedAt: at(2), progress: [], decisions: [], evidence: [], blocked: [], contextSourceIds: []}, lease: {holder: null}} as unknown as LaneState;
  const history = projectLaneHistory(lane);
  assert.ok(history.every(entry => entry.laneId === 3));
  assert.equal(history.some(entry => entry.type === 'LANE_BATON_STATE' && /not proof/.test(entry.content)), true);
  assert.equal(history.some(entry => entry.type === 'HANDOFF_COMPLETED'), false);
});
