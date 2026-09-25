import fs from 'node:fs';
import path from 'node:path';
import {parseHarnessBenchmarkSuite, renderHarnessEfficiencyReport, runHarnessEfficiencyBenchmark} from '../src/control/harness-efficiency-benchmark.js';

const root = process.cwd();
const suiteFile = path.join(root, 'benchmarks', 'harness-efficiency-jobs.json');
const suite = parseHarnessBenchmarkSuite(JSON.parse(fs.readFileSync(suiteFile, 'utf8')));
const started = performance.now();
const report = runHarnessEfficiencyBenchmark(suite);
report.frameworkLatency.packetBuildAndReportMs = performance.now() - started;
const jsonFile = path.join(root, 'artifacts', 'harness-efficiency-report.json');
const markdownFile = path.join(root, 'docs', 'harness-efficiency-report.md');
fs.mkdirSync(path.dirname(jsonFile), {recursive: true});
fs.writeFileSync(jsonFile, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(markdownFile, renderHarnessEfficiencyReport(report));
process.stdout.write(`${JSON.stringify({benchmarkId: report.benchmarkId, suiteId: report.suiteId, classification: report.classification, aggregates: report.aggregates, conclusions: report.conclusions, files: [markdownFile, jsonFile]}, null, 2)}\n`);
