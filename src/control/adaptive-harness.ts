import {createHash} from 'node:crypto';
import type {ContextTier} from './context.js';
import {EconomicRouter, type ExecutionIntent, type RouteCandidate, type RouteDecision} from './economic-routing.js';
import type {ExecutionAuthority} from './execution-provider.js';
import {resolveGovernedRuntimeBudget, type GovernedRuntimeBudget, type RuntimeBudgetRequest} from './runtime-budget.js';
import {
  DEFAULT_HARNESS_PROFILES,
  HarnessProfileRouter,
  type ContextPacket,
  type HarnessProfileDecision,
  type HarnessProfileName,
  type HarnessProfilePolicy,
  type HarnessRoutingSignals,
} from './harness-efficiency.js';

export type SkillStatus = 'proposed' | 'qualified' | 'revoked';
export type ToolRisk = 'read' | 'write' | 'privileged' | 'destructive';

export interface SkillDefinition {
  id: string;
  version: string;
  status: SkillStatus;
  capabilities: string[];
  requiredTools: string[];
  qualificationEvidence: string[];
}

export interface ToolDefinition {
  id: string;
  risk: ToolRisk;
  capabilities: string[];
}

/** Extension point only: agents may request a capability, but cannot qualify it. */
export interface SkillProposalRequest {
  taskId: string;
  requiredCapability: string;
  requestedBy: string;
  reason: string;
}

export interface SkillProposalPort {
  propose(request: SkillProposalRequest): Promise<{proposalId: string}>;
}

export interface PromptProfile {
  id: string;
  version: string;
  description: string;
}

export interface HarnessCandidate {
  route: RouteCandidate;
  workerCapabilities: string[];
  modelCapabilities: string[];
  promptProfiles: PromptProfile[];
  availableSkillIds: string[];
  availableToolIds: string[];
  runtime: Record<string, string | number | boolean>;
  supportedHarnessProfiles?: HarnessProfileName[];
}

export interface VerificationPolicy {
  requiredEvidence: string[];
  requireIndependentCheck: boolean;
}

export interface EscalationPolicy {
  minimumConfidence: number;
  maximumAttempts: number;
  onFailure: 'review' | 'reroute';
}

export interface ContextStrategy {
  tier: ContextTier;
  sourceIds: string[];
  evidenceIds: string[];
  estimatedTokens: number;
  packetId?: string;
  omittedSourceIds?: string[];
  provenanceIds?: string[];
}

export interface HarnessExecutionStrategy {
  profile: HarnessProfileName;
  recommendedProfile: HarnessProfileName;
  routingMode: HarnessProfileDecision['mode'];
  evidenceQualified: boolean;
  decisionReasons: string[];
  contextStrategyId: string;
  maximumTurns: number;
  contextPacketId?: string;
}

export interface ExecutionRecipe {
  id: string;
  taskId: string;
  jobId?: string;
  runId?: string;
  stepId?: string;
  workerId: string;
  providerId: string;
  accountProfileId?: string;
  modelId: string;
  promptProfile: PromptProfile;
  /** Absent only on pre-profile persisted/fixture recipes; interpreted as STANDARD. */
  harness?: HarnessExecutionStrategy;
  context: ContextStrategy;
  skills: SkillDefinition[];
  tools: ToolDefinition[];
  runtime: Record<string, string | number | boolean>;
  authority: ExecutionAuthority;
  resourceLimits: {maximumLatencyMs?: number; maximumMonetarySpend?: number};
  /** Explicit multi-dimensional policy. Absent on legacy recipes. */
  runtimeBudget?: GovernedRuntimeBudget;
  verification: VerificationPolicy;
  escalation: EscalationPolicy;
  routeReason: string;
  fingerprint: string;
}

export interface RecipeRequest {
  taskId: string;
  jobId?: string;
  runId?: string;
  stepId?: string;
  taskType: string;
  requiredCapabilities: string[];
  requiredTools: string[];
  deniedTools?: string[];
  approvedRisks?: ToolRisk[];
  preferredPromptProfile?: string;
  intent: ExecutionIntent;
  inputTokens: number;
  outputTokens: number;
  maximumLatencyMs?: number;
  maximumMonetarySpend?: number;
  runtimeBudget?: RuntimeBudgetRequest;
  meteredApproved?: boolean;
  context: ContextStrategy;
  authority: ExecutionAuthority;
  verification: VerificationPolicy;
  escalation: EscalationPolicy;
  harnessRouting?: HarnessRoutingSignals;
  contextPacket?: ContextPacket;
  contextStrategyId?: string;
}

export interface RecipeBuildResult {
  recipe?: ExecutionRecipe;
  route: RouteDecision;
  rejected: Array<{candidateId: string; reasons: string[]}>;
}

export class SkillCatalog {
  private readonly skills = new Map<string, SkillDefinition>();

  constructor(skills: SkillDefinition[] = []) { for (const skill of skills) this.skills.set(skill.id, structuredClone(skill)); }
  get(id: string) { const skill = this.skills.get(id); return skill ? structuredClone(skill) : undefined; }

  select(requiredCapabilities: string[], alreadyProvided: string[], availableIds: string[]) {
    const missing = new Set(requiredCapabilities.filter(capability => !alreadyProvided.includes(capability)));
    const selected: SkillDefinition[] = [], available = availableIds
      .map(id => this.skills.get(id))
      .filter((skill): skill is SkillDefinition => skill !== undefined)
      .filter(skill => skill.status === 'qualified' && skill.qualificationEvidence.length > 0);
    while (missing.size) {
      const best = available
        .filter(skill => !selected.some(item => item.id === skill.id))
        .map(skill => ({skill, coverage: skill.capabilities.filter(capability => missing.has(capability)).length}))
        .sort((left, right) => right.coverage - left.coverage || left.skill.id.localeCompare(right.skill.id))[0];
      if (!best || best.coverage === 0) break;
      selected.push(structuredClone(best.skill));
      for (const capability of best.skill.capabilities) missing.delete(capability);
    }
    return {selected, missing: [...missing]};
  }
}

export class ToolPolicy {
  private readonly tools = new Map<string, ToolDefinition>();

  constructor(tools: ToolDefinition[] = []) { for (const tool of tools) this.tools.set(tool.id, structuredClone(tool)); }

  grant(requiredIds: string[], candidateToolIds: string[], deniedIds: string[] = [], approvedRisks: ToolRisk[] = ['read']) {
    const denied = new Set(deniedIds), available = new Set(candidateToolIds), approved = new Set<ToolRisk>(approvedRisks);
    const granted: ToolDefinition[] = [], reasons: string[] = [];
    for (const id of [...new Set(requiredIds)]) {
      const tool = this.tools.get(id);
      if (!tool) { reasons.push(`unknown_tool:${id}`); continue; }
      if (denied.has(id)) { reasons.push(`tool_denied:${id}`); continue; }
      if (!available.has(id)) { reasons.push(`tool_unavailable:${id}`); continue; }
      if (!approved.has(tool.risk)) { reasons.push(`risk_not_approved:${id}:${tool.risk}`); continue; }
      granted.push(structuredClone(tool));
    }
    return {granted, reasons};
  }

  authorize(recipe: ExecutionRecipe, toolId: string, live: ExecutionAuthority | LiveToolAuthorization) {
    const context: LiveToolAuthorization = 'authority' in live ? live : {authority: live};
    const authority = context.authority;
    const tool = this.tools.get(toolId);
    if (!tool) return {allowed: false, reason: 'tool_unknown'};
    if (recipe.authority.owner !== 'agent') return {allowed: false, reason: 'recipe_not_agent_owned'};
    if (authority.laneId !== recipe.authority.laneId) return {allowed: false, reason: 'lane_identity_mismatch'};
    if (authority.owner !== 'agent') return {allowed: false, reason: 'human_owns_execution'};
    if (authority.leaseGeneration !== recipe.authority.leaseGeneration) return {allowed: false, reason: 'stale_lease_generation'};
    if (authority.ownershipGeneration !== recipe.authority.ownershipGeneration) return {allowed: false, reason: 'stale_ownership_generation'};
    if (!recipe.tools.some(tool => tool.id === toolId)) return {allowed: false, reason: 'tool_not_granted'};
    if (context.revokedToolIds?.includes(toolId)) return {allowed: false, reason: 'tool_revoked'};
    if (context.availableToolIds && !context.availableToolIds.includes(toolId)) return {allowed: false, reason: 'capability_unavailable'};
    if (context.workerId && context.workerId !== recipe.workerId) return {allowed: false, reason: 'worker_incompatible'};
    if (context.policyDeniedToolIds?.includes(toolId)) return {allowed: false, reason: 'policy_restricted'};
    if (context.approvedRisks && !context.approvedRisks.includes(tool.risk)) return {allowed: false, reason: 'privilege_not_approved'};
    return {allowed: true};
  }
}

export interface LiveToolAuthorization {
  authority: ExecutionAuthority;
  availableToolIds?: string[];
  revokedToolIds?: string[];
  workerId?: string;
  policyDeniedToolIds?: string[];
  approvedRisks?: ToolRisk[];
}

interface Composition {
  candidate: HarnessCandidate;
  prompt?: PromptProfile;
  skills: SkillDefinition[];
  tools: ToolDefinition[];
  reasons: string[];
}

export class AdaptiveHarness {
  constructor(
    readonly skillCatalog: SkillCatalog,
    readonly toolPolicy: ToolPolicy,
    readonly router = new EconomicRouter(),
    readonly profileRouter = new HarnessProfileRouter(),
    readonly profiles: Readonly<Record<HarnessProfileName, HarnessProfilePolicy>> = DEFAULT_HARNESS_PROFILES,
  ) {}

  build(request: RecipeRequest, candidates: HarnessCandidate[]): RecipeBuildResult {
    const profileDecision = this.profileRouter.route(request.harnessRouting ?? {
      taskId: request.taskId, complexity: .5, risk: 'medium', knownExactTargets: false, estimatedFiles: 0,
      deterministicVerifier: request.verification.requiredEvidence.length > 0, ambiguity: .5, architectural: false,
    });
    if (request.contextPacket && request.contextPacket.profile !== profileDecision.appliedProfile) throw new Error('context_packet_profile_mismatch');
    const compositions = candidates.map(candidate => this.compose(request, candidate, profileDecision));
    const routeCandidates = compositions.map(composition => ({
      ...composition.candidate.route,
      capabilities: [...new Set([
        ...composition.candidate.route.capabilities,
        ...composition.candidate.workerCapabilities,
        ...composition.candidate.modelCapabilities,
        ...composition.skills.flatMap(skill => skill.capabilities),
      ])],
      qualified: composition.candidate.route.qualified && composition.reasons.length === 0,
      qualificationReason: composition.reasons.length ? composition.reasons.join('|') : composition.candidate.route.qualificationReason,
    }));
    const route = this.router.route({
      taskId: request.taskId,
      taskType: request.taskType,
      intent: request.intent,
      requiredCapabilities: request.requiredCapabilities,
      inputTokens: request.inputTokens,
      outputTokens: request.outputTokens,
      maximumLatencyMs: request.maximumLatencyMs,
      maximumMonetarySpend: request.maximumMonetarySpend,
      minimumConfidence: request.escalation.minimumConfidence,
      meteredApproved: request.meteredApproved,
    }, routeCandidates);
    const rejected = compositions.filter(composition => composition.reasons.length).map(composition => ({candidateId: composition.candidate.route.id, reasons: composition.reasons}));
    if (!route.selected) return {route, rejected};
    const composition = compositions.find(item => item.candidate.route.id === route.selected?.candidate.id)!;
    const context: ContextStrategy = request.contextPacket ? {
      ...structuredClone(request.context), sourceIds: [...request.contextPacket.sourceIds], estimatedTokens: request.contextPacket.estimatedTokens,
      packetId: request.contextPacket.id, omittedSourceIds: request.contextPacket.omitted.map(item => item.id), provenanceIds: [...request.contextPacket.provenanceIds],
    } : structuredClone(request.context);
    const profilePolicy = this.profiles[profileDecision.appliedProfile];
    const harness: HarnessExecutionStrategy = {
      profile: profileDecision.appliedProfile,
      recommendedProfile: profileDecision.recommendedProfile,
      routingMode: profileDecision.mode,
      evidenceQualified: profileDecision.evidenceQualified,
      decisionReasons: [...profileDecision.reasons],
      contextStrategyId: request.contextStrategyId ?? `tier-${context.tier}`,
      maximumTurns: profilePolicy.maximumTurns,
      ...(request.contextPacket ? {contextPacketId: request.contextPacket.id} : {}),
    };
    const draft = {
      taskId: request.taskId,
      ...(request.jobId ? {jobId: request.jobId} : {}),
      ...(request.runId ? {runId: request.runId} : {}),
      ...(request.stepId ? {stepId: request.stepId} : {}),
      workerId: composition.candidate.route.workerId,
      providerId: composition.candidate.route.providerId,
      ...(composition.candidate.route.accountProfileId ? {accountProfileId: composition.candidate.route.accountProfileId} : {}),
      modelId: composition.candidate.route.modelId,
      promptProfile: composition.prompt!,
      harness,
      context,
      skills: composition.skills,
      tools: composition.tools,
      runtime: structuredClone(composition.candidate.runtime),
      authority: structuredClone(request.authority),
      resourceLimits: {maximumLatencyMs: request.maximumLatencyMs, maximumMonetarySpend: request.maximumMonetarySpend},
      ...(request.runtimeBudget ? {runtimeBudget: resolveGovernedRuntimeBudget(profileDecision.appliedProfile, request.runtimeBudget, {
        medianModelCallMs: typeof composition.candidate.runtime.medianModelCallMs === 'number' ? composition.candidate.runtime.medianModelCallMs : undefined,
        p95ModelCallMs: typeof composition.candidate.runtime.p95ModelCallMs === 'number' ? composition.candidate.runtime.p95ModelCallMs : undefined,
        generationTokensPerSecond: typeof composition.candidate.runtime.generationTokensPerSecond === 'number' ? composition.candidate.runtime.generationTokensPerSecond : undefined,
        maximumOutputTokens: request.outputTokens,
        evidenceIds: typeof composition.candidate.runtime.runtimeBudgetEvidenceId === 'string' ? [composition.candidate.runtime.runtimeBudgetEvidenceId] : [],
      })} : {}),
      verification: structuredClone(request.verification),
      escalation: structuredClone(request.escalation),
      routeReason: route.reason,
    };
    const fingerprint = createHash('sha256').update(stableJson(draft)).digest('hex');
    return {recipe: {...draft, id: `recipe-${fingerprint.slice(0, 16)}`, fingerprint}, route, rejected};
  }

  private compose(request: RecipeRequest, candidate: HarnessCandidate, profileDecision: HarnessProfileDecision): Composition {
    const prompt = request.preferredPromptProfile
      ? candidate.promptProfiles.find(profile => profile.id === request.preferredPromptProfile)
      : candidate.promptProfiles[0];
    const reasons: string[] = [];
    if (request.authority.owner !== 'agent') reasons.push('authority_not_agent_owned');
    if (!prompt) reasons.push('prompt_profile_unavailable');
    if (candidate.supportedHarnessProfiles && !candidate.supportedHarnessProfiles.includes(profileDecision.appliedProfile)) reasons.push(`harness_profile_unsupported:${profileDecision.appliedProfile}`);
    reasons.push(...unsafeRuntimeSettings(candidate.runtime));
    const provided = [...candidate.route.capabilities, ...candidate.workerCapabilities, ...candidate.modelCapabilities];
    const skillResult = this.skillCatalog.select(request.requiredCapabilities, provided, candidate.availableSkillIds);
    if (skillResult.missing.length) reasons.push(`capabilities_unresolved:${skillResult.missing.join(',')}`);
    const requiredTools = [...request.requiredTools, ...skillResult.selected.flatMap(skill => skill.requiredTools)];
    const toolResult = this.toolPolicy.grant(requiredTools, candidate.availableToolIds, request.deniedTools, request.approvedRisks);
    reasons.push(...toolResult.reasons);
    if (request.harnessRouting) {
      const policy = this.profiles[profileDecision.appliedProfile];
      const contextTokens = request.contextPacket?.estimatedTokens ?? request.context.estimatedTokens;
      if (contextTokens > policy.maximumInitialContextTokens) reasons.push(`harness_context_budget_exceeded:${contextTokens}:${policy.maximumInitialContextTokens}`);
      if (toolResult.granted.length > policy.maximumTools) reasons.push(`harness_tool_budget_exceeded:${toolResult.granted.length}:${policy.maximumTools}`);
      if (skillResult.selected.length > policy.maximumOptionalSkills) reasons.push(`harness_skill_budget_exceeded:${skillResult.selected.length}:${policy.maximumOptionalSkills}`);
    }
    return {candidate, prompt, skills: skillResult.selected, tools: toolResult.granted, reasons};
  }
}

const SECRET_LIKE_RUNTIME_KEY = /(?:^|[_.-])(token|secret|password|credential|api[-_]?key|private[-_]?key)(?:$|[_.-])/i;

function unsafeRuntimeSettings(runtime: Record<string, string | number | boolean>): string[] {
  const reasons: string[] = [];
  for (const [key, value] of Object.entries(runtime)) {
    if (SECRET_LIKE_RUNTIME_KEY.test(key)) reasons.push(`secret_like_runtime_key:${key}`);
    if (typeof value === 'string' && /:\/\/[^/@\s]+:[^/@\s]+@/.test(value)) reasons.push(`credentialed_runtime_url:${key}`);
  }
  return reasons;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  return JSON.stringify(value);
}
