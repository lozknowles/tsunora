import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {redactSensitiveText} from './context-readers.js';
import {policyProtectsEffect, type GovernedEffect, type ResourceCapabilityPolicy} from './action-governance.js';
import type {WorkerControllerRelationship, WorkerExecutionIdentity, WorkerExecutionLocality, WorkerIdentityAuthority} from './job-types.js';

export type RuntimeSafetyOutcome = 'ALLOW' | 'ALLOW_WITH_AUDIT' | 'REQUIRE_APPROVAL' | 'DENY' | 'PAUSE' | 'ESCALATE';
export type RuntimeActionCategory = 'READ_ONLY' | 'REPOSITORY_WRITE' | 'FILESYSTEM_WRITE' | 'REMOTE_NODE' | 'DESTRUCTIVE' | 'DEPLOYMENT' | 'CREDENTIAL_USE' | 'EXTERNAL_COMMUNICATION' | 'UNKNOWN';
export type RuntimeEffectDeclaration = {mode: 'READ_ONLY' | 'UNKNOWN' | 'RESOLVED_EFFECTS'} | {mode: 'CATEGORIES'; categories: RuntimeActionCategory[]};

export interface RuntimeActionIntent {
  runId: string;
  parcelId?: string;
  stageId?: string;
  stepId: string;
  actor: string;
  action: string;
  goal: string;
  categories: RuntimeActionCategory[];
  filesystemScope: string[];
  repositoryScope: string[];
  remoteNodeIds: string[];
  credentialReferences: string[];
  externalDestinations: string[];
  production: boolean;
  destructive: boolean;
  requestedCapabilities: string[];
  workerId?: string;
  workerNodeId?: string;
  workerLocality?: WorkerExecutionLocality;
  workerIdentityAuthority?: WorkerIdentityAuthority;
  workerControllerRelationship?: WorkerControllerRelationship;
  crewRole?: string;
  providerId?: string;
  accountProfileId?: string;
  modelId?: string;
  nodeId?: string;
  effects?: GovernedEffect[];
  resourcePolicies?: ResourceCapabilityPolicy[];
  /** True when pre-redaction inspection detected credential material. The material itself is never retained. */
  sensitiveMaterialDetected?: boolean;
}

export interface RuntimeSafetyDecision {
  schema: 'agent-control.runtime-safety-decision/v1';
  id: string;
  at: string;
  intentHash: string;
  runId: string;
  parcelId?: string;
  stageId?: string;
  stepId: string;
  action: string;
  actor: string;
  workerId?: string;
  workerNodeId?: string;
  workerLocality?: WorkerExecutionLocality;
  workerIdentityAuthority?: WorkerIdentityAuthority;
  workerControllerRelationship?: WorkerControllerRelationship;
  crewRole?: string;
  providerId?: string;
  accountProfileId?: string;
  modelId?: string;
  nodeId?: string;
  categories: RuntimeActionCategory[];
  outcome: RuntimeSafetyOutcome;
  reason: string;
  policyId: string;
  approvalId?: string;
  evidence: string[];
  effects?: GovernedEffect[];
  resourcePolicies?: ResourceCapabilityPolicy[];
}

export interface RuntimeSafetyPolicy {
  id: string;
  allowRepositoryWrite?: boolean;
  approvedFilesystemRoots?: string[];
  approvedRepositoryRoots?: string[];
  approvedRemoteNodes?: string[];
  requireApprovalForExternalCommunication?: boolean;
  requireApprovalForCredentialUse?: boolean;
  requireApprovalForDeployment?: boolean;
  denyDestructiveWithoutApproval?: boolean;
}

export interface RuntimeSafetySupervisorPort { assess(intent: RuntimeActionIntent): RuntimeSafetyDecision; approve(decisionId: string, actor: string): RuntimeSafetyDecision; list(): RuntimeSafetyDecision[]; subscribe?(listener: (decision: RuntimeSafetyDecision) => void): () => void; }

interface Snapshot {schema: 'agent-control.runtime-safety-ledger/v1'; decisions: RuntimeSafetyDecision[]; approvals: Array<{decisionId: string; actor: string; at: string}>}

export class RuntimeSafetySupervisor implements RuntimeSafetySupervisorPort {
  private readonly decisions = new Map<string, RuntimeSafetyDecision>();
  private readonly approvals = new Map<string, {decisionId: string; actor: string; at: string}>();
  private readonly listeners = new Set<(decision: RuntimeSafetyDecision) => void>();
  private readonly policy: Required<RuntimeSafetyPolicy>;
  constructor(policy: RuntimeSafetyPolicy = {id: 'agent-control.default-runtime-safety/v1'}, readonly file?: string, private readonly clock = () => new Date().toISOString()) {
    this.policy = {id: policy.id, allowRepositoryWrite: policy.allowRepositoryWrite ?? true, approvedFilesystemRoots: [...(policy.approvedFilesystemRoots ?? [])], approvedRepositoryRoots: [...(policy.approvedRepositoryRoots ?? [])], approvedRemoteNodes: [...(policy.approvedRemoteNodes ?? [])], requireApprovalForExternalCommunication: policy.requireApprovalForExternalCommunication ?? true, requireApprovalForCredentialUse: policy.requireApprovalForCredentialUse ?? false, requireApprovalForDeployment: policy.requireApprovalForDeployment ?? true, denyDestructiveWithoutApproval: policy.denyDestructiveWithoutApproval ?? true};
    if (!file || !fs.existsSync(file)) return; const snapshot = JSON.parse(fs.readFileSync(file, 'utf8')) as Snapshot; if (snapshot.schema !== 'agent-control.runtime-safety-ledger/v1') throw new Error('runtime_safety_snapshot_invalid'); for (const item of snapshot.decisions) this.decisions.set(item.id, item); for (const item of snapshot.approvals ?? []) this.approvals.set(item.decisionId, item);
  }
  assess(raw: RuntimeActionIntent) {
    const sensitiveMaterialDetected = raw.sensitiveMaterialDetected === true || containsSecretMaterial(raw), intent = sanitizeIntent({...raw, ...(sensitiveMaterialDetected ? {sensitiveMaterialDetected: true} : {})}), intentHash = sha(intent), existing = [...this.decisions.values()].find(item => item.intentHash === intentHash && item.runId === intent.runId && item.stepId === intent.stepId);
    if (existing) return structuredClone(existing);
    const assessment = this.evaluate(intent), id = `safety-${randomUUID()}`, approvalId = ['REQUIRE_APPROVAL','PAUSE','ESCALATE'].includes(assessment.outcome) ? `runtime-safety:${id}` : undefined;
    const decision: RuntimeSafetyDecision = {schema: 'agent-control.runtime-safety-decision/v1', id, at: this.clock(), intentHash, runId: intent.runId, ...(intent.parcelId ? {parcelId: intent.parcelId} : {}), ...(intent.stageId ? {stageId: intent.stageId} : {}), stepId: intent.stepId, action: intent.action, actor: intent.actor, ...(intent.workerId ? {workerId: intent.workerId} : {}), ...(intent.workerNodeId ? {workerNodeId: intent.workerNodeId} : {}), ...(intent.workerLocality ? {workerLocality: intent.workerLocality} : {}), ...(intent.workerIdentityAuthority ? {workerIdentityAuthority: intent.workerIdentityAuthority} : {}), ...(intent.workerControllerRelationship ? {workerControllerRelationship: intent.workerControllerRelationship} : {}), ...(intent.crewRole ? {crewRole: intent.crewRole} : {}), ...(intent.providerId ? {providerId: intent.providerId} : {}), ...(intent.accountProfileId ? {accountProfileId: intent.accountProfileId} : {}), ...(intent.modelId ? {modelId: intent.modelId} : {}), ...(intent.nodeId ? {nodeId: intent.nodeId} : {}), categories: intent.categories, outcome: assessment.outcome, reason: assessment.reason, policyId: this.policy.id, ...(approvalId ? {approvalId} : {}), evidence: assessment.evidence, ...(intent.effects?.length ? {effects: intent.effects} : {}), ...(intent.resourcePolicies?.length ? {resourcePolicies: intent.resourcePolicies} : {})};
    this.decisions.set(id, decision); this.save(); this.publish(decision); return structuredClone(decision);
  }
  approve(decisionId: string, actor: string) { const decision = this.decisions.get(decisionId); if (!decision) throw new Error('runtime_safety_decision_missing'); if (!['REQUIRE_APPROVAL','PAUSE','ESCALATE'].includes(decision.outcome)) throw new Error('runtime_safety_decision_not_approvable'); this.approvals.set(decision.id, {decisionId: decision.id, actor: safeIdentifier(actor), at: this.clock()}); decision.outcome = 'ALLOW_WITH_AUDIT'; decision.reason = `${decision.reason}; explicitly approved`; decision.evidence = [...decision.evidence, `approval:${safeIdentifier(actor)}`]; this.save(); this.publish(decision); return structuredClone(decision); }
  list() { return [...this.decisions.values()].sort((left, right) => Date.parse(left.at) - Date.parse(right.at)).map(item => structuredClone(item)); }
  subscribe(listener: (decision: RuntimeSafetyDecision) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private evaluate(intent: RuntimeActionIntent): {outcome: RuntimeSafetyOutcome; reason: string; evidence: string[]} {
    const evidence = [`goal:${sha(intent.goal).slice(0, 16)}`, `action:${intent.action}`, ...intent.categories.map(item => `category:${item}`), ...(intent.workerLocality ? [`worker-locality:${intent.workerLocality}`] : []), ...(intent.workerIdentityAuthority ? [`worker-identity-authority:${intent.workerIdentityAuthority}`] : [])];
    const protectedEffect = intent.effects?.find(effect => intent.resourcePolicies?.some(policy => policyProtectsEffect(policy, effect)));
    if (protectedEffect) return {outcome: 'DENY', reason: `Resolved ${protectedEffect.kind} effect conflicts with read-only resource policy for ${protectedEffect.resource.id}`, evidence: [...evidence, `effect:${protectedEffect.kind}:${protectedEffect.resource.id}`, 'execution:not-started']};
    if (intent.sensitiveMaterialDetected) return {outcome: 'DENY', reason: 'Plain credential material is forbidden; only opaque credential references may cross the control boundary', evidence};
    if (intent.categories.includes('UNKNOWN')) return {outcome: 'DENY', reason: 'Action effects are missing, ambiguous, or inconsistent; execution fails closed', evidence: [...evidence, 'execution:not-started']};
    if (!insideApprovedScopes(intent.filesystemScope, this.policy.approvedFilesystemRoots) || !insideApprovedScopes(intent.repositoryScope, this.policy.approvedRepositoryRoots)) return {outcome: 'DENY', reason: 'Requested filesystem or repository target falls outside configured scope', evidence};
    if (this.policy.approvedRemoteNodes.length && intent.remoteNodeIds.some(id => !this.policy.approvedRemoteNodes.includes(id))) return {outcome: 'DENY', reason: 'Requested remote node is outside configured scope', evidence};
    if (intent.destructive || intent.categories.includes('DESTRUCTIVE')) return this.policy.denyDestructiveWithoutApproval ? {outcome: 'REQUIRE_APPROVAL', reason: 'Destructive action requires explicit Agent Control approval', evidence} : {outcome: 'ALLOW_WITH_AUDIT', reason: 'Destructive action allowed by configured policy with durable audit', evidence};
    if (intent.production || intent.categories.includes('DEPLOYMENT')) return this.policy.requireApprovalForDeployment ? {outcome: 'REQUIRE_APPROVAL', reason: 'Production or deployment action requires explicit approval', evidence} : {outcome: 'ALLOW_WITH_AUDIT', reason: 'Deployment allowed by configured policy with durable audit', evidence};
    if (intent.categories.includes('EXTERNAL_COMMUNICATION') && this.policy.requireApprovalForExternalCommunication) return {outcome: 'REQUIRE_APPROVAL', reason: 'External communication requires explicit approval', evidence};
    if (intent.categories.includes('CREDENTIAL_USE') && this.policy.requireApprovalForCredentialUse) return {outcome: 'REQUIRE_APPROVAL', reason: 'Credential use requires explicit approval', evidence};
    if (intent.categories.includes('REPOSITORY_WRITE') && !this.policy.allowRepositoryWrite) return {outcome: 'DENY', reason: 'Repository writes are disabled by runtime safety policy', evidence};
    if (intent.categories.some(item => ['REPOSITORY_WRITE','FILESYSTEM_WRITE','REMOTE_NODE','CREDENTIAL_USE'].includes(item))) return {outcome: 'ALLOW_WITH_AUDIT', reason: 'Scoped governed action is allowed with durable independent audit', evidence};
    return {outcome: 'ALLOW', reason: 'Read-only bounded action satisfies configured scope', evidence};
  }
  private save() { if (!this.file) return; fs.mkdirSync(path.dirname(this.file), {recursive: true}); const temporary = `${this.file}.${process.pid}.tmp`, snapshot: Snapshot = {schema: 'agent-control.runtime-safety-ledger/v1', decisions: this.list(), approvals: [...this.approvals.values()]}; fs.writeFileSync(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, {mode: 0o600}); fs.renameSync(temporary, this.file); }
  private publish(decision: RuntimeSafetyDecision) { for (const listener of this.listeners) listener(structuredClone(decision)); }
}

export function deriveRuntimeActionIntent(input: {runId: string; parcelId?: string; stageId?: string; stepId: string; actor: string; action: string; goal: string; parameters: Record<string, unknown>; requestedCapabilities: string[]; resources: string[]; workerId?: string; workerIdentity?: WorkerExecutionIdentity; crewRole?: string; providerId?: string; accountProfileId?: string; modelId?: string; nodeId?: string; effectDeclaration?: RuntimeEffectDeclaration; effects?: GovernedEffect[]; resourcePolicies?: ResourceCapabilityPolicy[]}) {
  const text = `${input.action} ${input.goal} ${input.requestedCapabilities.join(' ')}`.toLowerCase(), categories = declaredCategories(input.effectDeclaration, input.effects);
  // Text is never authority to grant execution. It can only detect a declaration
  // mismatch and make the decision more restrictive.
  const suspicious = /delete|destroy|wipe|drop|force-push|reset-hard|remove-recursive|deploy|release|publish|production|(?:promote\w*.*(?:release|build|candidate|production)|(?:release|build|candidate|production).*promote\w*)|repository\.write|repo.*write|git\.mutation|code.*modify|file.*write|filesystem\.write|package\.install|remote|ssh|adb|credential|oauth|api.?key|email|message|external\.communication/.test(text);
  if (suspicious && categories.size === 1 && categories.has('READ_ONLY')) { categories.delete('READ_ONLY'); categories.add('UNKNOWN'); }
  const workerIdentity = classifyWorkerIdentity(input.workerId, input.workerIdentity);
  if (input.workerId && workerIdentity.locality === 'REMOTE_WORKER') categories.add('REMOTE_NODE');
  else if (input.workerId && workerIdentity.locality === 'UNKNOWN') categories.add('UNKNOWN');
  const entries = flatten(input.parameters), filesystemScope = entries.filter(item => /(?:path|file|directory|cwd)$/i.test(item.key) && typeof item.value === 'string').map(item => String(item.value)), repositoryScope = entries.filter(item => /repo(?:sitory)?(?:root|path)?$/i.test(item.key) && typeof item.value === 'string').map(item => String(item.value)), credentialReferences = entries.filter(item => /(?:credential|auth|token|key).*ref|(?:credential|auth).*env/i.test(item.key) && typeof item.value === 'string').map(item => String(item.value)), externalDestinations = entries.filter(item => /(?:url|destination|recipient|endpoint)$/i.test(item.key) && typeof item.value === 'string').map(item => String(item.value));
  if (categories.size > 1) categories.delete('READ_ONLY');
  const raw: RuntimeActionIntent = {runId: input.runId, ...(input.parcelId ? {parcelId: input.parcelId} : {}), ...(input.stageId ? {stageId: input.stageId} : {}), stepId: input.stepId, actor: input.actor, action: input.action, goal: input.goal, categories: [...categories], filesystemScope, repositoryScope, remoteNodeIds: workerIdentity.locality === 'REMOTE_WORKER' ? [workerIdentity.nodeId ?? input.workerId!] : [], credentialReferences, externalDestinations, production: categories.has('DEPLOYMENT'), destructive: categories.has('DESTRUCTIVE'), requestedCapabilities: input.requestedCapabilities, ...(input.workerId ? {workerId: input.workerId, ...(workerIdentity.nodeId ? {workerNodeId: workerIdentity.nodeId} : {}), workerLocality: workerIdentity.locality, workerIdentityAuthority: workerIdentity.authority, workerControllerRelationship: workerIdentity.controllerRelationship} : {}), ...(input.crewRole ? {crewRole: input.crewRole} : {}), ...(input.providerId ? {providerId: input.providerId} : {}), ...(input.accountProfileId ? {accountProfileId: input.accountProfileId} : {}), ...(input.modelId ? {modelId: input.modelId} : {}), ...(input.nodeId ? {nodeId: input.nodeId} : {}), sensitiveMaterialDetected: containsSecretMaterial(input.parameters), ...(input.effects?.length ? {effects: input.effects} : {}), ...(input.resourcePolicies?.length ? {resourcePolicies: input.resourcePolicies} : {})};
  return sanitizeIntent(raw);
}

function classifyWorkerIdentity(workerId: string | undefined, identity: WorkerExecutionIdentity | undefined): WorkerExecutionIdentity {
  if (!workerId || !identity || identity.workerId !== workerId) return {workerId: workerId ?? 'unassigned', nodeId: null, locality: 'UNKNOWN', authority: 'UNVERIFIED', controllerRelationship: 'UNKNOWN'};
  const internallyEstablished = identity.authority === 'AGENT_CONTROL_INTERNAL' && identity.locality === 'CONTROLLER_LOCAL' && identity.controllerRelationship === 'CONTROLLER_INTERNAL' && Boolean(identity.nodeId);
  const configured = identity.authority === 'CONFIGURED_RESOURCE' && Boolean(identity.nodeId) && (
    identity.locality === 'CONTROLLER_LOCAL' && identity.controllerRelationship === 'CONTROLLER_RESOURCE' ||
    identity.locality === 'LOCAL_WORKER' && identity.controllerRelationship === 'CONTROLLER_HOST_RESOURCE' ||
    identity.locality === 'REMOTE_WORKER' && identity.controllerRelationship === 'REMOTE_RESOURCE'
  );
  return internallyEstablished || configured ? structuredClone(identity) : {workerId, nodeId: null, locality: 'UNKNOWN', authority: 'UNVERIFIED', controllerRelationship: 'UNKNOWN'};
}

function declaredCategories(declaration: RuntimeEffectDeclaration | undefined, effects: GovernedEffect[] | undefined) {
  const categories = new Set<RuntimeActionCategory>();
  if (!declaration || declaration.mode === 'UNKNOWN') categories.add('UNKNOWN');
  else if (declaration.mode === 'READ_ONLY') categories.add('READ_ONLY');
  else if (declaration.mode === 'CATEGORIES') {
    for (const category of declaration.categories) categories.add(category);
    if (!categories.size || categories.has('READ_ONLY') && categories.size > 1) { categories.clear(); categories.add('UNKNOWN'); }
  } else if (!effects?.length) categories.add('UNKNOWN');
  else for (const effect of effects) {
    if (effect.kind === 'READ' && !effect.consequential) categories.add('READ_ONLY');
    else if (effect.kind === 'LOCAL_WRITE') categories.add('REPOSITORY_WRITE');
    else if (['CREATE', 'UPDATE', 'FORCE_UPDATE', 'DELETE', 'REWRITE'].includes(effect.kind)) categories.add('REPOSITORY_WRITE');
    else categories.add('UNKNOWN');
    if (['FORCE_UPDATE', 'DELETE', 'REWRITE'].includes(effect.kind)) categories.add('DESTRUCTIVE');
    if (effect.external) categories.add('EXTERNAL_COMMUNICATION');
  }
  return categories;
}

function sanitizeIntent(input: RuntimeActionIntent): RuntimeActionIntent { return {...input, runId: safeIdentifier(input.runId), ...(input.parcelId ? {parcelId: safeIdentifier(input.parcelId)} : {}), ...(input.stageId ? {stageId: safeIdentifier(input.stageId)} : {}), stepId: safeIdentifier(input.stepId), actor: safeIdentifier(input.actor), action: safeIdentifier(input.action), goal: safeText(input.goal, 8_192), categories: [...new Set(input.categories)], filesystemScope: safeList(input.filesystemScope), repositoryScope: safeList(input.repositoryScope), remoteNodeIds: input.remoteNodeIds.map(safeIdentifier), credentialReferences: input.credentialReferences.map(value => safeIdentifier(value)), externalDestinations: input.externalDestinations.map(value => safeText(value, 512)), requestedCapabilities: input.requestedCapabilities.map(safeIdentifier), ...(input.workerId ? {workerId: safeIdentifier(input.workerId)} : {}), ...(input.workerNodeId ? {workerNodeId: safeIdentifier(input.workerNodeId)} : {}), ...(input.workerLocality ? {workerLocality: input.workerLocality} : {}), ...(input.workerIdentityAuthority ? {workerIdentityAuthority: input.workerIdentityAuthority} : {}), ...(input.workerControllerRelationship ? {workerControllerRelationship: input.workerControllerRelationship} : {}), ...(input.crewRole ? {crewRole: safeIdentifier(input.crewRole)} : {}), ...(input.providerId ? {providerId: safeIdentifier(input.providerId)} : {}), ...(input.accountProfileId ? {accountProfileId: safeIdentifier(input.accountProfileId)} : {}), ...(input.modelId ? {modelId: safeIdentifier(input.modelId)} : {}), ...(input.nodeId ? {nodeId: safeIdentifier(input.nodeId)} : {}), ...(input.effects?.length ? {effects: structuredClone(input.effects)} : {}), ...(input.resourcePolicies?.length ? {resourcePolicies: structuredClone(input.resourcePolicies)} : {}), ...(input.sensitiveMaterialDetected ? {sensitiveMaterialDetected: true} : {})}; }
function containsSecretMaterial(value: unknown, key = ''): boolean {
  if (typeof value === 'string') {
    if (/(?:sk-(?:proj-)?[A-Za-z0-9_-]{12,}|bearer\s+[A-Za-z0-9._-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i.test(value)) return true;
    if (/(?:password|access.?token|refresh.?token|api.?key)\s*[:=]\s*\S+/i.test(value)) return true;
    return sensitiveKey(key) && value.trim().length > 0;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return sensitiveKey(key);
  if (Array.isArray(value)) return value.some(item => containsSecretMaterial(item, key));
  return Boolean(value && typeof value === 'object' && Object.entries(value).some(([name, item]) => containsSecretMaterial(item, name)));
}
function sensitiveKey(key: string) { return /(?:password|access.?token|refresh.?token|api.?key|client.?secret|private.?key)$/i.test(key) && !/(?:ref(?:erence)?|env|store|id)$/i.test(key); }
function insideApprovedScopes(values: string[], approved: string[]) {
  if (!approved.length) return true;
  return values.every(value => approved.some(root => scopeContains(root, value)));
}
function scopeContains(root: string, candidate: string) {
  const windowsSyntax = /^[a-z]:[\\/]|^\\\\/i.test(root) || /^[a-z]:[\\/]|^\\\\/i.test(candidate);
  if (windowsSyntax !== (process.platform === 'win32')) return false;
  if (!path.isAbsolute(root) || !path.isAbsolute(candidate)) return false;
  try {
    const canonicalRoot = fs.realpathSync.native(root), canonicalCandidate = canonicalizeProspectivePath(candidate);
    const normalizedRoot = process.platform === 'win32' ? canonicalRoot.toLowerCase() : canonicalRoot;
    const normalizedCandidate = process.platform === 'win32' ? canonicalCandidate.toLowerCase() : canonicalCandidate;
    const relative = path.relative(normalizedRoot, normalizedCandidate);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  } catch { return false; }
}
function canonicalizeProspectivePath(value: string) {
  let cursor = path.resolve(value); const suffix: string[] = [];
  while (!fs.existsSync(cursor)) { const parent = path.dirname(cursor); if (parent === cursor) throw new Error('scope_path_has_no_existing_parent'); suffix.unshift(path.basename(cursor)); cursor = parent; }
  return path.resolve(fs.realpathSync.native(cursor), ...suffix);
}
function flatten(value: unknown, prefix = ''): Array<{key: string; value: unknown}> { if (!value || typeof value !== 'object' || Array.isArray(value)) return [{key: prefix, value}]; return Object.entries(value).flatMap(([key, item]) => flatten(item, prefix ? `${prefix}.${key}` : key)); }
function safeList(values: string[]) { return [...new Set(values.map(value => safeText(value, 2_048)).filter(Boolean))]; }
function safeText(value: string, maximum: number) { const safe = redactSensitiveText(String(value)).replace(/[\r\n]+/g, ' ').trim(); return safe.length <= maximum ? safe : `${safe.slice(0, maximum - 3)}...`; }
function safeIdentifier(value: string) { const safe = safeText(value, 256); if (!/^[a-z0-9][a-z0-9:._/@-]*$/i.test(safe)) return `sha256:${sha(safe)}`; return safe; }
function sha(value: unknown) { return createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex'); }
function stableJson(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`; if (value && typeof value === 'object') return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`; return JSON.stringify(value); }
