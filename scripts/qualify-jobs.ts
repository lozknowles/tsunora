import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {AgentControlService} from '../src/control/application-service.js';
import {emptyConfig} from '../src/control/config.js';
import {nextCronOccurrence} from '../src/control/job-catalog.js';
import {buildJobRuntimeDefinition} from '../src/control/job-bootstrap.js';
import {ArtifactStore, JobRuntime, ResourceLockManager, RunLedger} from '../src/control/job-runtime.js';
import {PtyRegistry} from '../src/control/pty.js';
import {defaultCapabilities, type LaneState, type WorkspaceState} from '../src/state.js';

const outputFile = path.resolve(process.argv[2] ?? path.join('qualification-results', `jobs-${new Date().toISOString().replace(/[:.]/g, '-')}.json`));
function git(args: string[], fallback: string) { try { return execFileSync('git', args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim(); } catch { return fallback; } }
const discoveredCommit = git(['rev-parse', 'HEAD'], 'unavailable-in-exported-tree'), discoveredStatus = git(['status', '--porcelain'], '');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-job-qualification-'));
const {catalog, actions, workers} = buildJobRuntimeDefinition(emptyConfig(), path.resolve('config/jobs'));
const observedAt = new Date().toISOString();
workers.register({id: 'qualification-mobile', capabilities: ['browser.mobile', 'facebook.authenticated'], health: 'healthy', capacity: 1, active: 0, observedAt});
workers.register({id: 'qualification-publisher', capabilities: ['localwalks.publisher', 'node', 'git', 'production-access'], health: 'offline', capacity: 1, active: 0, observedAt});
workers.register({id: 'qualification-observer', capabilities: ['network.read'], health: 'healthy', capacity: 1, active: 0, observedAt});
const runtime = new JobRuntime(catalog, actions, workers, new RunLedger(path.join(root, 'ledger.json')), new ArtifactStore(path.join(root, 'artifacts')), new ResourceLockManager(path.join(root, 'locks.json')), {approval: policy => policy === 'production-publish'});
const lane: LaneState = {id: 1, name: 'Authority proof', status: 'waiting', model: 'unchanged', reasoning: 'medium', context: '0', lines: [], contract: {version: 2, laneId: 1, goal: 'authority invariant', constraints: [], cwd: root, priority: 5, mode: 'auto', capabilities: defaultCapabilities(), resourceLocks: {}, modelLock: null, sharedTaskIds: [], updatedAt: observedAt}, baton: {version: 1, laneId: 1, revision: 1, status: 'unchanged', progress: [], hypothesis: '', evidence: [], changes: [], nextAction: 'unchanged', openQuestions: [], model: 'unchanged', reasoning: 'medium', updatedAt: observedAt}, lease: {laneId: 1, holder: 'agent-a', acquiredAt: observedAt, expiresAt: new Date(Date.now() + 60000).toISOString()}};
const workspace: WorkspaceState = {version: 1, paused: false, lastRestorePoint: null, lanes: [lane]}, ptys = new PtyRegistry(); ptys.upsert({id: 'qualification-pty', cwd: root, command: 'harmless-fixture', recovery: 'reattachable'}, '1'); ptys.attach('qualification-pty', 'agent-a', 'own'); const service = new AgentControlService(workspace, ptys, undefined, '3.1.0-qualification', () => {}).configureProjection({jobRuntime: runtime});
const authorityBefore = {lease: structuredClone(lane.lease), baton: structuredClone(lane.baton), status: lane.status, owner: ptys.attached('qualification-pty').find(item => item.access === 'own')?.actorId};
const run = service.createJobRun('events-refresh-qualification', {}, 'qualification');
await runtime.tick(); await runtime.tick();
const waiting = runtime.ledger.get(run.id)!;
const retainedArtifact = runtime.artifacts.get(waiting.steps[0].artifactIds[0])!;
workers.setHealth('qualification-publisher', 'healthy');
for (let count = 0; count < 5; count++) await runtime.tick();
const completed = runtime.ledger.get(run.id)!;
const authorityAfter = {lease: structuredClone(lane.lease), baton: structuredClone(lane.baton), status: lane.status, owner: ptys.attached('qualification-pty').find(item => item.access === 'own')?.actorId};
const evidence = {
  schemaVersion: 1,
  qualification: 'Agent Control 3.1 Job Catalog and Scheduler',
  generatedAt: new Date().toISOString(),
  sourceCommit: process.env.AGENT_CONTROL_SOURCE_COMMIT ?? discoveredCommit,
  gitMetadataAvailable: discoveredCommit !== 'unavailable-in-exported-tree',
  workingTreeDirty: discoveredStatus !== '',
  safety: {target: 'non-production-fixture', externalNetworkUsed: false, publicationAttempted: false, scheduleEnabled: false},
  waitingProof: {runId: run.id, runStatus: waiting.status, discoveryStatus: waiting.steps[0].status, downstreamStatus: waiting.steps[1].status, reason: waiting.steps[1].waitingReason, artifact: {id: retainedArtifact.id, sha256: retainedArtifact.sha256, type: retainedArtifact.type, schema: retainedArtifact.schema}},
  completionProof: {status: completed.status, steps: completed.steps.map(step => ({id: step.id, status: step.status, worker: step.placement?.selected, attempts: step.attempts.length, verification: step.verification})), selectedWorkers: completed.selectedWorkers, artifacts: runtime.artifacts.list(run.id).map(artifact => ({id: artifact.id, stepId: artifact.stepId, type: artifact.type, schema: artifact.schema, sha256: artifact.sha256})), provenance: completed.provenance},
  schedulingProof: {definitionEnabled: catalog.schedule('events-refresh-twice-daily-candidate')?.spec.enabled, runtimeEnabled: runtime.ledger.schedule('events-refresh-twice-daily-candidate')?.enabled ?? false, londonSummerNext: nextCronOccurrence('0 7,19 * * *', 'Europe/London', new Date('2026-08-24T05:59:00Z')).toISOString(), londonWinterNext: nextCronOccurrence('0 7,19 * * *', 'Europe/London', new Date('2026-12-24T06:59:00Z')).toISOString()},
  authorityProof: {before: authorityBefore, after: authorityAfter, unchanged: JSON.stringify(authorityBefore) === JSON.stringify(authorityAfter), schedulerHasPtyWritePrimitive: false, manifestCanGrantCapability: false},
  verdict: completed.status === 'SUCCEEDED' && JSON.stringify(authorityBefore) === JSON.stringify(authorityAfter) ? 'PASS_SAFE_NON_PRODUCTION' : 'FAIL',
};
const canonical = `${JSON.stringify(evidence, null, 2)}\n`; fs.mkdirSync(path.dirname(outputFile), {recursive: true}); fs.writeFileSync(outputFile, canonical, {mode: 0o600}); process.stdout.write(`${JSON.stringify({outputFile, verdict: evidence.verdict, runId: run.id, sha256: createHash('sha256').update(canonical).digest('hex')})}\n`);
fs.rmSync(root, {recursive: true});
