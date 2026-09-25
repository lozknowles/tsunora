import fs from 'node:fs';
import path from 'node:path';
import {qualifyEdgeRuntime, usableEdgeTiers, type EdgeRuntimeMeasurement} from '../src/control/edge-context-runtime.js';

const argumentsList = process.argv.slice(2);
const value = (name: string) => { const index = argumentsList.indexOf(name); return index < 0 ? undefined : argumentsList[index + 1]; };
const read = (name: string) => { const file = value(name); return file ? JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')) as EdgeRuntimeMeasurement : undefined; };
const qualifications = [qualifyEdgeRuntime('E2B', read('--e2b')), qualifyEdgeRuntime('E4B', read('--e4b'))];
process.stdout.write(`${JSON.stringify({schema: 'agent-control.edge-context-runtime-suite/v1', qualifications, usableTiers: usableEdgeTiers(qualifications), observedAt: new Date().toISOString()}, null, 2)}\n`);
if (!usableEdgeTiers(qualifications).includes('E2B')) process.exitCode = 2;
