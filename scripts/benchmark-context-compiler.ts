import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {buildContextCompilerBenchmark, type ContextCompilerBenchmarkObservation} from '../src/control/context-compiler-benchmark.js';

const argumentsList = process.argv.slice(2);
const value = (name: string) => { const index = argumentsList.indexOf(name); return index < 0 ? undefined : argumentsList[index + 1]; };
const corpusFile = path.resolve(value('--corpus') ?? 'benchmarks/harness-mutation-jobs.json');
const rawCorpus = fs.readFileSync(corpusFile, 'utf8');
const corpus = JSON.parse(rawCorpus) as {suiteId: string; tasks: Array<{id: string}>};
const resultsFile = value('--results');
const observations = resultsFile ? JSON.parse(fs.readFileSync(path.resolve(resultsFile), 'utf8')) as ContextCompilerBenchmarkObservation[] : [];
const report = buildContextCompilerBenchmark(corpus.suiteId, createHash('sha256').update(rawCorpus).digest('hex'), corpus.tasks.map(task => task.id), observations);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.verdict === 'FAIL') process.exitCode = 1;
