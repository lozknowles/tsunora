import {reconcilePoeBatch,poeParcelHandovers} from './poe-progress.js';
import type {PoeKnowledgeService} from './poe-knowledge.js';
import type {PoeRegistrySource} from './poe-registry-source.js';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {PoeConversation, PoeEvidenceResult, PoeGroundedFact, PoeObjectReference} from './poe.js';
import type {JobRuntime} from './job-runtime.js';
import type {WorkParcelCoordinator} from './work-parcels.js';
import {effectiveParameters} from './job-catalog.js';
import {governedRequestOrigin} from './request-origin.js';
import {assertNoSensitiveMaterial} from './security-redaction.js';

export type InformationKind = 'LIVE_OBSERVED' | 'CONFIGURED_CAPABILITY' | 'DOCUMENTATION' | 'HISTORICAL_EVIDENCE' | 'INFERENCE' | 'UNAVAILABLE';
export interface OperatorRegistration {job: string; purpose: string; owner: string; changes: string; externalMutation: boolean; publication: boolean; permitted: boolean;}
export interface OperatorTopic {id: string; title: string; terms: string[]; text: string; source: string;}
export interface OperatorProposal {modality?:'text'|'voice';voiceReference?:{sessionId:string;delegationId:string};id: string; conversationId: string; actor: string; prompt: string; job: string; parameters: Record<string, unknown>; definitionHash: string; policyHash: string; createdAt: string; expiresAt: string; hash: string; state: 'WAITING_FOR_APPROVAL' | 'SUBMITTED'; operation?: 'START'|'CANCEL'; targetParcelId?:string; parcelId?: string;}
interface OperatorSources {
  systems(): Array<{id: string; name: string}>;
  savedJobs(): unknown[];
  parameterizedSchedules(): unknown[];
  resolve(reference: PoeObjectReference): PoeEvidenceResult;
  overview(): PoeEvidenceResult;
}
interface OperatorOptions {knowledge?:PoeKnowledgeService; registries?: PoeRegistrySource[]; runtime: JobRuntime; parcels: WorkParcelCoordinator; sources: OperatorSources; registrations: OperatorRegistration[]; topics: OperatorTopic[]; file?: string; clock?: () => Date;}
const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const words = (text: string): string[] => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
const operatorIntent = (text: string): string => text.replace(/^\s*mallow\b\s*[,;:\-]?\s*/i, '');
const copy = <T>(value: T): T => structuredClone(value);

/** Query output is data. Only approve() can cross the execution boundary. */
export class PoeOperatorRuntime {
  private proposals = new Map<string, OperatorProposal>();
  private clock: () => Date;
  constructor(private options: OperatorOptions) {
    this.clock = options.clock ?? (() => new Date());
    if (options.file && fs.existsSync(options.file)) {
      const stored = JSON.parse(fs.readFileSync(options.file, 'utf8'));
      if (stored.schema !== 'agent-control.poe-operator/v1') throw new Error('poe_operator_store_invalid');
      this.proposals = new Map(stored.proposals.map((item: OperatorProposal) => [item.id, item]));
    }
  }
  private fact(label: string, value: unknown, source: string, kind: InformationKind = 'LIVE_OBSERVED'): PoeGroundedFact {
    return {label, value: value == null ? null : typeof value === 'object' ? JSON.stringify(value) : String(value), authority: kind === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'AGENT_CONTROL', observedAt: this.clock().toISOString(), evidence: [source], informationKind: kind};
  }
  private result(title: string, summary: string, facts: PoeGroundedFact[], related: PoeObjectReference[] = []): PoeEvidenceResult {return {title, summary, facts, related};}
  private unavailable(title: string, reason: string): PoeEvidenceResult {return {...this.result(title, reason, [this.fact('Limitation', reason, 'poe.operator', 'UNAVAILABLE')]), unavailable: reason};}
  catalogue() {
    return this.options.runtime.jobsProjection().map(job => {
      const id = `${job.metadata.id}@${job.metadata.version}`, policy = this.options.registrations.find(item => item.job === id);
      return {id, name: job.metadata.name, purpose: policy?.purpose ?? job.metadata.description ?? null, owner: policy?.owner ?? null, enabled: job.spec.enabled !== false, inputs: Object.fromEntries(Object.entries(job.spec.parameters ?? {}).filter(([, value]) => !value.secretRef)), requiredCapabilities: [...new Set(job.spec.steps.flatMap(step => step.requires))], requiredResources: [...new Set(job.spec.steps.flatMap(step => step.resources ?? []))], approvals: [...new Set(job.spec.steps.flatMap(step => step.approval ? [step.approval] : []))], outputs: job.spec.steps.flatMap(step => step.outputs ?? []), lastRun: job.latestRun ? {id: job.latestRun.id, status: job.latestRun.status, at: job.latestRun.requestedAt} : null, schedules: job.schedules.map(item => item.metadata.id), registration: policy ?? null, readiness: this.readiness(id), link: `/api/jobs/${encodeURIComponent(job.metadata.id)}`};
    });
  }
  readiness(id: string, supplied: Record<string, unknown> = {}) {
    const runtime = this.options.runtime, job = runtime.catalog.job(id), reasons: string[] = [];
    if (!job) return {ready: false, reasons: ['Job is not registered.'], steps: [], observedAt: this.clock().toISOString()};
    if (job.spec.enabled === false) reasons.push('Job is disabled.');
    try {effectiveParameters(job, supplied);} catch {reasons.push('Required inputs are missing or invalid.');}
    const steps = job.spec.steps.map(step => {
      const placement = runtime.workers.resolve(step.requires, this.clock());
      if (!placement.worker) reasons.push(`${step.id}: no currently eligible worker; ${placement.rationale.rejected.map(item => `${item.workerId}: ${item.reasons.join(', ')}`).join('; ')}`);
      return {id: step.id, action: step.action, worker: placement.worker?.id ?? null, workerObservedAt:placement.worker?.observedAt??null, requires: step.requires, resources: step.resources ?? [], placement: placement.rationale};
    });
    return {ready: reasons.length === 0, reasons, steps, observedAt: this.clock().toISOString()};
  }
  schedules() {
    return this.options.runtime.catalog.listSchedules().map(schedule => ({...schedule, state: this.options.runtime.ledger.schedule(schedule.metadata.id) ?? null}));
  }
  async projection(actor: string, conversationId: string, approvedBenchmarkParcelIds: readonly string[] = []) {
    const read = (fn: () => unknown[]) => {try {return {available: true, records: fn()};} catch {return {available: false, records: []};}};
    const registries=await Promise.all((this.options.registries??[]).map(source=>source.refresh()));
    // Additional IDs come only from PoeRuntime's approved, conversation-owned proposals.
    const parcelIds=[...this.proposals.values()].filter(p=>p.actor===actor&&p.conversationId===conversationId&&p.operation!=='CANCEL'&&p.state==='SUBMITTED'&&p.parcelId).map(p=>p.parcelId!);
    const owned=[...new Set([...parcelIds,...approvedBenchmarkParcelIds])].map(id=>this.options.parcels.get(id));
    return {batch:reconcilePoeBatch(owned),handovers:owned.flatMap(poeParcelHandovers),registries, jobs: this.catalogue(), schedules: this.schedules(), savedJobs: read(() => this.options.sources.savedJobs()), savedSchedules: read(() => this.options.sources.parameterizedSchedules()), proposals: [...this.proposals.values()].filter(item => item.actor === actor && item.conversationId === conversationId).map(item=>({...copy(item),execution:item.parcelId?this.options.sources.resolve({kind:'parcel',id:item.parcelId}):null,executionStatus:item.parcelId?this.options.parcels.get(item.parcelId).status:null})), observedAt: this.clock().toISOString()};
  }
  private matches(text: string) {
    const catalogue = this.catalogue();
    const exact = catalogue.filter(item => text.toLowerCase().includes(item.id.toLowerCase()) || text.toLowerCase().includes(item.name.toLowerCase()));
    if (exact.length) return exact;
    const tokens = new Set(words(text).filter(word => !['the','job','jobs','start','run','please','what','does','do','how','is','it','events','collection'].includes(word)));
    const scored = catalogue.map(item => ({item, score: words(`${item.id} ${item.name}`).filter(word => tokens.has(word)).length})).filter(item => item.score > 0);
    const best = Math.max(0, ...scored.map(item => item.score));
    return scored.filter(item => item.score === best).map(item => item.item);
  }
  knowledgeProjection(){return this.options.knowledge?.projection()??null;}
  knowledgeSource(id:string){if(!this.options.knowledge)throw new Error('poe_knowledge_source_missing');return this.options.knowledge.source(id);}
  async query(text:string,conversation:PoeConversation,reference?:PoeObjectReference):Promise<PoeEvidenceResult|undefined>{
    const result=await this.queryRegistry(text,conversation,reference);
    return result?.title==='Review job proposal'||result?.unavailable?result:this.options.knowledge?.enrich(text,result)??result;
  }
  private async queryRegistry(text: string, conversation: PoeConversation, reference?: PoeObjectReference): Promise<PoeEvidenceResult | undefined> {
    assertNoSensitiveMaterial(text, 'poe_credential_material_forbidden');
    const intent = operatorIntent(text);
    const registries=await Promise.all((this.options.registries??[]).map(source=>source.refresh()));
    const remoteJobs=registries.flatMap(source=>source.jobs.map(job=>({source,job})));
    const remoteMatch=remoteJobs.filter(({job})=>words(intent).filter(word=>!['the','what','does','job','events','daily','start','run'].includes(word)).some(word=>words(`${job.metadata.id} ${job.metadata.name}`).includes(word)));
    if(/\blane master\b/i.test(text)&&!/\b(?:cancel|start|run|publish)\b/i.test(text))return this.options.sources.resolve({kind:'crew-member',id:'lane-master'});
    if(reference&&(/\b(?:this|it|that|found|result)\b/i.test(text)||text.includes(reference.id))&&!/\b(?:start|run|launch|cancel|pause|resume|publish|stage|delete|deploy|enable|disable|list|show.*jobs)\b/i.test(text))return this.options.sources.resolve(reference);
    const control = /\b(?:start|launch|execute|cancel|pause|resume|publish|stage|delete|deploy|enable|disable)\b/i.test(intent) || /^\s*(?:please\s+)?run\b/i.test(intent);
    if (control) {
      if(/^\s*(?:please\s+)?cancel\b/i.test(intent))return this.proposeCancellation(text,conversation,reference);
      if (!/^\s*(?:please\s+)?(?:start|run|launch)\b/i.test(intent) || /\b(?:publish|stage|delete|deploy|cancel|pause|resume|enable|disable)\b/i.test(intent)) return this.unavailable('Operation requires its governed control', 'Mallow has not executed anything. Use the relevant native runtime control; this conversational operation is not enabled. Schedule changes and publication have separate approval boundaries.');
      if (conversation.channel !== 'dashboard') return this.unavailable('Dashboard approval required', 'This channel can inspect jobs. Open the authenticated dashboard to review and approve a job proposal.');
      if(remoteMatch.length)return this.unavailable('Remote registered job',`${remoteMatch.map(item=>`${item.job.metadata.name} (${item.job.metadata.id})`).join('; ')}. ${remoteMatch[0]!.source.limitation}`);
      const matches = this.matches(intent);
      if (matches.length !== 1) return this.unavailable('Clarify the job', matches.length ? `Which registered job did you mean: ${matches.map(item => `${item.name} (${item.id})`).join('; ')}?` : 'No registered job matches that request. Ask for the job catalogue and use its exact identifier.');
      if(/\b(?:with|using|input|parameter|instead)\b/i.test(text))return this.unavailable('Review job inputs','This conversational adapter currently supports registered defaults only. Use the native typed input form for different inputs; no alternative values have been assumed.');
      return this.propose(matches[0]!.id, text, conversation);
    }
    if (/\b(?:schedules?|scheduled)\b/i.test(text)) {
      const rows = this.schedules(), facts = [this.fact('Registered manifest schedules', rows.length, 'job-catalog:schedules')];
      for (const row of rows) facts.push(this.fact(row.metadata.name, row, `schedule:${row.metadata.id}`, 'CONFIGURED_CAPABILITY'));
      try {const saved = this.options.sources.parameterizedSchedules(); facts.push(this.fact('Registered saved schedules', saved.length, 'saved-job-store:schedules')); for (const row of saved) facts.push(this.fact('Saved schedule', row, 'saved-job-store:schedules', 'CONFIGURED_CAPABILITY'));} catch {facts.push(this.fact('Saved schedules', null, 'saved-job-store:schedules', 'UNAVAILABLE'));}
      for(const source of registries){facts.push(this.fact(`${source.name}: schedules`,source.state==='OBSERVED'?source.schedules.length:null,`${source.source}/api/schedules`,source.state==='OBSERVED'?'LIVE_OBSERVED':'UNAVAILABLE'));for(const schedule of source.schedules)facts.push(this.fact(schedule.metadata.name,schedule,`${source.source}/api/schedules`, 'LIVE_OBSERVED'));}
      return this.result('Registered schedules', 'Only registered schedules are shown. A missing execution cursor or next run is unavailable, not a successful or scheduled run.', facts);
    }
    if (/\b(?:systems?|machines?|pixel|overlay|network|termux|readiness)\b/i.test(text) && !/facebook|\bjobs?\b|how.*works|purpose|\bexplain\s+(?:how\s+)?(?:the\s+)?system\b/i.test(text)) {
      const rows = this.options.sources.systems().filter(item => !/pixel/i.test(text) || /pixel/i.test(`${item.id} ${item.name}`));
      if (!rows.length) return this.unavailable('System readiness unavailable', 'No matching authoritative system observation is available. Reachability alone cannot establish browser or Facebook login readiness.');
      return this.result('Systems and readiness', 'These are the current readiness projections. Configured capability and observed authentication remain separate.', rows.map(item => this.fact(item.name, item, `system:${item.id}`)), rows.map(item => ({kind: 'system', id: item.id})));
    }
    if (/\b(?:jobs|catalogue|catalog)\b/i.test(text) && /\b(?:list|show|which|available|can|catalogue|catalog)\b/i.test(text) && !/\b(?:running|waiting|blocked|approval)\b/i.test(text)) {
      const rows = this.catalogue();
      const facts = [this.fact('Registered executable jobs', rows.length, 'job-catalog:jobs')];
      for (const row of rows) facts.push(this.fact(row.name, row, `job:${row.id}`, 'CONFIGURED_CAPABILITY'));
      try {const saved = this.options.sources.savedJobs(); facts.push(this.fact('Saved jobs', saved.length, 'saved-job-store')); for (const row of saved) facts.push(this.fact('Saved job', row, 'saved-job-store', 'CONFIGURED_CAPABILITY'));} catch {facts.push(this.fact('Saved jobs', null, 'saved-job-store', 'UNAVAILABLE'));}
      for(const source of registries){facts.push(this.fact(`${source.name}: jobs`,source.state==='OBSERVED'?source.jobs.length:null,`${source.source}/api/jobs`,source.state==='OBSERVED'?'LIVE_OBSERVED':'UNAVAILABLE'));for(const job of source.jobs)facts.push(this.fact(job.metadata.name,{...job,limitation:source.limitation},`${source.source}/api/jobs`));}
      return this.result('Registered job catalogue', 'Every entry comes from a runtime registry; optimism is not a registration method. Mallow can propose execution only when an explicit operator registration defines its effects; other jobs retain their native controls.', facts, rows.map(item => ({kind: 'job', id: item.id.split('@')[0]!})));
    }
    if (/facebook|\bjob\b/i.test(text) && !/\b(?:running|waiting|blocked)\b/i.test(text)) {
      if(remoteMatch.length)return this.result('Remote registered workflow','These definitions and last-run records were observed from the configured remote registry. Pixel transport, Termux, browser/session and Facebook login are separate checks and are unavailable from this registry. Collection, review, staging and publication remain distinct; no publication has been performed.',remoteMatch.map(({source,job})=>this.fact(job.metadata.name,{...job,limitation:source.limitation},`${source.source}/api/jobs`)));
      const matches = reference?.kind === 'job' ? this.catalogue().filter(item => item.id === reference.id || item.id.split('@')[0] === reference.id) : this.matches(text);
      if (matches.length !== 1) return this.unavailable('Job resolution', matches.length ? `Please name one exact job: ${matches.map(item => item.id).join(', ')}.` : 'No matching executable job is registered in this runtime. Repository scripts and example manifests are not evidence of a live Facebook collection workflow.');
      const row = matches[0]!;
      return {...this.result(row.name, 'Collection, staging and publication require distinct governed actions. Missing device, session, source-authorisation or publication evidence remains unavailable.', [this.fact('Registered definition', row, `job:${row.id}`, 'CONFIGURED_CAPABILITY'), this.fact('Live preflight', row.readiness, `workers:preflight:${row.id}`)], [{kind: 'job', id: row.id.split('@')[0]!}]), reference: {kind: 'job', id: row.id.split('@')[0]!}};
    }
    if (/\b(?:how|what|who|which|explain|purpose)\b/i.test(text)) {
      const selected = this.options.topics.filter(topic => topic.terms.some(term => text.toLowerCase().includes(term)));
      if (selected.length) return this.result('How Agent Control works', 'The following is versioned documentation, not a claim that those capabilities are ready on a particular machine.', selected.map(topic => this.fact(topic.title, topic.text, topic.source, 'DOCUMENTATION')));
    }
    if (/\b(?:running|waiting|blocked|approvals?)\b/i.test(text)) {
      const rows = this.options.runtime.ledger.list().filter(run => /RUNNING|QUEUED|WAITING|BLOCKED|VERIFYING/.test(run.status) || run.steps.some(step => step.status === 'WAITING_FOR_APPROVAL'));
      return this.result('Current work', rows.length ? 'The ledger owns these states. Approval is not inferred from conversation.' : 'No matching active runs appear in this Job ledger. A rare interval of administrative peace.', rows.map(row => this.fact(row.id, {status: row.status, job: row.jobId, steps: row.steps.map(step => ({id: step.id, status: step.status, reason: step.waitingReason, approval: step.approval}))}, `run:${row.id}`)), rows.map(row => ({kind: 'run', id: row.id})));
    }
    return undefined;
  }
  private propose(id: string, prompt: string, conversation: PoeConversation) {
    const job = this.options.runtime.catalog.job(id)!, policy = this.options.registrations.find(item => item.job === id);
    if (!policy?.permitted) return this.unavailable('Operator registration required', 'The job exists, but its conversational execution effects have not been explicitly registered. Use its native governed control.');
    const preflight = this.readiness(id);
    if (!preflight.ready) return this.unavailable('Job blocked', preflight.reasons.join('\n'));
    const definitionHash = digest(job), policyHash = digest(policy), parameters = effectiveParameters(job);
    const key = digest({conversationId: conversation.id, actor: conversation.actorId, prompt, job: id, parameters, definitionHash, policyHash});
    let proposal = this.proposals.get(key);
    if (!proposal || proposal.state !== 'SUBMITTED' && Date.parse(proposal.expiresAt) <= this.clock().getTime()) {
      const source=conversation.turns.at(-1);
      const sealed = {modality:source?.modality??'text',...(source?.voiceReference?{voiceReference:source.voiceReference}:{}),id: key, conversationId: conversation.id, actor: conversation.actorId, prompt, job: id, parameters, definitionHash, policyHash, createdAt: this.clock().toISOString(), expiresAt: new Date(this.clock().getTime() + 10 * 60_000).toISOString()};
      proposal = {...sealed, hash: digest(sealed), state: 'WAITING_FOR_APPROVAL'};
      this.proposals.set(key, proposal); this.save();
    }
    return this.result('Review job proposal', proposal.state === 'SUBMITTED' ? `This request already created ${proposal.parcelId}.` : 'Nothing has started. Review the job, inputs, worker and effects below. Approve the sealed proposal to start. It expires after ten minutes.', [this.fact('Proposal', proposal, `poe-operation:${proposal.id}`), this.fact('Effects', policy, `operator-registration:${id}`, 'CONFIGURED_CAPABILITY'), this.fact('Live preflight', preflight, `workers:preflight:${id}`)], proposal.parcelId ? [{kind: 'parcel', id: proposal.parcelId}] : []);
  }
  private proposeCancellation(prompt:string,conversation:PoeConversation,reference?:PoeObjectReference) {
    if(conversation.channel!=='dashboard')return this.unavailable('Dashboard approval required','Use the authenticated dashboard to review cancellation.');
    const owned=[...this.proposals.values()].filter(item=>item.actor===conversation.actorId&&item.conversationId===conversation.id&&item.state==='SUBMITTED'&&item.operation!=='CANCEL'&&item.parcelId);
    const explicit=owned.filter(item=>prompt.includes(item.parcelId!));
    const candidates=explicit.length?explicit:reference?.kind==='parcel'?owned.filter(item=>item.parcelId===reference.id):owned;
    if(candidates.length!==1)return this.unavailable('Clarify cancellation','Name one Work Parcel started in this conversation. No cancellation has been requested.');
    const target=candidates[0]!,parcel=this.options.parcels.get(target.parcelId!);
    if(['SUCCEEDED','FAILED','CANCELLED'].includes(parcel.status))return this.unavailable('Work is already terminal',`The Work Parcel is ${parcel.status}. Nothing has been cancelled.`);
    const id=digest({conversationId:conversation.id,prompt,targetParcelId:parcel.id,operation:'CANCEL'});
    let proposal=this.proposals.get(id);
    if(!proposal){const sealed={id,conversationId:conversation.id,actor:conversation.actorId,prompt,job:target.job,parameters:{},definitionHash:target.definitionHash,policyHash:target.policyHash,createdAt:this.clock().toISOString(),expiresAt:new Date(this.clock().getTime()+600000).toISOString(),operation:'CANCEL' as const,targetParcelId:parcel.id};proposal={...sealed,hash:digest(sealed),state:'WAITING_FOR_APPROVAL'};this.proposals.set(id,proposal);this.save();}
    return this.result('Review job proposal','Cancellation stops the selected Work Parcel through its real runtime. Partial external effects, if any, are not undone. Review and explicitly approve this cancellation.',[this.fact('Cancellation proposal',proposal,`poe-operation:${id}`)]);
  }
  approve(id: string, hash: string, conversation: PoeConversation) {
    const proposal = this.proposals.get(id);
    if (!proposal || proposal.actor !== conversation.actorId || proposal.conversationId !== conversation.id || conversation.channel !== 'dashboard') throw new Error('poe_operation_ownership_denied');
    if (hash !== proposal.hash) throw new Error('poe_operation_approval_stale');
    if (proposal.state === 'SUBMITTED') return copy(proposal);
    if(proposal.operation==='CANCEL'){
      if(Date.parse(proposal.expiresAt)<=this.clock().getTime())throw new Error('poe_operation_approval_stale');
      const target=this.options.parcels.get(proposal.targetParcelId!);if(target.actor!==conversation.actorId)throw new Error('poe_operation_ownership_denied');
      const result=this.options.parcels.cancel(target.id,conversation.actorId);proposal.parcelId=result.id;proposal.state='SUBMITTED';this.save();return copy(proposal);
    }
    const job = this.options.runtime.catalog.job(proposal.job), policy = this.options.registrations.find(item => item.job === proposal.job);
    if (!job || !policy?.permitted || digest(job) !== proposal.definitionHash || digest(policy) !== proposal.policyHash || Date.parse(proposal.expiresAt) <= this.clock().getTime()) throw new Error('poe_operation_approval_stale');
    if (!this.readiness(proposal.job, proposal.parameters).ready) throw new Error('poe_operation_readiness_blocked');
    const origin = governedRequestOrigin({channel: 'mallow/dashboard', modality: proposal.modality==='voice'?'voice-confirmed-by-text':'dashboard', ...(proposal.modality==='voice'?{confirmationReference:hash,transcriptionAuthority:'untrusted-confirmed-by-text' as const}:{}),receivedAt: proposal.createdAt, authentication: 'dashboard-bearer', actorId: proposal.actor, authority: [`conversation:${conversation.id}`, `operation:${id}`, `approved-sha256:${hash}`,...(proposal.voiceReference?[`voice-session:${proposal.voiceReference.sessionId}`,`voice-delegation:${digest(proposal.voiceReference.delegationId)}`]:[])], messageReference: id, identityReference: digest(proposal.actor), request: proposal.prompt});
    const parcel = this.options.parcels.submitApprovedPlan(proposal.prompt, proposal.actor, id, {objective: proposal.prompt, constraints: ['Use only the sealed registered job and inputs.', 'No silent provider or execution-route substitution.'], planner: {kind: 'deterministic', reason: 'Explicit dashboard approval of a sealed registered-job proposal after fresh worker capability checks.'}, stages: [{id: 'execute', name: job.metadata.name, job: proposal.job, parameters: proposal.parameters}], successCriteria: [{id: 'verified', kind: 'STAGE_VERIFIED', description: 'The registered stage passes its required verification.', source: 'USER', stageId: 'execute', requiredEvidence: ['stage:execute:verified']}]}, origin);
    proposal.state = 'SUBMITTED'; proposal.parcelId = parcel.id; this.save(); return copy(proposal);
  }
  private save() {
    if (!this.options.file) return;
    const text = JSON.stringify({schema: 'agent-control.poe-operator/v1', proposals: [...this.proposals.values()]}, null, 2);
    assertNoSensitiveMaterial(text, 'poe_credential_material_forbidden');
    fs.mkdirSync(path.dirname(this.options.file), {recursive: true, mode: 0o700});
    fs.writeFileSync(`${this.options.file}.tmp`, text, {mode: 0o600}); fs.renameSync(`${this.options.file}.tmp`, this.options.file);
  }
}
