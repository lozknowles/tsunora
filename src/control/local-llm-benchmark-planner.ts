import {BenchmarkEvidenceStore,benchmarkHash,benchmarkReadiness,localBenchmarkProposal,newBenchmarkId,PYTHON_REPAIR_CASES,type LocalBenchmarkSpec} from './local-llm-benchmark.js';
import type {DiscoveryScan} from './environment-discovery.js';

/** A bounded worked-example parser. Operator review, not inferred intent, grants authority. */
export function draftLocalBenchmarkObjective(objective:string,template:LocalBenchmarkSpec,scan:DiscoveryScan,store:BenchmarkEvidenceStore,now=new Date()) {
  if(!/python|code repair|repair.*code/i.test(objective)&&!template.workload)throw Error('benchmark_workload_required');
  const spec=structuredClone(template);spec.id=newBenchmarkId();spec.createdAt=now.toISOString();spec.objective=objective;
  if(/python|code repair|repair.*code/i.test(objective)){spec.workload='Python function repair with fixed independent tests';spec.cases=structuredClone(PYTHON_REPAIR_CASES);}
  const limit=objective.match(/(?:under|up to|less than)\s+(\d+(?:\.\d+)?)\s*(GB|GiB|MB|MiB)\b/i);
  if(limit){const scale=/^g/i.test(limit[2]!)?(/i/i.test(limit[2]!)?2**30:1e9):(/i/i.test(limit[2]!)?2**20:1e6);spec.constraints.maxArtifactBytes=Math.floor(Number(limit[1])*scale);}
  if(/(?:entirely|must fit|only).*VRAM|VRAM.only/i.test(objective))spec.constraints.mustFitVram=true;
  if(/permissive licen[sc]es?/i.test(objective))spec.constraints.permissiveOnly=true;
  const families=['gemma','qwen'].filter(f=>new RegExp(`\\b${f}\\b`,'i').test(objective));if(families.length)spec.constraints.families=families;
  const attempts=objective.match(/(?:attempts|repetitions|runs)\s*(?:of|:|=)?\s*(\d+)/i);if(attempts)spec.attempts=Number(attempts[1]);
  const sealed=store.seal(spec),readiness=benchmarkReadiness(spec,scan,now),proposal=localBenchmarkProposal(spec,sealed.sha256);
  return {spec,specSha256:sealed.sha256,readiness,proposal,reviewSummary:`${spec.workload}. ${spec.candidates.length} pinned candidates; ${spec.cases.length} cases × ${spec.attempts} attempts per candidate. Download ${readiness.downloadBytes??0} bytes. Estimated runtime ceiling ${(spec.candidates.length*spec.cases.length*spec.attempts*spec.settings.timeoutMs/60000).toFixed(1)} minutes plus loading/download. API cost ceiling 0. ${readiness.state}. Review the complete specification before freezing and approving.`,fixtureSha256:benchmarkHash(spec.cases)};
}
