import fs from 'node:fs';
import path from 'node:path';
import type {ModelConfig, ModelQualificationState, ModelRoutingConfig, ProviderAccountProfileConfig, ProviderConfig} from './config.js';
import {accountCredentialResidency, accountProviderExecutionNode} from './provider-account-profile.js';
import {normalizeCapabilityId, type CapabilityIntelligenceStore, type CapabilityRequirementAssessment} from './capability-intelligence.js';
import type {ModelIntelligenceLedger, ModelLifecycleState, ModelWindowMetrics} from './model-intelligence.js';
import {credentialReferenceStatus, providerCredentialStatus} from './provider-credential-store.js';

export interface ModelQualificationRecord {
  modelId: string;
  state: ModelQualificationState;
  version: string;
  checkedAt: string;
  qualifiedAt?: string;
  capabilities: string[];
  nodes: string[];
  latencyMs?: number;
  successRate?: number;
  evidence: string[];
  detail?: string;
  configuration?: {
    providerModel: string;
    modelRevision: string;
    artifactSha256: string;
    quantization: string;
    runtime: string;
    runtimeRevision: string;
    runtimeBinarySha256?: string[];
  };
  /** Task-specific outcomes prevent unrelated evidence from admitting a failed workload. */
  taskQualifications?: Array<{taskClass: string; state: ModelQualificationState; checkedAt: string; evidence: string[]; detail?: string}>;
}
export interface ModelRouteRequest {model?: string; modelRole?: string; taskClass?: string; accountProfile?: string; nodeId: string; workloadNodeId?: string; providerExecutionNodeId?: string; requiredCapabilities?: string[]; allowFallback?: boolean; purpose?: 'EXECUTION' | 'QUALIFICATION';}
export interface ModelRouteDecision {
  requestedModel: string | null;
  requestedRole: string | null;
  /** Whether a later governed lifecycle decision may select a configured alternate route. */
  allowFallback?: boolean;
  /** Explicit qualification runs may inspect disabled-for-production candidates without admitting them. */
  purpose?: 'EXECUTION' | 'QUALIFICATION';
  modelId: string;
  providerId: string;
  accountProfileId: string | null;
  accountLabel: string | null;
  accountPlan: string | null;
  accountPlanAuthority: ProviderAccountProfileConfig['planAuthority'] | null;
  accountQualification: ModelQualificationState | null;
  accountAvailability: ProviderAccountProfileView['availability'] | null;
  providerModel: string;
  workloadNodeId: string;
  providerExecutionNodeId: string;
  credentialNodeId: string | null;
  /** 3.8 compatibility alias for providerExecutionNodeId. */
  nodeId: string;
  qualificationVersion: string;
  fallback: boolean;
  fallbackReason: string | null;
  requiredCapabilities?: string[];
  nativeCapabilities?: string[];
  emulatedCapabilities?: string[];
  intelligence?: {state: ModelLifecycleState; metrics: ModelWindowMetrics; qualificationVersion: string; selectionBasis: string};
  considered: Array<{modelId: string; accountProfileId: string | null; workloadNodeId: string; providerExecutionNodeId: string; credentialNodeId: string | null; nodeId: string; eligible: boolean; reasons: string[]; capabilityAssessment?: CapabilityRequirementAssessment[]; intelligence?: {state: ModelLifecycleState; metrics: ModelWindowMetrics; qualificationVersion: string}}>;
}
export interface AccountProfileQualificationRecord {providerId: string; accountProfileId: string; nodeId?: string; providerExecutionNodeId?: string; credentialNodeId?: string; state: ModelQualificationState; version: string; checkedAt: string; qualifiedAt?: string; capabilities: string[]; evidence: string[]; detail?: string;}
export interface ProviderAccountProfileView {providerId: string; id: string; nodeId: string; providerExecutionNodeId: string; credentialNodeId: string; label: string; plan: string | null; planAuthority: ProviderAccountProfileConfig['planAuthority'] | null; capabilities: string[]; qualification: AccountProfileQualificationRecord; credentialConfigured: boolean; availability: 'AVAILABLE' | 'AUTH_REQUIRED' | 'UNQUALIFIED' | 'DEGRADED' | 'DISABLED';}
export interface ModelRegistryRow extends ModelConfig {providerDisplayName: string; qualification: ModelQualificationRecord; assignedRoles: string[]; account: ProviderAccountProfileView | null;}

export class AccountProfileQualificationStore {
  private readonly records = new Map<string, AccountProfileQualificationRecord>();
  constructor(readonly file?: string) {
    if (!file || !fs.existsSync(file)) return;
    const value = JSON.parse(fs.readFileSync(file, 'utf8')) as {version: 1; records: AccountProfileQualificationRecord[]};
    if (value.version !== 1 || !Array.isArray(value.records)) throw new Error('account_profile_qualification_state_invalid');
    for (const record of value.records) this.records.set(key(record.providerId, record.accountProfileId), structuredClone(record));
  }
  get(providerId: string, accountProfileId: string) { const value = this.records.get(key(providerId, accountProfileId)); return value ? structuredClone(value) : undefined; }
  list() { return [...this.records.values()].map(value => structuredClone(value)); }
  set(record: AccountProfileQualificationRecord) { this.records.set(key(record.providerId, record.accountProfileId), structuredClone(record)); this.save(); return this.get(record.providerId, record.accountProfileId)!; }
  private save() { if (!this.file) return; fs.mkdirSync(path.dirname(this.file), {recursive: true}); const temporary = `${this.file}.${process.pid}.tmp`; fs.writeFileSync(temporary, `${JSON.stringify({version: 1, records: this.list()}, null, 2)}\n`, {mode: 0o600}); fs.renameSync(temporary, this.file); }
}

export class ModelQualificationStore {
  private readonly records = new Map<string, ModelQualificationRecord>();
  constructor(readonly file?: string) {
    if (!file || !fs.existsSync(file)) return;
    const value = JSON.parse(fs.readFileSync(file, 'utf8')) as {version: 1; records: ModelQualificationRecord[]};
    if (value.version !== 1 || !Array.isArray(value.records)) throw new Error('model_qualification_state_invalid');
    for (const record of value.records) { validateModelQualificationRecord(record); this.records.set(record.modelId, structuredClone(record)); }
  }
  get(modelId: string) { const value = this.records.get(modelId); return value ? structuredClone(value) : undefined; }
  list() { return [...this.records.values()].map(value => structuredClone(value)); }
  set(record: ModelQualificationRecord) { validateModelQualificationRecord(record); this.records.set(record.modelId, structuredClone(record)); this.save(); return this.get(record.modelId)!; }
  private save() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), {recursive: true});
    const temporary = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify({version: 1, records: this.list()}, null, 2)}\n`, {mode: 0o600});
    fs.renameSync(temporary, this.file);
  }
}

export class ModelRegistry {
  private providers = new Map<string, ProviderConfig>();
  private models = new Map<string, ModelConfig>();
  private routing: ModelRoutingConfig = {roles: {}};
  private configuredModelIds = new Set<string>();
  constructor(providers: ProviderConfig[], models: ModelConfig[], routing: ModelRoutingConfig, readonly qualifications = new ModelQualificationStore(), readonly accountQualifications = new AccountProfileQualificationStore(), private readonly environment: NodeJS.ProcessEnv = process.env, readonly capabilityIntelligence?: CapabilityIntelligenceStore, readonly modelIntelligence?: ModelIntelligenceLedger) { this.reload(providers, models, routing); }
  reload(providers: ProviderConfig[], models: ModelConfig[], routing: ModelRoutingConfig) {
    this.providers = new Map(providers.map(provider => [provider.id, structuredClone(provider)]));
    this.models = new Map(models.map(model => [model.id, structuredClone(model)]));
    this.configuredModelIds = new Set(models.map(model => model.id));
    this.routing = structuredClone(routing);
    this.harvestCapabilities();
  }
  provider(id: string) { const value = this.providers.get(id); return value ? structuredClone(value) : undefined; }
  model(id: string) { const value = this.models.get(id); return value ? structuredClone(value) : undefined; }
  providersList() { return [...this.providers.values()].map(value => ({...safeProvider(value, this.environment), accountProfiles: (value.accountProfiles ?? []).map(account => this.accountView(value, account))})); }
  accountProfilesList() { return [...this.providers.values()].flatMap(provider => (provider.accountProfiles ?? []).map(account => this.accountView(provider, account))); }
  accountProfile(providerId: string, accountProfileId: string) { const provider = this.providers.get(providerId), account = provider?.accountProfiles?.find(value => value.id === accountProfileId); return provider && account ? structuredClone(account) : undefined; }
  list(): ModelRegistryRow[] {
    return [...this.models.values()].map(model => { const provider = this.providers.get(model.provider), account = model.accountProfile && provider ? provider.accountProfiles?.find(value => value.id === model.accountProfile) : undefined; return {...structuredClone(model), providerDisplayName: provider?.name ?? model.provider, qualification: this.qualification(model), assignedRoles: this.rolesFor(model.id), account: provider && account ? this.accountView(provider, account) : null}; });
  }
  routes() { return structuredClone(this.routing); }
  registerDiscoveredModel(model: ModelConfig) {
    const provider = this.providers.get(model.provider); if (!provider) throw new Error('provider_missing');
    const current = this.models.get(model.id);
    if (current && (current.provider !== model.provider || current.providerModel !== model.providerModel)) throw new Error('discovered_model_identity_conflict');
    if (this.configuredModelIds.has(model.id)) return this.model(model.id)!;
    this.models.set(model.id, structuredClone(model)); this.harvestModelCapabilities(model, this.qualification(model)); return this.model(model.id)!;
  }
  setDiscoveredRoutingEligibility(modelId: string, eligible: boolean) {
    if (this.configuredModelIds.has(modelId)) throw new Error('configured_model_routing_managed_by_configuration');
    const model = this.models.get(modelId); if (!model) throw new Error('model_missing');
    model.routingEligible = eligible; this.models.set(modelId, model); return this.model(modelId)!;
  }
  governedAlternatives(modelId: string, requestedRole?: string | null) {
    const roles = requestedRole ? [requestedRole] : Object.keys(this.routing.roles).filter(role => this.expandRole(role).includes(modelId));
    return [...new Set(roles.flatMap(role => this.expandRole(role)))];
  }
  qualification(model: ModelConfig | string): ModelQualificationRecord {
    const value = typeof model === 'string' ? this.models.get(model) : model;
    if (!value) throw new Error('model_missing');
    return this.qualifications.get(value.id) ?? {
      modelId: value.id,
      state: value.enabled === false ? 'DISABLED' : value.qualification?.state ?? 'UNTESTED',
      version: value.qualification?.version ?? 'configured-v1',
      checkedAt: value.qualification?.qualifiedAt ?? new Date(0).toISOString(),
      ...(value.qualification?.qualifiedAt ? {qualifiedAt: value.qualification.qualifiedAt} : {}),
      capabilities: [...(value.qualification?.state === 'QUALIFIED' ? value.qualification.capabilities ?? [] : [])],
      nodes: [...(value.qualification?.state === 'QUALIFIED' ? value.qualification.nodes ?? value.nodes ?? [] : [])],
      ...(value.qualification?.latencyMs === undefined ? {} : {latencyMs: value.qualification.latencyMs}),
      ...(value.qualification?.successRate === undefined ? {} : {successRate: value.qualification.successRate}),
      evidence: [...(value.qualification?.evidence ?? [])],
    };
  }
  setQualification(record: ModelQualificationRecord) {
    if (!this.models.has(record.modelId)) throw new Error('model_missing');
    const value = this.qualifications.set(record); this.harvestModelCapabilities(this.models.get(record.modelId)!, value); return value;
  }
  accountQualification(providerId: string, accountProfileId: string): AccountProfileQualificationRecord {
    const provider = this.providers.get(providerId), account = provider?.accountProfiles?.find(value => value.id === accountProfileId);
    if (!provider || !account) throw new Error('account_profile_missing');
    const providerExecutionNodeId = accountProviderExecutionNode(account), credentialNodeId = accountCredentialResidency(account).nodeId;
    return this.accountQualifications.get(providerId, accountProfileId) ?? {providerId, accountProfileId, nodeId: providerExecutionNodeId, providerExecutionNodeId, credentialNodeId, state: account.enabled === false ? 'DISABLED' : account.qualification?.state ?? 'UNTESTED', version: account.qualification?.version ?? 'configured-v1', checkedAt: account.qualification?.checkedAt ?? account.qualification?.qualifiedAt ?? new Date(0).toISOString(), ...(account.qualification?.qualifiedAt ? {qualifiedAt: account.qualification.qualifiedAt} : {}), capabilities: [...(account.qualification?.state === 'QUALIFIED' ? account.qualification.capabilities ?? account.capabilities ?? [] : [])], evidence: [...(account.qualification?.evidence ?? [])], ...(account.qualification?.detail ? {detail: account.qualification.detail} : {})};
  }
  setAccountQualification(record: AccountProfileQualificationRecord) { const account = this.accountProfile(record.providerId, record.accountProfileId); if (!account) throw new Error('account_profile_missing'); const executionNode = accountProviderExecutionNode(account), credentialNode = accountCredentialResidency(account).nodeId; if ((record.providerExecutionNodeId ?? record.nodeId ?? 'controller') !== executionNode) throw new Error('account_profile_qualification_execution_node_mismatch'); if ((record.credentialNodeId ?? credentialNode) !== credentialNode) throw new Error('account_profile_qualification_credential_node_mismatch'); const value = this.accountQualifications.set({...record, nodeId: executionNode, providerExecutionNodeId: executionNode, credentialNodeId: credentialNode}); this.harvestAccountCapabilities(value); return value; }
  route(request: ModelRouteRequest): ModelRouteDecision {
    const requestedRole = request.modelRole ?? (!request.model ? this.routing.defaultRole : undefined);
    const candidates = request.model ? [request.model] : requestedRole ? this.expandRole(requestedRole) : [];
    if (!candidates.length) throw new Error(request.model ? 'model_missing' : 'model_route_unconfigured');
    const roleCapabilities = requestedRole ? this.routing.roles[requestedRole]?.requires ?? [] : [];
    const effectiveRequest = {...request, requiredCapabilities: [...new Set([...roleCapabilities, ...(request.requiredCapabilities ?? [])])]};
    const considered = candidates.map(modelId => this.eligibility(modelId, effectiveRequest));
    const preferred = considered.map((item, index) => ({item, index})).filter(value => value.item.eligible && value.item.intelligence?.state === 'PREFERRED').sort((left, right) => historicalRouteScore(right.item.intelligence!.metrics) - historicalRouteScore(left.item.intelligence!.metrics) || left.index - right.index);
    const selectedIndex = preferred[0]?.index ?? considered.findIndex(item => item.eligible);
    if (selectedIndex < 0) throw Object.assign(new Error('model_route_unavailable'), {considered});
    if (selectedIndex > 0 && request.allowFallback === false) throw Object.assign(new Error('model_fallback_disabled'), {considered});
    const selectedAssessment = considered[selectedIndex], selected = this.models.get(selectedAssessment.modelId)!, provider = this.providers.get(selected.provider)!, account = selected.accountProfile ? provider.accountProfiles?.find(value => value.id === selected.accountProfile) : undefined;
    const qualification = this.qualification(selected), accountView = account ? this.accountView(provider, account) : undefined;
    const providerExecutionNodeId = account ? accountProviderExecutionNode(account) : request.providerExecutionNodeId ?? (request.workloadNodeId === undefined ? request.nodeId : qualification.nodes[0] ?? selected.nodes?.[0] ?? request.nodeId);
    return {
      requestedModel: request.model ?? null, requestedRole: requestedRole ?? null, allowFallback: request.allowFallback !== false, purpose: request.purpose ?? 'EXECUTION', modelId: selected.id, providerId: selected.provider, accountProfileId: account?.id ?? null, accountLabel: account?.label ?? null, accountPlan: account?.plan ?? null, accountPlanAuthority: account?.planAuthority ?? null, accountQualification: accountView?.qualification.state ?? null, accountAvailability: accountView?.availability ?? null,
      providerModel: selected.providerModel, workloadNodeId: request.workloadNodeId ?? request.nodeId, providerExecutionNodeId, credentialNodeId: account ? accountCredentialResidency(account).nodeId : null, nodeId: providerExecutionNodeId, qualificationVersion: qualification.state === 'QUALIFIED' ? qualification.version : selectedAssessment.intelligence?.qualificationVersion ?? qualification.version,
      fallback: selectedIndex > 0, fallbackReason: selectedIndex > 0 ? considered.slice(0, selectedIndex).map(item => `${item.modelId}:${item.reasons.join('+')}`).join(',') : null,
      requiredCapabilities: effectiveRequest.requiredCapabilities.map(normalizeCapabilityId), nativeCapabilities: selectedAssessment.capabilityAssessment?.filter(item => item.satisfied && item.implementation === 'NATIVE').map(item => item.capabilityId) ?? [], emulatedCapabilities: selectedAssessment.capabilityAssessment?.filter(item => item.satisfied && item.implementation === 'AGENT_CONTROL_EMULATED').map(item => item.capabilityId) ?? [],
      ...(selectedAssessment.intelligence ? {intelligence: {...selectedAssessment.intelligence, selectionBasis: selectedAssessment.intelligence.state === 'PREFERRED' ? 'human-approved preferred route with historical verified economics' : 'configured route order'}} : {}),
      considered,
    };
  }
  private expandRole(role: string, stack = new Set<string>()): string[] {
    if (stack.has(role)) throw new Error(`model_fallback_cycle:${role}`);
    const route = this.routing.roles[role]; if (!route) throw new Error('model_role_missing');
    stack.add(role); const output: string[] = [];
    for (const id of [route.primary, ...(route.fallback ?? [])]) output.push(...(this.routing.roles[id] ? this.expandRole(id, stack) : [id]));
    stack.delete(role); return [...new Set(output)];
  }
  private eligibility(modelId: string, request: ModelRouteRequest) {
    const reasons: string[] = [], model = this.models.get(modelId);
    const workloadNodeId = request.workloadNodeId ?? request.nodeId;
    if (!model) return {modelId, accountProfileId: null, workloadNodeId, providerExecutionNodeId: request.providerExecutionNodeId ?? request.nodeId, credentialNodeId: null, nodeId: request.providerExecutionNodeId ?? request.nodeId, eligible: false, reasons: ['unknown-model']};
    const provider = this.providers.get(model.provider), qualification = this.qualification(model), capabilities = new Set(qualification.capabilities.map(normalizeCapabilityId));
    if (provider?.enabled === false) reasons.push('provider-disabled');
    if (!provider) reasons.push('provider-missing');
    const qualificationRun = request.purpose === 'QUALIFICATION';
    if (model.enabled === false || qualification.state === 'DISABLED') reasons.push('model-disabled');
    if (model.routingEligible === false && !qualificationRun) reasons.push('model-routing-disabled');
    const account = model.accountProfile ? provider?.accountProfiles?.find(value => value.id === model.accountProfile) : undefined;
    if (request.accountProfile && model.accountProfile !== request.accountProfile) reasons.push('account-profile-policy-mismatch');
    if (model.accountProfile && !account) reasons.push('account-profile-missing');
    if (account) {
      const accountQualification = this.accountQualification(model.provider, account.id);
      const executionNode = accountProviderExecutionNode(account), credentialNode = accountCredentialResidency(account).nodeId;
      if (request.providerExecutionNodeId && request.providerExecutionNodeId !== executionNode) reasons.push('provider-execution-node-policy-mismatch');
      if ((accountQualification.providerExecutionNodeId ?? accountQualification.nodeId) && (accountQualification.providerExecutionNodeId ?? accountQualification.nodeId) !== executionNode) reasons.push('account-profile-qualification-execution-node-mismatch');
      if (accountQualification.credentialNodeId && accountQualification.credentialNodeId !== credentialNode) reasons.push('account-profile-qualification-credential-node-mismatch');
      if (account.enabled === false || accountQualification.state === 'DISABLED') reasons.push('account-profile-disabled');
      else if (!this.credentialConfigured(account, accountQualification)) reasons.push('account-profile-authentication-required');
      else if (accountQualification.state !== 'QUALIFIED') reasons.push(`account-profile-qualification-${accountQualification.state.toLowerCase()}`);
    }
    const executionNode = account ? accountProviderExecutionNode(account) : request.providerExecutionNodeId ?? (request.workloadNodeId === undefined ? request.nodeId : qualification.nodes[0] ?? model.nodes?.[0] ?? request.nodeId), credentialNode = account ? accountCredentialResidency(account).nodeId : null;
    const taskQualification = request.taskClass ? qualification.taskQualifications?.find(item => item.taskClass === request.taskClass) : undefined;
    const taskFailed = Boolean(taskQualification && ['FAILED','DISABLED'].includes(taskQualification.state));
    if (taskFailed) reasons.push(`task-qualification-${request.taskClass}-${taskQualification!.state.toLowerCase()}`);
    const intelligence = this.intelligenceFor(model, executionNode);
    if (qualificationRun ? !['UNTESTED','QUALIFYING','QUALIFIED','DEGRADED'].includes(qualification.state) : qualification.state !== 'QUALIFIED') reasons.push(`qualification-${qualification.state.toLowerCase()}`);
    const nodes = qualification.nodes.length ? qualification.nodes : model.nodes ?? [];
    if (nodes.length && !nodes.includes(executionNode)) reasons.push('provider-execution-node-unavailable');
    const capabilityAssessment = this.capabilityIntelligence?.assess({providerId: model.provider, modelId: model.id, ...(model.accountProfile ? {accountProfileId: model.accountProfile} : {}), runtimeId: provider?.kind, nodeId: executionNode}, request.requiredCapabilities ?? [], {allowEmulated: true, verifiedOnly: !qualificationRun});
    if (capabilityAssessment) for (const assessment of capabilityAssessment) { if (!assessment.satisfied) reasons.push(`capability-${assessment.capabilityId}-${assessment.reason}`); }
    else for (const required of request.requiredCapabilities ?? []) if (!(qualificationRun ? new Set(model.capabilities.map(normalizeCapabilityId)) : capabilities).has(normalizeCapabilityId(required))) reasons.push(`capability-${required}-unproven`);
    return {modelId, accountProfileId: model.accountProfile ?? null, workloadNodeId, providerExecutionNodeId: executionNode, credentialNodeId: credentialNode, nodeId: executionNode, eligible: reasons.length === 0, reasons, ...(capabilityAssessment ? {capabilityAssessment} : {}), ...(intelligence ? {intelligence} : {})};
  }
  private accountView(provider: ProviderConfig, account: ProviderAccountProfileConfig): ProviderAccountProfileView {
    const qualification = this.accountQualification(provider.id, account.id), credentialConfigured = this.credentialConfigured(account, qualification);
    const availability = account.enabled === false || qualification.state === 'DISABLED' ? 'DISABLED' : !credentialConfigured ? 'AUTH_REQUIRED' : qualification.state === 'QUALIFIED' ? 'AVAILABLE' : qualification.state === 'DEGRADED' ? 'DEGRADED' : 'UNQUALIFIED';
    const providerExecutionNodeId = accountProviderExecutionNode(account), credentialNodeId = accountCredentialResidency(account).nodeId;
    return {providerId: provider.id, id: account.id, nodeId: providerExecutionNodeId, providerExecutionNodeId, credentialNodeId, label: account.label, plan: account.plan ?? null, planAuthority: account.planAuthority ?? null, capabilities: [...(account.capabilities ?? [])], qualification, credentialConfigured, availability};
  }
  private credentialConfigured(account: ProviderAccountProfileConfig, qualification: AccountProfileQualificationRecord) {
    const residency = accountCredentialResidency(account);
    if (residency.nodeId !== 'controller') return (qualification.credentialNodeId ?? qualification.nodeId) === residency.nodeId && ['QUALIFIED', 'DEGRADED'].includes(qualification.state);
    if (residency.store.type === 'provider-secure-store') return credentialReferenceStatus(residency.store, this.environment) === 'CONFIGURED';
    const value = this.environment[residency.store.env]?.trim();
    if (!value) return false;
    if (residency.store.type === 'api-key-env') return true;
    if (!path.isAbsolute(value)) return false;
    try { return residency.store.type === 'codex-home-env' ? fs.statSync(value).isDirectory() : fs.statSync(value).isFile(); } catch { return false; }
  }
  private rolesFor(modelId: string) { return Object.entries(this.routing.roles).filter(([, route]) => [route.primary, ...(route.fallback ?? [])].includes(modelId)).map(([role]) => role); }
  private harvestCapabilities() {
    if (!this.capabilityIntelligence) return;
    for (const provider of this.providers.values()) for (const capability of provider.capabilities ?? []) this.observeCapability({id: `provider-config:${provider.id}:${normalizeCapabilityId(capability)}`, capability, subject: {providerId: provider.id, runtimeId: provider.kind}, verified: false, evidence: [`provider-config:${provider.id}`], source: 'ADAPTER'});
    for (const model of this.models.values()) this.harvestModelCapabilities(model, this.qualification(model));
    for (const record of this.accountQualifications.list()) this.harvestAccountCapabilities(record);
  }
  private harvestModelCapabilities(model: ModelConfig, qualification: ModelQualificationRecord) {
    if (!this.capabilityIntelligence) return; const verified = qualification.state === 'QUALIFIED', capabilities = verified ? qualification.capabilities : model.capabilities;
    for (const capability of capabilities) this.observeCapability({id: `model-${verified ? 'qualification' : 'config'}:${model.id}:${qualification.version}:${normalizeCapabilityId(capability)}`, capability, subject: {providerId: model.provider, modelId: model.id, ...(model.accountProfile ? {accountProfileId: model.accountProfile} : {})}, verified, evidence: qualification.evidence.length ? qualification.evidence : [`model-config:${model.id}`], source: verified ? 'QUALIFICATION' : 'ADAPTER', qualifiedAt: verified ? qualification.qualifiedAt ?? qualification.checkedAt : undefined});
  }
  private harvestAccountCapabilities(record: AccountProfileQualificationRecord) {
    if (!this.capabilityIntelligence) return; for (const capability of record.capabilities) this.observeCapability({id: `account-qualification:${record.providerId}:${record.accountProfileId}:${record.version}:${normalizeCapabilityId(capability)}`, capability, subject: {providerId: record.providerId, accountProfileId: record.accountProfileId, nodeId: record.providerExecutionNodeId ?? record.nodeId}, verified: record.state === 'QUALIFIED', evidence: record.evidence, source: 'QUALIFICATION', qualifiedAt: record.qualifiedAt});
  }
  private observeCapability(input: {id: string; capability: string; subject: {providerId: string; modelId?: string; accountProfileId?: string; runtimeId?: string; nodeId?: string}; verified: boolean; evidence: string[]; source: 'ADAPTER' | 'QUALIFICATION'; qualifiedAt?: string}) {
    if (!this.capabilityIntelligence || this.capabilityIntelligence.listObservations().some(item => item.id === input.id)) return;
    this.capabilityIntelligence.observe({id: input.id, capabilityId: input.capability, subject: input.subject, support: 'SUPPORTED', implementation: 'NATIVE', verification: input.verified ? 'VERIFIED' : 'UNVERIFIED', confidence: input.verified ? 1 : .5, ...(input.qualifiedAt ? {qualifiedAt: input.qualifiedAt} : {}), limitations: input.verified ? [] : ['Configured or advertised capability has not completed qualification'], evidence: input.evidence, source: input.source, adapterCapability: input.capability});
  }
  private intelligenceFor(model: ModelConfig, nodeId: string) {
    const route = this.modelIntelligence?.projection().routes.filter(item => item.identity.providerId === model.provider && item.identity.modelId === model.id && item.identity.nodeId === nodeId && (item.identity.accountProfileId ?? null) === (model.accountProfile ?? null)).sort((left, right) => right.current.completed - left.current.completed)[0];
    if (!route || !this.modelIntelligence) return undefined;
    const latest = this.modelIntelligence.attemptsList({routeKey: route.routeKey}).at(-1);
    const qualificationVersion = latest ? `model-intelligence:${latest.suiteId}@${latest.suiteVersion}:${latest.suiteSha256.slice(0, 16)}` : `model-intelligence:${route.routeKey}`;
    return {state: route.state, metrics: route.current, qualificationVersion};
  }
}

function key(providerId: string, accountProfileId: string) { return `${providerId}\u0000${accountProfileId}`; }

function validateModelQualificationRecord(record: ModelQualificationRecord) {
  if (!record.modelId.trim() || !record.version.trim() || !Number.isFinite(Date.parse(record.checkedAt)) || !Array.isArray(record.capabilities) || !Array.isArray(record.nodes) || !Array.isArray(record.evidence)) throw new Error('model_qualification_record_invalid');
  if (record.configuration && (!record.configuration.providerModel.trim() || !record.configuration.modelRevision.trim() || !/^[a-f0-9]{64}$/.test(record.configuration.artifactSha256) || !record.configuration.quantization.trim() || !record.configuration.runtime.trim() || !record.configuration.runtimeRevision.trim() || record.configuration.runtimeBinarySha256?.some(value => !/^[a-f0-9]{64}$/.test(value)))) throw new Error('model_qualification_configuration_invalid');
  const taskClasses = new Set<string>();
  for (const task of record.taskQualifications ?? []) {
    if (!task.taskClass.trim() || taskClasses.has(task.taskClass) || !Number.isFinite(Date.parse(task.checkedAt)) || !Array.isArray(task.evidence)) throw new Error('model_task_qualification_invalid');
    taskClasses.add(task.taskClass);
  }
}

function historicalRouteScore(metrics: ModelWindowMetrics) { return (metrics.quality ?? 0) * 4 + (metrics.reliability ?? 0) * 3 + (metrics.costPerSuccessfulTask === null ? 0 : 1 / (1 + metrics.costPerSuccessfulTask)) + (metrics.timePerSuccessfulTaskMs === null ? 0 : 1 / (1 + metrics.timePerSuccessfulTaskMs / 1_000)); }

function safeProvider(provider: ProviderConfig, environment: NodeJS.ProcessEnv) {
  const status = providerCredentialStatus(provider, environment);
  return {id: provider.id, name: provider.name ?? provider.id, kind: provider.kind, enabled: provider.enabled !== false, baseUrl: provider.baseUrl, adapter: provider.adapter, wireApi: provider.wireApi, auth: provider.auth ? {type: provider.auth.type, configured: ['NOT_REQUIRED','CONFIGURED'].includes(status), status} : undefined, discovery: provider.discovery ? structuredClone(provider.discovery) : undefined, capabilities: [...(provider.capabilities ?? [])]};
}
