import type {RetrievalProviderDescriptor, RetrievalProviderResult} from './governed-retrieval.js';

export type RetrievalResourceDecisionAction = 'USE_PROVIDER' | 'USE_BUILTIN' | 'BUILD_INDEX' | 'DEFER_INDEX';

export interface RetrievalResourceObservation {
  provider: RetrievalProviderDescriptor;
  indexState: RetrievalProviderResult['index']['state'];
  availableMemoryMb: number;
  availableStorageMb: number;
  repositoryBytes: number;
  expectedTaskDurationMs: number;
  coldIndexMemoryMb?: number;
  coldIndexDurationMs?: number;
  indexManageAuthorized: boolean;
  builtinAvailable: boolean;
}

export interface RetrievalResourceDecision {
  action: RetrievalResourceDecisionAction;
  providerId: string;
  reasons: string[];
}

export function decideRetrievalResource(observation: RetrievalResourceObservation): RetrievalResourceDecision {
  validate(observation);
  const reasons:string[]=[];
  if(!observation.provider.index.required)return{action:'USE_PROVIDER',providerId:observation.provider.id,reasons:['provider_requires_no_index']};
  if(observation.indexState==='CURRENT')return{action:'USE_PROVIDER',providerId:observation.provider.id,reasons:['warm_index_current']};
  if(observation.indexState==='UNAVAILABLE')return fallback(observation,['provider_or_index_runtime_unavailable']);
  if(!observation.indexManageAuthorized)return fallback(observation,['index_mutation_authority_absent']);
  const requiredMemory=Math.max(512,(observation.coldIndexMemoryMb??512)*1.25),requiredStorage=Math.max(256,observation.repositoryBytes/1024/1024*2);
  if(observation.availableMemoryMb<requiredMemory)reasons.push(`insufficient_memory:${observation.availableMemoryMb}<${Math.ceil(requiredMemory)}`);
  if(observation.availableStorageMb<requiredStorage)reasons.push(`insufficient_storage:${observation.availableStorageMb}<${Math.ceil(requiredStorage)}`);
  if(observation.coldIndexDurationMs!==undefined&&observation.expectedTaskDurationMs<observation.coldIndexDurationMs*2)reasons.push('cold_index_cost_exceeds_short_task_policy');
  if(reasons.length)return fallback(observation,reasons);
  return{action:'BUILD_INDEX',providerId:observation.provider.id,reasons:[`index_${observation.indexState.toLowerCase()}`,'node_capacity_and_task_duration_satisfy_policy','separate_index_manage_authority_present']};
}

function fallback(observation:RetrievalResourceObservation,reasons:string[]):RetrievalResourceDecision{return{action:observation.builtinAvailable?'USE_BUILTIN':'DEFER_INDEX',providerId:observation.provider.id,reasons:[...reasons,observation.builtinAvailable?'bounded_builtin_available':'no_safe_retrieval_fallback']};}
function validate(value:RetrievalResourceObservation){for(const [name,number] of Object.entries({availableMemoryMb:value.availableMemoryMb,availableStorageMb:value.availableStorageMb,repositoryBytes:value.repositoryBytes,expectedTaskDurationMs:value.expectedTaskDurationMs,coldIndexMemoryMb:value.coldIndexMemoryMb??0,coldIndexDurationMs:value.coldIndexDurationMs??0}))if(!Number.isFinite(number)||number<0)throw new Error(`retrieval_resource_${name}_invalid`);}
