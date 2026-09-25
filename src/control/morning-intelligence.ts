import {IntelligenceJournal, type ModelWatch} from './model-landscape.js';
import {PersonalBenchmarkLeague, personalResultSchema} from './personal-benchmark-league.js';

/** Explain one recorded watch run. Missing observations never become a no-change verdict. */
export function morningIntelligence(journal:IntelligenceJournal, league:PersonalBenchmarkLeague, watch:ModelWatch, watchDigest:string, runKey:string) {
  const history=journal.records(), rows=history.filter(r=>r.value.runKey===runKey);
  if(rows.some(r=>r.value.watchDigest&&r.value.watchDigest!==watchDigest))throw Error('brief_watch_run_identity_mismatch');
  const latest=(kind:string)=>rows.filter(r=>r.kind===kind).at(-1)?.value;
  const gathered=latest('watch-intelligence'), shortlist=latest('watch-shortlist'), result=latest('watch-results'), proposal=latest('watch-benchmark-proposed');
  const sources=watch.sourceIds.map(sourceId=>{
    const source=gathered?.results.find((r:any)=>r.sourceId===sourceId);
    const snapshot=history.find(r=>r.sha256===source?.snapshotSha256&&r.kind==='source-snapshot');
    const baseline=Boolean(snapshot&&!history.some(r=>r.kind==='source-snapshot'&&r.value.sourceId===sourceId&&r.sequence<snapshot.sequence));
    return {sourceId,state:!source?'NOT_OBSERVED':source.state!=='COMPLETE'?source.state:snapshot?.value.complete===false?'PARTIAL':'COMPLETE',baseline,changes:source?.changes.length??0,snapshotSha256:snapshot?.sha256??null};
  });
  const allSourcesComplete=sources.every(s=>s.state==='COMPLETE');
  const outcomes={complete:0,failed:0,interrupted:0,unverified:0,missing:0};
  const comparisons:any[]=[], completed:string[]=[];
  for(const digest of new Set<string>(result?.resultHashes??[])) {
    const raw=history.find(r=>r.kind==='personal-result'&&r.value.digest===digest)?.value.result;
    const parsed=personalResultSchema.safeParse(raw);
    if(!parsed.success||parsed.data.benchmarkSha256!==watch.benchmarkSha256){outcomes.missing++;continue;}
    const item=parsed.data;
    if(item.provenance!=='NATIVE_EXECUTION'){outcomes.unverified++;continue;}
    if(item.status!=='COMPLETE'){outcomes[item.status==='FAILED'?'failed':'interrupted']++;continue;}
    outcomes.complete++;completed.push(digest);
    if(!watch.incumbentResultSha256){comparisons.push({resultSha256:digest,state:'NO_INCUMBENT'});continue;}
    try {comparisons.push({resultSha256:digest,...league.compare(watch.incumbentResultSha256,digest)});}
    catch {comparisons.push({resultSha256:digest,state:'INCOMPARABLE',reasons:['Incumbent evidence is missing']});}
  }
  const qualityImproved=comparisons.some(c=>c.state==='COMPARABLE'&&c.delta?.quality>0);
  const status=result?.state??(latest('watch-dispatched')?'BENCHMARK_RUNNING':!gathered?'NOT_RUN':!sources.some(s=>s.state==='COMPLETE'||s.state==='PARTIAL')?'SOURCE_UNAVAILABLE':proposal?.state??'NOT_RUN');
  const nextActions:string[]=[];
  if(!allSourcesComplete)nextActions.push('Review incomplete or unavailable sources; unchanged models cannot be concluded from missing observations.');
  if(status==='APPROVAL_REQUIRED')nextActions.push('Review and approve the exact benchmark proposal before acquisition or execution.');
  if(status==='CONNECTOR_REQUIRED')nextActions.push('Configure and qualify a compatible benchmark adapter.');
  if(outcomes.failed||outcomes.interrupted||outcomes.missing||outcomes.unverified)nextActions.push('Inspect failed, interrupted or unverified results; these do not count as completed native benchmarks.');
  if(completed.length&&!watch.incumbentResultSha256)nextActions.push('Review the personal league and choose an incumbent for future comparisons.');
  if(qualityImproved)nextActions.push('Inspect quality, speed, memory and cost tradeoffs before any separate routing qualification.');
  return {schema:'agent-control.morning-intelligence/v1',watchId:watch.id,watchDigest,runKey,at:new Date().toISOString(),
    observationScope:sources.some(s=>s.baseline)?'BASELINE_OR_MIXED':'FOLLOW_UP',sourceCoverage:{complete:sources.filter(s=>s.state==='COMPLETE').length,total:sources.length,allComplete:allSourcesComplete,sources},
    changesDetected:shortlist?.counts.changes??0,relevantCandidates:shortlist?.counts.shortlisted??0,
    changeSummary:sources.some(s=>s.baseline)?'Initial observations include existing models; this is not proof that they were newly released.':!allSourcesComplete?'Source coverage is incomplete; only observed changes are reported.':shortlist?.counts.changes?'Changes observed against retained source history.':'No changes observed across the complete configured source set.',
    rejections:shortlist?.candidates.filter((c:any)=>c.reasons.length).map((c:any)=>({model:c.item.identity.model,reasons:c.reasons}))??[],
    benchmarked:outcomes.complete,benchmarkOutcomes:outcomes,status,comparisons,sourceFailures:sources.filter(s=>s.state!=='COMPLETE').map(s=>s.sourceId),
    routingChanged:false,recommendation:qualityImproved?'Objective quality improved; inspect tradeoffs before separate local qualification':'No evidence-backed new leader established',nextActions,
    execution:{parcelId:latest('watch-dispatched')?.parcelId??null,completedResultHashes:completed},evidence:rows.map(r=>r.sha256)};
}
