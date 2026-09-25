import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface GitMutationEntry {
  path: string;
  indexStatus: string;
  worktreeStatus: string;
  kind: 'tracked' | 'untracked';
}

export interface GitMutationSurface {
  entries: GitMutationEntry[];
  touchedFiles: string[];
  untrackedFiles: string[];
  changedLines: number;
  sha256: string;
}

export interface IgnoredFileState {path: string; kind: 'file' | 'symlink'; size: number; sha256: string;}
export interface GitIgnoredState {entries: IgnoredFileState[]; sha256: string; disposableRoots: string[];}

/**
 * Captures the complete non-ignored working-tree mutation surface. Git's
 * NUL-delimited porcelain format is the authority for paths, including rename
 * source/destination pairs and names containing whitespace or control bytes.
 */
export async function inspectGitMutationSurface(root: string): Promise<GitMutationSurface> {
  const status = await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignored=no']);
  const entries = parsePorcelainV1Z(status);
  const trackedDiff = await git(root, ['diff', 'HEAD', '--binary', '--']);
  const numstat = await git(root, ['diff', 'HEAD', '--numstat', '-z', '--']);
  let changedLines = parseNumstatZ(numstat);
  const untrackedFiles = entries.filter(entry => entry.kind === 'untracked').map(entry => entry.path);
  const untrackedManifest: Array<{path: string; kind: 'file' | 'symlink'; size: number; sha256: string}> = [];
  for (const relative of untrackedFiles) {
    const absolute = path.join(root, relative), stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) {
      const target = Buffer.from(fs.readlinkSync(absolute));
      changedLines += 1_000_000;
      untrackedManifest.push({path: relative, kind: 'symlink', size: target.length, sha256: createHash('sha256').update(target).digest('hex')});
      continue;
    }
    const content = fs.readFileSync(absolute);
    changedLines += textLines(content);
    untrackedManifest.push({path: relative, kind: 'file', size: content.length, sha256: createHash('sha256').update(content).digest('hex')});
  }
  untrackedManifest.sort((a, b) => a.path.localeCompare(b.path));
  const touchedFiles = [...new Set(entries.map(entry => entry.path))].sort();
  const digest = createHash('sha256').update(trackedDiff).update('\0').update(JSON.stringify(untrackedManifest)).digest('hex');
  return {entries, touchedFiles, untrackedFiles: [...untrackedFiles].sort(), changedLines, sha256: digest};
}

/**
 * Captures ignored files which must survive an execution. Callers must name
 * disposable roots explicitly; ignored does not mean disposable. The bounded
 * content digest makes silent mutation visible without deleting or restoring
 * operator state.
 */
export async function inspectGitIgnoredState(root: string, disposableRoots: string[] = []): Promise<GitIgnoredState> {
  const canonicalRoot = fs.realpathSync.native(root);
  const normalizedDisposable = disposableRoots.map(normalizeDisposableRoot);
  const listed = await git(canonicalRoot, ['ls-files', '--others', '--ignored', '--exclude-standard', '-z']);
  const paths = listed.toString('utf8').split('\0').filter(Boolean).filter(relative => !normalizedDisposable.some(prefix => relative === prefix || relative.startsWith(`${prefix}/`))).sort();
  const entries: IgnoredFileState[] = []; let bytes = 0;
  for (const relative of paths) {
    const absolute = path.resolve(canonicalRoot, relative), parent = fs.realpathSync.native(path.dirname(absolute));
    if (path.relative(canonicalRoot, parent).startsWith('..')) throw new Error('ignored_state_path_escaped_repository');
    const stat = fs.lstatSync(absolute);
    const content = stat.isSymbolicLink() ? Buffer.from(fs.readlinkSync(absolute)) : fs.readFileSync(absolute);
    bytes += content.length; if (bytes > 64 * 1024 * 1024) throw new Error('ignored_state_capture_limit_exceeded');
    entries.push({path: relative, kind: stat.isSymbolicLink() ? 'symlink' : 'file', size: content.length, sha256: createHash('sha256').update(content).digest('hex')});
  }
  return {entries, sha256: createHash('sha256').update(JSON.stringify(entries)).digest('hex'), disposableRoots: normalizedDisposable};
}

export function changedIgnoredPaths(before: GitIgnoredState, after: GitIgnoredState) {
  const left = new Map(before.entries.map(item => [item.path, `${item.kind}:${item.size}:${item.sha256}`])), right = new Map(after.entries.map(item => [item.path, `${item.kind}:${item.size}:${item.sha256}`]));
  return [...new Set([...left.keys(), ...right.keys()].filter(item => left.get(item) !== right.get(item)))].sort();
}

function normalizeDisposableRoot(value: string) {
  const normalized = value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
  if (!normalized || normalized.startsWith('/') || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) throw new Error('ignored_state_disposable_root_invalid');
  return normalized;
}

export function parsePorcelainV1Z(value: Buffer): GitMutationEntry[] {
  const fields = value.toString('utf8').split('\0');
  const entries: GitMutationEntry[] = [];
  for (let index = 0; index < fields.length; index++) {
    const field = fields[index];
    if (!field) continue;
    if (field.length < 4 || field[2] !== ' ') throw new Error('git_status_porcelain_invalid');
    const indexStatus = field[0], worktreeStatus = field[1], currentPath = field.slice(3);
    if (indexStatus === '?' && worktreeStatus === '?') {
      entries.push({path: currentPath, indexStatus, worktreeStatus, kind: 'untracked'});
      continue;
    }
    entries.push({path: currentPath, indexStatus, worktreeStatus, kind: 'tracked'});
    if (indexStatus === 'R' || indexStatus === 'C' || worktreeStatus === 'R' || worktreeStatus === 'C') {
      const originalPath = fields[++index];
      if (!originalPath) throw new Error('git_status_rename_origin_missing');
      entries.push({path: originalPath, indexStatus, worktreeStatus, kind: 'tracked'});
    }
  }
  return entries;
}

function parseNumstatZ(value: Buffer) {
  let total = 0;
  for (const field of value.toString('utf8').split('\0')) {
    const match = /^(\d+|-)\t(\d+|-)\t/.exec(field);
    if (!match) continue;
    total += match[1] === '-' || match[2] === '-' ? 1_000_000 : Number(match[1]) + Number(match[2]);
  }
  return total;
}

function textLines(value: Buffer) {
  if (value.includes(0)) return 1_000_000;
  if (!value.length) return 0;
  let lines = value[value.length - 1] === 10 ? 0 : 1;
  for (const byte of value) if (byte === 10) lines++;
  return lines;
}

function git(root: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {cwd: root, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
    const stdout: Buffer[] = [], stderr: Buffer[] = [];
    let size = 0;
    child.stdout.on('data', value => { size += value.length; if (size <= 32 * 1024 * 1024) stdout.push(value); else child.kill(); });
    child.stderr.on('data', value => stderr.push(value));
    child.once('error', reject);
    child.once('close', code => code === 0 && size <= 32 * 1024 * 1024 ? resolve(Buffer.concat(stdout)) : reject(new Error(`git_mutation_surface_failed:${code ?? -1}:${Buffer.concat(stderr).toString('utf8').trim().slice(0, 240)}`)));
  });
}
