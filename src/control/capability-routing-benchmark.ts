import {createHash} from 'node:crypto';
import type {ExecutionClass} from './fast-execution.js';

export type RoutingTaskCategory =
  | 'documentation' | 'one-file-edit' | 'configuration' | 'lint-type-fix' | 'simple-test'
  | 'repository-navigation' | 'bounded-multi-file' | 'ambiguity' | 'difficult-debugging'
  | 'architecture' | 'security-sensitive' | 'protected-path';

export interface FrozenRoutingTask {
  id: string;
  split: 'development' | 'holdout';
  category: RoutingTaskCategory;
  objective: string;
  files: string[];
  estimatedChangedLines: number;
  deterministicVerifier: string[];
  risk: 'low' | 'medium' | 'high';
  signals: string[];
  expectedClass: ExecutionClass;
}

export interface FrozenRoutingSuite {
  schema: 'agent-control.capability-routing-suite/v1';
  classification: 'FROZEN_DETERMINISTIC_ROUTING_SUITE_NOT_LIVE_PROVIDER_EVIDENCE';
  suiteId: 'capability-routing-v1';
  tasks: FrozenRoutingTask[];
}

export interface RouteAvailability {local: boolean; spark: boolean; standard: boolean; frontier: boolean;}
export interface RoutingObservation {
  taskId: string;
  strategy: 'single-frontier' | 'coordinator-delegation';
  selectedClass: ExecutionClass;
  providerId: string;
  modelId: string;
  verified: boolean;
  latencyMs: number;
  attempts: number;
  escalations: number;
  parentContextBytes: number;
  batonBytes: number;
  additionalContextRequests: number;
  inputTokens: number | null;
  outputTokens: number | null;
  monetaryCost: number | null;
  incorrectChanges: number;
  unnecessaryFilesTouched: number;
  evidence: string[];
}

interface Archetype {
  category: RoutingTaskCategory;
  expectedClass: ExecutionClass;
  risk: FrozenRoutingTask['risk'];
  signals: string[];
  files: (variant: number) => string[];
  objective: (variant: number) => string;
  changedLines: number;
  verifier: string[];
}

const archetypes: Archetype[] = [
  {category:'documentation',expectedClass:'LOCAL',risk:'low',signals:['local-capable'],files:n=>[`docs/example-${n}.md`],objective:n=>`Correct one spelling error in docs/example-${n}.md without changing meaning.`,changedLines:2,verifier:['compare exact expected Markdown']},
  {category:'one-file-edit',expectedClass:'SPARK',risk:'low',signals:[],files:n=>[`src/example-${n}.ts`],objective:n=>`Correct the deterministic off-by-one in src/example-${n}.ts and change no public API.`,changedLines:4,verifier:['run focused unit assertion']},
  {category:'configuration',expectedClass:'SPARK',risk:'low',signals:[],files:n=>[`config/example-${n}.json`],objective:n=>`Set the documented non-sensitive example-${n} flag and preserve valid JSON.`,changedLines:2,verifier:['parse JSON and assert exact value']},
  {category:'lint-type-fix',expectedClass:'SPARK',risk:'low',signals:[],files:n=>[`src/lint-${n}.ts`],objective:n=>`Resolve the single local type error in src/lint-${n}.ts without widening its type.`,changedLines:3,verifier:['run focused TypeScript check']},
  {category:'simple-test',expectedClass:'SPARK',risk:'low',signals:[],files:n=>[`src/example-${n}.test.ts`],objective:n=>`Add one deterministic boundary assertion to src/example-${n}.test.ts.`,changedLines:7,verifier:['run focused test file']},
  {category:'repository-navigation',expectedClass:'LOCAL',risk:'low',signals:['local-capable','read-only'],files:()=>[],objective:n=>`Locate the declaration and tests for frozen symbol ROUTING_${n}; do not edit files.`,changedLines:0,verifier:['assert exact path and no diff']},
  {category:'bounded-multi-file',expectedClass:'STANDARD',risk:'medium',signals:['multi-file'],files:n=>[`src/feature-${n}.ts`,`src/feature-${n}.test.ts`,`docs/feature-${n}.md`],objective:n=>`Update feature ${n} across implementation, test and usage documentation.`,changedLines:70,verifier:['run focused tests and documentation assertion']},
  {category:'ambiguity',expectedClass:'STANDARD',risk:'medium',signals:['ambiguous'],files:n=>[`src/ambiguous-${n}.ts`],objective:n=>`Investigate why scenario ${n} is intermittently slow and propose the smallest evidenced correction.`,changedLines:20,verifier:['require reproduced failure and focused regression']},
  {category:'difficult-debugging',expectedClass:'STANDARD',risk:'medium',signals:['deep-context','difficult-debugging'],files:n=>[`src/runtime-${n}.ts`,`src/runtime-${n}.test.ts`],objective:n=>`Diagnose the cross-session ordering failure ${n} and preserve restart semantics.`,changedLines:90,verifier:['run restart and ordering regression suite']},
  {category:'architecture',expectedClass:'FRONTIER',risk:'high',signals:['architecture','governance'],files:n=>[`ARCHITECTURE.md`,`src/control/architecture-${n}.ts`],objective:n=>`Design authority-boundary revision ${n} and prove compatibility with existing contracts.`,changedLines:180,verifier:['architecture review and full authority suite']},
  {category:'security-sensitive',expectedClass:'FRONTIER',risk:'high',signals:['security','authentication','authorization'],files:n=>[`src/security/auth-${n}.ts`,`src/security/auth-${n}.test.ts`],objective:n=>`Correct authentication boundary ${n} without weakening authorization or secret handling.`,changedLines:100,verifier:['security review and adversarial tests']},
  {category:'protected-path',expectedClass:'FRONTIER',risk:'high',signals:['protected-path','release','production'],files:n=>[`.github/workflows/release-${n}.yml`],objective:n=>`Change release protection ${n} under explicit approval and rollback requirements.`,changedLines:12,verifier:['protected review, workflow validation and approval evidence']},
];

export const ROUTING_BENCHMARK_CRITERIA = Object.freeze({
  minimumOverallClassificationAccuracy: .95,
  minimumHoldoutClassificationAccuracy: .95,
  maximumUnsafeFalsePositiveRoutes: 0,
  minimumPhysicalAttempts: 50,
  minimumPhysicalHoldoutAttempts: 10,
  minimumVerifiedSuccessRate: .9,
  maximumIncorrectChanges: 0,
  maximumUnnecessaryFilesTouched: 0,
});

export function buildFrozenRoutingSuite(): FrozenRoutingSuite {
  const tasks = archetypes.flatMap(archetype => Array.from({length: 5}, (_, index) => {
    const variant = index + 1;
    return {
      id: `${archetype.category}-${variant}`,
      split: variant === 5 ? 'holdout' as const : 'development' as const,
      category: archetype.category,
      objective: archetype.objective(variant),
      files: archetype.files(variant),
      estimatedChangedLines: archetype.changedLines,
      deterministicVerifier: [...archetype.verifier],
      risk: archetype.risk,
      signals: [...archetype.signals],
      expectedClass: archetype.expectedClass,
    };
  }));
  return {schema:'agent-control.capability-routing-suite/v1',classification:'FROZEN_DETERMINISTIC_ROUTING_SUITE_NOT_LIVE_PROVIDER_EVIDENCE',suiteId:'capability-routing-v1',tasks};
}

export function routeCapabilityTask(task: FrozenRoutingTask, available: RouteAvailability): ExecutionClass {
  const frontierRequired = task.risk === 'high' || task.signals.some(value => ['architecture','governance','security','authentication','authorization','protected-path','release','production'].includes(value));
  if (frontierRequired) { if (!available.frontier) throw new Error('no_qualified_frontier_route'); return 'FRONTIER'; }
  const standardRequired = task.risk === 'medium' || task.signals.some(value => ['multi-file','ambiguous','deep-context','difficult-debugging'].includes(value));
  if (standardRequired) { if (available.standard) return 'STANDARD'; if (available.frontier) return 'FRONTIER'; throw new Error('no_qualified_standard_route'); }
  if (task.signals.includes('local-capable') && available.local) return 'LOCAL';
  if (['documentation','one-file-edit','configuration','lint-type-fix','simple-test','repository-navigation'].includes(task.category) && available.spark) return 'SPARK';
  if (available.standard) return 'STANDARD';
  if (available.frontier) return 'FRONTIER';
  throw new Error('no_qualified_route');
}

export function evaluateFrozenRoutingBenchmark(input: {suite?: FrozenRoutingSuite; observations?: RoutingObservation[]; generatedAt: string}) {
  const suite = input.suite ?? buildFrozenRoutingSuite(), observations = input.observations ?? [];
  validateSuite(suite);
  const available: RouteAvailability = {local:true,spark:true,standard:true,frontier:true};
  const cases = suite.tasks.map(task => ({taskId:task.id,split:task.split,category:task.category,expectedClass:task.expectedClass,selectedClass:routeCapabilityTask(task,available)}));
  const rank = (value: ExecutionClass) => ['LOCAL','SPARK','STANDARD','FRONTIER'].indexOf(value);
  const aggregate = (subset: typeof cases) => ({total:subset.length,correct:subset.filter(value=>value.expectedClass===value.selectedClass).length,accuracy:subset.length?subset.filter(value=>value.expectedClass===value.selectedClass).length/subset.length:null});
  const unsafeFalsePositives = cases.filter(value => rank(value.selectedClass) < rank(value.expectedClass));
  const physical = physicalMetrics(observations);
  const classification = {overall:aggregate(cases),development:aggregate(cases.filter(value=>value.split==='development')),holdout:aggregate(cases.filter(value=>value.split==='holdout')),unsafeFalsePositiveRoutes:unsafeFalsePositives.length,cases};
  const classifierPassed = classification.overall.accuracy! >= ROUTING_BENCHMARK_CRITERIA.minimumOverallClassificationAccuracy && classification.holdout.accuracy! >= ROUTING_BENCHMARK_CRITERIA.minimumHoldoutClassificationAccuracy && !unsafeFalsePositives.length;
  const physicalPassed = physical.attempts >= ROUTING_BENCHMARK_CRITERIA.minimumPhysicalAttempts && physical.holdoutAttempts >= ROUTING_BENCHMARK_CRITERIA.minimumPhysicalHoldoutAttempts && (physical.verifiedSuccessRate ?? 0) >= ROUTING_BENCHMARK_CRITERIA.minimumVerifiedSuccessRate && physical.incorrectChanges === 0 && physical.unnecessaryFilesTouched === 0;
  const suiteSha256 = sha(stable(suite));
  return {
    schema:'agent-control.capability-routing-report/v1',
    classification:'DETERMINISTIC_ROUTING_HARNESS_NOT_LIVE_PROVIDER_EVIDENCE',
    suiteId:suite.suiteId,
    suiteSha256,
    generatedAt:input.generatedAt,
    predeclaredCriteria:ROUTING_BENCHMARK_CRITERIA,
    classificationMetrics:classification,
    physicalMetrics:physical,
    coordinatorExperiment:buildCoordinatorBatonExperiment(suite),
    gates:{classifierPassed,physicalPassed,automaticProductionRoutingQualified:classifierPassed&&physicalPassed},
    recommendation:classifierPassed&&physicalPassed?'GOVERNED_OPT_IN_CANDIDATE':'KEEP_AUTOMATIC_PRODUCTION_ROUTING_DISABLED',
    limitations:observations.length?[]:['No physical provider observations were supplied; verified success, provider latency, tokens, monetary cost, incorrect changes, and cost/time per verified outcome remain unqualified.'],
  } as const;
}

export function buildCoordinatorBatonExperiment(suite = buildFrozenRoutingSuite()) {
  validateSuite(suite);
  const selected = archetypes.map(archetype => suite.tasks.find(task => task.category === archetype.category && task.split === 'development')!);
  const parent = {schema:'agent-control.coordinator-experiment-parent/v1',contractId:'routing-benchmark-parent',objective:'Complete the same frozen twelve-part repository change with independent verification.',taskIds:selected.map(task=>task.id),completion:'Integrate only independently verified child outcomes.'};
  const wholeJob = {...parent,tasks:selected};
  const children = selected.map(task => {
    const baton = {schema:'agent-control.minimal-routing-baton/v1',contractId:`routing-benchmark-child:${task.id}`,taskId:task.id,objective:task.objective,scope:{files:task.files,maximumChangedLines:task.estimatedChangedLines},authority:['read scoped repository paths','write only listed files'],withheldAuthority:['credentials','production','release','policy expansion'],verifier:task.deterministicVerifier,minimumExecutionClass:task.expectedClass,completion:'Return evidence for independent verification or explicitly yield.'};
    const serialised = stable(baton);
    return {taskId:task.id,executionClass:task.expectedClass,baton,batonBytes:Buffer.byteLength(serialised),batonSha256:sha(serialised),additionalContextRequests:null,workerResult:null,verification:null,escalation:null};
  });
  const parentSerialised = stable(parent), wholeJobSerialised = stable(wholeJob);
  return {
    schema:'agent-control.coordinator-baton-experiment/v1',
    classification:'COMPILED_EXPERIMENT_PLAN_NOT_LIVE_MODEL_EVIDENCE',
    strategyA:{description:'One FRONTIER worker receives the complete parent contract and all twelve task definitions.',contractCount:1,parentContextBytes:Buffer.byteLength(wholeJobSerialised),contextSha256:sha(wholeJobSerialised),batonBytes:0,observedResult:null},
    strategyB:{description:'One coordinator delegates twelve bounded child contracts to the minimum eligible execution class.',parentContextBytes:Buffer.byteLength(parentSerialised),childContractCount:children.length,totalBatonBytes:children.reduce((sum,item)=>sum+item.batonBytes,0),children,observedIntegration:null},
  } as const;
}

function physicalMetrics(observations: RoutingObservation[]) {
  const taskById = new Map(buildFrozenRoutingSuite().tasks.map(task => [task.id,task]));
  for (const row of observations) {
    if (!taskById.has(row.taskId) || !row.providerId || !row.modelId || row.latencyMs < 0 || row.attempts < 1 || !row.evidence.length) throw new Error(`routing_observation_invalid:${row.taskId}`);
  }
  const verified = observations.filter(value=>value.verified), holdoutAttempts=observations.filter(value=>taskById.get(value.taskId)?.split==='holdout').length;
  const completeSum = (values: Array<number|null>) => values.length && values.every(value=>value!==null) ? values.reduce<number>((sum,value)=>sum+(value??0),0) : null;
  const cost=completeSum(observations.map(value=>value.monetaryCost));
  return {
    attempts:observations.length,
    holdoutAttempts,
    verified:verified.length,
    verifiedSuccessRate:observations.length?verified.length/observations.length:null,
    latencyMs:observations.length?observations.reduce((sum,value)=>sum+value.latencyMs,0):null,
    attemptsIncludingRetries:observations.length?observations.reduce((sum,value)=>sum+value.attempts,0):null,
    escalations:observations.length?observations.reduce((sum,value)=>sum+value.escalations,0):null,
    parentContextBytes:observations.length?observations.reduce((sum,value)=>sum+value.parentContextBytes,0):null,
    batonBytes:observations.length?observations.reduce((sum,value)=>sum+value.batonBytes,0):null,
    additionalContextRequests:observations.length?observations.reduce((sum,value)=>sum+value.additionalContextRequests,0):null,
    reportedInputTokens:completeSum(observations.map(value=>value.inputTokens)),
    reportedOutputTokens:completeSum(observations.map(value=>value.outputTokens)),
    monetaryCost:cost,
    incorrectChanges:observations.length?observations.reduce((sum,value)=>sum+value.incorrectChanges,0):null,
    unnecessaryFilesTouched:observations.length?observations.reduce((sum,value)=>sum+value.unnecessaryFilesTouched,0):null,
    costTimePerVerifiedOutcome:verified.length?{latencyMs:observations.reduce((sum,value)=>sum+value.latencyMs,0)/verified.length,monetaryCost:cost===null?null:cost/verified.length}:null,
  };
}

function validateSuite(suite: FrozenRoutingSuite) {
  if (suite.schema!=='agent-control.capability-routing-suite/v1'||suite.classification!=='FROZEN_DETERMINISTIC_ROUTING_SUITE_NOT_LIVE_PROVIDER_EVIDENCE'||suite.tasks.length<50||suite.tasks.length>100) throw new Error('capability_routing_suite_invalid');
  const ids=new Set<string>(); for(const task of suite.tasks){if(ids.has(task.id))throw new Error('capability_routing_task_duplicate');ids.add(task.id);if(!task.deterministicVerifier.length)throw new Error(`capability_routing_verifier_missing:${task.id}`);}
  if(suite.tasks.filter(task=>task.split==='holdout').length<10)throw new Error('capability_routing_holdout_too_small');
}

function sha(value:string){return createHash('sha256').update(value).digest('hex');}
function stable(value:unknown):string{if(Array.isArray(value))return`[${value.map(stable).join(',')}]`;if(value&&typeof value==='object')return`{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,child])=>`${JSON.stringify(key)}:${stable(child)}`).join(',')}}`;return JSON.stringify(value);}
