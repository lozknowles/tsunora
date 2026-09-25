#!/usr/bin/env node
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {LocalCommandExecutor, RipgrepSearchRunner} from '../src/control/repository-search.js';
import {MemoryCommandResultStore, TokenAwareOutputService, estimateTokens, type OutputAuthorityScope} from '../src/control/token-aware-output.js';

interface BenchmarkCase {name: string; query: string}
interface BenchmarkResult {
  name: string;
  query: string;
  matches: number;
  files: number;
  originalBytes: number;
  returnedBytes: number;
  estimatedOriginalTokens: number;
  estimatedReturnedTokens: number;
  expansionTokens: number;
  totalEffectiveTokens: number;
  initialReductionPercent: number;
  effectiveReductionPercent: number;
  baselineLatencyMs: number;
  tokenAwareLatencyMs: number;
  latencyOverheadMs: number;
  disposition: string;
  handle: string;
  semanticCountsEqual: boolean;
  semanticIndexEqual: boolean;
  fullResultRecoverable: boolean;
  authoritativeStdoutSha256: string;
}

const cases: BenchmarkCase[] = [
  {name: 'small', query: 'SMALL_MARKER'},
  {name: 'medium', query: 'MEDIUM_MARKER'},
  {name: 'broad', query: 'BROAD_MARKER'},
  {name: 'pathological', query: 'PATHOLOGICAL_MARKER'},
];

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-token-output-benchmark-'));
const fixture = path.join(root, 'source-tree');
fs.mkdirSync(fixture, {recursive: true});

try {
  generateFixture(fixture);
  const results: BenchmarkResult[] = [];
  for (const item of cases) results.push(await benchmarkCase(fixture, item));
  const fixtureFiles = fs.readdirSync(fixture).length;
  const fixtureBytes = fs.readdirSync(fixture).reduce((sum, file) => sum + fs.statSync(path.join(fixture, file)).size, 0);
  const evidence = {
    schema: 'agent-control.token-aware-output-benchmark/v1',
    generatedAt: new Date().toISOString(),
    fixture: {generator: 'deterministic', files: fixtureFiles, bytes: fixtureBytes, approximateSourceLines: fixtureFiles * 200},
    estimator: 'ceil(UTF-8 bytes / 3)',
    baseline: 'rg --line-number --no-heading --color=never',
    tokenAware: 'typed rg --json -> authoritative result -> compact index -> selected captured expansion',
    results,
    acceptance: {
      allSemanticsRecoverable: results.every(item => item.semanticCountsEqual && item.semanticIndexEqual && item.fullResultRecoverable),
      broadInitialReductionAtLeast70Percent: results.find(item => item.name === 'broad')!.initialReductionPercent >= 70,
      pathologicalInitialReductionAtLeast70Percent: results.find(item => item.name === 'pathological')!.initialReductionPercent >= 70,
    },
  };
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  if (!evidence.acceptance.allSemanticsRecoverable || !evidence.acceptance.broadInitialReductionAtLeast70Percent || !evidence.acceptance.pathologicalInitialReductionAtLeast70Percent) process.exitCode = 1;
} finally {
  fs.rmSync(root, {recursive: true, force: true});
}

async function benchmarkCase(workspace: string, item: BenchmarkCase): Promise<BenchmarkResult> {
  const executor = new LocalCommandExecutor();
  const baselineStarted = performance.now();
  const baseline = await executor.execute({command: 'rg', args: ['--line-number', '--no-heading', '--color=never', '--case-sensitive', '--', item.query, '.'], cwd: workspace, timeoutMs: 60_000, maxCaptureBytesPerStream: 64 * 1024 * 1024});
  const baselineLatencyMs = performance.now() - baselineStarted;
  if (baseline.exitCode !== 0) throw new Error(`benchmark_baseline_failed:${item.name}:${baseline.exitCode}:${baseline.stderr}`);
  const baselineLines = baseline.stdout.split(/\r?\n/).filter(Boolean);
  const baselineFiles = new Set(baselineLines.map(line => line.match(/^(.+?):\d+:/)?.[1]).filter((value): value is string => Boolean(value)));
  const baselineIndex = conventionalIndex(baselineLines);
  const scope: OutputAuthorityScope = {taskId: `benchmark-${item.name}`, laneId: 'benchmark', workerId: 'benchmark-local', leaseGeneration: 1, ownershipGeneration: 1, jobId: 'token-output-benchmark'};
  const outputService = new TokenAwareOutputService(new MemoryCommandResultStore(), {handleFactory: () => `search:BENCHMARK-${item.name.toUpperCase()}`});
  const runner = new RipgrepSearchRunner({workspaceRoot: workspace, executor});
  const tokenStarted = performance.now();
  const captured = await runner.execute({query: item.query, paths: ['.'], contextLines: 0, timeoutMs: 60_000});
  const initial = outputService.capture(captured, scope);
  const tokenAwareLatencyMs = performance.now() - tokenStarted;
  const firstFile = initial.search?.files[0];
  const selected = initial.disposition === 'COMPLETE' || !firstFile ? undefined : outputService.expand(initial.handle, {mode: 'matches', file: firstFile.path, lines: firstFile.lines.slice(0, 3), contextLines: 0}, scope);
  const full = outputService.expand(initial.handle, {mode: 'all'}, scope);
  const originalBytes = Buffer.byteLength(baseline.stdout);
  const initialModelPayload = JSON.stringify(initial), selectedModelPayload = selected ? JSON.stringify(selected) : '';
  const returnedBytes = Buffer.byteLength(initialModelPayload);
  const estimatedOriginalTokens = estimateTokens(baseline.stdout);
  const estimatedReturnedTokens = estimateTokens(initialModelPayload);
  const expansionTokens = selected ? estimateTokens(selectedModelPayload) : 0;
  const totalEffectiveTokens = estimatedReturnedTokens + expansionTokens;
  const reduction = (tokens: number) => estimatedOriginalTokens ? round((1 - tokens / estimatedOriginalTokens) * 100, 2) : 0;
  return {
    name: item.name, query: item.query, matches: baselineLines.length, files: baselineFiles.size,
    originalBytes, returnedBytes, estimatedOriginalTokens, estimatedReturnedTokens, expansionTokens, totalEffectiveTokens,
    initialReductionPercent: reduction(estimatedReturnedTokens), effectiveReductionPercent: reduction(totalEffectiveTokens),
    baselineLatencyMs: round(baselineLatencyMs, 3), tokenAwareLatencyMs: round(tokenAwareLatencyMs, 3), latencyOverheadMs: round(tokenAwareLatencyMs - baselineLatencyMs, 3),
    disposition: initial.disposition, handle: initial.handle,
    semanticCountsEqual: initial.search?.totalMatches === baselineLines.length && initial.search.filesWithMatches === baselineFiles.size,
    semanticIndexEqual: indexesEqual(baselineIndex, structuredIndex(captured.stdout)),
    fullResultRecoverable: full.stdout === captured.stdout && full.authoritative.sha256 === initial.authoritative.sha256,
    authoritativeStdoutSha256: createHash('sha256').update(captured.stdout).digest('hex'),
  };
}

function generateFixture(directory: string) {
  for (let file = 0; file < 240; file++) {
    const rows: string[] = [];
    for (let line = 1; line <= 200; line++) {
      const markers: string[] = [];
      if (file === 0 && line === 1) markers.push('SMALL_MARKER');
      if (file % 3 === 0 && line === 7) markers.push('MEDIUM_MARKER');
      if ([30, 90, 150].includes(line)) markers.push('BROAD_MARKER');
      if (line <= 100 && line % 2 === 0) markers.push('PATHOLOGICAL_MARKER');
      rows.push(`export const value_${file}_${line} = "${markers.join(' ')} deterministic filler ${String(file).padStart(3, '0')}-${String(line).padStart(3, '0')}";`);
    }
    fs.writeFileSync(path.join(directory, `module-${String(file).padStart(3, '0')}.ts`), `${rows.join('\n')}\n`);
  }
}

function round(value: number, places: number) { const scale = 10 ** places; return Math.round(value * scale) / scale; }

function conventionalIndex(lines: string[]) {
  const index = new Map<string, number[]>();
  for (const line of lines) {
    const match = line.match(/^(.+?):(\d+):/);
    if (!match) throw new Error(`benchmark_baseline_line_unrecognised:${line.slice(0, 120)}`);
    addIndexLine(index, match[1], Number(match[2]));
  }
  return index;
}

function structuredIndex(stdout: string) {
  const index = new Map<string, number[]>();
  for (const line of stdout.split(/\r?\n/).filter(Boolean)) {
    const event = JSON.parse(line) as {type?: string; data?: {path?: {text?: string}; line_number?: number}};
    if (event.type !== 'match') continue;
    const file = event.data?.path?.text, lineNumber = event.data?.line_number;
    if (!file || !Number.isSafeInteger(lineNumber)) throw new Error('benchmark_structured_match_invalid');
    addIndexLine(index, file, lineNumber!);
  }
  return index;
}

function addIndexLine(index: Map<string, number[]>, file: string, line: number) {
  const lines = index.get(file) ?? [];
  if (!lines.includes(line)) lines.push(line);
  index.set(file, lines);
}

function indexesEqual(left: Map<string, number[]>, right: Map<string, number[]>) {
  const normalize = (value: Map<string, number[]>) => [...value].map(([file, lines]) => [file, [...lines].sort((a, b) => a - b)] as const).sort(([leftFile], [rightFile]) => leftFile.localeCompare(rightFile));
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}
