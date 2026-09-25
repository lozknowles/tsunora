import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import type {JobFinding, ParameterizedJobRun, RepositoryReviewResult, ResolvedRepository} from './parameterized-job-types.js';
import {ParameterizedJobError} from './parameterized-job-registry.js';

const SECRET_PATH = /(^|\/)(?:\.env(?:\..*)?|\.git|\.npmrc|\.pypirc|\.netrc|id_(?:rsa|dsa|ecdsa|ed25519)|[^/]*\.(?:pem|p12|pfx|key)|(?:credentials?|secrets?)(?:\.[^/]*)?)(?:$|\/)/i;
const BINARY = /\.(?:png|jpe?g|gif|webp|ico|pdf|zip|gz|xz|bz2|7z|wasm|woff2?|ttf|mp[34]|mov)$/i;
const IMPORTANT = /(^|\/)(?:package\.json|Cargo\.toml|pyproject\.toml|go\.mod|Gemfile|pom\.xml|build\.gradle|Dockerfile|README(?:\.[^/]*)?|.*\.(?:ts|tsx|js|mjs|cjs|rs|py|go|java|kt|swift|rb|php|cs|cpp|c|h))$/i;
function git(cwd: string, args: string[]) { return execFileSync('git', ['-C', cwd, ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024}).trim(); }
function hash(value: string) { return createHash('sha256').update(value).digest('hex'); }

export interface RepositoryResolveRequest {nodeId: string; repository: string; requestedRef: string; comparisonSha?: string; allowedRoots: string[]; allowedRemotes?: string[]; snapshotsRoot?: string;}
export interface RepositoryResolver {resolve(input: RepositoryResolveRequest): ResolvedRepository | Promise<ResolvedRepository>;}
export class LocalRepositoryResolver implements RepositoryResolver {
  resolve(input: RepositoryResolveRequest): ResolvedRepository {
    if (!path.isAbsolute(input.repository)) return this.resolveRemote(input);
    let source: string; try { source = fs.realpathSync(input.repository); } catch { throw new ParameterizedJobError('repository_missing', input.repository); }
    const allowed = input.allowedRoots.map(root => { try { return fs.realpathSync(root); } catch { throw new ParameterizedJobError('repository_policy_root_missing', root); } });
    if (!allowed.some(root => source === root || source.startsWith(`${root}${path.sep}`))) throw new ParameterizedJobError('repository_path_outside_policy', source);
    try { if (git(source, ['rev-parse', '--is-inside-work-tree']) !== 'true') throw new Error(); } catch { throw new ParameterizedJobError('repository_not_git', source); }
    let reviewedSha: string; try { reviewedSha = git(source, ['rev-parse', '--verify', `${input.requestedRef}^{commit}`]); } catch { throw new ParameterizedJobError('repository_ref_unresolved', input.requestedRef); }
    if (!/^[0-9a-f]{40,64}$/.test(reviewedSha)) throw new ParameterizedJobError('repository_ref_unresolved', input.requestedRef);
    if (input.comparisonSha) { try { git(source, ['merge-base', '--is-ancestor', input.comparisonSha, reviewedSha]); } catch { throw new ParameterizedJobError('repository_comparison_not_ancestor', input.comparisonSha); } }
    const dirtyPaths = git(source, ['status', '--porcelain=v1', '--untracked-files=normal']).split('\n').filter(Boolean).map(line => line.slice(3));
    let remote: string | undefined; try { remote = git(source, ['remote', 'get-url', 'origin']); } catch { /* A local-only repository is valid. */ }
    const root = input.snapshotsRoot ?? fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-review-'));
    fs.mkdirSync(root, {recursive: true});
    const snapshotPath = path.join(root, `${path.basename(source)}-${reviewedSha.slice(0, 12)}-${randomUUID().slice(0, 8)}`);
    execFileSync('git', ['clone', '--quiet', '--no-checkout', '--shared', '--', source, snapshotPath], {stdio: 'pipe'});
    git(snapshotPath, ['checkout', '--quiet', '--detach', reviewedSha]);
    if (git(snapshotPath, ['rev-parse', 'HEAD']) !== reviewedSha || git(snapshotPath, ['status', '--porcelain'])) throw new ParameterizedJobError('repository_snapshot_verification_failed');
    try { makeReadOnly(snapshotPath); } catch (error) { fs.rmSync(snapshotPath, {recursive: true, force: true}); throw error; }
    return {identity: hash(`${remote ?? source}\n${git(source, ['rev-parse', '--show-toplevel'])}`), name: path.basename(source), nodeId: input.nodeId, sourcePath: source, ...(remote ? {remote} : {}), requestedRef: input.requestedRef, reviewedSha, dirty: dirtyPaths.length > 0, dirtyPaths, ...(input.comparisonSha ? {comparisonSha: input.comparisonSha} : {}), snapshotPath, snapshotKind: 'local-shared-clone'};
  }
  private resolveRemote(input: RepositoryResolveRequest): ResolvedRepository {
    let parsed: URL; try { parsed = new URL(input.repository); } catch { throw new ParameterizedJobError('repository_remote_invalid'); }
    if (!['https:', 'git:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new ParameterizedJobError('repository_remote_invalid');
    const remote = parsed.toString(), allowed = input.allowedRemotes ?? [];
    if (!allowed.some(prefix => remote === prefix || remote.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`))) throw new ParameterizedJobError('repository_remote_outside_policy', remote);
    const root = input.snapshotsRoot ?? fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-review-')); fs.mkdirSync(root, {recursive: true});
    const name = path.basename(parsed.pathname).replace(/\.git$/i, '') || parsed.hostname, snapshotPath = path.join(root, `${name}-${randomUUID().slice(0, 8)}`);
    try { execFileSync('git', ['clone', '--quiet', '--no-checkout', '--', remote, snapshotPath], {stdio: 'pipe', timeout: 120_000}); } catch { throw new ParameterizedJobError('repository_remote_clone_failed', parsed.hostname); }
    let reviewedSha: string; try { reviewedSha = git(snapshotPath, ['rev-parse', '--verify', `${input.requestedRef}^{commit}`]); } catch { try { reviewedSha = git(snapshotPath, ['rev-parse', '--verify', `origin/${input.requestedRef}^{commit}`]); } catch { throw new ParameterizedJobError('repository_ref_unresolved', input.requestedRef); } }
    if (input.comparisonSha) { try { git(snapshotPath, ['merge-base', '--is-ancestor', input.comparisonSha, reviewedSha]); } catch { throw new ParameterizedJobError('repository_comparison_not_ancestor', input.comparisonSha); } }
    git(snapshotPath, ['checkout', '--quiet', '--detach', reviewedSha]);
    try { makeReadOnly(snapshotPath); } catch (error) { fs.rmSync(snapshotPath, {recursive: true, force: true}); throw error; }
    return {identity: hash(remote), name, nodeId: input.nodeId, remote, requestedRef: input.requestedRef, reviewedSha, dirty: false, dirtyPaths: [], ...(input.comparisonSha ? {comparisonSha: input.comparisonSha} : {}), snapshotPath, snapshotKind: 'remote-clone'};
  }
}

function makeReadOnly(root: string) {
  const canonicalRoot = fs.realpathSync(root), entries: string[] = [];
  const inside = (candidate: string) => { const relative = path.relative(canonicalRoot, candidate); return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)); };
  const walk = (directory: string) => { for (const entry of fs.readdirSync(directory, {withFileTypes: true})) { const absolute = path.join(directory, entry.name); if (entry.isSymbolicLink()) { let target: string; try { target = fs.realpathSync(absolute); } catch { throw new ParameterizedJobError('repository_snapshot_symlink_unsafe', path.relative(root, absolute)); } if (!inside(target)) throw new ParameterizedJobError('repository_snapshot_symlink_unsafe', path.relative(root, absolute)); continue; } entries.push(absolute); if (entry.isDirectory()) walk(absolute); } };
  walk(root);
  for (const entry of entries.filter(value => !fs.lstatSync(value).isDirectory())) fs.chmodSync(entry, 0o400);
  for (const entry of entries.filter(value => fs.lstatSync(value).isDirectory()).sort((a, b) => b.length - a.length)) fs.chmodSync(entry, 0o500);
  fs.chmodSync(root, 0o500);
}
function listFiles(root: string, includeDirectories = false) {
  const output: string[] = [], walk = (directory: string) => { for (const entry of fs.readdirSync(directory, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) { if (entry.name === '.git') continue; const absolute = path.join(directory, entry.name), relative = path.relative(root, absolute); if (entry.isDirectory()) { if (includeDirectories) output.push(relative); walk(absolute); } else if (entry.isFile()) output.push(relative); } }; walk(root); return output;
}

export interface RepositoryContext {summary: ParameterizedJobRun['context']; chunks: Array<{id: string; content: string; files: string[]; sha256: string}>;}
export function buildRepositoryContext(repository: ResolvedRepository, profile: 'THIN' | 'STANDARD' | 'DEEP', maximumInputTokens?: number): RepositoryContext {
  const allTracked = repository.snapshotKind === 'remote-immutable-archive' ? listFiles(repository.snapshotPath) : git(repository.snapshotPath, ['ls-files', '-z']).split('\0').filter(Boolean), tracked = allTracked.filter(file => !SECRET_PATH.test(file) && !BINARY.test(file));
  const changedFiles = repository.comparisonSha ? git(repository.snapshotPath, ['diff', '--name-only', `${repository.comparisonSha}..${repository.reviewedSha}`, '--']).split('\n').filter(Boolean).filter(file => tracked.includes(file)) : [];
  const selected = selectFiles(tracked, changedFiles, profile), profileByteLimit = {THIN: 192_000, STANDARD: 768_000, DEEP: 2_000_000}[profile], byteLimit = Math.min(profileByteLimit, maximumInputTokens ? maximumInputTokens * 4 : profileByteLimit), chunks: RepositoryContext['chunks'] = [];
  let current = '', currentFiles: string[] = [], total = 0;
  const flush = () => { if (!current) return; const sha256 = hash(current); chunks.push({id: `context-${chunks.length + 1}-${sha256.slice(0, 12)}`, content: current, files: currentFiles, sha256}); current = ''; currentFiles = []; };
  const tree = tracked.join('\n'), diff = repository.comparisonSha ? git(repository.snapshotPath, ['diff', '--no-ext-diff', '--unified=40', `${repository.comparisonSha}..${repository.reviewedSha}`, '--', ...changedFiles]) : '';
  for (const [name, content] of [['__repository_tree__', tree], ...(diff ? [['__review_diff__', diff]] : []), ...selected.map(file => [file, readText(path.join(repository.snapshotPath, file))])]) {
    if (!content) continue; const section = `\n===== ${name} =====\n${content}\n`;
    if (section.length > 96_000) { flush(); for (let index = 0; index < section.length && total < byteLimit; index += 96_000) { const piece = section.slice(index, index + 96_000), sha256 = hash(piece); chunks.push({id: `context-${chunks.length + 1}-${sha256.slice(0, 12)}`, content: piece, files: [name], sha256}); total += piece.length; } continue; }
    if (current.length + section.length > 96_000) flush(); if (total + section.length > byteLimit) break; current += section; currentFiles.push(name); total += section.length;
  }
  flush();
  const represented = new Set(chunks.flatMap(chunk => chunk.files).filter(file => !file.startsWith('__'))), omittedFiles = allTracked.filter(file => !represented.has(file));
  return {summary: {profile, files: [...represented], changedFiles, omittedFiles, chunks: chunks.map(({id, files, sha256}) => ({id, files, sha256})), truncated: omittedFiles.length > 0}, chunks};
}

function selectFiles(files: string[], changed: string[], profile: 'THIN' | 'STANDARD' | 'DEEP') { const important = files.filter(file => IMPORTANT.test(file)), ordered = [...new Set([...changed, ...important, ...(profile === 'DEEP' ? files : [])])]; return ordered.slice(0, profile === 'THIN' ? 80 : profile === 'STANDARD' ? 400 : 2_000); }
function readText(file: string) { const value = fs.readFileSync(file); if (value.includes(0)) return ''; return value.toString('utf8'); }

export function validateRepositoryReview(result: RepositoryReviewResult, repository: ResolvedRepository) {
  if (result.schema !== 'agent-control.repository-review/v1' || !Array.isArray(result.findings) || !result.executiveSummary?.trim()) throw new ParameterizedJobError('repository_review_schema_invalid');
  const seen = new Set<string>(), accepted: JobFinding[] = [];
  for (const finding of result.findings) {
    const reasons: string[] = [], key = `${finding.file ?? ''}:${finding.startLine ?? ''}:${finding.title.toLowerCase()}`;
    if (seen.has(key)) reasons.push('duplicate_finding'); else seen.add(key);
    if (!finding.evidence?.trim()) reasons.push('evidence_missing');
    if (!(finding.confidence >= 0 && finding.confidence <= 1)) reasons.push('confidence_invalid');
    if (finding.file) {
      const normalized = path.normalize(finding.file); if (path.isAbsolute(normalized) || normalized.startsWith('..') || SECRET_PATH.test(normalized)) reasons.push('path_invalid');
      else { const file = path.join(repository.snapshotPath, normalized); if (!fs.existsSync(file) || !fs.statSync(file).isFile()) reasons.push('file_missing'); else if (finding.startLine) { const lines = fs.readFileSync(file, 'utf8').split('\n').length; if (finding.startLine < 1 || finding.startLine > lines || finding.endLine && (finding.endLine < finding.startLine || finding.endLine > lines)) reasons.push('line_range_invalid'); } }
    }
    finding.validation = {state: reasons.length ? 'REJECTED' : 'VALID', reasons}; if (!reasons.length) accepted.push(finding);
  }
  result.findings = accepted;
  if (result.verdict === 'PASS' && accepted.length) result.verdict = 'PASS_WITH_FINDINGS';
  if (result.verdict === 'PASS_WITH_FINDINGS' && !accepted.length) result.verdict = 'PASS';
  return result;
}

interface BaselineState {version: 1; entries: Record<string, {sha: string; runId: string; completedAt: string}>;}
export class ReviewBaselineStore {
  private state: BaselineState = {version: 1, entries: {}};
  constructor(readonly file: string) { if (fs.existsSync(file)) this.state = JSON.parse(fs.readFileSync(file, 'utf8')) as BaselineState; }
  key(savedJobId: string, repositoryIdentity: string, ref: string) { return hash(`${savedJobId}\n${repositoryIdentity}\n${ref}`); }
  get(savedJobId: string, repositoryIdentity: string, ref: string) { return this.state.entries[this.key(savedJobId, repositoryIdentity, ref)]; }
  advance(savedJobId: string, repository: ResolvedRepository, runId: string, completedAt: string) { this.state.entries[this.key(savedJobId, repository.identity, repository.requestedRef)] = {sha: repository.reviewedSha, runId, completedAt}; fs.mkdirSync(path.dirname(this.file), {recursive: true}); const temporary = `${this.file}.${process.pid}.tmp`; fs.writeFileSync(temporary, `${JSON.stringify(this.state, null, 2)}\n`, {mode: 0o600}); fs.renameSync(temporary, this.file); }
}
