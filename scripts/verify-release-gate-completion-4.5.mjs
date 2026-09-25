import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve('qualification/agent-control-4.5-release-gate-completion-20260912');
const report=read('release-gate.json'),matrix=read('memory-matrix.json'),manifest=read('evidence-manifest.json'),routes=read('memory-route-qualifications.json'),live=read('live/cross-model-memory-qualification.json'),liveManifest=read('live/live-evidence-manifest.json');
assert.equal(report.recommendation,'EXPERIMENTAL');
assert.equal(report.releaseReady,false);
assert.deepEqual(report.releaseActions,{merge:false,tag:false,release:false,deploy:false});
assert.equal(report.validation.fullSuite.passed,1161);
assert.equal(matrix.rows.length,12);
assert.equal(matrix.reconciliation.terminallyClassified,12);
assert.equal(matrix.reconciliation.successful,9);
assert.deepEqual([...new Set(matrix.rows.map(row=>row.terminalClassification))].sort(),['BLOCKED_EXTERNAL','FIXED','PASS','UNSUPPORTED']);
assert.equal(matrix.contract.verificationWeakened,false);
assert.ok(routes.records.some(record=>record.route.modelId==='pixel-gemma-e4b'&&record.reader.eligibility==='UNSUPPORTED'));
assert.equal(live.matrix[0].routeQualification.decision,'ESCALATE');
assert.equal(live.matrix[0].routeQualification.selected.reader.modelId,'codex-luna');
assert.equal(live.matrix[0].readerRoute.includes('/codex-luna@'),true);
assert.equal(live.matrix[0].result,'PASS');
assert.equal(liveManifest.verdict,'PASS_GENUINE_RUNTIME_ACTIVITY_RECORDED');
assert.equal(liveManifest.browserErrors.length,0);
assert.equal(liveManifest.video.streams[0].width,1920);
assert.equal(liveManifest.video.streams[0].height,1080);
assert.ok(report.gates.some(g=>g.name==='Provider-neutral route qualification'&&g.status==='PROVEN'));
assert.ok(report.gates.some(g=>g.name==='Specialist-model energy advantage'&&g.status==='DISPROVEN'));
assert.ok(report.gates.some(g=>g.name==='Whole-node power claim'&&g.status==='BLOCKED_EXTERNAL'));
for(const item of manifest.files){const value=fs.readFileSync(path.join(root,item.file));assert.equal(value.length,item.bytes,item.file);assert.equal(createHash('sha256').update(value).digest('hex'),item.sha256,item.file);}
console.log(JSON.stringify({verdict:'PASS_INDEPENDENT_COMPLETION_EVIDENCE_VERIFICATION',implementationHead:report.implementationHead,files:manifest.files.length,matrix:matrix.reconciliation,recommendation:report.recommendation},null,2));
function read(file){return JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));}
