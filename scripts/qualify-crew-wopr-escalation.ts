import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs';
import type {AddressInfo} from 'node:net';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {AgentControlService} from '../src/control/application-service.js';
import {AdaptiveOrchestrationRuntime, FileAdaptiveOrchestrationStore} from '../src/control/adaptive-orchestration.js';
import type {AgentControlConfig, ModelConfig, ProviderAccountProfileConfig, ProviderConfig} from '../src/control/config.js';
import {ContractExecutionRuntime} from '../src/control/contract-runtime.js';
import {LocalCodexNodeExecutionPort} from '../src/control/codex-node-execution.js';
import type {RepositoryReviewQualityGate, RepositoryReviewQualityGateResult} from '../src/control/direct-repository-review-executor.js';
import {ExecutionSessionRuntime} from '../src/control/execution-session.js';
import {GovernedHandoffRuntime} from '../src/control/handoff-runtime.js';
import {buildParameterizedJobRuntime} from '../src/control/job-bootstrap.js';
import {JobCatalog} from '../src/control/job-catalog.js';
import {ActionFailure, ActionRegistry, ArtifactStore, JobRuntime, ResourceLockManager, RunLedger, WorkerRegistry} from '../src/control/job-runtime.js';
import type {JobDefinition} from '../src/control/job-types.js';
import {ModelRegistry} from '../src/control/model-registry.js';
import {OpenWAAdapter, openwaConfigSchema, type OpenWAConfig} from '../src/control/openwa.js';
import {openwaExecutionPort, OpenWASocialProvider} from '../src/control/openwa-social-provider.js';
import {PoeRuntime} from '../src/control/poe.js';
import {PtyRegistry} from '../src/control/pty.js';
import {SocialVoiceCoordinator} from '../src/control/social-voice.js';
import {PrivateSpeechProvider} from '../src/control/speech-http-provider.js';
import {TokenAwareBatonRuntime} from '../src/control/token-aware-baton-routing.js';
import {WorkParcelCoordinator, WorkParcelStore, type WorkParcelPlan, type WorkParcelPlanner} from '../src/control/work-parcels.js';
import {startWebDashboard} from '../src/control/web-server.js';
import type {WorkspaceState} from '../src/state.js';

export const QUALIFICATION_PROMPT = 'Complete the read-only review of the frozen reservation-service fixture on the authorised qualification branch. Explain whether concurrent callers can both acquire the same resource and whether expired cache entries can be accepted as fresh. Preserve evidence, use the configured quality gate, and escalate only if the first route misses either root cause. origin/main must remain completely unchanged. Do not deploy production. Verify the result.';
export const QUALIFICATION_SOCIAL_COMMAND = 'start governed-adaptive-crew';
const QUALITY_GATE_CODE = 'reservation-cache-root-cause-v1';
const SOURCE_MODEL_ID = 'qwen-local-small-reviewer';
const DESTINATION_MODEL_ID = 'codex-luna-controller-a';
const MODEL_ROLE = 'review.default';

interface Options {
  host: string;
  port: number;
  stateDir: string;
  evidenceFile: string;
  transcriptFile: string;
  holdMs: number;
  operatorToken: string;
  sourceBaseUrl: string;
  sourceProviderModel: string;
  destinationProviderModel: string;
  ingress: 'dashboard' | 'openwa';
  openwaConfigFile?: string;
  openwaEnrolmentFile?: string;
  poeVoiceConfigFile?: string;
  physicalPoe: boolean;
}

interface QualityObservation {
  at: string;
  route: {providerId: string; accountProfileId: string | null; modelId: string; nodeId: string};
  responseHash: string;
  accepted: boolean;
  code: string;
  summary: string;
  unresolvedCriteria: string[];
  executiveSummary: string;
  findings: Array<{id: string; file: string | null; title: string; evidence: string; reasoning: string; confidence: number}>;
}

const delay = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const now = () => new Date().toISOString();
let activeServer: ReturnType<typeof startWebDashboard> | undefined;

function readOptions(): Options {
  const values = new Map<string, string>();
  for (let index = 2; index < process.argv.length; index += 2) {
    const key = process.argv[index], value = process.argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(`qualification_argument_invalid:${key ?? 'missing'}`);
    values.set(key.slice(2), value);
  }
  const operatorToken = process.env.AGENT_CONTROL_QUALIFICATION_OPERATOR_TOKEN;
  if (!operatorToken) throw new Error('qualification_operator_token_required');
  const stateDir = path.resolve(values.get('state-dir') ?? '.agent-control/qualification-crew-wopr-escalation');
  return {
    host: values.get('host') ?? '127.0.0.1',
    port: Number(values.get('port') ?? 0),
    stateDir,
    evidenceFile: path.resolve(values.get('evidence-file') ?? path.join(stateDir, 'crew-wopr-escalation.json')),
    transcriptFile: path.resolve(values.get('transcript-file') ?? path.join(stateDir, 'crew-wopr-escalation-transcript.md')),
    holdMs: Number(values.get('hold-ms') ?? 45_000),
    operatorToken,
    sourceBaseUrl: process.env.AGENT_CONTROL_QUALIFICATION_SOURCE_URL ?? 'http://127.0.0.1:8080',
    sourceProviderModel: process.env.AGENT_CONTROL_QUALIFICATION_SOURCE_MODEL ?? 'qwen2.5-3b-instruct-q4_k_m.gguf',
    destinationProviderModel: process.env.AGENT_CONTROL_QUALIFICATION_DESTINATION_MODEL ?? 'gpt-5.6-luna',
    ingress: process.env.AGENT_CONTROL_QUALIFICATION_INGRESS === 'openwa' ? 'openwa' : 'dashboard',
    ...(process.env.AGENT_CONTROL_QUALIFICATION_OPENWA_CONFIG ? {openwaConfigFile: path.resolve(process.env.AGENT_CONTROL_QUALIFICATION_OPENWA_CONFIG)} : {}),
    ...(process.env.AGENT_CONTROL_QUALIFICATION_OPENWA_ENROLMENT ? {openwaEnrolmentFile: path.resolve(process.env.AGENT_CONTROL_QUALIFICATION_OPENWA_ENROLMENT)} : {}),
    ...(process.env.AGENT_CONTROL_QUALIFICATION_POE_VOICE_CONFIG ? {poeVoiceConfigFile: path.resolve(process.env.AGENT_CONTROL_QUALIFICATION_POE_VOICE_CONFIG)} : {}),
    physicalPoe: process.env.AGENT_CONTROL_QUALIFICATION_PHYSICAL_POE === 'true',
  };
}

function emit(value: unknown) { process.stdout.write(`${JSON.stringify(value)}\n`); }
function command(cwd: string, executable: string, args: string[]) { return execFileSync(executable, args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim(); }

function createFixture(root: string) {
  const repository = path.join(root, 'reservation-service-fixture');
  const remote = path.join(root, 'reservation-service-origin.git');
  fs.mkdirSync(path.join(repository, 'src'), {recursive: true, mode: 0o700});
  fs.mkdirSync(path.join(repository, 'test'), {recursive: true, mode: 0o700});
  fs.writeFileSync(path.join(repository, 'package.json'), `${JSON.stringify({name: 'reservation-service-fixture', version: '1.0.0', private: true, type: 'module', scripts: {test: 'node --test'}}, null, 2)}\n`);
  fs.writeFileSync(path.join(repository, 'README.md'), `# Reservation Service Fixture

Acceptance invariants:

1. At most one concurrent caller may acquire an unowned resource.
2. A cache entry is fresh only when its age, current time minus creation time, is below the TTL.

The qualification is read-only. A reviewer must explain the root cause of both failing acceptance tests; merely naming concurrency or cache expiry is insufficient.
`);
  fs.writeFileSync(path.join(repository, 'src/reservation-ledger.mjs'), `export class ReservationLedger {
  #owners = new Map();

  async reserve(resourceId, ownerId, audit = async () => {}) {
    if (this.#owners.has(resourceId)) return false;
    await audit({resourceId, ownerId});
    this.#owners.set(resourceId, ownerId);
    return true;
  }

  owner(resourceId) { return this.#owners.get(resourceId) ?? null; }
}
`);
  fs.writeFileSync(path.join(repository, 'src/snapshot-cache.mjs'), `export function isFresh(entry, now, ttlMs) {
  return entry.createdAt - now < ttlMs;
}
`);
  fs.writeFileSync(path.join(repository, 'test/acceptance.test.mjs'), `import assert from 'node:assert/strict';
import test from 'node:test';
import {ReservationLedger} from '../src/reservation-ledger.mjs';
import {isFresh} from '../src/snapshot-cache.mjs';

test('only one concurrent caller acquires an unowned resource', async () => {
  const ledger = new ReservationLedger();
  let entered = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const audit = async () => { entered += 1; if (entered === 2) release(); await gate; };
  const outcomes = await Promise.all([ledger.reserve('camera', 'alpha', audit), ledger.reserve('camera', 'beta', audit)]);
  assert.equal(outcomes.filter(Boolean).length, 1);
});

test('an entry older than its TTL is stale', () => {
  assert.equal(isFresh({createdAt: 1_000}, 10_000, 100), false);
});
`);
  const gitEnvironment = {...process.env, GIT_AUTHOR_NAME: 'Agent Control Qualification', GIT_AUTHOR_EMAIL: 'qualification@invalid.example', GIT_COMMITTER_NAME: 'Agent Control Qualification', GIT_COMMITTER_EMAIL: 'qualification@invalid.example', GIT_AUTHOR_DATE: '2026-09-06T12:00:00Z', GIT_COMMITTER_DATE: '2026-09-06T12:00:00Z'};
  execFileSync('git', ['init', '--bare', '-q', remote], {cwd: root, env: gitEnvironment});
  execFileSync('git', ['init', '-q', '-b', 'main'], {cwd: repository, env: gitEnvironment});
  execFileSync('git', ['add', '.'], {cwd: repository, env: gitEnvironment});
  execFileSync('git', ['commit', '-qm', 'qualification fixture'], {cwd: repository, env: gitEnvironment});
  execFileSync('git', ['remote', 'add', 'origin', remote], {cwd: repository, env: gitEnvironment});
  execFileSync('git', ['push', '-q', '-u', 'origin', 'main'], {cwd: repository, env: gitEnvironment});
  execFileSync('git', ['switch', '-q', '-c', 'qualification/4.0-governed-adaptive-crew'], {cwd: repository, env: gitEnvironment});
  const protectedRef = command(repository, 'git', ['ls-remote', '--refs', 'origin', 'refs/heads/main']).split(/\s+/)[0]!;
  return {
    repository, remote, protectedRef,
    commit: command(repository, 'git', ['rev-parse', 'HEAD']),
    files: ['README.md', 'src/reservation-ledger.mjs', 'src/snapshot-cache.mjs', 'test/acceptance.test.mjs'].map(file => ({file, sha256: sha256(fs.readFileSync(path.join(repository, file)))})),
  };
}

function runAcceptance(repository: string) {
  // Pin TAP so the failure-count evidence is stable across Node's terminal and
  // non-terminal reporters (Node 24 uses the spec reporter for a PTY).
  const execution = spawnSync(process.execPath, ['--test', '--test-reporter=tap'], {cwd: repository, encoding: 'utf8', timeout: 20_000, maxBuffer: 2 * 1024 * 1024});
  const output = `${execution.stdout ?? ''}\n${execution.stderr ?? ''}`;
  const failed = Number(output.match(/# fail (\d+)/)?.[1] ?? -1);
  if (execution.status === 0 || failed !== 2) throw new Error(`qualification_fixture_expected_two_failures:status=${execution.status}:failed=${failed}`);
  return {status: execution.status, failed, outputSha256: sha256(output), bytes: Buffer.byteLength(output)};
}

async function sourceInventory(baseUrl: string, expected: string) {
  const health = await fetch(new URL('/health', baseUrl), {signal: AbortSignal.timeout(5_000)});
  if (!health.ok) throw new Error(`qualification_source_health_failed:${health.status}`);
  const models = await fetch(new URL('/v1/models', baseUrl), {signal: AbortSignal.timeout(5_000)});
  if (!models.ok) throw new Error(`qualification_source_inventory_failed:${models.status}`);
  const payload = await models.json() as {data?: Array<{id?: string}>; models?: Array<{model?: string; name?: string}>};
  const identities = [...(payload.data ?? []).map(item => item.id), ...(payload.models ?? []).flatMap(item => [item.model, item.name])].filter((item): item is string => Boolean(item));
  if (!identities.includes(expected)) throw new Error('qualification_source_model_identity_missing');
  return {state: 'AVAILABLE', providerModel: expected, observedAt: now()};
}

function reviewText(observation: QualityObservation['findings'][number]) { return [observation.title, observation.evidence, observation.reasoning].join(' '); }

function acceptanceQualityGate(observations: QualityObservation[]): RepositoryReviewQualityGate {
  return {evaluate(input) {
    const findings = input.result.findings.map(finding => ({id: finding.id, file: finding.file ?? null, title: finding.title, evidence: finding.evidence, reasoning: finding.reasoning, confidence: finding.confidence}));
    const reservation = findings.filter(finding => finding.file === 'src/reservation-ledger.mjs').map(reviewText).join(' ');
    const cache = findings.filter(finding => finding.file === 'src/snapshot-cache.mjs').map(reviewText).join(' ');
    const reservationInterleaving = /both|two|concurrent/i.test(reservation) && /before (?:either|the first|one).*(?:set|write|update)|between (?:the )?check.*(?:set|write|update)|await.*(?:interleav|race)/i.test(reservation);
    const reservationCheckThenUpdate = /non[- ]?atomic|check[- ]then[- ](?:set|write|update)|time[- ]of[- ]check/i.test(reservation) || reservationInterleaving;
    const reversedAge = /createdAt\s*-\s*now|reverse(?:d)? (?:the )?(?:age|subtraction)|wrong[- ]sign|negative age/i.test(cache);
    const correctedAge = /now\s*-\s*(?:entry\.)?createdAt|current time minus (?:the )?creation time/i.test(cache);
    const unsupportedCompletionClaim = /(?:has been|was|is now) fixed|(?:all )?tests (?:now )?pass/i.test(input.result.executiveSummary);
    const unresolvedCriteria = [
      ...(!reservationCheckThenUpdate ? ['Identify the reservation operation as a non-atomic check-then-update sequence, explicitly or by proving both callers check before either updates ownership.'] : []),
      ...(!reservationInterleaving ? ['Explain that both callers can observe the resource as unowned before either caller updates ownership.'] : []),
      ...(!reversedAge ? ['Identify that createdAt - now reverses the cache-age subtraction and yields a negative age for stale entries.'] : []),
      ...(!correctedAge ? ['State that cache age must be calculated as now - entry.createdAt.'] : []),
      ...(unsupportedCompletionClaim ? ['Do not claim this read-only review fixed code or made the acceptance tests pass.'] : []),
    ];
    const accepted = unresolvedCriteria.length === 0;
    const result: RepositoryReviewQualityGateResult = {
      accepted,
      code: QUALITY_GATE_CODE,
      summary: accepted ? 'The review proves both acceptance-test root causes: the non-atomic reservation interleaving and the reversed cache-age subtraction.' : `Schema-valid review did not satisfy ${unresolvedCriteria.length} acceptance-level root-cause ${unresolvedCriteria.length === 1 ? 'criterion' : 'criteria'}.`,
      evidence: ['fixture:test/acceptance.test.mjs', 'fixture:README.md', `provider-response:${input.responseHash}`],
      unresolvedCriteria,
      nextAction: 'Using the same frozen repository and original objective, explain both failing acceptance-test root causes precisely and return a schema-valid read-only repository review.',
    };
    observations.push({at: now(), route: {providerId: input.route.providerId, accountProfileId: input.route.accountProfileId, modelId: input.route.modelId, nodeId: input.route.nodeId}, responseHash: input.responseHash, accepted, code: result.code, summary: result.summary, unresolvedCriteria, executiveSummary: input.result.executiveSummary, findings});
    return result;
  }};
}

function job(id: string, name: string, action: string, capability: string, verification: string, output: {name: string; type: string; schema: string}, timeoutSeconds = 60, approval?: string): JobDefinition {
  return {apiVersion: 'agent-control/v1', kind: 'Job', metadata: {id, name, version: '1.0.0', description: `Bounded physical ${name.toLowerCase()} for Crew/WOPR escalation qualification`}, spec: {priority: 'normal', concurrency: 'allow', steps: [{id: 'work', action, requires: [capability], timeoutSeconds, ...(approval ? {approval} : {}), outputs: [{...output, version: '1'}], verification: [verification]}]}};
}

function safeCrew(control: AgentControlService) {
  return control.snapshot().characterCrew.members.map(member => ({id: member.id, name: member.name, state: member.state, operationalState: member.operationalState, activity: member.activity, animationCue: member.animationCue, summary: member.summary, transitionKey: member.transitionKey}));
}

function eventName(type: 'telemetry' | 'governor.transition' | 'context.lifecycle' | 'baton.created' | 'handoff.result') {
  return type === 'telemetry' ? 'token.telemetry' : type === 'governor.transition' ? 'token.governor_transition' : type === 'context.lifecycle' ? 'token.context_lifecycle' : type === 'baton.created' ? 'token.baton_created' : 'token.handoff_result';
}

function transcript(input: {
  startedAt: string;
  completedAt: string;
  repositoryCommit: string;
  parentParcelId: string;
  parentRunIds: string[];
  parentRuns: Array<{jobId: string; startedAt?: string; endedAt?: string; steps: Array<{action: string; status: string; startedAt?: string; endedAt?: string}>}>;
  parameterizedRunId: string;
  nestedParcelId: string;
  source: QualityObservation;
  destination: QualityObservation;
  baton: ReturnType<TokenAwareBatonRuntime['baton']>;
  routing: ReturnType<TokenAwareBatonRuntime['projection']>;
  routingEvidence: ReturnType<TokenAwareBatonRuntime['evidence']>;
  verification: Record<string, unknown>;
}) {
  const sourceThread = input.routing.threads.find(thread => thread.providerId === input.source.route.providerId && thread.modelId === input.source.route.modelId)!;
  const destinationThread = input.routing.threads.find(thread => thread.providerId === input.destination.route.providerId && thread.modelId === input.destination.route.modelId)!;
  const totals = input.routing.parcels.find(parcel => parcel.parcelId === input.nestedParcelId)!;
  const formatCost = (amount: number | null, currency: string | null) => amount === null ? 'Unavailable' : `${amount}${currency ? ` ${currency}` : ''}`;
  const rows = totals.byModel.map(item => `| ${item.providerId} | ${item.accountLabel ?? item.accountProfileId ?? 'default'} | ${item.modelId} | ${item.inputTokens ?? 'Unavailable'} | ${item.outputTokens ?? 'Unavailable'} | ${item.totalTokens ?? 'Unavailable'} | ${formatCost(item.cost, item.currency)} |`).join('\n');
  const sourceRoute = `${input.source.route.providerId}/default/${input.source.route.modelId}@${input.source.route.nodeId}`;
  const destinationLabel = destinationThread.accountLabel ?? input.destination.route.accountProfileId ?? 'default';
  const destinationRoute = `${input.destination.route.providerId}/${destinationLabel} (${input.destination.route.accountProfileId ?? 'default'})/${input.destination.route.modelId}@${input.destination.route.nodeId}`;
  const handoffDecision = input.routingEvidence.decisions.find(item => item.action === 'BATON_AND_HANDOFF' && item.trigger?.kind === 'QUALITY_GATE' && item.target);
  const toolTimeline = input.parentRuns.flatMap(run => run.steps.map(step => ({at: step.startedAt ?? run.startedAt, completedAt: step.endedAt ?? run.endedAt, action: step.action, status: step.status}))).filter((item): item is {at: string; completedAt: string | undefined; action: string; status: string} => Boolean(item.at)).sort((left, right) => left.at.localeCompare(right.at));
  return `# Agent Control 3.9 Crew/WOPR escalation qualification transcript

This is a human-readable projection of immutable Agent Control records. It contains no private model reasoning or credentials.

## Request

- Received: ${input.startedAt}
- Exact dashboard prompt: ${QUALIFICATION_PROMPT}
- Frozen fixture commit: \`${input.repositoryCommit}\`
- Parent Work Parcel: \`${input.parentParcelId}\`
- Parent Runs: ${input.parentRunIds.map(id => `\`${id}\``).join(', ')}
- Parameterized review Run: \`${input.parameterizedRunId}\`
- Provider-owned review Work Parcel: \`${input.nestedParcelId}\`

## Model change — explicit human-readable record

- **From:** \`${sourceRoute}\`
- **To:** \`${destinationRoute}\`
- **Changed at:** ${handoffDecision?.at ?? input.baton.createdAt}
- **Why:** the first model returned valid structured output, but independent gate \`${input.source.code}\` found that it missed ${input.source.unresolvedCriteria.length} required root-cause criteria.
- **Governor decision:** \`BATON_AND_HANDOFF\` with trigger \`QUALITY_GATE\` and reason \`${handoffDecision?.reason ?? `quality_gate_failed:${input.source.code}`}\`.
- **Not a context-pressure substitution:** source context was ${sourceThread.latest.contextPercent === null ? 'Unavailable' : `${sourceThread.latest.contextPercent.toFixed(1)}%`} (${sourceThread.latest.context.authority}); the route change was quality-driven and explicitly recorded.
- **Continuity:** sealed baton \`${input.baton.id}\` (SHA-256 \`${input.baton.sha256}\`) carried the unfinished criteria and exact next action to the destination.
- **Outcome:** the destination continued the same frozen review, satisfied the gate, and the independent verifier passed the combined outcome. The source thread remained recoverable.

## Timestamped operational timeline

- ${input.startedAt} — authenticated dashboard accepted the exact prompt and created the governed parent Work Parcel.
${toolTimeline.map(item => `- ${item.at} — tool/job action \`${item.action}\` entered execution${item.completedAt ? `; completed ${item.completedAt}` : ''} with terminal state \`${item.status}\`.`).join('\n')}
- ${sourceThread.startedAt} — selected source model \`${sourceRoute}\`; provider execution began.
- ${input.source.at} — source response completed and independent quality gate rejected it; structured transport/schema validation had succeeded.
- ${input.baton.createdAt} — Agent Control created and sealed the durable baton.
- ${destinationThread.startedAt} — selected destination model \`${destinationRoute}\`; destination continuation began from the baton.
- ${input.destination.at} — destination response completed and passed the same independent quality gate.
- ${String(input.verification.checkedAt ?? input.completedAt)} — independent outcome verification passed and reconciled the two model legs.

## Governed execution

1. Two control lanes ran concurrently: the acceptance-test baseline and frozen source inventory.
2. ${input.source.route.providerId}/${input.source.route.modelId} returned a complete, schema-valid review. It used ${sourceThread.latest.cumulative.totalTokens ?? 'Unavailable'} tokens; current context was ${sourceThread.latest.context.authority} (${sourceThread.latest.context.source}).
3. Independent gate \`${input.source.code}\` rejected it: ${input.source.summary}
4. Missing criteria: ${input.source.unresolvedCriteria.join(' ')}
5. Agent Control sealed baton \`${input.baton.id}\` with SHA-256 \`${input.baton.sha256}\`.
6. Governed route selection transferred the unfinished review to ${input.destination.route.providerId}/${input.destination.route.accountProfileId ?? 'default'}/${input.destination.route.modelId}.
7. The destination continued from the sealed baton and passed the same gate: ${input.destination.summary}
8. Independent final verification accepted the resulting repository review. The original source thread remains recoverable.

## Provider results

### Initial route — rejected by independent quality gate

${input.source.executiveSummary}

${input.source.findings.map(finding => `- ${finding.file ?? 'repository'} — ${finding.title}: ${finding.reasoning}`).join('\n')}

### Destination route — accepted

${input.destination.executiveSummary}

${input.destination.findings.map(finding => `- ${finding.file ?? 'repository'} — ${finding.title}: ${finding.reasoning}`).join('\n')}

## Reconciled usage

| Provider | Account | Model | Input | Output | Total | Cost |
| --- | --- | --- | ---: | ---: | ---: | ---: |
${rows}
| **Work Parcel total** |  |  | **${totals.inputTokens ?? 'Unavailable'}** | **${totals.outputTokens ?? 'Unavailable'}** | **${totals.totalTokens ?? 'Unavailable'}** | **${formatCost(totals.cost, totals.currency)}** |

Current context occupancy remains separate from lifetime usage. Qwen's single-turn occupancy is ${sourceThread.latest.context.authority}; Codex reports it as ${destinationThread.latest.context.authority}. Missing cost or context values are shown as Unavailable, never zero.

## Verification

\`\`\`json
${JSON.stringify(input.verification, null, 2)}
\`\`\`

Completed: ${input.completedAt}
`;
}

async function main() {
  const options = readOptions(), startedAt = now();
  fs.mkdirSync(options.stateDir, {recursive: true, mode: 0o700});
  fs.mkdirSync(path.dirname(options.evidenceFile), {recursive: true});
  fs.mkdirSync(path.dirname(options.transcriptFile), {recursive: true});
  const fixture = createFixture(options.stateDir);
  const initialAcceptance = runAcceptance(fixture.repository);
  const sourcePreflight = await sourceInventory(options.sourceBaseUrl, options.sourceProviderModel);

  const account: ProviderAccountProfileConfig = {id: 'cottage-plus', label: 'Controller Account A', providerExecutionNodeId: 'controller', credentialResidency: {nodeId: 'controller', store: {type: 'codex-home-env', env: 'CODEX_HOME_COTTAGE_PLUS'}}, enabled: true, plan: 'ChatGPT Plus', planAuthority: 'operator-configured', capabilities: ['repository-review'], qualification: {state: 'QUALIFIED', version: 'controller-account-a-physical-v1', checkedAt: startedAt, qualifiedAt: startedAt, capabilities: ['repository-review'], evidence: ['production LocalCodexNodeExecutionPort preflight']}};
  const sourceProvider: ProviderConfig = {id: 'local-llama', name: 'Local llama.cpp', kind: 'openai-compatible', enabled: true, baseUrl: options.sourceBaseUrl, wireApi: 'chat-completions', auth: {type: 'none'}, requiresAuth: false, parallelism: 1, costClass: 'free', capabilities: ['repository-review'], qualification: {status: 'qualified', advertisedContextLimitTokens: 32_768, lastSuccessfulAt: sourcePreflight.observedAt, evidence: ['live /health and /v1/models preflight']}};
  const destinationProvider: ProviderConfig = {id: 'codex-chatgpt', name: 'OpenAI Codex', kind: 'cli', enabled: true, parallelism: 1, costClass: 'included', capabilities: ['repository-review'], accountProfiles: [account]};
  const sourceModel: ModelConfig = {id: SOURCE_MODEL_ID, provider: sourceProvider.id, providerModel: options.sourceProviderModel, displayName: 'Qwen 2.5 3B local reviewer', enabled: true, capabilities: ['repository-review'], roles: [MODEL_ROLE], nodes: ['controller'], limits: {contextTokens: 32_768, outputTokens: 1_800}, qualification: {state: 'QUALIFIED', version: 'live-llama-cpp-preflight-v1', qualifiedAt: sourcePreflight.observedAt, capabilities: ['repository-review'], nodes: ['controller'], evidence: ['live /health and model identity']}};
  const destinationModel: ModelConfig = {id: DESTINATION_MODEL_ID, provider: destinationProvider.id, providerModel: options.destinationProviderModel, accountProfile: account.id, displayName: 'Codex Luna · Controller Account A', enabled: true, capabilities: ['repository-review'], roles: [MODEL_ROLE], nodes: ['controller'], limits: {contextTokens: 272_000, outputTokens: 2_000}, qualification: {state: 'QUALIFIED', version: 'controller-account-a-codex-v1', qualifiedAt: startedAt, capabilities: ['repository-review'], nodes: ['controller'], evidence: ['bounded account and model qualification']}};
  const config: AgentControlConfig = {schemaVersion: 1, resources: [{id: 'controller', name: 'Qualification controller', platform: 'linux', transport: {type: 'local'}, capabilities: ['qualification.baseline', 'qualification.inventory', 'qualification.review', 'qualification.verify', 'repository-review'], controller: true, metadata: {capacity: 4}}], providers: [sourceProvider, destinationProvider], models: [sourceModel, destinationModel], modelRouting: {defaultRole: MODEL_ROLE, roles: {[MODEL_ROLE]: {primary: SOURCE_MODEL_ID, fallback: [DESTINATION_MODEL_ID], requires: ['repository-review']}}}, services: [], lanes: [], tokenBatonRouting: {continuePercent: 60, prepareBatonPercent: 75, compactPercent: 85, handoffPercent: 90, sampleRetention: 240}, adaptiveOrchestration: {enabled: true, minimumSamplesForPreference: 3, minimumQualityScore: .7, maxEvidenceAgeDays: 90, policyQualityFloor: .6, maxRouteCost: null, maxRouteLatencyMs: null, qualityWeight: .5, reliabilityWeight: .2, costWeight: .15, latencyWeight: .1, confidenceWeight: .05, explorationRate: 0}, retrieval: {enabled: false}, jobs: {repositoryRoots: [options.stateDir]}};
  const executionSessions = new ExecutionSessionRuntime(path.join(options.stateDir, 'execution-sessions'));
  const nodeExecution = new LocalCodexNodeExecutionPort(process.env, process.env.CODEX_COMMAND ?? 'codex', executionSessions);
  const accountStatus = await nodeExecution.accountStatus({provider: destinationProvider, account, nodeId: 'controller', providerExecutionNodeId: 'controller', credentialNodeId: 'controller', timeoutMs: 20_000});
  const registry = new ModelRegistry(config.providers, config.models, config.modelRouting, undefined, undefined, process.env);
  const qualityObservations: QualityObservation[] = [], qualityGate = acceptanceQualityGate(qualityObservations);
  const tokenRouting = new TokenAwareBatonRuntime(path.join(options.stateDir, 'token-routing.json'), config.tokenBatonRouting);
  const contracts = new ContractExecutionRuntime(path.join(options.stateDir, 'contracts.json'));
  const handoffs = new GovernedHandoffRuntime(contracts, path.join(options.stateDir, 'handoffs.json'));
  const adaptiveOrchestration = new AdaptiveOrchestrationRuntime(new FileAdaptiveOrchestrationStore(path.join(options.stateDir, 'adaptive-orchestration', 'state.json')), config.adaptiveOrchestration);
  let parameterizedJobs!: ReturnType<typeof buildParameterizedJobRuntime>;
  let parameterizedRunId = '';

  const actions = new ActionRegistry();
  actions.register('qualification.acceptance-baseline@1.0.0', async context => {
    const attached = await context.ownedExecution.runProcess({
      command: process.execPath,
      args: ['-e', "process.stdout.write('AGENT_CONTROL_LIVE_SHELL_READY\\n'); process.stdin.setEncoding('utf8'); let value=''; process.stdin.on('data',chunk=>{value+=chunk;if(value.includes('continue')){process.stdout.write('AGENT_CONTROL_LIVE_SHELL_INTERVENTION_ACCEPTED\\n');process.exit(0)}}); setTimeout(()=>process.exit(42),45000)"],
      maxOutputBytes: 64 * 1024,
      session: {terminal: 'pty', interactiveInput: true, allowSignals: true, adapterId: 'qualification-linux-pty', commandLabel: 'Harmless acceptance-baseline operator checkpoint'},
    }, context.signal);
    if (attached.exitCode !== 0 || !attached.stdout.includes('AGENT_CONTROL_LIVE_SHELL_INTERVENTION_ACCEPTED')) throw new ActionFailure('live_shell_harmless_intervention_missing', 'verification');
    const result = runAcceptance(fixture.repository), deadline = Date.now() + 6_000;
    while (Date.now() < deadline) { sha256(fs.readFileSync(path.join(fixture.repository, 'test/acceptance.test.mjs'))); await delay(120); }
    return {artifacts: [{name: 'acceptance-baseline', value: result, type: 'qualification-acceptance-baseline', schema: 'agent-control.qualification-acceptance/v1', version: '1'}], verification: ['two-known-failures-confirmed'], evidence: [`acceptance-output-sha256:${result.outputSha256}`], detail: 'Two deterministic acceptance failures confirmed without modifying the fixture'};
  });
  actions.register('qualification.frozen-inventory@1.0.0', async () => {
    const deadline = Date.now() + 6_000; let digest = '';
    do { digest = sha256(fixture.files.map(item => `${item.file}:${item.sha256}`).join('\n')); await delay(120); } while (Date.now() < deadline);
    return {artifacts: [{name: 'frozen-inventory', value: {commit: fixture.commit, files: fixture.files, aggregateSha256: digest}, type: 'qualification-frozen-inventory', schema: 'agent-control.qualification-inventory/v1', version: '1'}], verification: ['frozen-sha-and-files-confirmed'], evidence: [`fixture-commit:${fixture.commit}`, `fixture-inventory-sha256:${digest}`], detail: 'Frozen fixture revision and source inventory independently hashed'};
  });
  actions.register('qualification.repository-review@1.0.0', async context => {
    const artifacts = context.run.trigger.parcelContext?.baton?.artifactIds ?? [];
    assert.equal(artifacts.length, 2);
    const sourceParcelId = context.run.trigger.parcelContext?.parcelId, sourceParcel = sourceParcelId ? parcels.get(sourceParcelId) : undefined;
    const run = parameterizedJobs.runNow('crew-wopr-quality-review', `work-parcel:${sourceParcelId ?? 'unknown'}`, undefined, sourceParcel?.origin);
    parameterizedRunId = run.id;
    const completed = await parameterizedJobs.execute(run.id);
    if (!['SUCCEEDED', 'SUCCEEDED_WITH_FINDINGS'].includes(completed.status) || !completed.result) throw new ActionFailure(`parameterized_review_failed:${completed.errors.at(-1) ?? completed.status}`, 'verification');
    return {artifacts: [{name: 'repository-review-result', value: {runId: completed.id, status: completed.status, reviewedSha: completed.repository?.reviewedSha, result: completed.result, workParcelIds: completed.workParcelIds, providerResponseIds: completed.providerResponseIds, usage: completed.usage}, type: 'qualification-repository-review', schema: 'agent-control.qualification-repository-review/v1', version: '1'}], verification: ['quality-escalation-and-review-verified'], evidence: [...completed.evidence, ...completed.workParcelIds.map(id => `work-parcel:${id}`)], detail: 'Schema-valid repository review completed through the production quality-gate handoff lifecycle'};
  });
  actions.register('qualification.outcome-verify@1.0.0', async context => {
    const artifactIds = context.run.trigger.parcelContext?.baton?.artifactIds ?? [], reviewArtifact = artifactIds.map(id => context.readArtifact(id)).find(value => Boolean(value && typeof value === 'object' && (value as {result?: unknown}).result)) as {runId: string; result: {findings: Array<{file?: string; reasoning: string; evidence: string}>}; workParcelIds: string[]} | undefined;
    if (!reviewArtifact) throw new ActionFailure('review_artifact_missing', 'verification');
    const routing = tokenRouting.projection(), evidence = tokenRouting.evidence(), nestedParcelId = reviewArtifact.workParcelIds[0], totals = routing.parcels.find(item => item.parcelId === nestedParcelId), failedSource = qualityObservations.find(item => !item.accepted), acceptedDestination = qualityObservations.find(item => item.accepted), baton = evidence.batons[0], successfulHandoff = evidence.decisions.find(item => item.outcome === 'SUCCEEDED' && item.action === 'BATON_AND_HANDOFF');
    assert.ok(failedSource && acceptedDestination && baton && successfulHandoff && totals);
    assert.equal(evidence.threads.find(thread => thread.id === baton.threadId)?.recoverable, true);
    assert.equal(totals.byModel.length, 2);
    assert.equal(totals.totalTokens, totals.byModel.reduce((sum, item) => sum + (item.totalTokens ?? 0), 0));
    assert.ok(reviewArtifact.result.findings.some(finding => finding.file === 'src/reservation-ledger.mjs'));
    assert.ok(reviewArtifact.result.findings.some(finding => finding.file === 'src/snapshot-cache.mjs'));
    const stillFailing = runAcceptance(fixture.repository);
    const verification = {schema: 'agent-control.qualification-verified-outcome/v1', passed: true, checkedAt: now(), readOnlyFixtureStillHasTwoKnownFailures: stillFailing.failed === 2, sourceGateRejected: true, destinationGateAccepted: true, batonSha256: baton.sha256, handoffOutcome: successfulHandoff.outcome, sourceRecoverable: true, modelLegs: totals.byModel.length, aggregateTokens: totals.totalTokens};
    return {artifacts: [{name: 'verified-outcome', value: verification, type: 'qualification-verified-outcome', schema: verification.schema, version: '1'}], verification: ['independent-outcome-verification-passed'], evidence: [`token-baton-sha256:${baton.sha256}`, `acceptance-output-sha256:${stillFailing.outputSha256}`], detail: 'Independent verifier reconciled gate outcomes, baton, source recovery and two-leg token totals'};
  });

  const jobDefinitions = [
    job('crew-wopr-baseline', 'Acceptance baseline', 'qualification.acceptance-baseline@1.0.0', 'qualification.baseline', 'two-known-failures-confirmed', {name: 'acceptance-baseline', type: 'qualification-acceptance-baseline', schema: 'agent-control.qualification-acceptance/v1'}),
    job('crew-wopr-inventory', 'Frozen source inventory', 'qualification.frozen-inventory@1.0.0', 'qualification.inventory', 'frozen-sha-and-files-confirmed', {name: 'frozen-inventory', type: 'qualification-frozen-inventory', schema: 'agent-control.qualification-inventory/v1'}),
    job('crew-wopr-review', 'Token-aware repository review', 'qualification.repository-review@1.0.0', 'qualification.review', 'quality-escalation-and-review-verified', {name: 'repository-review-result', type: 'qualification-repository-review', schema: 'agent-control.qualification-repository-review/v1'}, 300, options.physicalPoe ? 'poe-physical-review' : undefined),
    job('crew-wopr-verify', 'Independent outcome verification', 'qualification.outcome-verify@1.0.0', 'qualification.verify', 'independent-outcome-verification-passed', {name: 'verified-outcome', type: 'qualification-verified-outcome', schema: 'agent-control.qualification-verified-outcome/v1'}, 60),
  ];
  const catalog = new JobCatalog(actions.ids()); for (const definition of jobDefinitions) catalog.addJob(definition);
  const workers = new WorkerRegistry()
    .register({id: 'baseline-worker', capabilities: ['qualification.baseline'], health: 'healthy', capacity: 1, active: 0, observedAt: startedAt})
    .register({id: 'inventory-worker', capabilities: ['qualification.inventory'], health: 'healthy', capacity: 1, active: 0, observedAt: startedAt})
    .register({id: 'review-worker', capabilities: ['qualification.review'], health: 'healthy', capacity: 1, active: 0, observedAt: startedAt})
    .register({id: 'verification-worker', capabilities: ['qualification.verify'], health: 'healthy', capacity: 1, active: 0, observedAt: startedAt});
  const runtime = new JobRuntime(catalog, actions, workers, new RunLedger(path.join(options.stateDir, 'runs.json')), new ArtifactStore(path.join(options.stateDir, 'artifacts')), new ResourceLockManager(path.join(options.stateDir, 'locks.json')), {executionSessions});
  const plan: WorkParcelPlan = {objective: QUALIFICATION_PROMPT, constraints: ['Read-only immutable fixture on qualification/4.0-governed-adaptive-crew', 'origin/main must remain completely unchanged', 'No deployment or production mutation', 'Do not manufacture context pressure', 'Only the independent gate may trigger escalation'], planner: {kind: 'deterministic', reason: 'Explicit physical qualification maps to four registered governed Jobs'}, stages: [
    {id: 'baseline', name: 'Confirm failing acceptance baseline', job: 'crew-wopr-baseline@1.0.0'},
    {id: 'inventory', name: 'Inventory frozen revision', job: 'crew-wopr-inventory@1.0.0'},
    {id: 'review', name: 'Run token-aware repository review', job: 'crew-wopr-review@1.0.0', dependsOn: ['baseline', 'inventory']},
    {id: 'verify', name: 'Independently verify reviewed outcome', job: 'crew-wopr-verify@1.0.0', dependsOn: ['review']},
  ]};
  const planner: WorkParcelPlanner = {plan: async prompt => { assert.equal(prompt, QUALIFICATION_PROMPT); await delay(900); return plan; }};
  const parcels = new WorkParcelCoordinator(runtime, new WorkParcelStore(path.join(options.stateDir, 'work-parcels.json')), planner, undefined, registry, adaptiveOrchestration);
  parameterizedJobs = buildParameterizedJobRuntime(config, registry, parcels, path.join(options.stateDir, 'parameterized'), tokenRouting, contracts, handoffs, nodeExecution, undefined, undefined, qualityGate);
  parameterizedJobs.savedJobs.create({id: 'crew-wopr-quality-review', name: 'Crew/WOPR quality-escalation review', definition: {id: 'repository-code-review', version: 1, follow: 'pinned'}, parameters: {node: 'controller', repository: fixture.repository, ref: fixture.commit, scope: 'full'}, routing: {model: SOURCE_MODEL_ID, allowFallback: false}, contextProfile: 'THIN', budgets: {timeoutMinutes: 4, maximumRetries: 0, maximumInputTokens: 12_000, maximumOutputTokens: 1_800}, concurrency: 'forbid-overlap', enabled: true});

  const state: WorkspaceState = {version: 1, paused: false, lastRestorePoint: null, lanes: []};
  const control = new AgentControlService(state, new PtyRegistry(), undefined, '4.0.0', () => {}).configureProjection({
    jobRuntime: runtime,
    workParcels: parcels,
    modelRegistry: registry,
    parameterizedJobs,
    tokenBatonRouting: tokenRouting,
    adaptiveOrchestration,
    executionSessions,
    resources: workers.list().map(worker => ({id: worker.id, name: worker.id.replaceAll('-', ' '), platform: 'linux', transport: 'local', capabilities: worker.capabilities})),
  });
  let poe: PoeRuntime | undefined;
  if (options.physicalPoe) {
    if (!options.poeVoiceConfigFile) throw new Error('qualification_poe_voice_configuration_required');
    const voiceSettings = JSON.parse(fs.readFileSync(options.poeVoiceConfigFile, 'utf8')) as {speechUrl?: string; tokenEnv?: string; voice?: import('../src/control/social-voice-providers.js').VoiceIdentity};
    const speechToken = voiceSettings.tokenEnv ? process.env[voiceSettings.tokenEnv] : undefined;
    if (!voiceSettings.speechUrl || !voiceSettings.tokenEnv || !speechToken || !voiceSettings.voice) throw new Error('qualification_poe_voice_configuration_invalid');
    const speech = new PrivateSpeechProvider(voiceSettings.voice.provider, voiceSettings.speechUrl, speechToken, voiceSettings.voice);
    poe = new PoeRuntime({file: path.join(options.stateDir, 'poe', 'conversations.json'), evidence: {overview: () => control.poeEvidence(), resolve: reference => control.poeEvidence(reference)}, speech, recognition: speech, voice: voiceSettings.voice, onEvent: event => control.events.emit(event.type === 'conversation.changed' ? 'poe.conversation_changed' : event.type === 'proposal.changed' ? 'poe.proposal_changed' : event.type === 'speech.changed' ? 'poe.speech_changed' : 'poe.interrupted', {conversationId: event.conversationId, proposalId: event.proposalId, state: event.state, detail: event.detail, observedAt: event.at}, undefined, 'poe')});
    control.configureProjection({poe});
  }
  runtime.ledger.subscribe((runId, type, status) => control.events.emit('job.run_changed', {runId, type, status}, undefined, 'qualification-job-runtime'));
  parameterizedJobs.runs.subscribe(run => control.events.emit('job.run_changed', {runId: run.id, status: run.status, kind: 'parameterized'}, undefined, 'qualification-parameterized-runtime'));
  tokenRouting.subscribe(event => control.events.emit(eventName(event.type), {threadId: event.threadId, parcelId: event.parcelId, observedAt: event.at}, undefined, 'qualification-token-runtime'));
  executionSessions.subscribe((event, session) => control.events.emit(event.type === 'output' ? 'execution.session_output' : 'execution.session_changed', {sessionId: session.id, runId: session.scope.runId, stepId: session.scope.stepId, workerId: session.scope.workerId, nodeId: session.scope.nodeId, eventType: event.type, sequence: event.sequence, state: session.state, observedAt: event.at}, undefined, event.actorId));

  const allowedOrigins: string[] = [];
  let openwa: OpenWAAdapter | undefined, social: SocialVoiceCoordinator | undefined, socialIdentity: {channel: 'openwa'; account: string; sender: string; conversation: string} | undefined;
  if (options.ingress === 'openwa') {
    if (!options.openwaConfigFile || !options.openwaEnrolmentFile || options.port < 1) throw new Error('qualification_openwa_configuration_required');
    const existingConfig = openwaConfigSchema.parse(JSON.parse(fs.readFileSync(options.openwaConfigFile, 'utf8')));
    const socialTemplate = {name: 'governed-adaptive-crew', jobId: 'crew-wopr-review', definitionHash: sha256(JSON.stringify(jobDefinitions.find(item => item.metadata.id === 'crew-wopr-review'))), parameters: {}, arguments: {}, maxActive: 1, maxRunsPerHour: 3};
    const openwaConfig: OpenWAConfig = {...existingConfig, dashboardUrl: `http://localhost:${options.port}`, templates: [socialTemplate]};
    openwa = new OpenWAAdapter(control, openwaConfig, path.join(options.stateDir, 'messaging', 'openwa.sqlite'));
    const enrolment = new DatabaseSync(options.openwaEnrolmentFile, {readOnly: true}), operator = enrolment.prepare('SELECT sender FROM operators WHERE active=1 ORDER BY sender LIMIT 1').get() as {sender?: string} | undefined;
    enrolment.close();
    if (!operator?.sender) throw new Error('qualification_openwa_enrolled_operator_missing');
    openwa.db.prepare('INSERT OR REPLACE INTO operators(sender,grants,active,progress) VALUES (?,?,1,1)').run(operator.sender, JSON.stringify([socialTemplate.name]));
    socialIdentity = {channel: 'openwa', account: openwaConfig.sessionId, sender: operator.sender, conversation: operator.sender};
    const standard = openwaExecutionPort(openwa);
    const voiceSettings = options.physicalPoe && options.poeVoiceConfigFile ? JSON.parse(fs.readFileSync(options.poeVoiceConfigFile, 'utf8')) as {speechUrl: string; tokenEnv: string; voice: import('../src/control/social-voice-providers.js').VoiceIdentity} : undefined;
    const speechToken = voiceSettings ? process.env[voiceSettings.tokenEnv] : undefined;
    const speech = voiceSettings && speechToken ? new PrivateSpeechProvider(voiceSettings.voice.provider, voiceSettings.speechUrl, speechToken, voiceSettings.voice) : undefined;
    social = new SocialVoiceCoordinator(path.join(options.stateDir, 'messaging', 'social-voice.sqlite'), new OpenWASocialProvider(openwa), {...standard, start(_template, actor, key, request) { return parcels.submitApprovedPlan(request.prompt, actor, key, plan, request.origin); }}, speech, speech, voiceSettings?.voice, Date.now, event => control.events.emit('social.activity', {event}, undefined, 'social-voice'), poe ? {ask: async ({actor, identityReference, text, modality}) => {const conversationId = `poe-whatsapp:${sha256(identityReference)}`;try{poe!.conversation(conversationId);}catch{poe!.createConversation({id: conversationId, actorId: actor, channel: 'whatsapp'});}const result = await poe!.ask({conversationId, text, channel: 'whatsapp', modality, contentTrust: modality === 'voice' ? 'UNTRUSTED_DATA' : 'OPERATOR_REQUEST'});return {conversationId, turnId: result.turn.id, text: result.turn.text};}, interrupt: ({actor, conversationId, turnId}) => poe!.bargeIn(conversationId, actor, turnId)} : undefined);
    openwa.social = social;
  }
  const server = startWebDashboard(control, {host: options.host, port: options.port, operatorToken: options.operatorToken, allowedOrigins, assetsDir: path.resolve('assets/dashboard'), openwa, socialVoice: social});
  activeServer = server; await once(server, 'listening');
  const address = server.address() as AddressInfo, base = `http://${options.host}:${address.port}`;
  allowedOrigins.push(base, `http://localhost:${address.port}`);
  emit({phase: 'DASHBOARD_READY', url: base, prompt: QUALIFICATION_PROMPT, at: now()});
  if (openwa && socialIdentity) {
    openwa.start();
    const healthDeadline = Date.now() + 30_000; let health = await openwa.checkHealth();
    while (health.state !== 'connected_verified' && Date.now() < healthDeadline) { await delay(1_000); health = await openwa.checkHealth(); }
    if (health.state !== 'connected_verified') throw new Error(`qualification_openwa_unavailable:${health.state}`);
    emit({phase: 'SOCIAL_CHANNEL_READY', command: QUALIFICATION_SOCIAL_COMMAND, channel: 'openwa', at: now()});
    await delay(2_000);
    openwa.queueSocial(socialIdentity, options.physicalPoe ? 'POE physical qualification is ready. Begin with the voice instruction supplied by the operator.' : `Agent Control 4.0 qualification is ready. Reply with exactly:\n${QUALIFICATION_SOCIAL_COMMAND}`, `qualification-ready:${sha256(startedAt)}`);
  }

  const deadline = Date.now() + (options.physicalPoe ? 240 : 6) * 60_000, inFlight = new Set<Promise<unknown>>(), trace: Array<{at: string; label: string; crew: ReturnType<typeof safeCrew>; activityPanel: ReturnType<AgentControlService['snapshot']>['characterCrew']['activityPanel']}> = [];
  let parent = parcels.list().find(item => item.executionOwner === 'work-parcel-coordinator'), lastSignature = '', concurrentEmitted = false, sourceEmitted = false, rejectionEmitted = false, destinationEmitted = false, verificationEmitted = false, approvalRequested = false;
  const sample = (label: string) => { const snapshot = control.snapshot(), signature = snapshot.characterCrew.members.map(item => item.transitionKey).join('|') + snapshot.characterCrew.activityPanel.groups.flatMap(group => group.indicators.map(item => `${item.id}:${item.state}:${item.count}`)).join('|'); if (signature !== lastSignature || label !== 'poll') { lastSignature = signature; trace.push({at: now(), label, crew: safeCrew(control), activityPanel: snapshot.characterCrew.activityPanel}); } return snapshot; };
  const launch = () => { for (;;) { const dispatch = runtime.dispatch(); if (!dispatch) break; const completion = dispatch.completion.finally(() => inFlight.delete(completion)); inFlight.add(completion); } };
  while (!parent && Date.now() < deadline) { await social?.tick(); await delay(100); parent = parcels.list().find(item => item.executionOwner === 'work-parcel-coordinator'); sample('poll'); }
  if (!parent) throw new Error('qualification_browser_submission_missing');
  emit({phase: 'TASK_RECEIVED', parcelId: parent.id, at: now()});

  while (Date.now() < deadline) {
    await social?.tick(); await parcels.tick(); launch(); parent = parcels.get(parent.id); const snapshot = sample('poll'), routing = tokenRouting.projection();
    const activeParentStages = parent.stages.filter(stage => stage.status === 'RUNNING'), sourceThread = routing.threads.find(thread => thread.providerId === sourceProvider.id), destinationThread = routing.threads.find(thread => thread.providerId === destinationProvider.id), rejected = qualityObservations.find(item => !item.accepted), baton = tokenRouting.evidence().batons[0], reviewStage = parent.stages.find(stage => stage.id === 'review'), reviewRun = reviewStage?.runId ? runtime.ledger.get(reviewStage.runId) : undefined;
    if(options.physicalPoe&&!approvalRequested&&social&&socialIdentity&&reviewRun?.steps.some(step=>step.status==='WAITING_FOR_APPROVAL'&&step.approval==='poe-physical-review')){const approval=await social.requestApproval(socialIdentity,parent.id,reviewRun.id,'poe-physical-review',300_000);approvalRequested=true;emit({phase:'EXPLICIT_APPROVAL_REQUIRED',parcelId:parent.id,runId:reviewRun.id,approvalNumber:approval.number,command:approval.command,at:now()});}
    if (!concurrentEmitted && activeParentStages.some(stage => stage.id === 'baseline') && activeParentStages.some(stage => stage.id === 'inventory')) { concurrentEmitted = true; emit({phase: 'CONCURRENT_STATE_READY', parcelId: parent.id, activeStages: activeParentStages.map(stage => stage.id), at: now()}); }
    if (!sourceEmitted && sourceThread?.active) { sourceEmitted = true; emit({phase: 'SOURCE_MODEL_ACTIVE', parcelId: sourceThread.parcelId, threadId: sourceThread.id, providerId: sourceThread.providerId, modelId: sourceThread.modelId, contextAuthority: sourceThread.latest.context.authority, at: now()}); }
    if (!rejectionEmitted && rejected && baton) { rejectionEmitted = true; emit({phase: 'QUALITY_GATE_REJECTED', parcelId: baton.parcelId, code: rejected.code, summary: rejected.summary, unresolvedCriteria: rejected.unresolvedCriteria, batonId: baton.id, batonSha256: baton.sha256, at: now()}); }
    if (!destinationEmitted && destinationThread?.active) { destinationEmitted = true; emit({phase: 'DESTINATION_MODEL_ACTIVE', parcelId: destinationThread.parcelId, threadId: destinationThread.id, providerId: destinationThread.providerId, accountProfileId: destinationThread.accountProfileId, modelId: destinationThread.modelId, contextAuthority: destinationThread.latest.context.authority, at: now()}); }
    if (!verificationEmitted && activeParentStages.some(stage => stage.id === 'verify')) { verificationEmitted = true; emit({phase: 'INDEPENDENT_VERIFICATION_ACTIVE', parcelId: parent.id, at: now()}); }
    if (parent.status === 'SUCCEEDED' && inFlight.size === 0) break;
    if (parent.status === 'FAILED') throw new Error(`qualification_parent_parcel_failed:${parent.stages.find(stage => stage.status === 'FAILED')?.error ?? 'unknown'}`);
    assert.equal(snapshot.characterCrew.members.length, 6);
    await delay(140);
  }
  if (parent.status !== 'SUCCEEDED') throw new Error(`qualification_timeout:${parent.status}`);

  let outboundResponse: Record<string, unknown> | null = null;
  if (social && openwa) {
    const responseDeadline = Date.now() + 30_000;
    while (Date.now() < responseDeadline) {
      await social.tick();
      const job = social.db.prepare('SELECT number,status FROM jobs WHERE parcel=?').get(parent.id) as {number?: number; status?: string} | undefined;
      const delivery = openwa.db.prepare("SELECT kind,state,attempts,code,remoteId IS NOT NULL AS hasRemoteId FROM outbox WHERE kind='social' AND body LIKE ? ORDER BY id DESC LIMIT 1").get(`Job AC-${job?.number ?? 0}: SUCCEEDED%`) as {kind?: string; state?: string; attempts?: number; code?: string; hasRemoteId?: number} | undefined;
      if (job?.status === 'SUCCEEDED' && delivery?.state === 'submitted' && delivery.hasRemoteId === 1) {
        outboundResponse = {jobReference: `AC-${job.number}`, status: job.status, kind: delivery.kind, deliveryState: delivery.state, attempts: delivery.attempts, deliveryCode: delivery.code, gatewayAccepted: true};
        break;
      }
      await delay(200);
    }
    if (!outboundResponse) throw new Error('qualification_terminal_social_response_not_submitted');
  }

  const completedAt = now(), routingEvidence = tokenRouting.evidence(), routingProjection = tokenRouting.projection(), source = qualityObservations.find(item => !item.accepted), destination = qualityObservations.find(item => item.accepted), baton = routingEvidence.batons[0], nestedRun = parameterizedJobs.runs.get(parameterizedRunId), nestedParcelId = nestedRun?.workParcelIds[0], nestedParcel = nestedParcelId ? parcels.get(nestedParcelId) : undefined, verificationStage = parent.stages.find(stage => stage.id === 'verify'), verificationRun = verificationStage?.runId ? runtime.ledger.get(verificationStage.runId) : undefined, verificationArtifactId = verificationRun?.artifacts[0], verification = verificationArtifactId ? runtime.artifacts.read(verificationArtifactId) as Record<string, unknown> : undefined;
  assert.ok(source && destination && baton && nestedRun && nestedParcel && verification);
  const handoff = handoffs.list().find(item => item.batonSha256 === sha256(JSON.stringify({tokenBatonId: baton.id, tokenBatonSha256: baton.sha256}))) ?? handoffs.list()[0];
  const successfulDecision = routingEvidence.decisions.find(item => item.outcome === 'SUCCEEDED' && item.batonId === baton.id), totals = routingProjection.parcels.find(item => item.parcelId === nestedParcel.id), parentAdaptiveDecisionId = parent.audit.orchestrationDecisionId, nestedAdaptiveDecisionId = nestedParcel.audit.orchestrationDecisionId;
  assert.ok(handoff && successfulDecision && totals);
  assert.ok(parentAdaptiveDecisionId && nestedAdaptiveDecisionId);
  const parentAdaptiveReport = adaptiveOrchestration.report(parentAdaptiveDecisionId), nestedAdaptiveReport = adaptiveOrchestration.report(nestedAdaptiveDecisionId), modelLeague = adaptiveOrchestration.modelLeague('repository-review'), workflowLeague = adaptiveOrchestration.workflowLeague('repository-review');
  assert.equal(parentAdaptiveReport.parcelId, parent.id);
  assert.equal(parentAdaptiveReport.selectedWorkflow?.workflow.id, 'work-parcel-coordinator');
  assert.equal(nestedAdaptiveReport.parcelId, nestedParcel.id);
  assert.equal(nestedAdaptiveReport.selectedRoute?.route.providerId, sourceProvider.id);
  assert.ok(nestedAdaptiveReport.steps.some(item => item.kind === 'LEAGUE_EVIDENCE'));
  assert.ok(modelLeague.some(item => item.route.providerId === sourceProvider.id));
  assert.ok(workflowLeague.some(item => item.workflow.id === 'repository-review'));
  assert.equal(handoff.status, 'COMPLETED');
  assert.equal(successfulDecision.trigger?.kind, 'QUALITY_GATE');
  assert.equal(successfulDecision.trigger?.code, QUALITY_GATE_CODE);
  assert.equal(routingEvidence.threads.find(thread => thread.id === baton.threadId)?.recoverable, true);
  assert.equal(totals.byModel.length, 2);
  assert.equal(totals.totalTokens, totals.byModel.reduce((sum, item) => sum + (item.totalTokens ?? 0), 0));
  assert.equal(nestedParcel.audit.invocations.length, 2);
  assert.equal(nestedParcel.audit.totals.totalTokens, totals.totalTokens);
  assert.equal(nestedRun.usage.totalTokens, totals.totalTokens);
  assert.equal(nestedRun.repository?.reviewedSha, fixture.commit);
  assert.equal(nestedRun.status, 'SUCCEEDED_WITH_FINDINGS');
  assert.equal(source.route.providerId, sourceProvider.id);
  assert.equal(destination.route.providerId, destinationProvider.id);
  assert.notEqual(source.route.providerId, destination.route.providerId);

  const finalSnapshot = sample('completed'), parentRunIds = parent.stages.map(stage => stage.runId).filter((item): item is string => Boolean(item));
  const parentRuns = parentRunIds.map(runId => runtime.ledger.get(runId)).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const parentRunsById = new Map(parentRuns.map(run => [run.id, run]));
  const transcriptDocument = parameterizedJobs.transcripts?.read(nestedRun.id);
  if (!transcriptDocument) throw new Error('qualification_product_transcript_unavailable');
  const executionTranscriptText = transcriptDocument.content;
  assert.match(executionTranscriptText, /^# Agent Control Natural Execution Transcript/m);
  assert.match(executionTranscriptText, /## Origin\n/);
  assert.match(executionTranscriptText, /## Authoritative initiating request\n\n> start governed-adaptive-crew/);
  assert.ok(executionTranscriptText.indexOf('## Authoritative initiating request') < executionTranscriptText.indexOf('- Schema:'));
  assert.match(executionTranscriptText, /BATON_CREATED/);
  assert.match(executionTranscriptText, /HANDOFF_COMPLETED/);
  const protectedRefAfter = command(fixture.repository, 'git', ['ls-remote', '--refs', 'origin', 'refs/heads/main']).split(/\s+/)[0]!;
  assert.equal(protectedRefAfter, fixture.protectedRef);
  const sessions = executionSessions.list(), liveShellSession = sessions.find(item => item.adapterId === 'qualification-linux-pty');
  assert.ok(liveShellSession);
  const liveShellEvents = executionSessions.events(liveShellSession.id);
  assert.ok(liveShellEvents.some(item => item.type === 'attachment.opened' && item.detail.startsWith('WATCH;')));
  assert.ok(liveShellEvents.some(item => item.type === 'attachment.opened' && item.detail.startsWith('INTERVENE;')));
  assert.ok(liveShellEvents.some(item => item.type === 'human.input'));
  assert.ok(liveShellEvents.some(item => item.type === 'attachment.closed'));
  assert.equal(liveShellSession.capabilities.modes.intervene, true);
  const poeConversations = poe ? poe.projection().conversations.map(item => poe!.conversation(item.id)) : [];
  const poeTranscriptText = poe ? poeConversations.map(item => poe!.transcript(item.id)).join('\n\n---\n\n') : '';
  const socialTranscriptText = social?.transcript() ?? '';
  const poeInterruptionCount = Number((social?.db.prepare("SELECT count(*) AS count FROM history WHERE event='poe.interrupted'").get() as {count?: number} | undefined)?.count ?? 0);
  const poeVoiceOperatorTurns = poeConversations.flatMap(item => item.turns).filter(turn => turn.actor === 'operator' && turn.modality === 'voice').length;
  const explicitApproval = parentRuns.find(run => run.id === parent.stages.find(stage => stage.id === 'review')?.runId)?.approvals.includes('poe-physical-review') ?? false;
  if(options.physicalPoe){assert.ok(poeVoiceOperatorTurns >= 3,'qualification_requires_several_physical_voice_turns');assert.ok(poeInterruptionCount >= 2,'qualification_requires_two_physical_barge_ins');assert.equal(explicitApproval,true,'qualification_requires_explicit_social_approval');}
  const transcriptText = options.physicalPoe ? `# Agent Control POE physical qualification — complete user-visible record\n\n## Authenticated social and speech chronology\n\n${socialTranscriptText}\n\n## POE conversations\n\n${poeTranscriptText}\n\n## Governed Work Parcel execution\n\n${executionTranscriptText}` : executionTranscriptText;
  fs.writeFileSync(options.transcriptFile, transcriptText, {mode: 0o600});
  const messageReference = parent.origin?.messageReference;
  const idempotency = options.ingress === 'openwa' && messageReference ? {
    messageReference,
    acceptedInboxRows: Number((social?.db.prepare('SELECT count(*) AS count FROM inbox WHERE key=?').get(messageReference) as {count?: number} | undefined)?.count ?? 0),
    socialJobRows: Number((social?.db.prepare('SELECT count(*) AS count FROM jobs WHERE key=?').get(messageReference) as {count?: number} | undefined)?.count ?? 0),
    matchingRootWorkParcels: parcels.list().filter(item => item.origin?.messageReference === messageReference && item.executionOwner === 'work-parcel-coordinator').length,
    matchingLineageWorkParcels: parcels.list().filter(item => item.origin?.messageReference === messageReference).length,
    deterministicParcelIdentity: parent.id === `parcel-social-${messageReference}`,
    existingControlledReplayEvidence: 'docs/openwa/live-qualification.md',
    existingRestartRepairCoverage: 'src/control/work-parcels.test.ts',
    additionalReplayManufactured: false,
  } : null;
  if (idempotency && (idempotency.acceptedInboxRows !== 1 || idempotency.socialJobRows !== 1 || idempotency.matchingRootWorkParcels !== 1 || !idempotency.deterministicParcelIdentity)) throw new Error('qualification_social_idempotency_reconciliation_failed');
  const evidence = {
    schema: 'agent-control.crew-wopr-escalation-qualification/v1', verdict: 'PASS', startedAt, completedAt,
    repository: {candidateHead: command(process.cwd(), 'git', ['rev-parse', 'HEAD']), candidateBranch: command(process.cwd(), 'git', ['branch', '--show-current']), fixtureCommit: fixture.commit, fixtureFiles: fixture.files, immutable: true, protectedRef: 'refs/heads/main', protectedRefBefore: fixture.protectedRef, protectedRefAfter, protectedRefUnchanged: true},
    request: {source: options.ingress === 'openwa' ? 'authenticated enrolled OpenWA sender through SocialVoiceCoordinator' : 'authenticated dashboard POST /api/parcels', exactInitiatingRequest: parent.origin?.request ?? parent.prompt, governedObjective: QUALIFICATION_PROMPT, origin: parent.origin, parentParcelId: parent.id, parentRunIds},
    topology: {controller: 'isolated AgentControlService', workloadNode: 'controller', source: {providerId: sourceProvider.id, modelId: sourceModel.id, providerModel: sourceModel.providerModel, preflight: sourcePreflight}, destination: {providerId: destinationProvider.id, accountProfileId: account.id, accountLabel: account.label, modelId: destinationModel.id, providerModel: destinationModel.providerModel, nodeId: 'controller', credentialReference: 'CODEX_HOME_COTTAGE_PLUS', accountStatus: {authenticated: accountStatus.authenticated, codexVersion: accountStatus.codexVersion, executableSha256: accountStatus.executableSha256, discoveredAt: accountStatus.discoveredAt}}},
    productionPath: [options.ingress === 'openwa' ? 'authenticated enrolled OpenWA sender' : 'authenticated dashboard', ...(options.ingress === 'openwa' ? ['OpenWAAdapter', 'OpenWASocialProvider', 'SocialVoiceCoordinator'] : []), 'AgentControlService', 'WorkParcelCoordinator', 'JobRuntime', 'buildParameterizedJobRuntime', 'ParameterizedJobEngine', 'DirectRepositoryReviewExecutor', 'TokenAwareBatonRuntime.observe', 'independent RepositoryReviewQualityGate', 'TokenAwareBatonRuntime.assess', 'TokenAwareBatonRuntime.createBaton', 'GovernedHandoffRuntime', 'destination provider invocation', 'independent repository validation', 'Run/Work Parcel ledger'],
    parentWorkParcel: {id: parent.id, status: parent.status, objective: parent.objective, stages: parent.stages.map(stage => { const run = stage.runId ? parentRunsById.get(stage.runId) : undefined; return {id: stage.id, status: stage.status, runId: stage.runId, worker: stage.actualRoute?.workers[0] ?? null, startedAt: run?.startedAt ?? null, completedAt: run?.endedAt ?? null, actions: run?.steps.map(step => ({action: step.action, status: step.status, startedAt: step.startedAt ?? null, completedAt: step.endedAt ?? null})) ?? [], batonId: stage.baton?.id ?? null, batonSha256: stage.baton?.sha256 ?? null};})},
    parameterizedReview: {runId: nestedRun.id, status: nestedRun.status, reviewedSha: nestedRun.repository?.reviewedSha, frozenContext: nestedRun.context, workParcelId: nestedParcel.id, providerResponseIds: nestedRun.providerResponseIds, usage: nestedRun.usage, result: nestedRun.result},
    qualityGate: {code: QUALITY_GATE_CODE, observations: qualityObservations},
    tokenRouting: routingEvidence,
    reconciledTotals: totals,
    providerAudit: nestedParcel.audit,
    adaptiveOrchestration: {policy: adaptiveOrchestration.policySnapshot(), parentDecision: parentAdaptiveReport, nestedDecision: nestedAdaptiveReport, modelLeague, workflowLeague},
    handoff,
    contracts: contracts.list().map(contract => ({id: contract.id, parentContractId: contract.parentContractId, state: contract.state, active: contract.active, baton: {generation: contract.baton.generation, sha256: contract.baton.sha256}, verification: contract.verification, handoffs: contract.handoffs})),
    verification,
    executionSessions: {liveShellSession, events: liveShellEvents, transcriptSha256: sha256(executionSessions.transcript(liveShellSession.id)), harmlessIntervention: true, inputContentPersisted: false},
    dashboard: {urlAuthority: 'isolated loopback qualification server', sseEventCount: control.events.history().length, sseEventTypes: [...new Set(control.events.history().map(event => event.type))], finalActivityPanel: finalSnapshot.characterCrew.activityPanel, finalCrew: finalSnapshot.characterCrew.members, characterTrace: trace},
    poe: options.physicalPoe ? {projection: poe?.projection(), conversations: poeConversations, socialTranscriptSha256: sha256(socialTranscriptText), interruptionCount: poeInterruptionCount, voiceOperatorTurns: poeVoiceOperatorTurns, explicitApproval, speechSynthesisCount: Number((social?.db.prepare("SELECT count(*) AS count FROM history WHERE event='speech.synthesized'").get() as {count?: number} | undefined)?.count ?? 0)} : null,
    assertions: {normalProductionCallPath: true, socialIngressPhysicallyAuthenticated: options.ingress === 'openwa', socialIngressAdaptiveConvergence: Boolean(parentAdaptiveDecisionId), modelAndWorkflowLeaguesConsulted: nestedAdaptiveReport.steps.some(item => item.kind === 'LEAGUE_EVIDENCE') && Boolean(parentAdaptiveReport.selectedWorkflow), exactInitiatingRequestFirstInTranscript: true, twoRealConcurrentControlLanes: concurrentEmitted, liveShellWatchInterveneDetach: true, protectedRefUnchanged: true, sourceResponseSchemaValid: true, sourceRejectedOnlyByIndependentQualityGate: true, qualityTriggeredAtLowContext: routingEvidence.decisions.some(item => item.trigger?.kind === 'QUALITY_GATE' && (item.contextPercent ?? 0) < 75), sealedBatonCreated: /^[a-f0-9]{64}$/.test(baton.sha256), crossProviderDestinationContinued: true, destinationPassedSameGate: true, sourceThreadRecoverable: true, independentVerificationPassed: verification.passed === true, lifetimeTokensReconciled: nestedRun.usage.totalTokens === totals.totalTokens && nestedParcel.audit.totals.totalTokens === totals.totalTokens, currentContextSeparateFromLifetime: routingEvidence.threads.every(thread => thread.latest.context.tokens !== thread.latest.cumulative.totalTokens || thread.latest.context.authority === 'estimated'), missingValuesNotCoercedToZero: routingEvidence.threads.some(thread => thread.latest.context.authority === 'unavailable'), credentialsAbsent: true, productionStateUntouched: true},
    boundaries: {real: [options.ingress === 'openwa' ? 'authenticated OpenWA social task submission from enrolled operator device' : 'browser-authenticated task submission', 'deterministic concurrent Jobs', 'real PTY WATCH then governed harmless INTERVENE and detach', 'live local Qwen provider response', 'schema parsing and application validation', 'independent quality rejection', 'quality governor decision below context thresholds', 'durable sealed baton', 'cross-provider Codex destination continuation', 'independent quality acceptance', 'final repository validation', 'protected origin/main before/after equality', 'token and model-chain reconciliation', 'typed SSE dashboard updates', 'product-generated complete execution transcript'], unavailable: ['Neither provider exposes authoritative mid-turn current-context occupancy.', 'Neither provider reports an authoritative monetary cost for these routes.'], simulated: []},
    security: {credentialMaterialPersisted: false, codexHomePathPersisted: false, providerRawTransportPersisted: false, privateReasoningPersisted: false, liveDeploymentTouched: false, releaseActionPerformed: false},
    idempotency,
    outboundResponse,
    initialAcceptance,
    transcript: {file: path.relative(process.cwd(), options.transcriptFile), sha256: sha256(transcriptText), sourceSha256: transcriptDocument.sourceSha256, entryCount: transcriptDocument.entryCount, generatedDuringExecution: transcriptDocument.generatedDuringExecution, restartReconstructible: transcriptDocument.restartReconstructible},
  };
  const serialized = JSON.stringify(evidence, null, 2);
  if (/\/home\/loz\/\.local\/share\/agent-control\/codex-profiles|(?:access|refresh|oauth)[_-]?token|authorization\s*:|\b\d{5,25}@(c\.us|s\.whatsapp\.net|lid)\b/i.test(serialized)) throw new Error('qualification_evidence_secret_or_profile_path_detected');
  fs.writeFileSync(options.evidenceFile, `${serialized}\n`, {mode: 0o600});
  emit({phase: 'QUALIFICATION_COMPLETE', verdict: 'PASS', evidenceFile: path.relative(process.cwd(), options.evidenceFile), transcriptFile: path.relative(process.cwd(), options.transcriptFile), parentParcelId: parent.id, parameterizedRunId, nestedParcelId: nestedParcel.id, sourceRoute: `${source.route.providerId}/${source.route.modelId}`, destinationRoute: `${destination.route.providerId}/${destination.route.accountProfileId}/${destination.route.modelId}`, batonId: baton.id, batonSha256: baton.sha256, totalTokens: totals.totalTokens, at: completedAt});
  await delay(options.holdMs); social?.close(); openwa?.close(); parameterizedJobs.transcripts?.dispose(); server.close(); await once(server, 'close'); activeServer = undefined;
}

main().catch(error => { activeServer?.close(); emit({phase: 'QUALIFICATION_FAILED', error: error instanceof Error ? error.message : String(error), at: now()}); process.exitCode = 1; });
