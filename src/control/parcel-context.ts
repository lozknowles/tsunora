import {createHash, randomUUID} from 'node:crypto';
import {redactSensitiveText} from './context-readers.js';

export type ParcelContextEventType =
  | 'goal.recorded'
  | 'plan.recorded'
  | 'stage.started'
  | 'stage.completed'
  | 'stage.failed'
  | 'route.selected'
  | 'baton.created'
  | 'question.created'
  | 'question.answered'
  | 'question.withdrawn'
  | 'steering.accepted'
  | 'steering.superseded'
  | 'criterion.added'
  | 'criterion.evaluated'
  | 'retrieval.performed'
  | 'tool.result'
  | 'test.result'
  | 'verification.result'
  | 'approval.recorded'
  | 'provider.error'
  | 'node.failure'
  | 'usage.observed'
  | 'recovery.recorded';

export type SuccessCriterionKind =
  | 'STAGE_VERIFIED'
  | 'TESTS_PASS'
  | 'EXPECTED_RESULT'
  | 'ARTIFACT_EXISTS'
  | 'REPOSITORY_CLEAN'
  | 'DEPLOYMENT_HEALTHY'
  | 'EVIDENCE_CAPTURED'
  | 'REVIEWER_PASS'
  | 'USER_APPROVAL'
  | 'CUSTOM';
export type SuccessCriterionSource = 'INFERRED' | 'USER' | 'POLICY' | 'REVIEWER';
export type SuccessCriterionStatus = 'PENDING' | 'PASS' | 'FAIL';

export interface ParcelSuccessCriterion {
  id: string;
  kind: SuccessCriterionKind;
  description: string;
  source: SuccessCriterionSource;
  sourceActor: string;
  stageId?: string;
  requiredEvidence: string[];
  status: SuccessCriterionStatus;
  evidence: string[];
  createdAt: string;
  evaluatedAt?: string;
  detail?: string;
}

export interface ParcelQuestion {
  id: string;
  text: string;
  originatingStageId?: string;
  dependentStageIds: string[];
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  consequence: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'OPEN' | 'ANSWERED' | 'WITHDRAWN';
  createdAt: string;
  createdBy: string;
  answer?: string;
  answeredAt?: string;
  answeredBy?: string;
}

export interface ParcelSteeringAmendment {
  id: string;
  instruction: string;
  constraints: string[];
  affectedStageIds: string[];
  status: 'ACCEPTED' | 'SUPERSEDED' | 'REJECTED';
  actor: string;
  createdAt: string;
  supersededAt?: string;
  supersededBy?: string;
}

export interface ParcelActiveState {
  originalGoal: string;
  currentInterpretation: string;
  effectiveInstructions: string[];
  constraints: string[];
  plan: Array<{id: string; name: string; dependencies: string[]; state: string}>;
  currentStageIds: string[];
  unresolvedQuestionIds: string[];
  approvalIds: string[];
  currentRoute?: string;
  currentModel?: string;
  currentNode?: string;
  currentLane?: string;
  updatedAt: string;
}

export interface ParcelContextEvent {
  id: string;
  sequence: number;
  at: string;
  type: ParcelContextEventType;
  stageId?: string;
  summary: string;
  detail: Record<string, unknown>;
  tags: string[];
  evidence: string[];
  previousHash: string | null;
  sha256: string;
}

export interface ParcelBatonView {
  schema: 'agent-control.work-parcel-baton/v2';
  id: string;
  createdAt: string;
  sourceStageIds: string[];
  targetStageId?: string;
  objective: string;
  currentInterpretation: string;
  effectiveInstructions: string[];
  constraints: string[];
  successCriteria: Array<{id: string; description: string; status: SuccessCriterionStatus}>;
  completedStages: Array<{id: string; name: string; state: string}>;
  nextAction: string;
  artifactIds: string[];
  outputTypes: string[];
  eventRefs: Array<{id: string; sequence: number; type: ParcelContextEventType; summary: string; sha256: string}>;
  unresolvedQuestions: Array<{id: string; text: string; consequence: ParcelQuestion['consequence']}>;
  approvals: string[];
  previousBatonIds: string[];
  sizeBytes: number;
  estimatedTokens: number;
  sha256: string;
}

export interface ParcelContextMetrics {
  eventLedgerBytes: number;
  latestBatonBytes: number;
  latestBatonEstimatedTokens: number;
  historicalBytesExcludedFromLatestBaton: number;
  estimatedHistoricalTokensExcluded: number;
  retrievals: number;
  retrievedEvents: number;
}

export interface ParcelContextState {
  schema: 'agent-control.parcel-context/v1';
  active: ParcelActiveState;
  events: ParcelContextEvent[];
  questions: ParcelQuestion[];
  amendments: ParcelSteeringAmendment[];
  criteria: ParcelSuccessCriterion[];
  batonViews: ParcelBatonView[];
  metrics: ParcelContextMetrics;
}

export interface ParcelPlanShape {id: string; name: string; dependsOn?: string[]; status?: string}

export function createParcelContext(input: {
  goal: string;
  actor: string;
  plan?: ParcelPlanShape[];
  constraints?: string[];
  criteria?: Array<Omit<ParcelSuccessCriterion, 'id' | 'createdAt' | 'status' | 'evidence'> & {id?: string}>;
  at?: string;
}): ParcelContextState {
  const at = input.at ?? new Date().toISOString();
  const state: ParcelContextState = {
    schema: 'agent-control.parcel-context/v1',
    active: {
      originalGoal: bounded(input.goal, 16_384),
      currentInterpretation: bounded(input.goal, 16_384),
      effectiveInstructions: [],
      constraints: uniqueSafe(input.constraints ?? []),
      plan: (input.plan ?? []).map(stage => ({id: stage.id, name: bounded(stage.name, 512), dependencies: [...(stage.dependsOn ?? [])], state: stage.status ?? 'QUEUED'})),
      currentStageIds: [], unresolvedQuestionIds: [], approvalIds: [], updatedAt: at,
    },
    events: [], questions: [], amendments: [], criteria: [], batonViews: [],
    metrics: {eventLedgerBytes: 0, latestBatonBytes: 0, latestBatonEstimatedTokens: 0, historicalBytesExcludedFromLatestBaton: 0, estimatedHistoricalTokensExcluded: 0, retrievals: 0, retrievedEvents: 0},
  };
  appendParcelContextEvent(state, {at, type: 'goal.recorded', summary: 'Original goal recorded', detail: {actor: safeIdentifier(input.actor)}, tags: ['goal'], evidence: []});
  if (input.plan?.length) appendParcelContextEvent(state, {at, type: 'plan.recorded', summary: `${input.plan.length} governed stage(s) recorded`, detail: {stageIds: input.plan.map(stage => stage.id)}, tags: ['plan'], evidence: []});
  for (const criterion of input.criteria ?? []) addSuccessCriterion(state, {...criterion, at});
  refreshContextMetrics(state);
  return state;
}

export function inferStageCriteria(state: ParcelContextState, stages: ParcelPlanShape[], actor = 'agent-control-policy', at = new Date().toISOString()) {
  for (const stage of stages) {
    const id = `criterion:stage:${stage.id}`;
    if (state.criteria.some(item => item.id === id)) continue;
    addSuccessCriterion(state, {id, kind: 'STAGE_VERIFIED', description: `${stage.name} completes through its declared verification boundary`, source: 'INFERRED', sourceActor: actor, stageId: stage.id, requiredEvidence: [`stage:${stage.id}:verified`], at});
  }
  return state;
}

export function addSuccessCriterion(state: ParcelContextState, input: {
  id?: string; kind: SuccessCriterionKind; description: string; source: SuccessCriterionSource; sourceActor: string; stageId?: string; requiredEvidence?: string[]; at?: string;
}) {
  const at = input.at ?? new Date().toISOString(), id = input.id ?? `criterion-${randomUUID()}`;
  if (!criterionKinds.has(input.kind) || !criterionSources.has(input.source) || !input.description.trim() || !input.sourceActor.trim()) throw new Error('parcel_success_criterion_invalid');
  if (state.criteria.some(item => item.id === id)) throw new Error('parcel_success_criterion_exists');
  const criterion: ParcelSuccessCriterion = {id, kind: input.kind, description: bounded(input.description, 2_048), source: input.source, sourceActor: safeIdentifier(input.sourceActor), ...(input.stageId ? {stageId: input.stageId} : {}), requiredEvidence: uniqueSafe(input.requiredEvidence ?? []), status: 'PENDING', evidence: [], createdAt: at};
  state.criteria.push(criterion);
  appendParcelContextEvent(state, {at, type: 'criterion.added', stageId: input.stageId, summary: criterion.description, detail: {criterionId: id, kind: input.kind, source: input.source, sourceActor: criterion.sourceActor}, tags: ['criterion', input.kind.toLowerCase()], evidence: []});
  return structuredClone(criterion);
}

export function evaluateSuccessCriterion(state: ParcelContextState, id: string, input: {status: Exclude<SuccessCriterionStatus, 'PENDING'>; evidence: string[]; detail?: string; actor: string; at?: string}) {
  const criterion = state.criteria.find(item => item.id === id); if (!criterion) throw new Error('parcel_success_criterion_missing');
  if (!['PASS','FAIL'].includes(input.status) || !input.actor.trim()) throw new Error('parcel_success_criterion_evaluation_invalid');
  const at = input.at ?? new Date().toISOString(); criterion.status = input.status; criterion.evidence = uniqueSafe(input.evidence); criterion.evaluatedAt = at; criterion.detail = input.detail ? bounded(input.detail, 2_048) : undefined;
  appendParcelContextEvent(state, {at, type: 'criterion.evaluated', stageId: criterion.stageId, summary: `${criterion.description}: ${criterion.status}`, detail: {criterionId: criterion.id, status: criterion.status, actor: safeIdentifier(input.actor)}, tags: ['criterion', criterion.status.toLowerCase()], evidence: criterion.evidence});
  return structuredClone(criterion);
}

export function addParcelQuestion(state: ParcelContextState, input: {
  id?: string; text: string; originatingStageId?: string; dependentStageIds: string[]; priority?: ParcelQuestion['priority']; consequence?: ParcelQuestion['consequence']; actor: string; at?: string;
}) {
  const at = input.at ?? new Date().toISOString(), id = input.id ?? `question-${randomUUID()}`;
  if (!input.text.trim() || !input.actor.trim() || input.priority && !['LOW','NORMAL','HIGH','URGENT'].includes(input.priority) || input.consequence && !['LOW','MEDIUM','HIGH'].includes(input.consequence)) throw new Error('parcel_question_invalid');
  if (state.questions.some(item => item.id === id)) throw new Error('parcel_question_exists');
  const question: ParcelQuestion = {id, text: bounded(input.text, 4_096), ...(input.originatingStageId ? {originatingStageId: input.originatingStageId} : {}), dependentStageIds: [...new Set(input.dependentStageIds)], priority: input.priority ?? 'NORMAL', consequence: input.consequence ?? 'MEDIUM', status: 'OPEN', createdAt: at, createdBy: safeIdentifier(input.actor)};
  state.questions.push(question); state.active.unresolvedQuestionIds = [...new Set([...state.active.unresolvedQuestionIds, id])]; state.active.updatedAt = at;
  appendParcelContextEvent(state, {at, type: 'question.created', stageId: input.originatingStageId, summary: question.text, detail: {questionId: id, dependentStageIds: question.dependentStageIds, priority: question.priority, consequence: question.consequence}, tags: ['question', question.priority.toLowerCase()], evidence: []});
  return structuredClone(question);
}

export function answerParcelQuestion(state: ParcelContextState, id: string, answer: string, actor: string, at = new Date().toISOString()) {
  const question = state.questions.find(item => item.id === id); if (!question) throw new Error('parcel_question_missing'); if (question.status !== 'OPEN') throw new Error('parcel_question_not_open');
  if (!answer.trim() || !actor.trim()) throw new Error('parcel_question_answer_invalid');
  question.status = 'ANSWERED'; question.answer = bounded(answer, 8_192); question.answeredAt = at; question.answeredBy = safeIdentifier(actor); state.active.unresolvedQuestionIds = state.active.unresolvedQuestionIds.filter(value => value !== id); state.active.updatedAt = at;
  appendParcelContextEvent(state, {at, type: 'question.answered', stageId: question.originatingStageId, summary: `Question answered: ${question.text}`, detail: {questionId: id, answer: question.answer, actor: question.answeredBy}, tags: ['question', 'answer'], evidence: []});
  return structuredClone(question);
}

export function withdrawParcelQuestion(state: ParcelContextState, id: string, actor: string, at = new Date().toISOString()) {
  const question = state.questions.find(item => item.id === id); if (!question) throw new Error('parcel_question_missing'); if (question.status !== 'OPEN') throw new Error('parcel_question_not_open');
  question.status = 'WITHDRAWN'; state.active.unresolvedQuestionIds = state.active.unresolvedQuestionIds.filter(value => value !== id); state.active.updatedAt = at;
  appendParcelContextEvent(state, {at, type: 'question.withdrawn', stageId: question.originatingStageId, summary: `Question withdrawn: ${question.text}`, detail: {questionId: id, actor: safeIdentifier(actor)}, tags: ['question', 'withdrawn'], evidence: []}); return structuredClone(question);
}

export function addSteeringAmendment(state: ParcelContextState, input: {instruction: string; constraints?: string[]; affectedStageIds?: string[]; actor: string; supersedes?: string[]; at?: string}) {
  const at = input.at ?? new Date().toISOString(), id = `amendment-${randomUUID()}`;
  if (!input.instruction.trim() || !input.actor.trim()) throw new Error('parcel_steering_invalid');
  for (const previousId of input.supersedes ?? []) { const previous = state.amendments.find(item => item.id === previousId); if (!previous || previous.status !== 'ACCEPTED') throw new Error('parcel_steering_superseded_amendment_invalid'); previous.status = 'SUPERSEDED'; previous.supersededAt = at; previous.supersededBy = id; appendParcelContextEvent(state, {at, type: 'steering.superseded', summary: `Amendment ${previous.id} superseded`, detail: {amendmentId: previous.id, supersededBy: id}, tags: ['steering'], evidence: []}); }
  const amendment: ParcelSteeringAmendment = {id, instruction: bounded(input.instruction, 8_192), constraints: uniqueSafe(input.constraints ?? []), affectedStageIds: [...new Set(input.affectedStageIds ?? [])], status: 'ACCEPTED', actor: safeIdentifier(input.actor), createdAt: at};
  state.amendments.push(amendment); state.active.constraints = uniqueSafe([...state.active.constraints, ...amendment.constraints]); state.active.effectiveInstructions = state.amendments.filter(item => item.status === 'ACCEPTED').map(item => item.instruction); state.active.currentInterpretation = deriveCurrentInterpretation(state.active.originalGoal, state.active.effectiveInstructions); state.active.updatedAt = at;
  appendParcelContextEvent(state, {at, type: 'steering.accepted', summary: amendment.instruction, detail: {amendmentId: id, actor: amendment.actor, affectedStageIds: amendment.affectedStageIds, constraints: amendment.constraints}, tags: ['steering'], evidence: []});
  return structuredClone(amendment);
}

export function appendParcelContextEvent(state: ParcelContextState, input: {at?: string; type: ParcelContextEventType; stageId?: string; summary: string; detail?: Record<string, unknown>; tags?: string[]; evidence?: string[]}) {
  verifyParcelContextEventChain(state.events);
  const previousHash = state.events.at(-1)?.sha256 ?? null, eventWithoutHash = {
    id: `context-event-${randomUUID()}`, sequence: state.events.length + 1, at: input.at ?? new Date().toISOString(), type: input.type, ...(input.stageId ? {stageId: input.stageId} : {}), summary: bounded(input.summary, 4_096), detail: sanitizeRecord(input.detail ?? {}), tags: uniqueSafe(input.tags ?? []), evidence: uniqueSafe(input.evidence ?? []), previousHash,
  };
  const event: ParcelContextEvent = {...eventWithoutHash, sha256: digest(eventWithoutHash)}; state.events.push(event); refreshContextMetrics(state); return structuredClone(event);
}

export function verifyParcelContextEventChain(events: ParcelContextEvent[]) {
  let previousHash: string | null = null;
  for (let index = 0; index < events.length; index++) {
    const event = events[index]; if (event.sequence !== index + 1 || event.previousHash !== previousHash) throw new Error('parcel_context_event_chain_invalid');
    const {sha256, ...withoutHash} = event; if (digest(withoutHash) !== sha256) throw new Error('parcel_context_event_hash_invalid'); previousHash = sha256;
  }
  return true;
}

export function retrieveParcelContext(state: ParcelContextState, input: {query: string; limit?: number; types?: ParcelContextEventType[]; stageIds?: string[]; actor?: string; at?: string}) {
  const terms = tokenize(input.query), types = new Set(input.types ?? []), stages = new Set(input.stageIds ?? []), limit = Math.max(1, Math.min(50, input.limit ?? 8));
  const ranked = state.events.filter(event => event.type !== 'retrieval.performed' && (!types.size || types.has(event.type)) && (!stages.size || Boolean(event.stageId && stages.has(event.stageId)))).map(event => {
    const haystack = tokenize(`${event.type} ${event.summary} ${JSON.stringify(event.detail)} ${event.tags.join(' ')}`), overlap = [...terms].filter(term => haystack.has(term)).length;
    const exact = input.query.trim() && `${event.summary} ${JSON.stringify(event.detail)}`.toLowerCase().includes(input.query.trim().toLowerCase()) ? 100 : 0;
    const failure = /fail|error|retry|recovery/.test(event.type) || event.tags.some(tag => /fail|error|retry/.test(tag)) ? 2 : 0;
    return {event, score: exact + overlap * 10 + failure + event.sequence / Math.max(1, state.events.length)};
  }).filter(item => terms.size === 0 || item.score > 0).sort((left, right) => right.score - left.score || right.event.sequence - left.event.sequence).slice(0, limit);
  const results = ranked.map(item => ({...structuredClone(item.event), relevanceScore: item.score}));
  state.metrics.retrievals++; state.metrics.retrievedEvents += results.length;
  appendParcelContextEvent(state, {at: input.at, type: 'retrieval.performed', summary: `Retrieved ${results.length} historical context event(s)`, detail: {query: bounded(input.query, 1_024), resultEventIds: results.map(item => item.id), actor: safeIdentifier(input.actor ?? 'agent-control-retrieval')}, tags: ['retrieval'], evidence: results.map(item => item.sha256)});
  return results;
}

export function createBatonView(state: ParcelContextState, input: {
  sourceStageIds: string[]; targetStageId?: string; nextAction: string; artifactIds?: string[]; outputTypes?: string[]; selectedEventIds?: string[]; maxBytes?: number; at?: string;
}) {
  verifyParcelContextEventChain(state.events);
  const at = input.at ?? new Date().toISOString(), maxBytes = Math.max(2_048, input.maxBytes ?? 32_768), selected = selectBatonEvents(state, input.selectedEventIds ?? [], maxBytes);
  const withoutSizeHash = {
    schema: 'agent-control.work-parcel-baton/v2' as const, id: `parcel-baton-${randomUUID()}`, createdAt: at, sourceStageIds: [...new Set(input.sourceStageIds)], ...(input.targetStageId ? {targetStageId: input.targetStageId} : {}),
    objective: state.active.originalGoal, currentInterpretation: state.active.currentInterpretation, effectiveInstructions: [...state.active.effectiveInstructions], constraints: [...state.active.constraints], successCriteria: state.criteria.map(item => ({id: item.id, description: item.description, status: item.status})), completedStages: state.active.plan.filter(item => item.state === 'SUCCEEDED').map(item => ({id: item.id, name: item.name, state: item.state})), nextAction: bounded(input.nextAction, 4_096), artifactIds: uniqueSafe(input.artifactIds ?? []), outputTypes: uniqueSafe(input.outputTypes ?? []), eventRefs: selected.map(event => ({id: event.id, sequence: event.sequence, type: event.type, summary: event.summary, sha256: event.sha256})), unresolvedQuestions: state.questions.filter(item => item.status === 'OPEN').map(item => ({id: item.id, text: item.text, consequence: item.consequence})), approvals: [...state.active.approvalIds], previousBatonIds: state.batonViews.slice(-4).map(item => item.id),
  };
  let baton = sealBaton(withoutSizeHash);
  if (baton.sizeBytes > maxBytes) {
    const trimmed = {...withoutSizeHash, eventRefs: withoutSizeHash.eventRefs.slice(0, 1), unresolvedQuestions: withoutSizeHash.unresolvedQuestions.map(item => ({...item, text: bounded(item.text, 512)})), effectiveInstructions: withoutSizeHash.effectiveInstructions.map(item => bounded(item, 512)), constraints: withoutSizeHash.constraints.map(item => bounded(item, 256))};
    baton = sealBaton(trimmed);
  }
  if (baton.sizeBytes > maxBytes) throw new Error('parcel_baton_projection_budget_exceeded');
  state.batonViews.push(baton); appendParcelContextEvent(state, {at, type: 'baton.created', stageId: input.targetStageId, summary: `Bounded baton view created for ${input.targetStageId ?? 'next executor'}`, detail: {batonId: baton.id, sha256: baton.sha256, sizeBytes: baton.sizeBytes, estimatedTokens: baton.estimatedTokens, selectedEventIds: baton.eventRefs.map(item => item.id)}, tags: ['baton'], evidence: [baton.sha256]}); refreshContextMetrics(state); return structuredClone(baton);
}

export function updateParcelActiveState(state: ParcelContextState, input: {plan?: ParcelPlanShape[]; currentStageIds?: string[]; route?: string; model?: string; node?: string; lane?: string; approvals?: string[]; at?: string}) {
  const at = input.at ?? new Date().toISOString();
  if (input.plan) state.active.plan = input.plan.map(stage => ({id: stage.id, name: bounded(stage.name, 512), dependencies: [...(stage.dependsOn ?? [])], state: stage.status ?? 'QUEUED'}));
  if (input.currentStageIds) state.active.currentStageIds = [...new Set(input.currentStageIds)]; if (input.route !== undefined) state.active.currentRoute = bounded(input.route, 1_024); if (input.model !== undefined) state.active.currentModel = bounded(input.model, 256); if (input.node !== undefined) state.active.currentNode = bounded(input.node, 256); if (input.lane !== undefined) state.active.currentLane = bounded(input.lane, 256); if (input.approvals) state.active.approvalIds = uniqueSafe(input.approvals); state.active.updatedAt = at; return state;
}

export function allSuccessCriteriaPass(state: ParcelContextState) { return state.criteria.length > 0 && state.criteria.every(item => item.status === 'PASS'); }

export function refreshContextMetrics(state: ParcelContextState) {
  const ledgerBytes = state.events.reduce((sum, event) => sum + Buffer.byteLength(stableJson(event)), 0), latest = state.batonViews.at(-1);
  state.metrics.eventLedgerBytes = ledgerBytes; state.metrics.latestBatonBytes = latest?.sizeBytes ?? 0; state.metrics.latestBatonEstimatedTokens = latest?.estimatedTokens ?? 0; state.metrics.historicalBytesExcludedFromLatestBaton = Math.max(0, ledgerBytes - (latest?.sizeBytes ?? 0)); state.metrics.estimatedHistoricalTokensExcluded = Math.ceil(state.metrics.historicalBytesExcludedFromLatestBaton / 4); return state.metrics;
}

function selectBatonEvents(state: ParcelContextState, explicitIds: string[], maxBytes: number) {
  const explicit = new Set(explicitIds), priority = state.events.filter(event => explicit.has(event.id) || ['stage.failed','verification.result','steering.accepted','question.answered','route.selected','recovery.recorded'].includes(event.type)).sort((left, right) => right.sequence - left.sequence), recent = [...state.events].reverse(); const selected: ParcelContextEvent[] = [], seen = new Set<string>(); let bytes = 0;
  for (const event of [...priority, ...recent]) { if (seen.has(event.id)) continue; const referenceBytes = Buffer.byteLength(event.summary) + 256; if (bytes + referenceBytes > Math.floor(maxBytes / 3)) continue; selected.push(event); seen.add(event.id); bytes += referenceBytes; if (selected.length >= 12) break; }
  return selected.sort((left, right) => left.sequence - right.sequence);
}

const criterionKinds = new Set<SuccessCriterionKind>(['STAGE_VERIFIED','TESTS_PASS','EXPECTED_RESULT','ARTIFACT_EXISTS','REPOSITORY_CLEAN','DEPLOYMENT_HEALTHY','EVIDENCE_CAPTURED','REVIEWER_PASS','USER_APPROVAL','CUSTOM']);
const criterionSources = new Set<SuccessCriterionSource>(['INFERRED','USER','POLICY','REVIEWER']);

function sanitizeRecord(value: Record<string, unknown>) { return sanitize(value) as Record<string, unknown>; }
function sanitize(value: unknown): unknown { if (typeof value === 'string') return bounded(value, 8_192); if (Array.isArray(value)) return value.slice(0, 100).map(sanitize); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !/(?:password|secret|api.?key|access.?token|refresh.?token|oauth|cookie|credential)/i.test(key)).map(([key, item]) => [key, sanitize(item)])); return value; }
function bounded(value: string, maximum: number) { const safe = redactSensitiveText(String(value)).replace(/[\r\n]+/g, ' ').trim(); return safe.length <= maximum ? safe : `${safe.slice(0, Math.max(0, maximum - 3))}...`; }
function uniqueSafe(values: string[]) { return [...new Set(values.map(value => bounded(value, 4_096)).filter(Boolean))]; }
function safeIdentifier(value: string) { return bounded(value, 256).replace(/[^a-z0-9:._/-]/gi, '_'); }
function deriveCurrentInterpretation(goal: string, amendments: string[]) { return amendments.length ? `${bounded(goal, 8_192)} Active amendments: ${amendments.map((item, index) => `${index + 1}) ${bounded(item, 2_048)}`).join(' ')}` : bounded(goal, 16_384); }
function sealBaton(base: Omit<ParcelBatonView, 'sizeBytes' | 'estimatedTokens' | 'sha256'>): ParcelBatonView { let sizeBytes = 0, estimatedTokens = 0, result!: ParcelBatonView; for (let index = 0; index < 6; index++) { const unsigned = {...base, sizeBytes, estimatedTokens}, candidate = {...unsigned, sha256: digest(unsigned)}, measured = Buffer.byteLength(stableJson(candidate)), tokens = Math.ceil(measured / 4); result = candidate; if (measured === sizeBytes && tokens === estimatedTokens) return result; sizeBytes = measured; estimatedTokens = tokens; } const unsigned = {...base, sizeBytes, estimatedTokens}; return {...unsigned, sha256: digest(unsigned)}; }
function tokenize(value: string) { return new Set(value.toLowerCase().match(/[a-z0-9_.:-]{3,}/g) ?? []); }
function digest(value: unknown) { return createHash('sha256').update(stableJson(value)).digest('hex'); }
function stableJson(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`; if (value && typeof value === 'object') return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`; return JSON.stringify(value); }
