import fs from 'node:fs';
import path from 'node:path';
import {evaluateFrozenRoutingBenchmark, type RoutingObservation} from '../src/control/capability-routing-benchmark.js';

const value=(name:string)=>{const index=process.argv.indexOf(name);return index<0?undefined:process.argv[index+1];};
const observationFile=value('--observations');
const output=path.resolve(value('--output')??'docs/evidence/capability-routing-benchmark-v1.json');
const observations=observationFile?JSON.parse(fs.readFileSync(path.resolve(observationFile),'utf8')) as RoutingObservation[]:[];
const report=evaluateFrozenRoutingBenchmark({observations,generatedAt:new Date().toISOString()});
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,`${JSON.stringify(report,null,2)}\n`,{mode:0o600});
process.stdout.write(`${JSON.stringify({output,suiteId:report.suiteId,suiteSha256:report.suiteSha256,tasks:report.classificationMetrics.overall.total,holdout:report.classificationMetrics.holdout.total,accuracy:report.classificationMetrics.overall.accuracy,unsafeFalsePositiveRoutes:report.classificationMetrics.unsafeFalsePositiveRoutes,physicalAttempts:report.physicalMetrics.attempts,recommendation:report.recommendation},null,2)}\n`);
