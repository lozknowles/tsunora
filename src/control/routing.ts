import type{AgentHandoff,ModelCandidate,RoutingPolicy,TaskContract}from"./types.js";
export function approvalRequired(c:TaskContract,h:AgentHandoff){return h.requiresApproval||c.risk==="high"||(h.requestedAccess==="own"&&c.risk!=="low");}
export function chooseCandidate(cap:string,cs:ModelCandidate[],p:RoutingPolicy){const id=p.championByCapability[cap],preferred=cs.find(c=>c.recipe.id===id&&["active","preferred"].includes(c.stage));if(preferred)return preferred;return cs.filter(c=>["candidate","active","preferred"].includes(c.stage)).map(candidate=>({candidate,score:candidate.capabilities.find(x=>x.capability===cap)?.score??0})).sort((a,b)=>b.score-a.score)[0]?.candidate;}
export function handoffAllowed(mode:"auto"|"manual",c:TaskContract,h:AgentHandoff){return mode!=="manual"&&!approvalRequired(c,h);}

export interface RouteOption {
  id: string;
  providerId: string;
  model: string;
  location: 'local' | 'remote';
  health: 'healthy' | 'degraded' | 'offline' | 'unknown';
  qualifiedCapabilities: string[];
  tools: string[];
  contextCapacity: number;
  capabilityScore: number;
  reliability: number;
  estimatedLatencyMs: number;
  estimatedDurationMs: number;
  estimatedCost: number;
  gpuRequired?: boolean;
  available: boolean;
}
export interface RouteRequest {
  capabilities: string[];
  tools?: string[];
  contextTokens?: number;
  urgency: 'low' | 'normal' | 'high';
  priority: number;
  costSensitivity: number;
  latencySensitivity: number;
  reliabilitySensitivity: number;
  privacy: 'standard' | 'local_only';
  localComputeAvailable: boolean;
  gpuAvailable: boolean;
  preferredProviderId?: string;
}
export interface RoutingFactor {factor: 'capability' | 'latency' | 'duration' | 'cost' | 'reliability' | 'privacy' | 'health' | 'preference' | 'availability'; effect: 'positive' | 'negative' | 'required'; detail: string;}
export interface RouteDecision {selected: RouteOption; considered: Array<{optionId: string; eligible: boolean; score?: number; reasons: string[]}>; rationale: RoutingFactor[]; createdAt: string;}

export function chooseRoute(request: RouteRequest, options: RouteOption[]): RouteDecision {
  const considered: RouteDecision['considered'] = [];
  const eligible: Array<{option: RouteOption; score: number}> = [];
  const maxLatency = Math.max(1, ...options.map(option => option.estimatedLatencyMs));
  const maxDuration = Math.max(1, ...options.map(option => option.estimatedDurationMs));
  const maxCost = Math.max(.000001, ...options.map(option => option.estimatedCost));
  for (const option of options) {
    const reasons: string[] = [];
    if (!option.available) reasons.push('unavailable');
    if (option.health !== 'healthy') reasons.push(`provider_${option.health}`);
    const missingCapabilities = request.capabilities.filter(capability => !option.qualifiedCapabilities.includes(capability));
    if (missingCapabilities.length) reasons.push(`unqualified:${missingCapabilities.join(',')}`);
    const missingTools = (request.tools ?? []).filter(tool => !option.tools.includes(tool));
    if (missingTools.length) reasons.push(`tools_missing:${missingTools.join(',')}`);
    if ((request.contextTokens ?? 0) > option.contextCapacity) reasons.push('context_capacity');
    if (request.privacy === 'local_only' && option.location !== 'local') reasons.push('privacy_requires_local');
    if (option.location === 'local' && !request.localComputeAvailable) reasons.push('local_compute_unavailable');
    if (option.gpuRequired && !request.gpuAvailable) reasons.push('gpu_unavailable');
    if (reasons.length) { considered.push({optionId: option.id, eligible: false, reasons}); continue; }
    const urgencyBoost = request.urgency === 'high' ? 1.5 : request.urgency === 'low' ? .5 : 1;
    const latencyValue = 1 - option.estimatedLatencyMs / maxLatency;
    const durationValue = 1 - option.estimatedDurationMs / maxDuration;
    const costValue = 1 - option.estimatedCost / maxCost;
    const score = option.capabilityScore * 4
      + option.reliability * (2 + request.reliabilitySensitivity * 3)
      + latencyValue * request.latencySensitivity * urgencyBoost * 4
      + durationValue * request.latencySensitivity * urgencyBoost * 2
      + costValue * request.costSensitivity * 4
      + (option.location === 'local' && request.urgency === 'low' ? 1 : 0)
      + (request.preferredProviderId === option.providerId ? 1 : 0)
      + Math.min(1, request.priority / 100) * option.reliability;
    eligible.push({option, score});
    considered.push({optionId: option.id, eligible: true, score, reasons: ['qualified_and_available']});
  }
  eligible.sort((left, right) => right.score - left.score || left.option.id.localeCompare(right.option.id));
  const selected = eligible[0]?.option;
  if (!selected) throw new Error(`no_qualified_route:${considered.flatMap(item => item.reasons).join('|')}`);
  const rationale: RoutingFactor[] = [
    {factor: 'capability', effect: 'required', detail: `qualified for ${request.capabilities.join(', ') || 'general execution'}`},
    {factor: 'health', effect: 'required', detail: `provider ${selected.providerId} is healthy`},
    {factor: 'latency', effect: request.urgency === 'high' ? 'positive' : 'negative', detail: `estimated startup ${selected.estimatedLatencyMs}ms; urgency ${request.urgency}`},
    {factor: 'duration', effect: 'negative', detail: `estimated execution ${selected.estimatedDurationMs}ms`},
    {factor: 'cost', effect: selected.estimatedCost === 0 ? 'positive' : 'negative', detail: `estimated monetary cost ${selected.estimatedCost.toFixed(4)}; sensitivity ${request.costSensitivity}`},
    {factor: 'reliability', effect: 'positive', detail: `observed reliability ${selected.reliability.toFixed(2)}`},
    {factor: 'privacy', effect: request.privacy === 'local_only' ? 'required' : 'positive', detail: `${selected.location} route satisfies ${request.privacy} policy`},
  ];
  if (request.preferredProviderId) rationale.push({factor: 'preference', effect: selected.providerId === request.preferredProviderId ? 'positive' : 'negative', detail: `operator preferred ${request.preferredProviderId}`});
  return {selected, considered, rationale, createdAt: new Date().toISOString()};
}
