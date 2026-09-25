import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const SOURCE_DISTRIBUTION_POLICY = Object.freeze({
  maximumTrackedFileBytes: 1_000_000,
  externalEvidenceRelease:
    'https://github.com/lozknowles/agent-control-qualification-evidence/releases/tag/source-separation-20260912',
});

const evidenceMedia = /\.(?:mp4|webm|mov|avi|png|jpe?g|gif|wav|mp3|m4a|zip|tar|tar\.zst|gz|7z)$/i;

export function classifySourceDistributionPath(file, size) {
  const normalized = file.replaceAll('\\', '/').replace(/^\.\//, '');
  const reasons = [];
  if (normalized === 'qualification' || normalized.startsWith('qualification/')) reasons.push('qualification-tree');
  if (normalized === 'docs/images' || normalized.startsWith('docs/images/')) reasons.push('dashboard-evidence-media');
  if (normalized.startsWith('docs/evidence/') && evidenceMedia.test(normalized)) reasons.push('binary-qualification-evidence');
  if (size > SOURCE_DISTRIBUTION_POLICY.maximumTrackedFileBytes) reasons.push('oversized-tracked-object');
  return reasons;
}

export function inspectSourceDistribution(repositoryRoot) {
  let tracked;
  try {
    tracked = execFileSync('git', ['-C', repositoryRoot, 'ls-files', '-z'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).split('\0').filter(Boolean);
  } catch {
    // Source archives have no .git. Inspect their actual payload while omitting
    // dependency installation and local runtime state created after extraction.
    const ignored = new Set(['.git', 'node_modules', '.agent-control']);
    const walk = directory => fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
      if (ignored.has(entry.name)) return [];
      const absolute = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(absolute) : [path.relative(repositoryRoot, absolute).replaceAll('\\', '/')];
    });
    tracked = walk(repositoryRoot);
  }
  const violations = [];
  let totalBytes = 0;
  for (const file of tracked) {
    const absolute = path.join(repositoryRoot, file);
    if (!fs.existsSync(absolute)) continue;
    const size = fs.lstatSync(absolute).size;
    totalBytes += size;
    const reasons = classifySourceDistributionPath(file, size);
    if (reasons.length > 0) violations.push({file, size, reasons});
  }
  return {
    schema: 'agent-control.source-distribution-check/v1',
    repositoryRoot,
    trackedFiles: tracked.length,
    trackedBytes: totalBytes,
    maximumTrackedFileBytes: SOURCE_DISTRIBUTION_POLICY.maximumTrackedFileBytes,
    externalEvidenceRelease: SOURCE_DISTRIBUTION_POLICY.externalEvidenceRelease,
    violations,
    ok: violations.length === 0,
  };
}

const invoked = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invoked) {
  const repositoryRoot = path.resolve(process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url)));
  const result = inspectSourceDistribution(repositoryRoot);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
