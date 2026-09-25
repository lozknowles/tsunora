import fs from 'node:fs';
import path from 'node:path';
import {runPersistentTeammatesDemo} from '../src/control/teammates-demo.js';

const output = path.resolve(process.argv[2] ?? path.join('qualification-results', `persistent-teammates-${new Date().toISOString().replace(/[:.]/g, '-')}.json`));
const evidence = await runPersistentTeammatesDemo();
fs.mkdirSync(path.dirname(output), {recursive: true});
fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, {mode: 0o600});
process.stdout.write(`${JSON.stringify({status: 'PASS', output, conversationId: evidence.outcome.conversationId, specialistRuns: evidence.outcome.specialistRuns, synthesisRun: evidence.outcome.runId, delegatedJobs: evidence.runs.length, invocations: evidence.telemetry.length, totalTokens: evidence.metrics.overall.totalProcessedTokens, verifiedSuccesses: evidence.metrics.overall.verifiedSuccesses})}\n`);
