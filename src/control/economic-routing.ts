export type ExecutionIntent = 'URGENT' | 'NORMAL' | 'ECONOMY' | 'OVERNIGHT';

export interface IntentPolicy {
  intent: ExecutionIntent;
  targetCompletionMs: number;
  allowMeteredInitial: boolean;
  allowMeteredEscalation: boolean;
  weights: {
    monetary: number;
    latency: number;
    occupancy: number;
    contention: number;
    failureRisk: number;
    retryCost: number;
    quality: number;
  };
}

export const INTENT_POLICIES: Record<ExecutionIntent, IntentPolicy> = {
  URGENT: {
    intent: 'URGENT', targetCompletionMs: 5 * 60_000, allowMeteredInitial: true, allowMeteredEscalation: true,
    weights: {monetary: .45, latency: 3.2, occupancy: .15, contention: .45, failureRisk: 1.5, retryCost: 1.4, quality: 1.2},
  },
  NORMAL: {
    intent: 'NORMAL', targetCompletionMs: 20 * 60_000, allowMeteredInitial: true, allowMeteredEscalation: true,
    weights: {monetary: 1, latency: .8, occupancy: .4, contention: .8, failureRisk: 1.2, retryCost: 1.1, quality: 1.3},
  },
  ECONOMY: {
    intent: 'ECONOMY', targetCompletionMs: 2 * 60 * 60_000, allowMeteredInitial: false, allowMeteredEscalation: true,
    weights: {monetary: 4, latency: .12, occupancy: .55, contention: .7, failureRisk: 1, retryCost: .8, quality: 1.2},
  },
  OVERNIGHT: {
    intent: 'OVERNIGHT', targetCompletionMs: 8 * 60 * 60_000, allowMeteredInitial: false, allowMeteredEscalation: true,
    weights: {monetary: 6, latency: .025, occupancy: .15, contention: 1.1, failureRisk: .8, retryCost: .55, quality: 1.4},
  },
};

export interface ProviderPricing {
  currency: string;
  billing: 'free' | 'included' | 'metered';
  inputPerMillionTokens: number;
  outputPerMillionTokens: number;
  fixedPerRequest: number;
  effectiveFrom: string;
  source?: string;
}

export interface ProviderPerformance {
  startupLatencyMs: number;
  inputTokensPerSecond: number;
  outputTokensPerSecond: number;
  historicalSuccessRate: number;
  expectedQuality: number;
  confidence: number;
  contextLimitTokens: number;
  source: 'measured' | 'configured' | 'specification';
  sampleSize?: number;
}

export interface RouteCandidate {
  id: string;
  providerId: string;
  accountProfileId?: string;
  modelId: string;
  workerId: string;
  local: boolean;
  health: 'unknown' | 'healthy' | 'degraded' | 'offline';
  qualified: boolean;
  qualificationReason: string;
  capabilities: string[];
  pricing: ProviderPricing;
  performance: ProviderPerformance;
  occupancyShare?: number;
  queueDelayMs?: number;
  currentContention?: number;
  approvalRequired?: boolean;
}

export interface HistoricalExecution {
  providerId: string;
  taskType: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  monetaryCost: number;
  success: boolean;
  quality?: number;
  confidence?: number;
}

export interface RoutingRequest {
  taskId: string;
  taskType: string;
  intent: ExecutionIntent;
  requiredCapabilities: string[];
  inputTokens: number;
  outputTokens: number;
  maximumLatencyMs?: number;
  maximumMonetarySpend?: number;
  minimumConfidence?: number;
  minimumQuality?: number;
  meteredApproved?: boolean;
  allowMeteredInitial?: boolean;
}

export interface RouteEstimate {
  monetaryCost: number;
  estimatedLatencyMs: number;
  occupancyMs: number;
  contention: number;
  failureRisk: number;
  retryCost: number;
  confidence: number;
  expectedQuality: number;
  evidenceSource: ProviderPerformance['source'] | 'historical';
  sampleSize: number;
}

export interface RouteAssessment {
  candidate: RouteCandidate;
  estimate: RouteEstimate;
  acceptable: boolean;
  rejectionReasons: string[];
  effectiveCost: number;
}

export interface RouteDecision {
  selected?: RouteAssessment;
  assessments: RouteAssessment[];
  intent: ExecutionIntent;
  reason: string;
}

const median = (values: number[]) => {
  if (!values.length) return undefined;
  const sorted = [...values].sort((left, right) => left - right), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const clamp = (value: number) => Math.max(0, Math.min(1, value));

export class RouteEstimator {
  constructor(readonly history: HistoricalExecution[] = []) {}

  estimate(request: RoutingRequest, candidate: RouteCandidate): RouteEstimate {
    const relevant = this.history.filter(sample => sample.providerId === candidate.providerId && sample.taskType === request.taskType);
    const successful = relevant.filter(sample => sample.success);
    const successProbability = clamp(relevant.length ? successful.length / relevant.length : candidate.performance.historicalSuccessRate);
    const measuredDuration = median(successful.map(sample => sample.durationMs));
    const serviceDuration = measuredDuration ?? candidate.performance.startupLatencyMs
      + request.inputTokens / Math.max(.1, candidate.performance.inputTokensPerSecond) * 1000
      + request.outputTokens / Math.max(.1, candidate.performance.outputTokensPerSecond) * 1000;
    const attempts = Math.min(3, 1 / Math.max(.2, successProbability));
    const oneAttemptCost = candidate.pricing.fixedPerRequest
      + request.inputTokens * candidate.pricing.inputPerMillionTokens / 1_000_000
      + request.outputTokens * candidate.pricing.outputPerMillionTokens / 1_000_000;
    return {
      monetaryCost: oneAttemptCost,
      estimatedLatencyMs: (candidate.queueDelayMs ?? 0) + serviceDuration * attempts,
      occupancyMs: candidate.local ? serviceDuration * attempts * (candidate.occupancyShare ?? 1) : 0,
      contention: clamp(candidate.currentContention ?? 0),
      failureRisk: 1 - successProbability,
      retryCost: Math.max(0, attempts - 1) * oneAttemptCost,
      confidence: clamp(median(successful.flatMap(sample => sample.confidence === undefined ? [] : [sample.confidence])) ?? candidate.performance.confidence),
      expectedQuality: clamp(median(successful.flatMap(sample => sample.quality === undefined ? [] : [sample.quality])) ?? candidate.performance.expectedQuality),
      evidenceSource: relevant.length ? 'historical' : candidate.performance.source,
      sampleSize: relevant.length || candidate.performance.sampleSize || 0,
    };
  }
}

export class EconomicRouter {
  constructor(readonly estimator = new RouteEstimator()) {}

  route(request: RoutingRequest, candidates: RouteCandidate[]): RouteDecision {
    const policy = INTENT_POLICIES[request.intent], target = policy.targetCompletionMs;
    const minimumConfidence = request.minimumConfidence ?? .65, minimumQuality = request.minimumQuality ?? .7;
    const assessments = candidates.map(candidate => {
      const estimate = this.estimator.estimate(request, candidate), rejectionReasons: string[] = [];
      if (candidate.health !== 'healthy') rejectionReasons.push(`provider_${candidate.health}`);
      if (!candidate.qualified) rejectionReasons.push(`unqualified:${candidate.qualificationReason}`);
      const missing = request.requiredCapabilities.filter(capability => !candidate.capabilities.includes(capability));
      if (missing.length) rejectionReasons.push(`missing_capabilities:${missing.join(',')}`);
      if (estimate.confidence < minimumConfidence) rejectionReasons.push('confidence_below_policy');
      if (estimate.expectedQuality < minimumQuality) rejectionReasons.push('quality_below_policy');
      if (request.maximumLatencyMs !== undefined && estimate.estimatedLatencyMs > request.maximumLatencyMs) rejectionReasons.push('latency_budget');
      if (request.maximumMonetarySpend !== undefined && estimate.monetaryCost + estimate.retryCost > request.maximumMonetarySpend) rejectionReasons.push('spend_budget');
      const metered = candidate.pricing.billing === 'metered' && estimate.monetaryCost > 0;
      if (metered && candidate.approvalRequired && !request.meteredApproved) rejectionReasons.push('metered_approval_required');
      if (metered && (request.allowMeteredInitial ?? policy.allowMeteredInitial) === false) rejectionReasons.push('metered_initial_disabled');
      const cost = estimate.monetaryCost * policy.weights.monetary
        + estimate.estimatedLatencyMs / Math.max(1, target) * policy.weights.latency
        + estimate.occupancyMs / 3_600_000 * policy.weights.occupancy
        + estimate.contention * policy.weights.contention
        + estimate.failureRisk ** 2 * policy.weights.failureRisk
        + estimate.retryCost * policy.weights.retryCost
        + (2 - estimate.confidence - estimate.expectedQuality) * policy.weights.quality;
      return {candidate, estimate, acceptable: rejectionReasons.length === 0, rejectionReasons, effectiveCost: cost};
    });
    const selected = assessments.filter(item => item.acceptable).sort((left, right) => left.effectiveCost - right.effectiveCost || left.candidate.id.localeCompare(right.candidate.id))[0];
    return {
      selected,
      assessments,
      intent: request.intent,
      reason: selected
        ? `selected:${selected.candidate.id};intent:${request.intent};evidence:${selected.estimate.evidenceSource};effective_cost:${selected.effectiveCost.toFixed(4)}`
        : `no_route_passed:${assessments.flatMap(item => item.rejectionReasons).join('|')}`,
    };
  }
}

export interface ExecutionProgress {
  routeId: string;
  elapsedMs: number;
  failures: number;
  confidence?: number;
  estimatedRemainingMs?: number;
  contextRef?: string;
  checkpointRef?: string;
}

export interface EscalationDecision {
  action: 'continue' | 'escalate' | 'review';
  reason: string;
  route?: RouteAssessment;
  preserve: {contextRef?: string; checkpointRef?: string};
}

export class DynamicEscalationRouter {
  constructor(readonly router: EconomicRouter) {}

  reevaluate(request: RoutingRequest, candidates: RouteCandidate[], progress: ExecutionProgress): EscalationDecision {
    const policy = INTENT_POLICIES[request.intent], minimumConfidence = request.minimumConfidence ?? .65;
    const trigger = progress.failures > 0 ? 'failure'
      : progress.confidence !== undefined && progress.confidence < minimumConfidence ? 'low-confidence'
      : progress.elapsedMs + (progress.estimatedRemainingMs ?? 0) > (request.maximumLatencyMs ?? policy.targetCompletionMs * 1.25) ? 'latency-budget'
      : undefined;
    const preserve = {contextRef: progress.contextRef, checkpointRef: progress.checkpointRef};
    if (!trigger) return {action: 'continue', reason: 'route_within_policy', preserve};
    const remaining = candidates.filter(candidate => candidate.id !== progress.routeId);
    const decision = this.router.route({...request, allowMeteredInitial: policy.allowMeteredEscalation}, remaining);
    return decision.selected
      ? {action: 'escalate', reason: `${trigger}:${decision.reason}`, route: decision.selected, preserve}
      : {action: 'review', reason: `${trigger}:no_permitted_replacement`, preserve};
  }
}
