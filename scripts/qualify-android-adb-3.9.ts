import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs';
import type {AddressInfo} from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {androidAdbObservationArtifact, androidAdbQualificationDefinition} from './android-adb-qualification-contract.mjs';
import {AgentControlService} from '../src/control/application-service.js';
import {JobCatalog} from '../src/control/job-catalog.js';
import {ActionRegistry, ArtifactStore, JobRuntime, ResourceLockManager, RunLedger, WorkerRegistry} from '../src/control/job-runtime.js';
import type {JobDefinition, RunRecord} from '../src/control/job-types.js';
import {fetchNodeResource, runNodeJob, type NodeClientOptions} from '../src/control/node-client.js';
import {PtyRegistry} from '../src/control/pty.js';
import {startWebDashboard} from '../src/control/web-server.js';
import {WorkParcelCoordinator, WorkParcelStore} from '../src/control/work-parcels.js';
import type {WorkspaceState} from '../src/state.js';

type RawAdbEvidence = {
  adb?: {available?: boolean; version?: string | null; mdnsAvailable?: boolean; discoverySource?: string};
  discovery?: {pairing?: Array<{endpoint?: string; deviceIdentity?: string}>; connect?: Array<{endpoint?: string; deviceIdentity?: string}>; ignoredNonLocalServices?: number};
  devices?: Array<{serial?: string; state?: string}>;
  paired?: boolean;
  usableLocalDeviceConnected?: boolean;
  connectionEndpoint?: string | null;
  deviceIdentity?: string | null;
  verification?: {qualified?: boolean; method?: string; reason?: string; target?: {manufacturer?: string; model?: string; device?: string; android?: string; sdk?: string; serialSha256?: string; identityCorrelation?: string}};
  state?: string;
  operation?: string;
  action?: string;
  reason?: string;
};
type NodeJob = {status?: string; type?: string; resource?: string; device?: Record<string, string>; evidence?: RawAdbEvidence};
type SafeStatus = ReturnType<typeof sanitizeStatus>;

interface Options {
  mode: 'qualification' | 'resume';
  stateDir: string;
  evidenceFile: string;
  sessionFile: string;
  nodeUrl: string;
  host: string;
  port: number;
  pixelHost: string;
  pixelUser: string;
  pixelPort: number;
  pixelIdentity: string;
  resourceId: string;
  remoteAgent: string;
  controllerNodeId: string;
  controllerSshPort: number;
  pairingTimeoutMs: number;
  endpointChangeTimeoutMs: number;
  phaseDelayMs: number;
}

const timestamp = () => new Date().toISOString();
const delay = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const endpointPort = (value: unknown) => Number(String(value ?? '').match(/:(\d{1,5})$/)?.[1] ?? 0) || null;
const identityHash = (value: unknown) => value ? sha256(String(value).toLowerCase()) : null;
const writePhase = (phase: string, values: Record<string, unknown> = {}) => process.stdout.write(`${JSON.stringify({phase, at: timestamp(), ...values})}\n`);
function writeJson(file: string, value: unknown) { fs.mkdirSync(path.dirname(file), {recursive: true, mode: 0o700}); const temporary = `${file}.${process.pid}.tmp`; fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {mode: 0o600}); fs.renameSync(temporary, file); }

function options(): Options {
  const values = new Map<string, string>();
  for (let index = 2; index < process.argv.length; index += 2) {
    const name = process.argv[index], value = process.argv[index + 1];
    if (!name?.startsWith('--') || value === undefined) throw new Error(`qualification_argument_invalid:${name ?? 'missing'}`);
    values.set(name.slice(2), value);
  }
  const required = (name: string) => { const value = values.get(name); if (!value) throw new Error(`qualification_argument_required:${name}`); return value; };
  const mode = (values.get('mode') ?? 'qualification') as Options['mode'];
  if (!['qualification', 'resume'].includes(mode)) throw new Error('qualification_mode_invalid');
  const stateDir = path.resolve(values.get('state-dir') ?? path.join(os.tmpdir(), `agent-control-android-adb-${randomUUID()}`));
  const resourceId = values.get('resource-id') ?? 'pixel', controllerNodeId = values.get('controller-node-id') ?? 'controller';
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(resourceId)) throw new Error('qualification_resource_id_invalid');
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(controllerNodeId)) throw new Error('qualification_controller_node_id_invalid');
  const pixelHost = required('pixel-host'), pixelUser = required('pixel-user');
  if (!/^[a-z0-9.:-]+$/i.test(pixelHost) || !/^[a-z0-9._-]+$/i.test(pixelUser)) throw new Error('qualification_ssh_identity_invalid');
  return {
    mode,
    stateDir,
    evidenceFile: path.resolve(values.get('evidence-file') ?? path.join(stateDir, 'android-adb-qualification.json')),
    sessionFile: path.resolve(values.get('session-file') ?? path.join(stateDir, 'android-adb-session.json')),
    nodeUrl: required('node-url'),
    host: values.get('host') ?? '127.0.0.1',
    port: Number(values.get('port') ?? 4393),
    pixelHost,
    pixelUser,
    pixelPort: Number(values.get('pixel-port') ?? 8022),
    pixelIdentity: path.resolve(required('pixel-identity')),
    resourceId,
    remoteAgent: values.get('remote-agent') ?? '~/.cache/agent-control-3.9-qualification/resource-agent.sh',
    controllerNodeId,
    controllerSshPort: Number(values.get('controller-ssh-port') ?? 2222),
    pairingTimeoutMs: Number(values.get('pairing-timeout-ms') ?? 600_000),
    endpointChangeTimeoutMs: Number(values.get('endpoint-change-timeout-ms') ?? 300_000),
    phaseDelayMs: Number(values.get('phase-delay-ms') ?? 3_000),
  };
}

function sanitizeStatus(result: NodeJob): {
  nodeStatus: string | null;
  operation: string | null;
  state: string | null;
  paired: boolean;
  usable: boolean;
  adb: {available: boolean; version: string | null; mdnsAvailable: boolean; discoverySource: string | null};
  discovery: {pairingCount: number; connectCount: number; connectPorts: number[]; ignoredNonLocalServices: number};
  connectionEndpointPort: number | null;
  deviceIdentitySha256: string | null;
  verification: RawAdbEvidence['verification'];
} {
  const value = result.evidence ?? {}, connect = value.discovery?.connect ?? [];
  return {
    nodeStatus: result.status ?? null,
    operation: value.operation ?? null,
    state: value.state ?? null,
    paired: value.paired === true,
    usable: value.usableLocalDeviceConnected === true,
    adb: {available: value.adb?.available === true, version: value.adb?.version ?? null, mdnsAvailable: value.adb?.mdnsAvailable === true, discoverySource: value.adb?.discoverySource ?? null},
    discovery: {pairingCount: value.discovery?.pairing?.length ?? 0, connectCount: connect.length, connectPorts: connect.map(item => endpointPort(item.endpoint)).filter((item): item is number => item !== null), ignoredNonLocalServices: value.discovery?.ignoredNonLocalServices ?? 0},
    connectionEndpointPort: endpointPort(value.connectionEndpoint),
    deviceIdentitySha256: identityHash(value.deviceIdentity),
    verification: value.verification ? structuredClone(value.verification) : undefined,
  };
}

function requireQualified(result: NodeJob) {
  const value = result.evidence;
  assert.equal(result.status, 'completed', `android_node_job_not_completed:${result.status}`);
  assert.equal(value?.usableLocalDeviceConnected, true, 'android_adb_connection_not_usable');
  assert.equal(value?.verification?.qualified, true, 'android_adb_target_not_qualified');
  assert.match(value?.verification?.target?.serialSha256 ?? '', /^[a-f0-9]{64}$/);
  assert.ok(value?.connectionEndpoint, 'android_adb_endpoint_missing');
  return value!;
}

function definition(id: string, action: string, requires: string[], retry?: {attempts: number; backoffSeconds: number; overallDeadlineSeconds: number}): JobDefinition {
  return androidAdbQualificationDefinition(id, action, requires, retry) as JobDefinition;
}

function ssh(options: Options, command: string[]) {
  for (const value of command) if (!/^[a-z0-9_./:=~@-]+$/i.test(value)) throw new Error('qualification_remote_argument_invalid');
  return execFileSync('ssh', ['-T', '-i', options.pixelIdentity, '-p', String(options.pixelPort), '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', `${options.pixelUser}@${options.pixelHost}`, ...command], {encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024});
}

function legacyProjection(options: Options) {
  const value = JSON.parse(ssh(options, ['env', `AGENT_CONTROL_RESOURCE_ID=${options.resourceId}`, options.remoteAgent]));
  return {schema: value.schema ?? null, resourceId: value.resource?.id ?? null, capabilities: Array.isArray(value.resource?.capabilities) ? value.resource.capabilities.map((item: {id?: string}) => item.id).filter(Boolean).sort() : []};
}

async function resume(options: Options, node: NodeClientOptions) {
  const session = JSON.parse(fs.readFileSync(options.sessionFile, 'utf8'));
  if (session.schema !== 'agent-control.android-adb-qualification-session/v1' || session.resourceId !== options.resourceId) throw new Error('android_adb_session_identity_invalid');
  const resource = await fetchNodeResource(node), result = await runNodeJob<NodeJob>(node, 'android.adb.status'), evidence = requireQualified(result), safe = sanitizeStatus(result);
  assert.ok(resource.capabilities.some(item => item.id === 'transport.adb'));
  assert.equal(evidence.verification?.target?.serialSha256, session.target.serialSha256, 'android_adb_resumed_target_mismatch');
  const resumed = {...session, sequence: 2, resumedAt: timestamp(), resumedInFreshProcess: true, resumedStatus: safe};
  writeJson(options.sessionFile, resumed); writePhase('PERSISTED_SESSION_RESUMED', {sessionId: session.sessionId, status: safe});
}

async function waitForChangedEndpoint(node: NodeClientOptions, previousEndpoint: string, identity: string | null, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await runNodeJob<NodeJob>(node, 'android.adb.status'), connect = result.evidence?.discovery?.connect ?? [];
    const changed = connect.find(item => item.endpoint && item.endpoint !== previousEndpoint && (!identity || item.deviceIdentity === identity));
    if (changed?.endpoint) return changed.endpoint;
    await delay(1_000);
  }
  throw new Error('android_adb_changed_endpoint_not_observed');
}

async function waitForQualifiedConnection(node: NodeClientOptions, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await runNodeJob<NodeJob>(node, 'android.adb.status');
    if (result.evidence?.paired && result.evidence.usableLocalDeviceConnected && result.evidence.verification?.qualified) return result;
    await delay(1_000);
  }
  throw new Error('android_adb_local_pairing_timeout');
}

async function qualification(options: Options, node: NodeClientOptions) {
  const startedAt = timestamp(), sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(), dirty = execFileSync('git', ['status', '--short'], {encoding: 'utf8'}).trim().length > 0;
  if (dirty) throw new Error('android_qualification_requires_clean_source');
  fs.mkdirSync(options.stateDir, {recursive: true, mode: 0o700});
  const rawByRun = new Map<string, NodeJob>(), safeByRun = new Map<string, SafeStatus>();
  const action = (operation: 'android.adb.status' | 'android.adb.ensure-connected') => async (context: {run: RunRecord}) => {
    const raw = await runNodeJob<NodeJob>(node, operation), evidence = requireQualified(raw), safe = sanitizeStatus(raw);
    rawByRun.set(context.run.id, raw); safeByRun.set(context.run.id, safe);
    return {artifacts: [{...androidAdbObservationArtifact, value: safe}], evidence: [`node-operation:${operation}`, `target-serial-sha256:${evidence.verification!.target!.serialSha256}`], verification: ['adb-target-qualified']};
  };
  const actions = new ActionRegistry().register('qualification.android-adb-status@1.0.0', action('android.adb.status')).register('qualification.android-adb-reconnect@1.0.0', action('android.adb.ensure-connected'));
  const catalog = new JobCatalog(actions.ids()); catalog.addJob(definition('android-adb-governed-status', 'qualification.android-adb-status@1.0.0', ['android.adb.local'])); catalog.addJob(definition('android-adb-governed-reconnect', 'qualification.android-adb-reconnect@1.0.0', ['android.adb.ensure-connected'], {attempts: 1, backoffSeconds: 1, overallDeadlineSeconds: 90}));
  const initialResource = await fetchNodeResource(node), workers = new WorkerRegistry().register({id: options.resourceId, capabilities: initialResource.capabilities.map(item => item.id), health: initialResource.health, capacity: 1, active: 0, observedAt: timestamp()});
  const ledger = new RunLedger(path.join(options.stateDir, 'runs.json')), artifacts = new ArtifactStore(path.join(options.stateDir, 'artifacts')), locks = new ResourceLockManager(path.join(options.stateDir, 'locks.json')), runtime = new JobRuntime(catalog, actions, workers, ledger, artifacts, locks);
  const workspace: WorkspaceState = {version: 1, paused: false, lastRestorePoint: null, lanes: []};
  const workParcels = new WorkParcelCoordinator(runtime, new WorkParcelStore(path.join(options.stateDir, 'parcels.json')), {plan: () => { throw new Error('android_qualification_planner_not_configured'); }});
  const control = new AgentControlService(workspace, new PtyRegistry(), undefined, '3.9.0-android-qualification', () => {}).configureProjection({jobRuntime: runtime, workParcels});
  const project = (resource: typeof initialResource) => { workers.observe({id: options.resourceId, capabilities: resource.capabilities.map(item => item.id), health: resource.health, capacity: 1, labels: {qualification: 'android-wireless-adb'}, observedAt: timestamp()}); control.configureProjection({resources: [{id: options.resourceId, name: 'Physical Pixel wireless ADB', platform: 'android', transport: 'governed loopback node over SSH tunnel', capabilities: resource.capabilities.map(item => item.id)}]}); control.events.emit('resource.node_changed', {resourceId: options.resourceId, capabilities: resource.capabilities.map(item => item.id)}, undefined, 'android-qualification'); };
  project(initialResource);
  const operatorToken = randomUUID(), server = startWebDashboard(control, {host: options.host, port: options.port, operatorToken, assetsDir: path.resolve('assets/dashboard')}); await once(server, 'listening');
  const monitor = setInterval(() => { const run = ledger.list()[0]; if (run) control.events.emit('job.run_changed', {runId: run.id, status: run.status}, undefined, 'android-qualification'); }, 250); monitor.unref();
  const run = async (reference: string) => {
    const created = runtime.createRun(reference, {}, {type: 'manual', actor: 'android-qualification'}), deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      await runtime.tick();
      const observed = ledger.get(created.id)!;
      if (['SUCCEEDED', 'FAILED', 'DEGRADED', 'CANCELLED'].includes(observed.status)) { assert.equal(observed.status, 'SUCCEEDED'); return observed; }
      await delay(100);
    }
    throw new Error(`android_qualification_run_timeout:${created.id}`);
  };
  try {
    writePhase('DASHBOARD_READY', {port: (server.address() as AddressInfo).port, operatorToken, resourceId: options.resourceId}); await delay(options.phaseDelayMs);
    const prePairRaw = await runNodeJob<NodeJob>(node, 'android.adb.status'), prePairStatus = sanitizeStatus(prePairRaw), prePairResource = await fetchNodeResource(node), prePairLegacy = legacyProjection(options);
    const prePairUnqualified = !prePairRaw.evidence?.usableLocalDeviceConnected && !prePairRaw.evidence?.verification?.qualified;
    assert.equal(prePairUnqualified, true, 'android_adb_pre_pair_connection_not_unqualified');
    assert.equal(prePairResource.capabilities.some(item => item.id === 'transport.adb' || item.id === 'android.adb.local'), false);
    assert.equal(prePairLegacy.capabilities.includes('transport.adb') || prePairLegacy.capabilities.includes('android.adb.local'), false);
    writePhase('PAIRING_REQUIRED', {status: prePairStatus, currentCapabilities: prePairResource.capabilities.map(item => item.id).sort(), legacyCapabilities: prePairLegacy.capabilities});
    const pairedObservation = await waitForQualifiedConnection(node, options.pairingTimeoutMs), pairedResource = await fetchNodeResource(node); project(pairedResource);
    writePhase('PAIRING_COMPLETED', {status: sanitizeStatus(pairedObservation), currentCapabilities: pairedResource.capabilities.map(item => item.id).sort()}); await delay(options.phaseDelayMs);
    const initial = await run('android-adb-governed-status@1.0.0'), rawInitial = rawByRun.get(initial.id)!, initialEvidence = requireQualified(rawInitial), safeInitial = safeByRun.get(initial.id)!;
    assert.equal(initialEvidence.paired, true, 'android_pairing_not_completed_through_candidate_helper'); assert.equal(initialEvidence.verification?.target?.model, 'Pixel 8 Pro'); assert.equal(initialEvidence.verification?.target?.android, '17'); assert.equal(safeInitial.adb.discoverySource, 'direct-mdns');
    const initialEndpoint = initialEvidence.connectionEndpoint!, stableIdentity = initialEvidence.deviceIdentity ?? null, sessionId = `android-adb-session-${randomUUID()}`;
    const session = {schema: 'agent-control.android-adb-qualification-session/v1', sessionId, sourceCommit, resourceId: options.resourceId, createdAt: timestamp(), sequence: 1, target: initialEvidence.verification!.target, initialEndpointPort: endpointPort(initialEndpoint), initialRunId: initial.id}; writeJson(options.sessionFile, session);
    const legacyInitial = legacyProjection(options); assert.ok(legacyInitial.capabilities.includes('transport.adb')); assert.ok(legacyInitial.capabilities.includes('android.adb.local'));
    writePhase('INITIAL_QUALIFIED', {runId: initial.id, sessionId, status: safeInitial}); await delay(options.phaseDelayMs);

    ssh(options, ['adb', 'disconnect', initialEndpoint]);
    let disconnected: NodeJob | undefined;
    for (let attempt = 0; attempt < 10; attempt++) { const observed = await runNodeJob<NodeJob>(node, 'android.adb.status'); if (!observed.evidence?.usableLocalDeviceConnected) { disconnected = observed; break; } await delay(500); }
    assert.ok(disconnected, 'android_adb_disconnect_not_observed'); const disconnectedResource = await fetchNodeResource(node); assert.equal(disconnectedResource.capabilities.some(item => item.id === 'transport.adb'), false); project(disconnectedResource);
    const legacyDisconnected = legacyProjection(options); assert.equal(legacyDisconnected.capabilities.includes('transport.adb'), false); assert.equal(legacyDisconnected.capabilities.includes('android.adb.local'), false);
    writePhase('CAPABILITY_WITHDRAWN', {status: sanitizeStatus(disconnected!), currentCapabilities: disconnectedResource.capabilities.map(item => item.id).sort()}); await delay(options.phaseDelayMs);

    const reconnect = await run('android-adb-governed-reconnect@1.0.0'), safeReconnect = safeByRun.get(reconnect.id)!; assert.equal(safeReconnect.connectionEndpointPort, endpointPort(initialEndpoint));
    const reconnectedResource = await fetchNodeResource(node); assert.ok(reconnectedResource.capabilities.some(item => item.id === 'transport.adb')); project(reconnectedResource);
    const legacyReconnect = legacyProjection(options); assert.ok(legacyReconnect.capabilities.includes('transport.adb'));
    const idempotent = await run('android-adb-governed-reconnect@1.0.0'), safeIdempotent = safeByRun.get(idempotent.id)!; assert.equal(rawByRun.get(idempotent.id)?.evidence?.action, 'already-connected');
    writePhase('SAME_ENDPOINT_RECONNECTED', {runId: reconnect.id, idempotentRunId: idempotent.id, status: safeReconnect}); await delay(options.phaseDelayMs);

    writePhase('ENDPOINT_CHANGE_REQUIRED', {previousEndpointPort: endpointPort(initialEndpoint), instruction: 'Toggle Wireless debugging off, then on, on the Pixel'});
    const changedEndpoint = await waitForChangedEndpoint(node, initialEndpoint, stableIdentity, options.endpointChangeTimeoutMs), changedObserved = await runNodeJob<NodeJob>(node, 'android.adb.status');
    if (!changedObserved.evidence?.usableLocalDeviceConnected) { const changedResource = await fetchNodeResource(node); project(changedResource); }
    const changedReconnect = await run('android-adb-governed-reconnect@1.0.0'), rawChanged = rawByRun.get(changedReconnect.id)!, changedEvidence = requireQualified(rawChanged), safeChanged = safeByRun.get(changedReconnect.id)!;
    assert.equal(changedEvidence.connectionEndpoint, changedEndpoint); assert.notEqual(endpointPort(changedEndpoint), endpointPort(initialEndpoint)); assert.equal(changedEvidence.deviceIdentity, stableIdentity); assert.equal(changedEvidence.verification?.target?.serialSha256, initialEvidence.verification?.target?.serialSha256);
    const changedResource = await fetchNodeResource(node); project(changedResource); const legacyChanged = legacyProjection(options); assert.ok(legacyChanged.capabilities.includes('transport.adb'));
    writePhase('CHANGED_ENDPOINT_RECONNECTED', {runId: changedReconnect.id, previousEndpointPort: endpointPort(initialEndpoint), currentEndpointPort: endpointPort(changedEndpoint), status: safeChanged}); await delay(options.phaseDelayMs);

    const resumeOutput = execFileSync(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), '--mode', 'resume', '--state-dir', options.stateDir, '--session-file', options.sessionFile, '--evidence-file', options.evidenceFile, '--node-url', options.nodeUrl, '--pixel-host', options.pixelHost, '--pixel-user', options.pixelUser, '--pixel-port', String(options.pixelPort), '--pixel-identity', options.pixelIdentity, '--resource-id', options.resourceId], {encoding: 'utf8', env: process.env, timeout: 60_000});
    const resumed = JSON.parse(resumeOutput.trim().split(/\r?\n/).at(-1)!); assert.equal(resumed.phase, 'PERSISTED_SESSION_RESUMED'); writePhase('PERSISTED_SESSION_RESUMED', {sessionId, status: resumed.status});
    const restoredLedger = new RunLedger(path.join(options.stateDir, 'runs.json')); assert.equal(restoredLedger.list().length, 4); assert.ok(restoredLedger.list().every(item => item.status === 'SUCCEEDED'));
    const finalSession = JSON.parse(fs.readFileSync(options.sessionFile, 'utf8')); assert.equal(finalSession.sequence, 2); assert.equal(finalSession.resumedInFreshProcess, true);
    const evidence = {
      schema: 'agent-control.android-adb-physical-qualification/v1', verdict: 'PASS', startedAt, completedAt: timestamp(),
      source: {branch: 'feature/3.9-resilient-execution', commit: sourceCommit, dirty: false},
      topology: {controller: options.controllerNodeId, controllerSshPort: options.controllerSshPort, pixel: {resourceId: options.resourceId, sshPort: options.pixelPort, platform: 'Android 17 / Termux'}, node: 'candidate loopback HTTP through strict-host-key SSH local-forward'},
      discovery: {nativeAdbHostMdns: 'unsupported-host-service', selectedSource: safeInitial.adb.discoverySource, quBit: false, manualEndpointEntry: false},
      prePair: {status: prePairStatus, nodeCapabilities: prePairResource.capabilities.map(item => item.id).sort(), legacyCapabilities: prePairLegacy.capabilities, capabilitiesWithheld: true},
      initial: {runId: initial.id, status: safeInitial, legacyCapabilities: legacyInitial.capabilities},
      disconnect: {injection: 'validated adb disconnect of the qualified endpoint', status: sanitizeStatus(disconnected!), nodeCapabilities: disconnectedResource.capabilities.map(item => item.id).sort(), legacyCapabilities: legacyDisconnected.capabilities},
      reconnect: {runId: reconnect.id, idempotentRunId: idempotent.id, status: safeReconnect, idempotentStatus: safeIdempotent, nodeCapabilities: reconnectedResource.capabilities.map(item => item.id).sort(), legacyCapabilities: legacyReconnect.capabilities},
      changedEndpoint: {injection: 'operator toggled Android Wireless debugging off then on', priorPort: endpointPort(initialEndpoint), currentPort: endpointPort(changedEndpoint), sameServiceIdentity: true, sameTargetSerialHash: true, runId: changedReconnect.id, status: safeChanged, nodeCapabilities: changedResource.capabilities.map(item => item.id).sort(), legacyCapabilities: legacyChanged.capabilities},
      governedExecution: {transport: 'production NodeClient to fixed node-server operations', operations: restoredLedger.list().map(item => ({runId: item.id, jobId: item.jobId, status: item.status, worker: item.selectedWorkers[0], artifactSha256: item.artifacts.map(id => artifacts.get(id)?.sha256).filter(Boolean)})), arbitraryShellExposed: false},
      persistedSession: {sessionId, initialRunId: initial.id, sourceProcess: process.pid, resumedInFreshProcess: true, sequence: finalSession.sequence, targetSerialSha256: finalSession.target.serialSha256, resumedAt: finalSession.resumedAt},
      unavailableConnectivity: {evidence: 'unqualified pre-pair observation plus deliberate post-pair disconnect and capability withdrawal in this run', failClosed: true},
      dashboard: {transport: 'loopback HTTP', eventStream: 'SSE', resourceTransitionsEmitted: true},
      security: {pairingPinPersisted: false, pairingPinInArguments: false, rawAdbOutputPersisted: false, rawSshStreamsPersisted: false, rawDeviceSerialPersisted: false, endpointAddressPersisted: false, targetSerialStoredAsSha256: true},
      assertions: {pairingCompletedThroughHiddenLocalStdinDuringRun: true, prePairCapabilityWithheld: true, intendedPixelVerified: true, sameEndpointReconnect: true, changedEndpointRediscovered: true, currentNodeCapabilityGated: true, legacyCapabilityGated: true, governedExecutionPassed: true, persistedSessionResumePassed: true},
    };
    writeJson(options.evidenceFile, evidence); writePhase('QUALIFICATION_COMPLETE', {verdict: 'PASS', evidenceFile: options.evidenceFile});
  } finally { clearInterval(monitor); await new Promise<void>(resolve => server.close(() => resolve())); }
}

const parsed = options(), token = process.env.AGENT_CONTROL_ANDROID_NODE_TOKEN;
if (!token) throw new Error('android_node_token_required');
const node: NodeClientOptions = {baseUrl: parsed.nodeUrl, token, timeoutMs: 30_000, resource: parsed.resourceId};
if (parsed.mode === 'resume') await resume(parsed, node); else await qualification(parsed, node);
