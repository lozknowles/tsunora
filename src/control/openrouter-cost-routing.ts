import type {CostPerformanceRoutingPolicy} from './cost-performance-routing.js';

export interface OpenRouterProviderPreferences {
  sort?: 'price'|'throughput'|'latency'|{by:'price'|'throughput'|'latency';partition:'model'|'none'};
  preferred_min_throughput?: number|Partial<Record<'p50'|'p75'|'p90'|'p99',number>>;
  preferred_max_latency?: number|Partial<Record<'p50'|'p75'|'p90'|'p99',number>>;
  max_price?: {prompt?:number;completion?:number};
  only?:string[];
  ignore?:string[];
  quantizations?:string[];
  allow_fallbacks?:boolean;
  require_parameters?:boolean;
}

export function translateOpenRouterPolicy(policy:CostPerformanceRoutingPolicy):{profile:string;body:{provider:OpenRouterProviderPreferences;models?:string[]}}{
  const provider:OpenRouterProviderPreferences={sort:policy.strategy==='balanced'?{by:policy.optimization,partition:'none'}:policy.optimization,allow_fallbacks:policy.fallback.enabled};
  if(policy.preferredMinThroughputTps)provider.preferred_min_throughput={[`p${policy.preferredMinThroughputTps.percentile}`]:policy.preferredMinThroughputTps.value};
  if(policy.preferredMaxLatencyMs)provider.preferred_max_latency={[`p${policy.preferredMaxLatencyMs.percentile}`]:policy.preferredMaxLatencyMs.value};
  if(policy.rateCeilingUsdPerMillionTokens)provider.max_price={...(policy.rateCeilingUsdPerMillionTokens.input===undefined?{}:{prompt:policy.rateCeilingUsdPerMillionTokens.input}),...(policy.rateCeilingUsdPerMillionTokens.output===undefined?{}:{completion:policy.rateCeilingUsdPerMillionTokens.output})};
  if(policy.providers?.allowed?.length)provider.only=[...policy.providers.allowed];
  if(policy.providers?.ignored?.length)provider.ignore=[...policy.providers.ignored];
  if(policy.quantizations?.length)provider.quantizations=[...policy.quantizations];
  return{profile:`openrouter-cost-routing.${policy.id}`,body:{provider}};
}

export function openRouterUnsupportedCapabilities(policy:CostPerformanceRoutingPolicy){const unsupported:string[]=[];if(policy.fallback.crossModel)unsupported.push('cross_model_fallback_requires_explicit_model_list');return unsupported;}

export function isOpenRouterEndpoint(baseUrl:string|undefined){if(!baseUrl)return false;try{return new URL(baseUrl).hostname.toLowerCase()==='openrouter.ai';}catch{return false;}}
