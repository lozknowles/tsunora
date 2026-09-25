import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repositoryRoot = path.resolve(import.meta.dirname, '..');

test('tracked Markdown local links resolve inside the source distribution', () => {
  const files = execFileSync('git', ['-C', repositoryRoot, 'ls-files', '*.md'], {encoding: 'utf8'})
    .trim().split('\n').filter(Boolean);
  const broken = [];
  for (const file of files) {
    const source = fs.readFileSync(path.join(repositoryRoot, file), 'utf8');
    const links = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+['"][^'"]*['"])?\)/g;
    let match;
    while ((match = links.exec(source))) {
      const href = match[1].replace(/^<|>$/g, '');
      if (/^(?:https?:|mailto:|#|data:)/.test(href)) continue;
      let target;
      try {
        target = decodeURIComponent(href.split('#')[0]);
      } catch {
        broken.push(`${file}: invalid URI ${href}`);
        continue;
      }
      if (!target) continue;
      const absolute = path.resolve(repositoryRoot, path.dirname(file), target);
      if (!fs.existsSync(absolute)) broken.push(`${file}: ${href}`);
    }
  }
  assert.deepEqual(broken, []);
});
