import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type ModelLifecycleState = 'DISCOVERED' | 'BENCHMARKING' | 'SHADOW' | 'CANDIDATE' | 'ACTIVE' | 'PREFERRED' | 'DEPRECATED';
export interface LogicalProvider {
  id: string;
  kind: 'openai' | 'openai-compatible' | 'local' | 'cli';
  endpoint?: string;
  credentialRef?: string;
  capabilities: string[];
  availableModels: string[];
  observedAt?: string;
  createdAt: string;
}
export interface ImmutableModelRecipe {
  id: string;
  version: string;
  providerId: string;
  providerModel: string;
  modelVersion: string;
  capabilities: string[];
  contextLimitTokens?: number;
  maximumOutputTokens?: number;
  toolSupport: string[];
  nodeRequirements: string[];
  runtimeRequirements: string[];
  fingerprint: string;
  createdAt: string;
}
export interface ModelLifecycleEvidence {id: string; recipeId: string; kind: 'benchmark' | 'shadow' | 'candidate' | 'comparison' | 'rollback'; verified: boolean; sampleSize: number; successRate?: number; latencyMs?: number; costPerVerifiedOutcome?: number | null; references: string[]; createdAt: string;}
export interface ModelLifecycleRecord {recipeId: string; state: ModelLifecycleState; history: Array<{from?: ModelLifecycleState; to: ModelLifecycleState; evidenceId?: string; reason: string; at: string}>;}
export interface RoutingPolicyRole {champion: string; challengers: string[]; mode: 'manual' | 'benchmark' | 'shadow' | 'candidate'; requirements: string[];}
export interface VersionedRoutingPolicy {id: string; version: number; roles: Record<string, RoutingPolicyRole>; previousVersion?: number; createdAt: string; createdBy: string; reason: string;}
interface ProviderLifecycleSnapshot {schema: 'agent-control.provider-lifecycle/v1'; providers: LogicalProvider[]; recipes: ImmutableModelRecipe[]; lifecycle: ModelLifecycleRecord[]; evidence: ModelLifecycleEvidence[]; policies: VersionedRoutingPolicy[]; activePolicy?: {id: string; version: number};}

const sequence: ModelLifecycleState[] = ['DISCOVERED','BENCHMARKING','SHADOW','CANDIDATE','ACTIVE','PREFERRED','DEPRECATED'];

/** Session-neutral durable provider/model lifecycle and routing-policy registry. */
export class ProviderModelLifecycleRegistry {
  private readonly providers = new Map<string, LogicalProvider>();
  private readonly recipes = new Map<string, ImmutableModelRecipe>();
  private readonly lifecycle = new Map<string, ModelLifecycleRecord>();
  private readonly evidence = new Map<string, ModelLifecycleEvidence>();
  private readonly policies = new Map<string, VersionedRoutingPolicy>();
  private activePolicy?: {id: string; version: number};
  constructor(readonly file?: string, readonly clock: () => string = () => new Date().toISOString()) { this.load(); }

  registerProvider(input: Omit<LogicalProvider, 'createdAt' | 'capabilities' | 'availableModels'> & {capabilities?: string[]; availableModels?: string[]}) {
    validateId(input.id, 'provider_id'); if (input.endpoint) validateEndpoint(input.endpoint); if (input.credentialRef && !/^(?:env|file-env):[A-Z][A-Z0-9_]{2,127}$/.test(input.credentialRef)) throw new Error('provider_credential_reference_invalid'); rejectSecrets(input);
    const current = this.providers.get(input.id); if (current && (current.kind !== input.kind || current.endpoint !== input.endpoint || current.credentialRef !== input.credentialRef)) throw new Error('provider_identity_immutable');
    const value: LogicalProvider = {...structuredClone(input), capabilities: unique(input.capabilities ?? current?.capabilities ?? []), availableModels: unique(input.availableModels ?? current?.availableModels ?? []), createdAt: current?.createdAt ?? this.clock()}; this.providers.set(value.id, value); this.save(); return this.provider(value.id);
  }

  recordDiscovery(providerId: string, observation: {capabilities: string[]; availableModels: string[]}) { const value = this.provider(providerId); value.capabilities = unique(observation.capabilities); value.availableModels = unique(observation.availableModels); value.observedAt = this.clock(); this.providers.set(providerId, value); this.save(); return this.provider(providerId); }
  provider(id: string) { const value = this.providers.get(id); if (!value) throw new Error('provider_lifecycle_missing'); return structuredClone(value); }
  listProviders() { return [...this.providers.values()].map(value => structuredClone(value)); }

  registerRecipe(input: Omit<ImmutableModelRecipe, 'fingerprint' | 'createdAt'>) {
    validateId(input.id, 'recipe_id'); this.provider(input.providerId); if (!input.version || !input.providerModel || !input.modelVersion) throw new Error('model_recipe_identity_invalid'); rejectSecrets(input);
    const key = recipeKey(input.id, input.version), payload = normalizedRecipe(input), fingerprint = sha(stable(payload)), current = this.recipes.get(key);
    if (current && current.fingerprint !== fingerprint) throw new Error('model_recipe_immutable');
    if (!current) { const value: ImmutableModelRecipe = {...payload, fingerprint, createdAt: this.clock()}; this.recipes.set(key, value); this.lifecycle.set(key, {recipeId: key, state: 'DISCOVERED', history: [{to: 'DISCOVERED', reason: 'immutable recipe registered', at: value.createdAt}]}); this.save(); }
    return this.recipe(key);
  }

  recipe(key: string) { const value = this.recipes.get(key); if (!value) throw new Error('model_recipe_missing'); return structuredClone(value); }
  listRecipes() { return [...this.recipes.entries()].map(([key, value]) => ({key, ...structuredClone(value), lifecycle: this.lifecycleState(key)})); }
  lifecycleState(key: string) { const value = this.lifecycle.get(key); if (!value) throw new Error('model_lifecycle_missing'); return structuredClone(value); }

  addEvidence(input: Omit<ModelLifecycleEvidence, 'id' | 'createdAt'> & {id?: string}) { this.recipe(input.recipeId); if (!Number.isSafeInteger(input.sampleSize) || input.sampleSize < 1 || !input.references.length) throw new Error('lifecycle_evidence_invalid'); const value: ModelLifecycleEvidence = {...structuredClone(input), id: input.id ?? `model-evidence:${randomUUID()}`, createdAt: this.clock()}; rejectSecrets(value); this.evidence.set(value.id, value); this.save(); return structuredClone(value); }

  transition(key: string, to: ModelLifecycleState, input: {evidenceId?: string; reason: string}) {
    const record = this.lifecycleState(key), fromIndex = sequence.indexOf(record.state), toIndex = sequence.indexOf(to); if (toIndex < 0 || (to !== 'DEPRECATED' && toIndex !== fromIndex + 1) || (to === 'DEPRECATED' && record.state === 'DEPRECATED')) throw new Error('model_lifecycle_transition_invalid');
    if (!input.reason.trim()) throw new Error('model_lifecycle_reason_required');
    if (!['DISCOVERED','BENCHMARKING'].includes(to)) { const evidence = input.evidenceId ? this.evidence.get(input.evidenceId) : undefined; if (!evidence || evidence.recipeId !== key || !evidence.verified || !evidenceFor(to, evidence.kind)) throw new Error('model_lifecycle_evidence_required'); }
    record.history.push({from: record.state, to, evidenceId: input.evidenceId, reason: bounded(input.reason), at: this.clock()}); record.state = to; this.lifecycle.set(key, record); this.save(); return this.lifecycleState(key);
  }

  publishPolicy(input: {id: string; roles: Record<string, RoutingPolicyRole>; createdBy: string; reason: string}) {
    validateId(input.id, 'routing_policy_id'); if (!Object.keys(input.roles).length) throw new Error('routing_policy_empty'); const existing = [...this.policies.values()].filter(value => value.id === input.id).sort((a,b) => b.version-a.version), version = (existing[0]?.version ?? 0) + 1;
    for (const [role, route] of Object.entries(input.roles)) { validateId(role, 'routing_role'); const champion = this.lifecycleState(route.champion).state; if (!['ACTIVE','PREFERRED'].includes(champion)) throw new Error(`routing_champion_not_active:${role}`); for (const challenger of route.challengers) if (!['SHADOW','CANDIDATE','ACTIVE','PREFERRED'].includes(this.lifecycleState(challenger).state)) throw new Error(`routing_challenger_not_qualified:${role}`); if (route.challengers.includes(route.champion)) throw new Error('routing_champion_is_challenger'); }
    const policy: VersionedRoutingPolicy = {id: input.id, version, roles: structuredClone(input.roles), previousVersion: existing[0]?.version, createdAt: this.clock(), createdBy: input.createdBy, reason: bounded(input.reason)}; this.policies.set(policyKey(input.id, version), policy); this.activePolicy = {id: input.id, version}; this.save(); return structuredClone(policy);
  }

  route(role: string) { if (!this.activePolicy) throw new Error('routing_policy_missing'); const policy = this.policy(this.activePolicy.id, this.activePolicy.version), route = policy.roles[role]; if (!route) throw new Error('routing_role_missing'); return {policy: {id: policy.id, version: policy.version}, champion: this.recipe(route.champion), challengers: route.challengers.map(key => this.recipe(key)), mode: route.mode, requirements: [...route.requirements]}; }
  policy(id: string, version: number) { const value = this.policies.get(policyKey(id, version)); if (!value) throw new Error('routing_policy_version_missing'); return structuredClone(value); }
  rollbackPolicy(id: string, version: number, actorId: string, evidenceId: string) { const evidence = this.evidence.get(evidenceId); if (!evidence || evidence.kind !== 'rollback' || !evidence.verified) throw new Error('routing_rollback_evidence_required'); this.policy(id, version); this.activePolicy = {id, version}; this.save(); return {activePolicy: structuredClone(this.activePolicy), actorId, evidenceId, at: this.clock()}; }

  historicalReplay(role: string, observations: Array<{recipeId: string; verified: boolean; latencyMs?: number; cost?: number | null}>) {
    const route = this.route(role), candidates = [route.champion, ...route.challengers], scored = candidates.map(recipe => { const rows = observations.filter(item => item.recipeId === recipeKey(recipe.id, recipe.version)), verified = rows.filter(item => item.verified), knownCosts = verified.map(item => item.cost).filter((value): value is number => typeof value === 'number'), latencies = verified.map(item => item.latencyMs).filter((value): value is number => typeof value === 'number'); return {recipeId: recipeKey(recipe.id, recipe.version), attempts: rows.length, verified: verified.length, successRate: rows.length ? verified.length / rows.length : 0, averageLatencyMs: latencies.length ? latencies.reduce((a,b)=>a+b,0)/latencies.length : null, averageCost: knownCosts.length === verified.length && verified.length ? knownCosts.reduce((a,b)=>a+b,0)/knownCosts.length : null}; }).sort((a,b) => b.successRate-a.successRate || (a.averageCost ?? Infinity)-(b.averageCost ?? Infinity) || (a.averageLatencyMs ?? Infinity)-(b.averageLatencyMs ?? Infinity));
    return {role, policy: route.policy, recommendation: scored[0]?.attempts ? scored[0].recipeId : null, scored};
  }

  snapshot(): ProviderLifecycleSnapshot { return {schema: 'agent-control.provider-lifecycle/v1', providers: this.listProviders(), recipes: [...this.recipes.values()].map(value => structuredClone(value)), lifecycle: [...this.lifecycle.values()].map(value => structuredClone(value)), evidence: [...this.evidence.values()].map(value => structuredClone(value)), policies: [...this.policies.values()].map(value => structuredClone(value)), activePolicy: this.activePolicy && structuredClone(this.activePolicy)}; }
  private load() { if (!this.file || !fs.existsSync(this.file)) return; const value = JSON.parse(fs.readFileSync(this.file,'utf8')) as ProviderLifecycleSnapshot; if (value.schema !== 'agent-control.provider-lifecycle/v1') throw new Error('provider_lifecycle_snapshot_unsupported'); for (const item of value.providers) this.providers.set(item.id,item); for (const item of value.recipes) this.recipes.set(recipeKey(item.id,item.version),item); for (const item of value.lifecycle) this.lifecycle.set(item.recipeId,item); for (const item of value.evidence) this.evidence.set(item.id,item); for (const item of value.policies) this.policies.set(policyKey(item.id,item.version),item); this.activePolicy=value.activePolicy; }
  private save() { if (!this.file) return; fs.mkdirSync(path.dirname(this.file),{recursive:true}); const temporary=`${this.file}.tmp`; fs.writeFileSync(temporary,`${JSON.stringify(this.snapshot(),null,2)}\n`,{mode:0o600}); fs.renameSync(temporary,this.file); }
}

function normalizedRecipe(input: Omit<ImmutableModelRecipe,'fingerprint'|'createdAt'>) { return {...structuredClone(input), capabilities: unique(input.capabilities), toolSupport: unique(input.toolSupport), nodeRequirements: unique(input.nodeRequirements), runtimeRequirements: unique(input.runtimeRequirements)}; }
function evidenceFor(to: ModelLifecycleState, kind: ModelLifecycleEvidence['kind']) { return to === 'SHADOW' ? kind === 'benchmark' : to === 'CANDIDATE' ? kind === 'shadow' : to === 'ACTIVE' ? kind === 'candidate' : to === 'PREFERRED' ? kind === 'comparison' : to === 'DEPRECATED'; }
function recipeKey(id:string,version:string){return `${id}@${version}`;} function policyKey(id:string,version:number){return `${id}@${version}`;}
function validateId(value:string,label:string){if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value))throw new Error(`${label}_invalid`);} function validateEndpoint(value:string){const url=new URL(value);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('provider_endpoint_invalid');if(url.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname.toLowerCase()))throw new Error('provider_cleartext_endpoint_denied');}
function unique(values:string[]){return[...new Set(values)];} function bounded(value:string,max=2048){return value.length<=max?value:value.slice(0,max);} function sha(value:string){return createHash('sha256').update(value).digest('hex');}
function stable(value:unknown):string{if(Array.isArray(value))return`[${value.map(stable).join(',')}]`;if(value&&typeof value==='object')return`{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,child])=>`${JSON.stringify(key)}:${stable(child)}`).join(',')}}`;return JSON.stringify(value);}
function rejectSecrets(value:unknown){if(/(?:sk-[A-Za-z0-9_-]{12,}|bearer\s+[A-Za-z0-9._-]{12,}|api[_-]?key["']?\s*[:=]|password["']?\s*[:=]|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i.test(JSON.stringify(value)))throw new Error('provider_lifecycle_secret_material_forbidden');}
