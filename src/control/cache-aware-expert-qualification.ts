import type {WorkParcelPlan, WorkParcelPlanner, WorkParcelPlanStage} from './work-parcels.js';

const MAIN_REQUEST = /agent control 4\.3.*cache-aware expert delegation qualification/i;
const RESTART_REQUEST = /agent control 4\.3.*backend restart control/i;

/**
 * Explicitly gated physical-qualification planner. It emits ordinary Work Parcel
 * stages and route requests; execution still crosses the production coordinator,
 * model registry, JobRuntime, provider adapter, ToolPolicy and verifier.
 */
export function cacheAwareExpertQualificationPlanner(environment: NodeJS.ProcessEnv = process.env): WorkParcelPlanner | undefined {
  if (environment.AGENT_CONTROL_ENABLE_CACHE_EXPERT_QUALIFICATION !== 'true') return undefined;
  const warmModel = required(environment.AGENT_CONTROL_CACHE_EXPERT_WARM_MODEL, 'cache_expert_warm_model_required');
  const coldModel = required(environment.AGENT_CONTROL_CACHE_EXPERT_COLD_MODEL, 'cache_expert_cold_model_required');
  const modelRole = required(environment.AGENT_CONTROL_CACHE_EXPERT_MODEL_ROLE, 'cache_expert_model_role_required');
  const warmBackend = required(environment.AGENT_CONTROL_CACHE_EXPERT_WARM_BACKEND_INSTANCE, 'cache_expert_warm_backend_required');
  const coldBackend = required(environment.AGENT_CONTROL_CACHE_EXPERT_COLD_BACKEND_INSTANCE, 'cache_expert_cold_backend_required');
  const repositoryRef = required(environment.AGENT_CONTROL_CACHE_EXPERT_REPOSITORY_REF, 'cache_expert_repository_ref_required');
  const repositorySha = requiredSha(environment.AGENT_CONTROL_CACHE_EXPERT_REPOSITORY_SHA256, 'cache_expert_repository_sha_required');
  const branchSha = requiredSha(environment.AGENT_CONTROL_CACHE_EXPERT_BRANCH_SHA256, 'cache_expert_branch_sha_required');
  const transportSha = requiredSha(environment.AGENT_CONTROL_CACHE_EXPERT_TRANSPORT_SHA256, 'cache_expert_transport_sha_required');
  const instructionSha = requiredSha(environment.AGENT_CONTROL_CACHE_EXPERT_INSTRUCTION_SHA256, 'cache_expert_instruction_sha_required');
  const toolSha = requiredSha(environment.AGENT_CONTROL_CACHE_EXPERT_TOOL_SHA256, 'cache_expert_tool_sha_required');
  const governanceSha = requiredSha(environment.AGENT_CONTROL_CACHE_EXPERT_GOVERNANCE_SHA256, 'cache_expert_governance_sha_required');
  const stableDependency = requiredSha(environment.AGENT_CONTROL_CACHE_EXPERT_STABLE_DEPENDENCY_SHA256, 'cache_expert_stable_dependency_required');
  const changedDependency = requiredSha(environment.AGENT_CONTROL_CACHE_EXPERT_CHANGED_DEPENDENCY_SHA256, 'cache_expert_changed_dependency_required');
  const scopes = () => ({
    [warmModel]: {sessionId: `session:${warmModel}`, cacheScopeId: `slot:${warmModel}:0`, backendInstanceId: warmBackend},
    [coldModel]: {sessionId: `session:${coldModel}`, cacheScopeId: `slot:${coldModel}:0`, backendInstanceId: coldBackend},
  });
  const context = (changed = false) => ({
    taskType: changed ? 'cache-qualification-changed-context' : 'cache-qualification-stable-context',
    repositoryRef,
    repositoryIdentitySha256: repositorySha,
    branchStateSha256: branchSha,
    dependencyContextSha256: changed ? changedDependency : stableDependency,
    instructionContextSha256: instructionSha,
    toolContractSha256: toolSha,
    governancePolicySha256: governanceSha,
    immutableContextSha256: changed ? changedDependency : stableDependency,
    promptPrefixSha256: changed ? changedDependency : stableDependency,
    transportContextSha256: transportSha,
    contextTags: ['qualification:cache-aware-expert', `repository:${repositoryRef}`, changed ? 'context:changed' : 'context:stable'],
  });
  const requested = (options: {model?: string; role?: string; changed?: boolean; reason: string}): NonNullable<WorkParcelPlanStage['requestedRoute']> => ({
    ...(options.model ? {model: options.model} : {modelRole: options.role ?? modelRole}),
    allowFallback: options.model ? false : true,
    profile: 'THIN',
    reason: options.reason,
    cacheContext: context(options.changed),
    cacheScopeByModel: scopes(),
  });
  return {plan(prompt: string): WorkParcelPlan {
    if (MAIN_REQUEST.test(prompt)) return {
      objective: prompt,
      planner: {kind: 'deterministic', reason: 'Explicitly gated 4.3 physical qualification plan; every stage uses normal production routing and execution'},
      stages: [
        {id:'a-cold-population',name:'A · Cold population on candidate Warm Expert',job:'non-openai-cache-stable@1.0.0',parameters:{prefixVariant:'stable'},requestedRoute:requested({model:warmModel,reason:'Establish a genuine verified cold population on the designated candidate route'})},
        {id:'b-compatible-follow-on',name:'B/C · Compatible follow-on with cold competitor',job:'non-openai-cache-stable@1.0.0',dependsOn:['a-cold-population'],parameters:{prefixVariant:'stable'},requestedRoute:requested({role:modelRole,reason:'Compare the equally capable cold primary with the compatible measured Warm Expert'})},
        {id:'d-incompatible-control',name:'D · Incompatible task control',job:'non-openai-cache-changed-prefix@1.0.0',dependsOn:['b-compatible-follow-on'],parameters:{prefixVariant:'changed-prefix-control'},requestedRoute:requested({role:modelRole,changed:true,reason:'Material task/dependency context changed; cache affinity must not select the prior Warm Expert'})},
        {id:'e-context-invalidation',name:'E · Material context invalidation',job:'non-openai-cache-changed-prefix@1.0.0',dependsOn:['d-incompatible-control'],parameters:{prefixVariant:'changed-prefix-control'},requestedRoute:requested({model:warmModel,changed:true,reason:'Run incompatible work in the same warm backend scope so displaced retained context is invalidated after observation'})},
      ],
    };
    if (RESTART_REQUEST.test(prompt)) return {
      objective: prompt,
      planner: {kind:'deterministic',reason:'Explicitly gated backend-restart negative control through normal production routing'},
      stages:[{id:'f-backend-restart',name:'F · Backend restart control',job:'non-openai-cache-stable@1.0.0',parameters:{prefixVariant:'stable'},requestedRoute:requested({role:modelRole,reason:'A new backend instance has no inherited cache authority; the declared cold primary must remain selected'})}],
    };
    throw new Error('cache_expert_qualification_request_unrecognised');
  }};
}

function required(value: string | undefined, reason: string) { if (!value?.trim()) throw new Error(reason); return value.trim(); }
function requiredSha(value: string | undefined, reason: string) { const result=required(value,reason); if(!/^[a-f0-9]{64}$/.test(result)) throw new Error(reason); return result; }
