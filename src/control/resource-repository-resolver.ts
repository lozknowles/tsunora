import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import type {ResourceConfig} from './config.js';
import {executeSsh, sshResourceArgs, type SshExecutor} from './managed-node-ssh.js';
import type {ResolvedRepository} from './parameterized-job-types.js';
import {ParameterizedJobError} from './parameterized-job-registry.js';
import {LocalRepositoryResolver, type RepositoryResolveRequest, type RepositoryResolver} from './repository-review-runtime.js';

type SnapshotWireResult = {schema: 'agent-control.repository-snapshot-result/v1'; ok: boolean; nodeId?: string; sourceIdentity?: string; reviewedSha?: string; dirty?: boolean; dirtyFingerprint?: string; archiveSha256?: string; archiveBase64?: string; createdAt?: string; error?: string};
const BOOTSTRAP = ['$ErrorActionPreference = "Stop"', '$payload = [Console]::In.ReadLine()', '$source = [Console]::In.ReadToEnd()', '& ([ScriptBlock]::Create($source)) $payload', ''].join('\n');

export class ResourceRepositoryResolver implements RepositoryResolver {
  private readonly resources: Map<string, ResourceConfig>;
  private readonly script: string;
  constructor(resources: ResourceConfig[], private readonly local = new LocalRepositoryResolver(), private readonly executor: SshExecutor = executeSsh, scriptSource?: string) {
    this.resources = new Map(resources.map(resource => [resource.id, structuredClone(resource)]));
    this.script = scriptSource ?? fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../scripts/repository-snapshot-windows.ps1'), 'utf8');
  }
  async resolve(input: RepositoryResolveRequest): Promise<ResolvedRepository> {
    const resource = this.resources.get(input.nodeId); if (!resource) throw new ParameterizedJobError('repository_node_missing', input.nodeId);
    if (resource.transport.type === 'local') return this.local.resolve(input);
    if (resource.platform !== 'windows' || resource.transport.type !== 'ssh') throw new ParameterizedJobError('repository_snapshot_transport_unsupported', input.nodeId);
    if (input.comparisonSha) throw new ParameterizedJobError('remote_repository_comparison_unsupported');
    const encoded = Buffer.from(JSON.stringify({operation: 'freezeGitRepository', nodeId: input.nodeId, repository: input.repository, requestedRef: input.requestedRef, allowedRoots: input.allowedRoots}), 'utf8').toString('base64');
    const bootstrap = Buffer.from(BOOTSTRAP, 'utf16le').toString('base64');
    let result;
    try { result = await this.executor('ssh', sshResourceArgs(resource, ['powershell.exe', '-NoProfile', '-NonInteractive', '-EncodedCommand', bootstrap]), `${encoded}\n${this.script.trimEnd()}\n`, {timeoutMs: 180_000, maxBytes: 64 * 1024 * 1024}); }
    catch { throw new ParameterizedJobError('repository_snapshot_transport_failed'); }
    if (result.timedOut) throw new ParameterizedJobError('repository_snapshot_timeout');
    if (result.aborted) throw new ParameterizedJobError('repository_snapshot_cancelled');
    if (result.status !== 0) throw new ParameterizedJobError('repository_snapshot_transport_failed');
    let wire: SnapshotWireResult; try { wire = JSON.parse(result.stdout.trim()) as SnapshotWireResult; } catch { throw new ParameterizedJobError('repository_snapshot_result_invalid'); }
    if (wire.schema !== 'agent-control.repository-snapshot-result/v1' || !wire.ok) throw new ParameterizedJobError(safeError(wire.error));
    if (wire.nodeId !== input.nodeId || wire.sourceIdentity !== remoteSourceIdentity(input.nodeId, input.repository) || !gitHash(wire.reviewedSha) || !sha256(wire.archiveSha256) || typeof wire.archiveBase64 !== 'string' || wire.archiveBase64.length > 64 * 1024 * 1024) throw new ParameterizedJobError('repository_snapshot_result_invalid');
    const archive = Buffer.from(wire.archiveBase64, 'base64'); if (!archive.length || createHash('sha256').update(archive).digest('hex') !== wire.archiveSha256) throw new ParameterizedJobError('repository_snapshot_hash_mismatch');
    let archiveCommit: string;
    try { archiveCommit = execFileSync('git', ['get-tar-commit-id'], {input: archive, encoding: 'utf8', maxBuffer: 1024}).trim(); }
    catch { throw new ParameterizedJobError('repository_snapshot_revision_unbound'); }
    if (archiveCommit !== wire.reviewedSha) throw new ParameterizedJobError('repository_snapshot_revision_mismatch');
    const root = input.snapshotsRoot ?? path.resolve('.agent-control/parameterized-jobs/snapshots'); fs.mkdirSync(root, {recursive: true});
    const snapshotPath = path.join(root, `remote-${wire.reviewedSha.slice(0, 12)}-${randomUUID().slice(0, 8)}`), archivePath = `${snapshotPath}.tar`;
    fs.mkdirSync(snapshotPath, {recursive: true}); fs.writeFileSync(archivePath, archive, {mode: 0o400});
    try {
      const entries = execFileSync('tar', ['-tf', archivePath], {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024}).split(/\r?\n/).filter(Boolean);
      if (entries.length > 100_000 || entries.some(entry => path.isAbsolute(entry) || entry.split(/[\\/]/).includes('..'))) throw new Error('unsafe');
      execFileSync('tar', ['-xf', archivePath, '-C', snapshotPath], {stdio: 'pipe'});
      makeReadOnly(snapshotPath);
    } catch {
      fs.rmSync(snapshotPath, {recursive: true, force: true});
      fs.rmSync(archivePath, {force: true});
      throw new ParameterizedJobError('repository_snapshot_archive_invalid');
    }
    return {identity: wire.sourceIdentity, name: `remote-${wire.reviewedSha.slice(0, 12)}`, nodeId: input.nodeId, requestedRef: input.requestedRef, reviewedSha: wire.reviewedSha, dirty: wire.dirty === true, dirtyPaths: [], dirtyFingerprint: wire.dirtyFingerprint, snapshotPath, snapshotKind: 'remote-immutable-archive', bundleSha256: wire.archiveSha256, bundlePath: archivePath};
  }
}

function gitHash(value: unknown): value is string { return typeof value === 'string' && (/^[a-f0-9]{40}$/i.test(value) || /^[a-f0-9]{64}$/i.test(value)); }
function sha256(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value); }
function remoteSourceIdentity(nodeId: string, repository: string) {
  if (!path.win32.isAbsolute(repository)) throw new ParameterizedJobError('repository_path_invalid');
  const normalized = path.win32.normalize(repository).replace(/[\\/]+$/, '').toLowerCase();
  return createHash('sha256').update(`${nodeId}\n${normalized}`).digest('hex');
}
function safeError(value: unknown) { return typeof value === 'string' && /^repository_[a-z0-9_]+$/.test(value) ? value : 'repository_snapshot_failed'; }
function makeReadOnly(root: string) {
  const walk = (directory: string): string[] => fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry => {
    const absolute = path.join(directory,entry.name);
    if (entry.isSymbolicLink()) {
      const target = path.resolve(path.dirname(absolute), fs.readlinkSync(absolute));
      if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error('repository_snapshot_symlink_escape');
      return [absolute];
    }
    return entry.isDirectory() ? [absolute,...walk(absolute)] : [absolute];
  });
  const entries=walk(root);
  for(const entry of entries.filter(value=>!fs.lstatSync(value).isDirectory() && !fs.lstatSync(value).isSymbolicLink())) fs.chmodSync(entry,0o400);
  for(const entry of entries.filter(value=>fs.lstatSync(value).isDirectory()).sort((a,b)=>b.length-a.length)) fs.chmodSync(entry,0o500);
  fs.chmodSync(root,0o500);
}
