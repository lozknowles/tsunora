import fs from 'node:fs';
import path from 'node:path';
import {ContextPacketBuilder, type ContextPacket, type ContextPacketSource, type HarnessProfileName} from './harness-efficiency.js';
import type {MutationBenchmarkSuite, MutationBenchmarkTask} from './harness-mutation-benchmark.js';
import {MUTATION_TOOL_SCHEMAS} from './harness-mutation-workspace.js';

export interface MutationCheckpointContext {
  priorProfile: HarnessProfileName;
  reason: string;
  changedFiles: string[];
  diffSha256: string;
  verifierFailures: string[];
}

export function buildMutationContextSources(suite: MutationBenchmarkSuite, task: MutationBenchmarkTask, fixtureRoot: string, checkpoint?: MutationCheckpointContext): ContextPacketSource[] {
  const provenance = (suffix: string) => [`mutation-suite:${suite.suiteId}`, `mutation-task:${task.id}`, suffix];
  const repositoryFiles = listFiles(fixtureRoot);
  const targetedFiles = task.allowedFiles.filter(file => fs.existsSync(path.join(fixtureRoot, file))).slice(0, 3);
  const targeted = targetedFiles.map(file => `FILE ${file}\n${boundedFile(path.join(fixtureRoot, file), 12_000)}`).join('\n\n');
  const publicTests = boundedFile(path.join(fixtureRoot, 'test', 'runtime.test.js'), 12_000);
  const architecture = `${boundedFile(path.join(fixtureRoot, 'README.md'), 12_000)}\n\n${boundedFile(path.join(fixtureRoot, 'ARCHITECTURE.md'), 18_000)}`;
  const graph = dependencyGraph(fixtureRoot, repositoryFiles.filter(file => file.startsWith('src/')));
  const sources: ContextPacketSource[] = [
    {id: `${task.id}:system`, kind: 'system_instructions', content: 'Perform a real bounded repository mutation. Inspect evidence, use only typed tools, run public tests when practical, and stop without claiming independent verification.', required: true, persistent: true, relevance: 1, provenanceIds: provenance('instructions:system')},
    {id: `${task.id}:control`, kind: 'agent_control_instructions', content: 'Agent Control retains scheduling, ToolPolicy, leases, ownership, cancellation, human takeover and verifier acceptance. Never modify a file outside the task scope.', required: true, persistent: true, relevance: 1, provenanceIds: provenance('policy:control')},
    {id: `${task.id}:tools`, kind: 'tool_schemas', content: JSON.stringify(MUTATION_TOOL_SCHEMAS), required: true, persistent: true, relevance: 1, provenanceIds: provenance('tools:typed-mutation-v1')},
    {id: `${task.id}:repository-rules`, kind: 'repository_instructions', content: 'This is a disposable frozen JavaScript repository. Use forward-slash relative paths. Do not edit package metadata unless explicitly allowed. Do not add dependencies, credentials, machine names, network addresses or provider/model conditionals. Existing public tests must continue to pass.', required: true, persistent: true, relevance: 1, provenanceIds: provenance('repository:frozen-rules')},
    {id: `${task.id}:task`, kind: 'task_context', content: `Task ${task.id} (${task.taskClass})\n${task.description}\nAllowed mutation paths: ${task.allowedFiles.join(', ')}\nRequired changed paths: ${task.requiredChangedFiles.join(', ')}\nAcceptance criteria:\n- ${task.acceptance.join('\n- ')}\nThe independent hidden verifier is not model-visible.`, required: true, persistent: false, relevance: 1, provenanceIds: provenance(`task:${task.verifierId}`)},
    {id: `${task.id}:targeted-files`, kind: 'task_context', content: targeted || 'No allowed target exists yet; inspect adjacent tests and source with bounded read/search before creating it.', relevance: .98, persistent: false, provenanceIds: provenance(`targeted:${targetedFiles.join(',') || 'new-file'}`)},
    {id: `${task.id}:workspace-index`, kind: 'workspace_bootstrap', content: `Frozen repository file index:\n${repositoryFiles.join('\n')}`, relevance: .82, persistent: true, provenanceIds: provenance('workspace:file-index')},
    {id: `${task.id}:public-tests`, kind: 'memory_shared_context', content: `Existing public regression style and contracts:\n${publicTests}`, relevance: .86, persistent: true, provenanceIds: provenance('tests:public')},
    {id: `${task.id}:architecture`, kind: 'repository_instructions', content: architecture, broad: true, relevance: task.features.architecturalTerms || task.features.sharedContextRequired ? .99 : .55, persistent: true, provenanceIds: provenance('docs:architecture')},
    {id: `${task.id}:dependency-graph`, kind: 'other', content: graph, broad: true, relevance: task.features.repositorySearchRequired ? .94 : .45, persistent: true, provenanceIds: provenance('graph:static-imports')},
  ];
  if (checkpoint) sources.push({id: `${task.id}:checkpoint:${checkpoint.priorProfile}`, kind: 'conversation_history', content: `A governed prior ${checkpoint.priorProfile} attempt did not verify. Classified escalation reason: ${checkpoint.reason}. Existing changed files: ${checkpoint.changedFiles.join(', ') || 'none'}. Checkpoint diff SHA-256: ${checkpoint.diffSha256}. Failed verifier checks: ${checkpoint.verifierFailures.join('; ') || 'none recorded'}. Inspect and repair the current workspace; do not blindly repeat the prior strategy.`, required: true, persistent: false, relevance: 1, provenanceIds: provenance(`checkpoint:${checkpoint.diffSha256}`)});
  return sources;
}

export function buildMutationContextPacket(profile: HarnessProfileName, sources: ContextPacketSource[], availableContextTokens: number): ContextPacket {
  return new ContextPacketBuilder().build(profile, sources, {availableContextTokens});
}

export function selectMutationPacketSources(packet: ContextPacket, sources: ContextPacketSource[]): ContextPacketSource[] {
  const byId = new Map(sources.map(source => [source.id, source]));
  return packet.sourceIds.map(id => {
    const source = byId.get(id);
    if (!source) throw new Error(`mutation_context_source_missing:${id}`);
    return structuredClone(source);
  });
}

export function renderMutationInstruction(task: MutationBenchmarkTask, profile: HarnessProfileName, checkpoint?: MutationCheckpointContext): string {
  return `Execute mutation task ${task.id} in the current disposable repository using profile ${profile}. This is an actual repository change, not a prose answer. Inspect before editing, remain inside the allowlisted paths, run the typed public-test tool when practical, then request mutation.finish. ${checkpoint ? `A prior attempt exists in the workspace; repair it using the classified checkpoint rather than restarting blindly.` : ''}`;
}

function listFiles(root: string): string[] {
  const walk = (directory: string): string[] => fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    if (['.git', 'node_modules'].includes(entry.name) || entry.isSymbolicLink()) return [];
    const child = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(child) : entry.isFile() ? [path.relative(root, child).split(path.sep).join('/')] : [];
  });
  return walk(root).sort();
}

function boundedFile(file: string, maximumBytes: number) {
  const content = fs.readFileSync(file, 'utf8');
  return Buffer.byteLength(content, 'utf8') <= maximumBytes ? content : `${Buffer.from(content, 'utf8').subarray(0, maximumBytes).toString('utf8')}\n[bounded]`;
}

function dependencyGraph(root: string, files: string[]) {
  const edges: string[] = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of content.matchAll(/from\s+['"](\.\.?\/[^'"]+)['"]/g)) edges.push(`${file} DEPENDS_ON ${path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]))}`);
  }
  return `Compact static import neighbourhood:\n${edges.sort().join('\n') || '(no imports)'}`;
}
