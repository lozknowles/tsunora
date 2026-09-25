import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import type {DiscoveryScan} from './environment-discovery.js';
import {estateObservationState} from './estate-map.js';
import type {PoeBenchmarkProposalInput} from './poe.js';
import type {WorkParcelPlanStage} from './work-parcels.js';

export const benchmarkHash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export interface BenchmarkCandidate {
  id:string;source:string;revision:string;filename:string;quantisation:string;bytes:number;sha256:string;
  licence:string;licenceSource:string;architecture:string;contextLimit:number;estimatedRamBytes:number;estimatedVramBytes:number;
  existingPath?:string;
}
export interface BenchmarkCase {id:string;prompt:string;validator:'python-function-tests'|'exact-text'|'json-schema';input:unknown;expected:unknown;}
export interface LocalBenchmarkSpec {
  schema:'agent-control.local-llm-benchmark/v1';id:string;version:string;objective:string;workload:string;cases:BenchmarkCase[];
  scoring:{correctnessWeight:number;speedWeight:number;memoryWeight:number;subjectiveWeight:0;formula:string};
  attempts:number;settings:{context:number;maxTokens:number;temperature:number;seed:number;threads:number;gpuLayers:number;concurrency:1;timeoutMs:number;cache:'COLD_PER_CANDIDATE';tools:string[]};
  constraints:{maxArtifactBytes:number;mustFitVram:boolean;permissiveOnly:boolean;families:string[];maxDiskBytes:number};
  hardware:{resourceId:string;scanId:string;fingerprint:string;cpu:string;ramBytes:number;freeDiskBytes:number;freeVramBytes:number;observedAt:string};
  execution:{capability:string;qualified:boolean;expiresAt:string;authentication:'AUTHENTICATED'|'NOT_REQUIRED'|'REQUIRED';runtimePath:string;runtimeSha256:string;runtimeVersion:string;sandboxPath:string;sandboxSha256:string;validatorSha256:string;architectures:string[];qualificationEvidenceSha256:string};
  candidates:BenchmarkCandidate[];judge:null;retention:'KEEP_ALL';routing:'RECOMMENDATION_ONLY';createdAt:string;
}
export const PYTHON_REPAIR_CASES:BenchmarkCase[]=[
  {id:'mean-empty',validator:'python-function-tests',prompt:'Repair this Python function. Return only the complete function named solve. It should return the arithmetic mean, or 0 for an empty list. Broken code: def solve(values): return sum(values) / len(values). Visible tests: solve([2,4]) == 3; solve([]) == 0.',input:[[],[2,4],[0],[-3,3],[1,2,3],[10,-2]],expected:[0,3,0,0,2,4]},
  {id:'stable-unique',validator:'python-function-tests',prompt:'Repair this Python function. Return only the complete function named solve. Remove duplicate integers while preserving their first appearance. Broken code: def solve(values): return sorted(set(values)). Visible tests: solve([3,1,3,2]) == [3,1,2]; solve([]) == [].',input:[[3,1,3,2],[],[0,0],[-2,1,-2],[4,3,2,1],[1,2,1,2]],expected:[[3,1,2],[],[0],[-2,1],[4,3,2,1],[1,2]]},
  {id:'inclusive-total',validator:'python-function-tests',prompt:'Repair this Python function. Return only the complete function named solve. For a nonnegative integer n, return the sum of integers from 1 through n inclusive; return 0 for n=0. Broken code: def solve(n): return sum(range(n)). Visible tests: solve(3) == 6; solve(0) == 0.',input:[0,1,2,3,10,100],expected:[0,1,3,6,55,5050]},
];

export function validateBenchmarkSpec(spec:LocalBenchmarkSpec) {
  if(spec.schema!=='agent-control.local-llm-benchmark/v1'||!spec.id||!spec.version||!spec.objective.trim()||spec.cases.length===0||spec.candidates.length<1)throw Error('benchmark_spec_invalid');
  if(!Number.isInteger(spec.attempts)||spec.attempts<1||spec.attempts>20||spec.settings.concurrency!==1||spec.settings.timeoutMs<1000||spec.settings.timeoutMs>300000||spec.settings.context<256||spec.settings.context>32768||spec.settings.maxTokens<1||spec.settings.maxTokens>8192||spec.settings.threads<1||spec.settings.threads>16)throw Error('benchmark_limits_invalid');
  if([spec.scoring.correctnessWeight,spec.scoring.speedWeight,spec.scoring.memoryWeight].some(w=>!Number.isFinite(w)||w<0)||spec.scoring.subjectiveWeight!==0||spec.judge!==null||Math.abs(spec.scoring.correctnessWeight+spec.scoring.speedWeight+spec.scoring.memoryWeight-1)>0.000001)throw Error('benchmark_scoring_invalid');
  const positive=(n:number)=>Number.isSafeInteger(n)&&n>0;
  const nonnegative=(n:number)=>Number.isSafeInteger(n)&&n>=0;
  if(![spec.settings.context,spec.settings.maxTokens,spec.settings.threads,spec.settings.timeoutMs].every(positive)||!Number.isSafeInteger(spec.settings.seed)||!Number.isFinite(spec.settings.temperature)||spec.settings.temperature<0||spec.settings.temperature>2||spec.settings.gpuLayers!==0||spec.settings.cache!=='COLD_PER_CANDIDATE'||spec.settings.tools.length)throw Error('benchmark_adapter_settings_unsupported');
  if(![spec.hardware.ramBytes,spec.hardware.freeDiskBytes,spec.constraints.maxArtifactBytes,spec.constraints.maxDiskBytes].every(positive)||!nonnegative(spec.hardware.freeVramBytes)||!Number.isFinite(Date.parse(spec.hardware.observedAt))||!Number.isFinite(Date.parse(spec.execution.expiresAt)))throw Error('benchmark_estate_evidence_invalid');
  if(![spec.execution.runtimeSha256,spec.execution.sandboxSha256,spec.execution.validatorSha256,spec.execution.qualificationEvidenceSha256].every(h=>/^[a-f0-9]{64}$/.test(h))||!path.isAbsolute(spec.execution.runtimePath)||!path.isAbsolute(spec.execution.sandboxPath)||!spec.execution.architectures.length)throw Error('benchmark_execution_identity_invalid');
  for(const task of spec.cases)if(!task.id||!task.prompt||!['python-function-tests','exact-text','json-schema'].includes(task.validator)||(task.validator==='python-function-tests'&&(!Array.isArray(task.input)||!Array.isArray(task.expected)||task.input.length===0||task.input.length!==task.expected.length)))throw Error('benchmark_validator_invalid');
  if(spec.retention!=='KEEP_ALL'||spec.routing!=='RECOMMENDATION_ONLY')throw Error('benchmark_authority_invalid');
  for(const c of spec.candidates) {
    if(!positive(c.contextLimit)||!positive(c.estimatedRamBytes)||!nonnegative(c.estimatedVramBytes)||!c.id||!c.architecture||!c.quantisation||c.filename.includes('\\')||(c.existingPath&&!path.isAbsolute(c.existingPath)))throw Error('benchmark_candidate_estimate_invalid');
    const u=new URL(c.source);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!/^[a-f0-9]{40}$/.test(c.revision)||!/^[a-f0-9]{64}$/.test(c.sha256)||path.basename(c.filename)!==c.filename||!c.filename.endsWith('.gguf')||!Number.isSafeInteger(c.bytes)||c.bytes<=0||!c.licence||!c.licenceSource)throw Error('benchmark_candidate_provenance_invalid');
    if(!c.source.includes(`/${c.revision}/`))throw Error('benchmark_candidate_revision_not_pinned');
  }
  if(new Set(spec.candidates.map(c=>c.id)).size!==spec.candidates.length||new Set(spec.cases.map(c=>c.id)).size!==spec.cases.length)throw Error('benchmark_duplicate_identity');
  return structuredClone(spec);
}

export interface BenchmarkReadinessAdmission {specSha256:string;runtimeSha256:string;verifiedCandidateHashes:string[];expiresAt:string;approvalSha256:string;}
export function benchmarkReadiness(spec:LocalBenchmarkSpec,scan:DiscoveryScan,now=new Date(),admission?:BenchmarkReadinessAdmission) {
  validateBenchmarkSpec(spec);
  const resource=scan.items.find(i=>i.id===spec.hardware.resourceId),reasons:string[]=[];
  if(!resource||!estateObservationState(resource,+now).alive)reasons.push('RESOURCE_STALE_OR_UNDISCOVERED');
  if(!spec.execution.qualified||Date.parse(spec.execution.expiresAt)<=+now)reasons.push('EXECUTION_CAPABILITY_UNQUALIFIED');
  if(spec.execution.authentication==='REQUIRED')return {state:'AUTHENTICATION_REQUIRED',reasons:['EXECUTION_AUTHENTICATION_REQUIRED'],authorityGranted:false};
  const feasible=spec.candidates.map(c=>({id:c.id,reasons:[...(!spec.execution.architectures.includes(c.architecture)?['RUNTIME_ARCHITECTURE_UNSUPPORTED']:[]),...(spec.constraints.mustFitVram&&spec.settings.gpuLayers===0?['GPU_EXECUTION_ADAPTER_REQUIRED']:[]),...(c.bytes>spec.constraints.maxArtifactBytes?['ARTIFACT_SIZE_LIMIT']:[]),...(c.contextLimit<spec.settings.context?['CONTEXT_UNSUPPORTED']:[]),...(c.estimatedRamBytes>spec.hardware.ramBytes?['RAM_INFEASIBLE']:[]),...(spec.constraints.mustFitVram&&c.estimatedVramBytes>spec.hardware.freeVramBytes?['VRAM_INFEASIBLE']:[]),...(spec.constraints.permissiveOnly&&!['apache-2.0','mit','bsd-3-clause','bsd-2-clause'].includes(c.licence.toLowerCase())?['LICENCE_REVIEW_REQUIRED']:[]),...(spec.constraints.families.length&&!spec.constraints.families.some(f=>c.id.toLowerCase().includes(f.toLowerCase()))?['FAMILY_CONSTRAINT']:[])]}));
  if(spec.constraints.families.some(f=>!spec.candidates.some(c=>c.id.toLowerCase().includes(f.toLowerCase()))))reasons.push('REQUESTED_FAMILY_NOT_IN_REVIEWED_CATALOGUE');
  if(feasible.some(c=>c.reasons.length))reasons.push('CANDIDATE_CONSTRAINTS_UNSATISFIED');
  const admitted=admission&&admission.specSha256===benchmarkHash(spec)&&admission.runtimeSha256===spec.execution.runtimeSha256&&Date.parse(admission.expiresAt)>+now&&/^[a-f0-9]{64}$/.test(admission.approvalSha256)&&spec.candidates.every(c=>admission.verifiedCandidateHashes.includes(c.sha256));
  const downloadBytes=admitted?0:spec.candidates.filter(c=>!c.existingPath).reduce((n,c)=>n+c.bytes,0);
  if(downloadBytes>spec.constraints.maxDiskBytes||downloadBytes*1.1>spec.hardware.freeDiskBytes)reasons.push('STORAGE_INFEASIBLE');
  return {state:reasons.length?'UNSUPPORTED':admitted?'READY':downloadBytes?'PROVISIONABLE':'APPROVAL_REQUIRED',reasons,feasible,downloadBytes,additionalDiskBytes:Math.ceil(downloadBytes*1.1),existingModels:spec.candidates.filter(c=>c.existingPath).length,authorityGranted:false,
    prerequisites:['Operator approves exact spec and candidate hashes','Allowed network sources remain reachable','Runtime and sandbox hashes verified','Fresh execution and hardware evidence at dispatch']};
}

/** Immutable content-addressed definitions/results; edits create new identities. */
export class BenchmarkEvidenceStore {
  constructor(readonly root:string){}
  seal(spec:LocalBenchmarkSpec){validateBenchmarkSpec(spec);return this.put('definitions',spec);}
  put(kind:'definitions'|'results'|'approvals'|'acquisitions',value:unknown){const sha256=benchmarkHash(value),dir=path.join(this.root,kind);fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,`${sha256}.json`),body=JSON.stringify(value);try{fs.writeFileSync(file,body,{flag:'wx',mode:0o600});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST'||fs.readFileSync(file,'utf8')!==body)throw e;}return {sha256,file};}
  read(kind:string,digest:string){if(!['definitions','results','approvals','acquisitions'].includes(kind)||!/^[a-f0-9]{64}$/.test(digest))throw Error('benchmark_reference_invalid');const value=JSON.parse(fs.readFileSync(path.join(this.root,kind,`${digest}.json`),'utf8'));if(benchmarkHash(value)!==digest)throw Error('benchmark_evidence_modified');return value;}
}

export interface BenchmarkMeasurement {id:string;candidateId:string;identity:{model:string;revision:string;quantisation:string;runtimeSha256:string;hardwareFingerprint:string;specSha256:string};caseId:string;attempt:number;passed:boolean;elapsedMs:number;generationTokensPerSecond:number|null;promptTokensPerSecond:number|null;ramBytes:number|null;vramBytes:number|null;cpuUtilisation:number|null;gpuUtilisation:number|null;energyJoules:null;promptTokens:number|null;outputTokens:number|null;rawResponseSha256:string;validatorVersion:string;validatorEvidenceSha256:string;failure?:string;}
export function leagueTable(spec:LocalBenchmarkSpec,measurements:BenchmarkMeasurement[]) {
  validateBenchmarkSpec(spec);
  if(measurements.some(m=>!spec.candidates.some(c=>c.id===m.candidateId)||m.identity.model!==m.candidateId||!Number.isInteger(m.attempt)||typeof m.passed!=='boolean'||!Number.isFinite(m.elapsedMs)||m.elapsedMs<=0||[m.ramBytes,m.vramBytes,m.generationTokensPerSecond,m.promptTokensPerSecond].some(n=>n!==null&&(!Number.isFinite(n)||n<0))))throw Error('benchmark_measurement_invalid');
  const specSha256=benchmarkHash(spec),expected=spec.cases.length*spec.attempts;
  const rows=spec.candidates.map(c=>{const runs=measurements.filter(m=>m.candidateId===c.id);if(runs.some(m=>m.identity.specSha256!==specSha256||m.identity.revision!==c.revision||m.identity.runtimeSha256!==spec.execution.runtimeSha256||m.identity.hardwareFingerprint!==spec.hardware.fingerprint||m.identity.quantisation!==c.quantisation))throw Error('benchmark_incomparable_identity');
    if(new Set(runs.map(m=>`${m.caseId}:${m.attempt}`)).size!==runs.length||runs.some(m=>!spec.cases.some(t=>t.id===m.caseId)||m.attempt<1||m.attempt>spec.attempts))throw Error('benchmark_duplicate_or_unknown_attempt');
    const complete=runs.length===expected,passed=runs.filter(r=>r.passed).length,quality=passed/expected,elapsedMs=runs.reduce((n,r)=>n+r.elapsedMs,0),ram=runs.length&&runs.every(r=>r.ramBytes!==null)?Math.max(...runs.map(r=>r.ramBytes!)):null;
    return {candidate:c.id,complete,attempts:runs.length,expectedAttempts:expected,passed,quality,elapsedMs,peakRamBytes:ram,modelBytes:c.bytes,meanGenerationTokensPerSecond:runs.length&&runs.every(r=>r.generationTokensPerSecond!==null)?runs.reduce((n,r)=>n+r.generationTokensPerSecond!,0)/runs.length:null,qualifiedForWorkload:complete&&passed===expected};});
  const rank=(compare:(a:typeof rows[number],b:typeof rows[number])=>number)=>rows.filter(r=>r.complete).sort(compare).map(r=>r.candidate);
  const fastest=Math.min(...rows.filter(r=>r.complete&&r.elapsedMs>0).map(r=>r.elapsedMs));
  const memoryMin=Math.min(...rows.filter(r=>r.complete&&r.peakRamBytes!==null).map(r=>r.peakRamBytes!));
  const scores=rows.map(r=>({...r,score:r.complete&&(spec.scoring.memoryWeight===0||r.peakRamBytes!==null)?100*(spec.scoring.correctnessWeight*r.quality+spec.scoring.speedWeight*(fastest/r.elapsedMs)+(spec.scoring.memoryWeight?spec.scoring.memoryWeight*(memoryMin/(r.peakRamBytes||1)):0)):null}));
  return {specSha256,rows:scores,rankings:{bestQuality:rank((a,b)=>b.quality-a.quality||a.elapsedMs-b.elapsedMs),fastest:rank((a,b)=>a.elapsedMs-b.elapsedMs),bestQualityPerformance:scores.filter(r=>r.complete&&r.score!==null).sort((a,b)=>b.score!-a.score!).map(r=>r.candidate),lowestMemory:rows.filter(r=>r.complete&&r.peakRamBytes!==null).sort((a,b)=>a.peakRamBytes!-b.peakRamBytes!).map(r=>r.candidate),bestForWorkload:scores.filter(r=>r.qualifiedForWorkload&&r.score!==null).sort((a,b)=>b.score!-a.score!).map(r=>r.candidate)},formulas:{quality:'Passed / all planned attempts; missing attempts never pass',fastest:'Sum of measured inference and validation elapsed time, complete candidates only',memory:'Peak measured process RSS; unavailable values excluded',workload:spec.scoring.formula},recommendation:rows.some(r=>r.qualifiedForWorkload)?'Recommendation only; no production routing change':'No candidate passed every planned workload check; no qualified winner',subjectiveJudging:false};
}

export function localBenchmarkProposal(spec:LocalBenchmarkSpec,specSha256:string):PoeBenchmarkProposalInput {
  const stages:WorkParcelPlanStage[]=[{id:'preflight',name:'Verify benchmark plan and estate',job:'local-benchmark-preflight@1.0.0',parameters:{specSha256}}];
  let prior='preflight';
  for(const candidate of spec.candidates)for(const phase of ['acquire','verify-artifact','run-candidate']){const id=`${phase}-${stages.length}`;stages.push({id,name:`${phase.replaceAll('-',' ')} ${candidate.id}`,job:`local-benchmark-${phase}@1.0.0`,dependsOn:[prior],parameters:{specSha256,candidateId:candidate.id,targetResourceId:spec.hardware.resourceId,benchmarkModelSha256:candidate.sha256}});prior=id;}
  stages.push({id:'league-table',name:'Validate, compare and preserve league table',job:'local-benchmark-league-table@1.0.0',dependsOn:[prior],parameters:{specSha256}});
  return {decision:'Find the best local LLM for this workload',objective:spec.objective,whyNewEvidenceIsNeeded:'Target models may not exist yet; benchmark targets are separate from the qualified control worker.',conditions:spec.candidates.map(c=>({route:{providerId:'local-benchmark-target',modelId:c.id,nodeId:spec.hardware.resourceId},tools:spec.settings.tools,contextPolicy:JSON.stringify(spec.settings),fixtureSha256:benchmarkHash(spec.cases),softwareVersion:spec.execution.runtimeVersion,hardwareClass:spec.hardware.fingerprint,quantization:c.quantisation,cacheState:'COLD',providerEndpoint:'isolated-loopback-runtime',authority:'Target proposal; no routing or provisioning authority',timeLimitMs:spec.settings.timeoutMs})),stages,metrics:[{id:'league-evidence',label:'Independent workload validation and complete measurements',kind:'OBJECTIVE',successCriterion:'Every planned attempt has an immutable measurement and deterministic validator verdict.',stageId:'league-table'}],repetitions:1,constraints:[`Spec SHA-256 ${specSha256}`,`Attempts per case ${spec.attempts}`,'No downloads or runtime start until exact frozen proposal approval','Keep all models; deletion and production routing require separate approval']};
}

export function isLocalBenchmarkObjective(text:string){return /\b(?:benchmark|best local (?:LLM|model)|compare local models)\b/i.test(text);}
export function newBenchmarkId(){return `local-benchmark-${randomUUID()}`;}
