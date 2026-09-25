import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {emptyConfig, loadConfig, validateConfig, type AgentControlConfig, type ModelConfig, type ModelRoutingConfig, type ProviderConfig, type ResourceConfig, type ServiceConfig, type SparkConfig} from './config.js';
import type {AdaptiveOrchestrationConfig} from './adaptive-orchestration.js';
import type {CacheExpertPolicyConfig} from './cache-aware-expert.js';
import type {LearnedSkillPolicyConfig} from './skill-learning.js';
import type {DeterministicSkillPolicyConfig} from './deterministic-skill.js';
import type {DiscoveryConfigurationOperation} from './environment-discovery.js';
import {normalizePolicy, routingPolicyRaisesAuthority, type CostPerformanceRoutingPolicy, type RoutingApproval} from './cost-performance-routing.js';

export type ConfiguredSystemKind = 'resource' | 'provider' | 'model' | 'service';
export interface ConfigurationSnapshot {
  revision: string;
  resources: ResourceConfig[];
  providers: ProviderConfig[];
  models: ModelConfig[];
  modelRouting: ModelRoutingConfig;
  services: ServiceConfig[];
  spark?: SparkConfig;
  adaptiveOrchestration?: AdaptiveOrchestrationConfig;
  cacheAwareExperts?: CacheExpertPolicyConfig;
  learnedSkills?: LearnedSkillPolicyConfig;
  deterministicSkills?: DeterministicSkillPolicyConfig;
  costPerformanceRouting?: AgentControlConfig['costPerformanceRouting'];
}

export class ConfigurationStoreError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export class ConfigurationStore {
  constructor(readonly file: string) {}

  read(): ConfigurationSnapshot {
    return snapshot(this.current());
  }

  upsert(input: {revision?: unknown; kind?: unknown; originalId?: unknown; item?: unknown}) {
    const current = this.current(), currentRevision = revision(current);
    if (typeof input.revision !== 'string' || input.revision !== currentRevision) throw new ConfigurationStoreError('configuration_revision_conflict', 409);
    if (!['resource', 'provider', 'model', 'service'].includes(String(input.kind))) throw new ConfigurationStoreError('configuration_kind_invalid', 400);
    if (!input.item || typeof input.item !== 'object' || Array.isArray(input.item)) throw new ConfigurationStoreError('configuration_item_invalid', 400);
    if (input.originalId !== undefined && typeof input.originalId !== 'string') throw new ConfigurationStoreError('configuration_original_id_invalid', 400);
    const kind = input.kind as ConfiguredSystemKind, key = collection(kind), values = structuredClone(current[key]) as Array<ResourceConfig | ProviderConfig | ModelConfig | ServiceConfig>;
    const item = structuredClone(input.item) as ResourceConfig | ProviderConfig | ModelConfig | ServiceConfig;
    if (input.originalId === undefined) values.push(item);
    else {
      const index = values.findIndex(value => value.id === input.originalId);
      if (index < 0) throw new ConfigurationStoreError('configuration_item_missing', 404);
      values[index] = item;
    }
    let next: AgentControlConfig;
    try { next = validateConfig({...current, [key]: values}); }
    catch (error) { throw new ConfigurationStoreError((error as Error).message || 'configuration_invalid', 400); }
    this.write(next);
    return {...snapshot(next), restartRequired: !['provider', 'model'].includes(kind), changed: {kind, id: item.id}};
  }

  updateModelRouting(input: {revision?: unknown; modelRouting?: unknown}) {
    const current = this.current(), currentRevision = revision(current);
    if (typeof input.revision !== 'string' || input.revision !== currentRevision) throw new ConfigurationStoreError('configuration_revision_conflict', 409);
    if (!input.modelRouting || typeof input.modelRouting !== 'object' || Array.isArray(input.modelRouting)) throw new ConfigurationStoreError('configuration_model_routing_invalid', 400);
    let next: AgentControlConfig;
    try { next = validateConfig({...current, modelRouting: structuredClone(input.modelRouting) as ModelRoutingConfig}); }
    catch (error) { throw new ConfigurationStoreError((error as Error).message || 'configuration_invalid', 400); }
    this.write(next);
    return {...snapshot(next), restartRequired: false, changed: {kind: 'model-routing' as const, id: 'model-routing'}};
  }

  updateSpark(input: {revision?: unknown; spark?: unknown}) {
    const current = this.current(), currentRevision = revision(current);
    if (typeof input.revision !== 'string' || input.revision !== currentRevision) throw new ConfigurationStoreError('configuration_revision_conflict', 409);
    if (!input.spark || typeof input.spark !== 'object' || Array.isArray(input.spark)) throw new ConfigurationStoreError('configuration_spark_invalid', 400);
    let next: AgentControlConfig;
    try { next = validateConfig({...current, spark: structuredClone(input.spark) as SparkConfig}); }
    catch (error) { throw new ConfigurationStoreError((error as Error).message || 'configuration_invalid', 400); }
    this.write(next);
    return {...snapshot(next), restartRequired: true, changed: {kind: 'spark' as const, id: 'fast-execution'}};
  }

  updateAdaptiveOrchestration(input: {revision?: unknown; adaptiveOrchestration?: unknown}) {
    const current = this.current(), currentRevision = revision(current);
    if (typeof input.revision !== 'string' || input.revision !== currentRevision) throw new ConfigurationStoreError('configuration_revision_conflict', 409);
    if (!input.adaptiveOrchestration || typeof input.adaptiveOrchestration !== 'object' || Array.isArray(input.adaptiveOrchestration)) throw new ConfigurationStoreError('configuration_adaptive_orchestration_invalid', 400);
    let next: AgentControlConfig;
    try { next = validateConfig({...current, adaptiveOrchestration: structuredClone(input.adaptiveOrchestration) as AgentControlConfig['adaptiveOrchestration']}); }
    catch (error) { throw new ConfigurationStoreError((error as Error).message || 'configuration_invalid', 400); }
    this.write(next);
    return {...snapshot(next), restartRequired: true, changed: {kind: 'adaptive-orchestration' as const, id: 'adaptive-orchestration'}};
  }

  updateCacheAwareExperts(input: {revision?: unknown; cacheAwareExperts?: unknown}) {
    const current = this.current(), currentRevision = revision(current);
    if (typeof input.revision !== 'string' || input.revision !== currentRevision) throw new ConfigurationStoreError('configuration_revision_conflict', 409);
    if (!input.cacheAwareExperts || typeof input.cacheAwareExperts !== 'object' || Array.isArray(input.cacheAwareExperts)) throw new ConfigurationStoreError('configuration_cache_aware_experts_invalid', 400);
    let next: AgentControlConfig;
    try { next = validateConfig({...current, cacheAwareExperts: structuredClone(input.cacheAwareExperts) as AgentControlConfig['cacheAwareExperts']}); }
    catch (error) { throw new ConfigurationStoreError((error as Error).message || 'configuration_invalid', 400); }
    this.write(next);
    return {...snapshot(next), restartRequired: true, changed: {kind: 'cache-aware-experts' as const, id: 'cache-aware-experts'}};
  }

  updateLearnedSkills(input: {revision?: unknown; learnedSkills?: unknown}) {
    const current = this.current(), currentRevision = revision(current);
    if (typeof input.revision !== 'string' || input.revision !== currentRevision) throw new ConfigurationStoreError('configuration_revision_conflict', 409);
    if (!input.learnedSkills || typeof input.learnedSkills !== 'object' || Array.isArray(input.learnedSkills)) throw new ConfigurationStoreError('configuration_learned_skills_invalid', 400);
    let next: AgentControlConfig;
    try { next = validateConfig({...current, learnedSkills: structuredClone(input.learnedSkills) as LearnedSkillPolicyConfig}); }
    catch (error) { throw new ConfigurationStoreError((error as Error).message || 'configuration_invalid', 400); }
    this.write(next);
    return {...snapshot(next), restartRequired: true, changed: {kind: 'learned-skills' as const, id: 'learned-skills'}};
  }

  updateDeterministicSkills(input:{revision?:unknown;deterministicSkills?:unknown}){
    const current=this.current(),currentRevision=revision(current);if(typeof input.revision!=='string'||input.revision!==currentRevision)throw new ConfigurationStoreError('configuration_revision_conflict',409);if(!input.deterministicSkills||typeof input.deterministicSkills!=='object'||Array.isArray(input.deterministicSkills))throw new ConfigurationStoreError('configuration_deterministic_skills_invalid',400);let next:AgentControlConfig;try{next=validateConfig({...current,deterministicSkills:structuredClone(input.deterministicSkills) as DeterministicSkillPolicyConfig});}catch(error){throw new ConfigurationStoreError((error as Error).message||'configuration_invalid',400);}this.write(next);return{...snapshot(next),restartRequired:true,changed:{kind:'deterministic-skills' as const,id:'deterministic-skills'}};
  }

  previewEstateCostPerformanceRouting(input:{revision?:unknown;policy?:unknown}){
    const current=this.current(),currentRevision=revision(current);
    if(typeof input.revision!=='string'||input.revision!==currentRevision)throw new ConfigurationStoreError('configuration_revision_conflict',409);
    let proposed:CostPerformanceRoutingPolicy;
    try{proposed=normalizePolicy(structuredClone(input.policy) as CostPerformanceRoutingPolicy);}catch(error){throw new ConfigurationStoreError((error as Error).message||'routing_policy_invalid',400);}
    const previous=current.costPerformanceRouting?.estate??null,requiresApproval=previous!==null&&routingPolicyRaisesAuthority(previous,proposed),proposalSha256=createHash('sha256').update(JSON.stringify({schema:'agent-control.cost-performance-routing-change/v1',revision:currentRevision,scope:'estate',previous,proposed})).digest('hex');
    return{schema:'agent-control.cost-performance-routing-change/v1' as const,revision:currentRevision,scope:'estate' as const,previous,proposed,requiresApproval,proposalSha256};
  }

  updateEstateCostPerformanceRouting(input:{revision?:unknown;policy?:unknown;proposalSha256?:unknown;approvalReason?:unknown;actor?:unknown}){
    const preview=this.previewEstateCostPerformanceRouting(input);
    if(typeof input.proposalSha256!=='string'||input.proposalSha256!==preview.proposalSha256)throw new ConfigurationStoreError('routing_policy_proposal_stale',409);
    let approval:RoutingApproval|undefined;
    if(preview.requiresApproval){
      if(typeof input.approvalReason!=='string'||input.approvalReason.trim().length<8||input.approvalReason.length>1000)throw new ConfigurationStoreError('routing_policy_raise_requires_approval',403);
      if(typeof input.actor!=='string'||!input.actor.trim())throw new ConfigurationStoreError('routing_policy_approver_required',403);
      approval={approved:true,approvalId:`routing-policy:${preview.proposalSha256}`,approver:input.actor.trim(),approvedAt:new Date().toISOString(),reason:input.approvalReason.trim()};
    }
    const current=this.current();let next:AgentControlConfig;
    try{next=validateConfig({...current,costPerformanceRouting:{...current.costPerformanceRouting,estate:preview.proposed}});}catch(error){throw new ConfigurationStoreError((error as Error).message||'configuration_invalid',400);}
    this.write(next);
    return{...snapshot(next),restartRequired:false,changed:{kind:'cost-performance-routing' as const,id:'estate'},proposalSha256:preview.proposalSha256,previousPolicy:preview.previous,requiresApproval:preview.requiresApproval,approval:approval??null};
  }

  applyDiscoveryOperations(input:{revision?:unknown;operations?:unknown}){
    const current=this.current(),currentRevision=revision(current);if(typeof input.revision!=='string'||input.revision!==currentRevision)throw new ConfigurationStoreError('configuration_revision_conflict',409);
    if(!Array.isArray(input.operations)||!input.operations.length)throw new ConfigurationStoreError('environment_discovery_operations_required',400);
    const next=structuredClone(current);
    for(const raw of input.operations){if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new ConfigurationStoreError('environment_discovery_operation_invalid',400);const operation=raw as DiscoveryConfigurationOperation;if(!['resource','provider','model','service'].includes(operation.kind)||!operation.item||typeof operation.item!=='object'||Array.isArray(operation.item))throw new ConfigurationStoreError('environment_discovery_operation_invalid',400);const key=collection(operation.kind),values=next[key] as Array<ResourceConfig|ProviderConfig|ModelConfig|ServiceConfig>;if(values.some(value=>value.id===operation.item.id))throw new ConfigurationStoreError(`duplicate_id:${operation.item.id}`,409);values.push(structuredClone(operation.item) as never);}
    let validated:AgentControlConfig;try{validated=validateConfig(next);}catch(error){throw new ConfigurationStoreError((error as Error).message||'configuration_invalid',400);}this.write(validated);return{...snapshot(validated),restartRequired:true,changed:{kind:'environment-discovery' as const,ids:input.operations.map(operation=>(operation as DiscoveryConfigurationOperation).item.id)}};
  }

  private current() {
    try { return fs.existsSync(this.file) ? loadConfig(this.file) : emptyConfig(); }
    catch (error) { throw new ConfigurationStoreError((error as Error).message || 'configuration_read_failed', 500); }
  }

  private write(config: AgentControlConfig) {
    const directory = path.dirname(this.file), temporary = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    fs.mkdirSync(directory, {recursive: true});
    try {
      fs.writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, {encoding: 'utf8', mode: 0o600, flag: 'wx'});
      fs.renameSync(temporary, this.file);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
}

function collection(kind: ConfiguredSystemKind): 'resources' | 'providers' | 'models' | 'services' {
  return kind === 'resource' ? 'resources' : kind === 'provider' ? 'providers' : kind === 'model' ? 'models' : 'services';
}

function revision(config: AgentControlConfig) {
  return createHash('sha256').update(JSON.stringify(config)).digest('hex');
}

function snapshot(config: AgentControlConfig): ConfigurationSnapshot {
  return {revision: revision(config), resources: structuredClone(config.resources), providers: structuredClone(config.providers), models: structuredClone(config.models), modelRouting: structuredClone(config.modelRouting), services: structuredClone(config.services), ...(config.spark ? {spark: structuredClone(config.spark)} : {}), ...(config.adaptiveOrchestration ? {adaptiveOrchestration: structuredClone(config.adaptiveOrchestration)} : {}), ...(config.cacheAwareExperts ? {cacheAwareExperts: structuredClone(config.cacheAwareExperts)} : {}), ...(config.learnedSkills ? {learnedSkills: structuredClone(config.learnedSkills)} : {}), ...(config.deterministicSkills ? {deterministicSkills: structuredClone(config.deterministicSkills)} : {}), ...(config.costPerformanceRouting ? {costPerformanceRouting: structuredClone(config.costPerformanceRouting)} : {})};
}
