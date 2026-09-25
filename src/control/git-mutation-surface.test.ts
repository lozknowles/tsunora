import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {changedIgnoredPaths, inspectGitIgnoredState, inspectGitMutationSurface} from './git-mutation-surface.js';

function git(root: string, ...args: string[]) { return execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim(); }
function repository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-mutation-surface-'));
  git(root, 'init', '-q', '-b', 'main'); git(root, 'config', 'user.email', 'test@example.invalid'); git(root, 'config', 'user.name', 'Agent Control Test');
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'original\n'); fs.writeFileSync(path.join(root, 'renamed.txt'), 'rename me\n'); fs.writeFileSync(path.join(root, 'deleted.txt'), 'delete me\n'); fs.writeFileSync(path.join(root, '.gitignore'), 'ignored.tmp\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'fixture'); return root;
}

test('complete Git mutation surface includes tracked, staged, deleted, renamed and untracked paths but excludes ignored files', async t => {
  const root = repository(); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'changed\n');
  git(root, 'mv', 'renamed.txt', 'renamed destination.txt');
  fs.unlinkSync(path.join(root, 'deleted.txt'));
  fs.writeFileSync(path.join(root, 'in scope.txt'), 'new line\n');
  fs.writeFileSync(path.join(root, 'outside-[scope].txt'), 'first\nsecond\n');
  fs.writeFileSync(path.join(root, 'ignored.tmp'), 'transient\n');
  const surface = await inspectGitMutationSurface(root);
  assert.deepEqual(surface.touchedFiles, ['deleted.txt', 'in scope.txt', 'outside-[scope].txt', 'renamed destination.txt', 'renamed.txt', 'tracked.txt']);
  assert.deepEqual(surface.untrackedFiles, ['in scope.txt', 'outside-[scope].txt']);
  assert.equal(surface.touchedFiles.includes('ignored.tmp'), false);
  assert.ok(surface.changedLines >= 6);
  assert.match(surface.sha256, /^[a-f0-9]{64}$/);
});

test('staged additions and unusual filenames are parsed without line-oriented filename splitting', async t => {
  const root = repository(); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const unusual = 'line break\nand spaces.txt';
  fs.writeFileSync(path.join(root, unusual), 'safe\n'); git(root, 'add', unusual);
  const surface = await inspectGitMutationSurface(root);
  assert.deepEqual(surface.touchedFiles, [unusual]);
  assert.deepEqual(surface.untrackedFiles, []);
  assert.equal(surface.changedLines, 1);
});

test('ignored state is preserved unless its root is explicitly disposable', async t => {
  const root = repository(); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.writeFileSync(path.join(root, 'ignored.tmp'), 'valuable operator state\n');
  fs.mkdirSync(path.join(root, 'node_modules')); fs.writeFileSync(path.join(root, 'node_modules', 'cache.bin'), 'disposable\n');
  fs.appendFileSync(path.join(root, '.gitignore'), 'node_modules/\n'); git(root, 'add', '.gitignore'); git(root, 'commit', '-qm', 'ignore dependencies');
  const before = await inspectGitIgnoredState(root, ['node_modules']);
  fs.writeFileSync(path.join(root, 'ignored.tmp'), 'changed operator state\n'); fs.writeFileSync(path.join(root, 'node_modules', 'cache.bin'), 'changed disposable state\n');
  const after = await inspectGitIgnoredState(root, ['node_modules']);
  assert.deepEqual(changedIgnoredPaths(before, after), ['ignored.tmp']);
  assert.equal(after.entries.some(item => item.path.startsWith('node_modules/')), false);
});

test('disposable ignored roots reject traversal and absolute paths', async t => {
  const root = repository(); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  await assert.rejects(inspectGitIgnoredState(root, ['../outside']), /disposable_root_invalid/);
  await assert.rejects(inspectGitIgnoredState(root, ['/tmp']), /disposable_root_invalid/);
});
