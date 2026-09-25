import type {AgentControlConfig} from './config.js';
import {CostRoutingLedger,explainRouting,resolveRoutingPolicy,routingPreset,type CostPerformanceRoutingPolicy,type RoutingApproval,type RoutingCandidate,type ScopedRoutingPolicy,type RoutingScope} from './cost-performance-routing.js';
import type {CostRoutingInvocationOptions} from './openai-compatible-provider.js';
import {isOpenRouterEndpoint,openRouterUnsupportedCapabilities,translateOpenRouterPolicy} from './openrouter-cost-routing.js';

export interface CostRoutingExplainRequest {
  strategy?: 'economy'|'balanced'|'fast-capped';
  policy?: CostPerformanceRoutingPolicy;
  providerId?: string;
  modelId?: string;
  suiteId?: string;
  jobId?: string;
  invocationPolicy?: CostPerformanceRoutingPolicy;
  invocationId?: string;
  inputTokensEstimated: number;
  outputTokensRequested: number;
  jobSpentUsd?: number;
  candidates?: RoutingCandidate[];
  approval?: RoutingApproval;
}

export function costRoutingProjection(config:AgentControlConfig){
  return {schema:'agent-control.cost-performance-routing/v1',enabled:Boolean(config.costPerformanceRouting||config.providers.some(item=>item.costPerformanceRouting)||config.models.some(item=>item.costPerformanceRouting)),presets:[routingPreset('economy'),routingPreset('balanced'),routingPreset('fast-capped'),...(config.costPerformanceRouting?.presets??[])],scopePrecedence:['estate','provider','model','suite','job','invocation'],configured:{estate:config.costPerformanceRouting?.estate??null,providers:config.providers.filter(item=>item.costPerformanceRouting).map(item=>({id:item.id,policy:item.costPerformanceRouting})),models:config.models.filter(item=>item.costPerformanceRouting).map(item=>({id:item.id,policy:item.costPerformanceRouting})),suites:config.costPerformanceRouting?.suites??{},jobs:config.costPerformanceRouting?.jobs??{}},controls:{rateCeilings:'USD_PER_MILLION_TOKENS',budgets:'TOTAL_USD',raiseRequiresApproval:true,missingValues:'unavailable'},documentation:{providerRouting:'https://openrouter.ai/docs/guides/routing/provider-selection',generationMetadata:'https://openrouter.ai/docs/api/api-reference/generations/get-request-&-usage-metadata-for-a-generation',accessedAt:'2026-09-20'}};
}

export function explainConfiguredCostRouting(config:AgentControlConfig,request:CostRoutingExplainRequest){
  if(!Number.isSafeInteger(request.inputTokensEstimated)||request.inputTokensEstimated<0||!Number.isSafeInteger(request.outputTokensRequested)||request.outputTokensRequested<1)throw new Error('routing_explain_token_estimate_invalid');
  const provider=request.providerId?config.providers.find(item=>item.id===request.providerId):undefined,model=request.modelId?config.models.find(item=>item.id===request.modelId):undefined,layers:ScopedRoutingPolicy[]=[];
  const add=(scope:RoutingScope,scopeId:string,policy:CostPerformanceRoutingPolicy|undefined)=>{if(policy)layers.push({scope,scopeId,policy,recordedAt:new Date(0).toISOString()});};
  add('estate','default',config.costPerformanceRouting?.estate);add('provider',provider?.id??'',provider?.costPerformanceRouting);add('model',model?.id??'',model?.costPerformanceRouting);add('suite',request.suiteId??'',request.suiteId?config.costPerformanceRouting?.suites?.[request.suiteId]:undefined);add('job',request.jobId??'',request.jobId?config.costPerformanceRouting?.jobs?.[request.jobId]:undefined);
  add('invocation',request.invocationId??'dry-run',request.invocationPolicy??request.policy??(request.strategy?routingPreset(request.strategy):undefined));
  const effective=resolveRoutingPolicy(layers,request.approval),candidates=request.candidates?.length?request.candidates:catalogueCandidates(config,request.providerId,request.modelId),openrouter=Boolean(provider&&isOpenRouterEndpoint(provider.baseUrl));
  const unsupported=openrouter?openRouterUnsupportedCapabilities(effective.policy):provider?['provider_native_cost_performance_translation_unavailable']:['provider_not_selected'];
  const explanation=explainRouting({policy:effective.policy,candidates,inputTokensEstimated:request.inputTokensEstimated,outputTokensRequested:request.outputTokensRequested,jobSpentUsd:request.jobSpentUsd,policySources:effective.sources,unsupportedCapabilities:unsupported});
  return {...explanation,translation:openrouter?{provider:'openrouter',request:translateOpenRouterPolicy(effective.policy).body}:{provider:provider?.id??'unavailable',request:null},approval:effective.approval??null};
}

export function configuredCostRoutingInvocation(config:AgentControlConfig,request:{providerId:string;modelId:string;suiteId?:string;jobId:string;runId?:string;invocationId:string;inputTokensEstimated:number;outputTokensRequested:number;invocationPolicy?:CostPerformanceRoutingPolicy;approval?:RoutingApproval},ledger:CostRoutingLedger):CostRoutingInvocationOptions|undefined{
  const provider=config.providers.find(item=>item.id===request.providerId),model=config.models.find(item=>item.id===request.modelId),layers:ScopedRoutingPolicy[]=[];
  const add=(scope:RoutingScope,scopeId:string,policy:CostPerformanceRoutingPolicy|undefined)=>{if(policy)layers.push({scope,scopeId,policy,recordedAt:new Date().toISOString()});};
  add('estate','default',config.costPerformanceRouting?.estate);add('provider',provider?.id??'',provider?.costPerformanceRouting);add('model',model?.id??'',model?.costPerformanceRouting);add('suite',request.suiteId??'',request.suiteId?config.costPerformanceRouting?.suites?.[request.suiteId]:undefined);add('job',request.jobId,config.costPerformanceRouting?.jobs?.[request.jobId]);add('invocation',request.invocationId,request.invocationPolicy);
  if(!layers.length)return undefined;
  const effective=resolveRoutingPolicy(layers,request.approval);
  if(effective.approval)ledger.append('OVERRIDE',{previousPolicy:layers.at(-2)?.policy??null,approvedPolicy:effective.policy,approval:effective.approval},{runId:request.runId,jobId:request.jobId,invocationId:request.invocationId});
  return{policy:effective.policy,candidates:catalogueCandidates(config,request.providerId,request.modelId),inputTokensEstimated:request.inputTokensEstimated,jobSpentUsd:ledger.spentUsd(request.jobId),ledger,runId:request.runId,jobId:request.jobId,invocationId:request.invocationId};
}

export function catalogueCandidates(config:AgentControlConfig,providerId?:string,modelId?:string):RoutingCandidate[]{
  return config.models.filter(model=>(!providerId||model.provider===providerId)&&(!modelId||model.id===modelId)&&model.enabled!==false&&model.routingEligible!==false).map(model=>{const provider=config.providers.find(item=>item.id===model.provider),pricing=model.pricing??provider?.pricing;return{id:`${model.provider}:${model.id}`,provider:model.provider,model:model.providerModel,available:provider?.enabled!==false,inputUsdPerMillionTokens:pricing?.currency==='USD'?pricing.inputPerMillionTokens:null,outputUsdPerMillionTokens:pricing?.currency==='USD'?pricing.outputPerMillionTokens:null};});
}
