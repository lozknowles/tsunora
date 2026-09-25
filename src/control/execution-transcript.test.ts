import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {ExecutionTranscriptRuntime, renderExecutionTranscript} from './execution-transcript.js';
import {ParameterizedJobRegistry, ParameterizedRunStore, SavedJobStore} from './parameterized-job-registry.js';
import {repositoryCodeReviewDefinition} from './repository-review-definition.js';
import {TokenAwareBatonRuntime} from './token-aware-baton-routing.js';
import {WorkParcelStore, type WorkParcel} from './work-parcels.js';
import type {ParameterizedJobRun} from './parameterized-job-types.js';
import {governedRequestOrigin} from './request-origin.js';

test('complete transcript is generated during execution, uncapped, redacted and byte-identical after restart', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-transcript-'));
  try {
    const definitions = new ParameterizedJobRegistry(); definitions.register(repositoryCodeReviewDefinition);
    const saved = new SavedJobStore(path.join(root, 'saved.json'), definitions), runs = new ParameterizedRunStore(path.join(root, 'runs.json')), parcels = new WorkParcelStore(path.join(root, 'parcels.json')), routing = new TokenAwareBatonRuntime(path.join(root, 'routing.json'));
    saved.create({id: 'natural-review', name: 'Natural release review', definition: {id: 'repository-code-review', version: 1, follow: 'pinned'}, parameters: {node: 'controller', repository: '/fixture', ref: 'main', scope: 'full'}, routing: {modelRole: 'review.default', allowFallback: true}, contextProfile: 'STANDARD', concurrency: 'forbid-overlap', enabled: true});
    const transcriptRoot = path.join(root, 'transcripts'), firstRuntime = new ExecutionTranscriptRuntime(transcriptRoot, runs, saved, parcels, routing);
    const at = (second: number) => `2026-09-07T10:00:${String(second).padStart(2, '0')}.000Z`;
    const definition = {...repositoryCodeReviewDefinition, template: {...repositoryCodeReviewDefinition.template, instruction: 'Inspect the frozen fixture exactly.\nReturn objective evidence only.\nnvapi-synthetic-secret-must-redact'}};
    const run: ParameterizedJobRun = {schema: 'agent-control.job-run/v1', id: 'run-natural', occurrenceId: 'occurrence-natural', savedJobId: 'natural-review', definition, resolvedParameters: {node: 'controller', repository: '/fixture', ref: 'main', scope: 'full'}, trigger: {type: 'manual', actor: 'operator'}, status: 'RUNNING', transitions: [{status: 'QUEUED', at: at(0)}, {status: 'RUNNING', at: at(1)}], requestedAt: at(0), startedAt: at(1), repository: {identity: 'fixture', name: 'fixture', nodeId: 'controller', requestedRef: 'main', reviewedSha: 'a'.repeat(40), dirty: false, dirtyPaths: [], snapshotPath: '/snapshot', snapshotKind: 'local-shared-clone'}, modelRoute: {requestedModel: null, requestedRole: 'review.default', allowFallback: true, purpose: 'EXECUTION', modelId: 'model-a', providerId: 'provider-a', accountProfileId: null, accountLabel: null, accountPlan: null, accountPlanAuthority: null, accountQualification: null, accountAvailability: null, providerModel: 'vendor/model-a', workloadNodeId: 'controller', providerExecutionNodeId: 'controller', credentialNodeId: null, nodeId: 'controller', qualificationVersion: 'q1', fallback: false, fallbackReason: null, requiredCapabilities: ['review.repository'], considered: []}, context: {profile: 'STANDARD', files: ['index.ts'], changedFiles: [], omittedFiles: [], chunks: [{id: 'chunk-a', files: ['index.ts'], sha256: 'b'.repeat(64)}], truncated: false}, workParcelIds: [], evidence: [], providerResponseIds: [], usage: {source: 'unavailable'}, errors: [], fallbackHistory: [], retryHistory: [], immutable: false};
    runs.add(run);
    const timeline = Array.from({length: 170}, (_, index) => ({id: `event-${index}`, at: at(2), type: 'context.retrieved' as const, summary: `Evidence event ${index}`, detail: `Safe result ${index}`}));
    const parcel: WorkParcel = {id: 'parcel-natural', prompt: 'Inspect the frozen fixture exactly.', objective: 'Inspect the frozen fixture exactly.', actor: 'operator', executionOwner: 'direct-repository-review-executor', status: 'RUNNING', planner: {kind: 'deterministic', reason: 'Registered Job'}, stages: [{id: 'review', name: 'Review', job: 'repository-code-review@1', dependsOn: [], parameters: {}, requiredCapabilities: ['repository-review'], outputs: ['repository-review-result'], waitingQuestionIds: [], status: 'RUNNING', startedAt: at(2)}], createdAt: at(2), updatedAt: at(2), telemetry: {inputTokens: null, freshInputTokens: null, cachedInputTokens: null, outputTokens: null, reasoningTokens: null, totalTokens: null, cost: null, currency: null, elapsedMs: 0}, audit: {schema: 'agent-control.work-parcel-audit/v1', recordedAt: at(2), classification: 'repository-review', selectedExecution: 'Work Parcel', planningRationale: 'Registered Job', planner: {kind: 'deterministic', provider: null, model: null}, alternatives: [], timeline, invocations: [], totals: {models: [], invocations: 0, inputTokens: null, freshInputTokens: null, cachedInputTokens: null, outputTokens: null, reasoningTokens: null, totalTokens: null, providerReportedCost: null, calculatedCost: null, cost: null, costBasis: 'unavailable', currency: null, modelExecutionMs: 0, wallClockMs: 0}}, provenance: [{at: at(2), type: 'job-run', detail: run.id}]};
    parcels.add(parcel);
    routing.observe({threadId: 'thread-natural', parcelId: parcel.id, agentId: 'controller', providerId: 'provider-a', modelId: 'model-a', observedAt: at(3), elapsedMs: 0, cumulative: {inputTokens: 0, outputTokens: 0, totalTokens: 0}, context: {tokens: null, limitTokens: null, authority: 'unavailable', source: 'provider_not_yet_reported'}});
    routing.observe({threadId: 'thread-natural', parcelId: parcel.id, agentId: 'controller', providerId: 'provider-a', modelId: 'model-a', observedAt: at(4), elapsedMs: 1000, active: false, cumulative: {inputTokens: 100, freshInputTokens: 75, cachedInputTokens: 25, outputTokens: 20, totalTokens: 120}, context: {tokens: 40, limitTokens: 100, authority: 'authoritative', source: 'provider'}});
    let current = runs.get(run.id)!; current.workParcelIds = [parcel.id]; current.status = 'SUCCEEDED'; current.completedAt = at(5); current.transitions.push({status: 'VALIDATING', at: at(4)}, {status: 'SUCCEEDED', at: at(5), detail: 'PASS'}); current.usage = {inputTokens: 100, freshInputTokens: 75, cachedInputTokens: 25, outputTokens: 20, totalTokens: 120, source: 'provider'}; current.immutable = true; runs.update(current);
    const before = firstRuntime.read(run.id);
    assert.equal(before.terminal, true);
    assert.ok(before.entryCount > 170, String(before.entryCount));
    assert.match(before.content, /Exact governed review instruction/);
    assert.match(before.content, /^# Agent Control Natural Execution Transcript/m);
    assert.match(before.content, /Governed provider route selected/);
    assert.doesNotMatch(before.content, /Initial status: SUCCEEDED/);
    assert.match(before.content, /Current durable status at transcript projection: RUNNING/);
    assert.match(before.content, /Return objective evidence only/);
    assert.match(before.content, /Live telemetry sample 2/);
    assert.match(before.content, /Safe result 169/);
    assert.doesNotMatch(before.content, /nvapi-synthetic-secret-must-redact/);
    assert.match(before.content, /REDACTED/);
    assert.equal(fs.statSync(path.join(transcriptRoot, before.file)).mode & 0o777, 0o600);
    firstRuntime.dispose();

    const restartedRuns = new ParameterizedRunStore(path.join(root, 'runs.json')), restartedParcels = new WorkParcelStore(path.join(root, 'parcels.json')), restartedRouting = new TokenAwareBatonRuntime(path.join(root, 'routing.json'));
    const restarted = new ExecutionTranscriptRuntime(transcriptRoot, restartedRuns, saved, restartedParcels, restartedRouting), after = restarted.read(run.id);
    assert.equal(after.sha256, before.sha256);
    assert.equal(after.sourceSha256, before.sourceSha256);
    assert.equal(after.content, before.content);
    restarted.dispose();
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('transcript title identifies controlled fault injection without calling it natural', () => {
  const projection = {schema: 'agent-control.execution-history/v1' as const, jobRunId: 'run-controlled', savedJobId: null, jobName: 'Controlled resilience qualification', retention: {mode: 'complete-durable' as const, maximumEntries: null, source: 'authoritative durable records'}, workParcelIds: [], entries: []};
  const run = {id: 'run-controlled', savedJobId: undefined, status: 'RUNNING', executionMode: 'CONTROLLED_FAULT_INJECTION', requestedAt: '2026-09-07T10:00:00.000Z'} as ParameterizedJobRun;
  const content = renderExecutionTranscript(projection, run);
  assert.match(content, /^# Agent Control Controlled Fault-Injection Execution Transcript/m);
  assert.doesNotMatch(content, /^# Agent Control Natural Execution Transcript/m);
  assert.match(content, /not a naturally occurring provider failure/);
});

test('qualification-purpose route is not described as production-qualified or admitted', () => {
  const projection = {schema: 'agent-control.execution-history/v1' as const, jobRunId: 'run-qualification', savedJobId: null, jobName: 'Route qualification', retention: {mode: 'complete-durable' as const, maximumEntries: null, source: 'authoritative durable records'}, workParcelIds: [], entries: [{id: 'route', at: '2026-09-07T10:00:00.000Z', actor: 'SYSTEM EVENT' as const, type: 'ROUTE_SELECTED', title: 'Governed qualification route selected', content: 'Route purpose QUALIFICATION. A qualification-purpose selection does not grant production routing admission.', outcome: 'SUCCEEDED' as const}]};
  const run = {id: 'run-qualification', savedJobId: undefined, status: 'RUNNING', executionMode: 'LIVE', requestedAt: '2026-09-07T10:00:00.000Z'} as ParameterizedJobRun;
  const content = renderExecutionTranscript(projection, run);
  assert.match(content, /Governed qualification route selected/);
  assert.match(content, /does not grant production routing admission/);
  assert.doesNotMatch(content, /Qualified provider route selected/);
});

test('transcript begins with exact channel request and safe authentication provenance', () => {
  const origin=governedRequestOrigin({channel:'openwa',modality:'voice-confirmed-by-text',receivedAt:'2026-09-07T10:00:00.000Z',authentication:'enrolled-direct-sender',actorId:'messaging:operator-safe',authority:['template:release-review'],messageReference:'a'.repeat(64),identityReference:'b'.repeat(64),confirmationReference:'c'.repeat(64),request:'Run the complete release review against the immutable repository bundle.',transcriptionAuthority:'untrusted-confirmed-by-text'});
  const projection={schema:'agent-control.execution-history/v1' as const,jobRunId:'run-origin',savedJobId:'review',jobName:'Release review',workParcelIds:['parcel-origin'],origin,retention:{mode:'complete-durable' as const,maximumEntries:null,source:'authoritative durable records'},entries:[]};
  const run={id:'run-origin',savedJobId:'review',status:'RUNNING',executionMode:'LIVE',requestedAt:origin.receivedAt} as ParameterizedJobRun,content=renderExecutionTranscript(projection,run);
  assert.ok(content.indexOf('## Origin')<content.indexOf('- Schema:'));
  assert.ok(content.indexOf('## Authoritative retained transcription')<content.indexOf('## Chronological execution record'));
  assert.match(content,/Run the complete release review against the immutable repository bundle\./);
  assert.match(content,/untrusted speech recognition output; execution was authorized only by a separate authenticated text confirmation/);
  assert.doesNotMatch(content,/phone|@c\.us|oauth|cookie/i);
});
