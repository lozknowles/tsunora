import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {projectParameterizedRunHistory, safeHistoryText, safeTranscriptText, type ExecutionHistoryEntry, type ExecutionHistoryProjection} from './execution-history.js';
import type {ParameterizedRunStore, SavedJobStore} from './parameterized-job-registry.js';
import type {ParameterizedJobRun} from './parameterized-job-types.js';
import type {TokenAwareBatonRuntime} from './token-aware-baton-routing.js';
import type {WorkParcel, WorkParcelStore} from './work-parcels.js';

export interface ExecutionTranscriptMetadata {
  schema: 'agent-control.execution-transcript/v1';
  jobRunId: string;
  savedJobId: string | null;
  status: ParameterizedJobRun['status'];
  terminal: boolean;
  entryCount: number;
  workParcelIds: string[];
  observedAt: string;
  sourceSha256: string;
  sha256: string;
  file: string;
  generatedDuringExecution: true;
  restartReconstructible: true;
}

export interface ExecutionTranscriptDocument extends ExecutionTranscriptMetadata {content: string;}

const TERMINAL = new Set<ParameterizedJobRun['status']>(['SUCCEEDED', 'SUCCEEDED_WITH_FINDINGS', 'FAILED', 'CANCELLED', 'DEGRADED']);

/**
 * Materialises a human-readable projection whenever an authoritative Job Run,
 * Work Parcel, token, governor or baton record changes. It never receives raw
 * credentials, raw provider transport output or private model reasoning.
 */
export class ExecutionTranscriptRuntime {
  private readonly unsubscribers: Array<() => void> = [];

  constructor(
    readonly root: string,
    private readonly runs: ParameterizedRunStore,
    private readonly savedJobs: SavedJobStore,
    private readonly parcels: WorkParcelStore,
    private readonly routing?: TokenAwareBatonRuntime,
  ) {
    fs.mkdirSync(root, {recursive: true, mode: 0o700});
    this.unsubscribers.push(runs.subscribe(run => this.refresh(run.id)));
    this.unsubscribers.push(parcels.subscribe(parcel => this.refreshParcel(parcel)));
    if (routing) this.unsubscribers.push(routing.subscribe(event => this.refreshParcelId(event.parcelId)));
    this.refreshAll();
  }

  dispose() { for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe(); }

  refreshAll() { for (const run of this.runs.list()) this.refresh(run.id); }

  refresh(jobRunId: string): ExecutionTranscriptMetadata | undefined {
    const run = this.runs.get(jobRunId);
    if (!run) return undefined;
    const savedJob = run.savedJobId ? this.savedJobs.list().find(item => item.id === run.savedJobId) : undefined;
    const tokenEvidence = this.routing?.evidence();
    const projection = projectParameterizedRunHistory({run, savedJob, parcels: this.parcels.list(), tokenEvidence, options: {mode: 'complete'}});
    const content = renderExecutionTranscript(projection, run);
    const sourceSha256 = digest(JSON.stringify(projection));
    const sha256 = digest(content);
    const stem = transcriptStem(jobRunId), file = `${stem}.md`, manifestFile = `${stem}.json`;
    const observedAt = projection.entries.at(-1)?.at ?? run.requestedAt;
    const metadata: ExecutionTranscriptMetadata = {
      schema: 'agent-control.execution-transcript/v1', jobRunId, savedJobId: run.savedJobId ?? null, status: run.status,
      terminal: TERMINAL.has(run.status), entryCount: projection.entries.length, workParcelIds: [...projection.workParcelIds], observedAt,
      sourceSha256, sha256, file, generatedDuringExecution: true, restartReconstructible: true,
    };
    writeIfChanged(path.join(this.root, file), content);
    writeIfChanged(path.join(this.root, manifestFile), `${JSON.stringify(metadata, null, 2)}\n`);
    return structuredClone(metadata);
  }

  metadata(jobRunId: string) { return this.refresh(jobRunId); }

  read(jobRunId: string): ExecutionTranscriptDocument {
    const metadata = this.refresh(jobRunId);
    if (!metadata) throw new Error('execution_transcript_missing');
    const content = fs.readFileSync(path.join(this.root, metadata.file), 'utf8');
    if (digest(content) !== metadata.sha256) throw new Error('execution_transcript_integrity_failed');
    return {...metadata, content};
  }

  private refreshParcel(parcel: WorkParcel) {
    const ids = new Set(parcel.provenance.filter(item => item.type === 'job-run').map(item => item.detail));
    for (const run of this.runs.list()) if (run.workParcelIds.includes(parcel.id)) ids.add(run.id);
    for (const id of ids) this.refresh(id);
  }

  private refreshParcelId(parcelId: string) {
    const parcel = this.parcels.get(parcelId);
    if (parcel) this.refreshParcel(parcel);
  }
}

export function renderExecutionTranscript(projection: ExecutionHistoryProjection, run: ParameterizedJobRun) {
  const title = run.executionMode === 'CONTROLLED_FAULT_INJECTION'
    ? 'Agent Control Controlled Fault-Injection Execution Transcript'
    : run.executionMode === 'SIMULATED'
      ? 'Agent Control Simulated/Test Execution Transcript'
      : 'Agent Control Natural Execution Transcript';
  const lines = [
    `# ${title}`,
    '',
    '> Product-generated during execution from authoritative durable records. This is not an after-the-fact narrative and excludes credentials, raw provider transport payloads, and private chain-of-thought.',
    '',
    ...(projection.origin ? renderOrigin(projection.origin) : []),
    `- Schema: \`agent-control.execution-transcript/v1\``,
    `- Job Run: \`${inline(projection.jobRunId)}\``,
    `- Saved Job: ${projection.savedJobId ? `\`${inline(projection.savedJobId)}\`` : 'none'}`,
    `- Job: ${inline(projection.jobName)}`,
    `- Status: \`${inline(run.status)}\``,
    `- Execution mode: \`${inline(run.executionMode ?? 'LIVE')}\`${run.executionMode === 'CONTROLLED_FAULT_INJECTION' ? ' — controlled qualification fault; not a naturally occurring provider failure' : run.executionMode === 'SIMULATED' ? ' — simulated/test data; not live execution' : ' — live/real execution'}`,
    `- Work Parcels: ${projection.workParcelIds.length ? projection.workParcelIds.map(id => `\`${inline(id)}\``).join(', ') : 'none yet'}`,
    `- Source retention: ${projection.retention.mode}; uncapped=${projection.retention.maximumEntries === null ? 'yes' : 'no'}`,
    '',
    '## Chronological execution record',
    '',
  ];
  projection.entries.forEach((entry, index) => lines.push(...renderEntry(entry, index + 1)));
  lines.push(
    '## Integrity and scope',
    '',
    `- Entries: ${projection.entries.length}`,
    '- Ordering: timestamp, then deterministic source-projection sequence; durable event identifiers are shown for traceability.',
    '- Authority: Job Run state, Work Parcel audit/provenance, model invocation ledger, token/governor lifecycle, and sealed baton records.',
    '- Deliberately excluded: credential values, authentication material, raw rejected provider payloads, and hidden/private model reasoning.',
    '- The adjacent JSON manifest records the SHA-256 of this complete Markdown document and its deterministic source projection.',
    '',
  );
  return `${lines.join('\n')}\n`;
}

function renderOrigin(origin: NonNullable<ExecutionHistoryProjection['origin']>) {
  const voice = origin.modality === 'voice-confirmed-by-text';
  return [
    '## Origin',
    '',
    `- Channel: \`${inline(origin.channel)}\``,
    `- Modality: \`${inline(origin.modality)}\``,
    `- Received: \`${inline(origin.receivedAt)}\``,
    `- Authentication: \`${inline(origin.authentication)}\``,
    `- Governed actor: \`${inline(origin.actorId)}\``,
    `- Authority: ${origin.authority.length ? origin.authority.map(value=>`\`${inline(value)}\``).join(', ') : 'none'}`,
    `- Identity reference: \`${inline(origin.identityReference)}\``,
    `- Message/audio reference: \`${inline(origin.messageReference)}\``,
    ...(origin.confirmationReference ? [`- Confirmation reference: \`${inline(origin.confirmationReference)}\``] : []),
    ...(voice ? ['- Transcription authority: untrusted speech recognition output; execution was authorized only by a separate authenticated text confirmation.'] : []),
    '',
    voice ? '## Authoritative retained transcription' : '## Authoritative initiating request',
    '',
    ...quote(origin.request),
    '',
  ];
}

function renderEntry(entry: ExecutionHistoryEntry, index: number) {
  const lines = [
    `### ${String(index).padStart(4, '0')} · ${inline(entry.at)} · ${inline(entry.type)}`,
    '',
    `- Event ID: \`${inline(entry.id)}\``,
    `- Actor: ${inline(entry.actor)}`,
    `- Outcome: \`${inline(entry.outcome)}\``,
    ...(entry.workParcelId ? [`- Work Parcel: \`${inline(entry.workParcelId)}\``] : []),
    ...(entry.route ? [`- Route: ${inline(entry.route)}`] : []),
    ...(entry.provider || entry.model ? [`- Provider/model: ${inline(entry.provider ?? 'unreported')} / ${inline(entry.accountLabel ?? 'default account')} / ${inline(entry.model ?? 'unreported')}`] : []),
    '',
    `**${inline(entry.title)}**`,
    '',
    ...quote(entry.content),
  ];
  if (entry.telemetry) {
    const value = entry.telemetry;
    lines.push('', '- Telemetry:', `  - Current context: ${amount(value.contextTokens)} / ${amount(value.contextLimitTokens)} tokens; ${value.contextPercent === null ? 'percentage unavailable' : `${value.contextPercent.toFixed(2)}%`}; ${value.contextAuthority}.`, `  - Lifetime: ${amount(value.inputTokens)} input (${amount(value.freshInputTokens)} fresh + ${amount(value.cachedInputTokens)} cached), ${amount(value.outputTokens)} output, ${amount(value.totalTokens)} total.`, `  - Cost: ${value.cost === null ? 'unavailable' : `${value.cost.toFixed(6)} ${inline(value.currency ?? '')}`.trim()}; ${value.costAuthority}.`, `  - Governor: ${inline(value.governorState ?? 'unavailable')}.`);
  }
  if (entry.evidenceRefs?.length) lines.push('', `- Evidence: ${entry.evidenceRefs.map(value => `\`${inline(value)}\``).join(', ')}`);
  lines.push('');
  return lines;
}

function quote(value: string) { return safeTranscriptText(value, 65_536).split('\n').map(line => `> ${line}`); }
function inline(value: string) { return safeHistoryText(value, 4_096).replace(/[`|]/g, '\\$&'); }
function amount(value: number | null) { return value === null ? 'unavailable' : value.toLocaleString('en-GB'); }
function digest(value: string) { return createHash('sha256').update(value).digest('hex'); }
function transcriptStem(id: string) { const safe = id.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 96) || 'run'; return `${safe}-${digest(id).slice(0, 12)}`; }
function writeIfChanged(file: string, content: string) { if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return; const temporary = `${file}.${process.pid}.tmp`; fs.writeFileSync(temporary, content, {mode: 0o600}); fs.renameSync(temporary, file); }
