import {guardResponse} from './conversation-grounding.js';
import {observeBounded} from './response-grounding.js';
import {conversationGreeting} from './conversation-greeting.js';
import type {SharedSpeechAdapter} from './shared-speech-adapter.js';
import {isLocalBenchmarkObjective} from './local-llm-benchmark.js';
import type {draftLocalBenchmarkObjective} from './local-llm-benchmark-planner.js';
import {HOST_IDENTITY, hostGreeting} from './host-identity.js';
import type {PoeOperatorRuntime, InformationKind} from './poe-operator.js';
import {prepareSpokenText, speechContentCoverage} from './speech-text.js';
import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {assertNoSensitiveMaterial, redactSensitiveValue} from './security-redaction.js';
import type {WorkParcelPlan, WorkParcelPlanStage} from './work-parcels.js';
import type {SpeechProvider, SpeechRecognitionProvider, VoiceIdentity} from './social-voice-providers.js';
import {validateAudio, validateVoice} from './social-voice-providers.js';

export type PoeState = 'HANDOFF' | 'SCHEDULING' | 'BLOCKED' | 'FAILED' | 'INTERRUPTED' | 'WORKING' | 'SUCCEEDED' | 'IDLE' | 'LISTENING' | 'INVESTIGATING' | 'THINKING' | 'EXPLAINING' | 'OBSERVING_CREW' | 'DESIGNING_EXPERIMENT' | 'WAITING_FOR_APPROVAL' | 'SPEAKING';
export type PoeChannel = 'dashboard' | 'whatsapp' | 'voice' | 'mobile';
export type PoeAuthority = 'AGENT_CONTROL' | 'OPERATOR' | 'PROVIDER_REPORTED' | 'ESTIMATED' | 'UNAVAILABLE';
export type PoeObjectKind = 'workspace' | 'node-dashboard' | 'run-inspector' | 'system' | 'schedule' | 'model' | 'league-row' | 'workflow' | 'job' | 'run' | 'parcel' | 'runtime-map' | 'crew-member' | 'lane' | 'routing-decision' | 'governor-decision' | 'capability-manifest' | 'baton' | 'execution-session' | 'verification' | 'benchmark' | 'human-evaluation';

export interface PoeObjectReference {kind: PoeObjectKind; id: string; label?: string;}
export interface PoeGroundedFact {informationKind?: InformationKind; label: string; value: string | number | boolean | null; authority: PoeAuthority; observedAt?: string | null; evidence: string[]; limitation?: string;}
export interface PoeEvidenceResult {reference?: PoeObjectReference; title: string; summary: string; facts: PoeGroundedFact[]; related: PoeObjectReference[]; unavailable?: string;}
export interface PoeEvidencePort {
  overview(): PoeEvidenceResult;
  resolve(reference: PoeObjectReference): PoeEvidenceResult;
}
export interface PoeSessionVaultPort {search(query:string,limit?:number):Array<{sessionId:string;providerId:string;nodeId:string;completeness:string;score:number;matches:Array<{eventId:string;kind:string;at:string;summary:string;authority:string}>;sourceObjectSha256:string}>;}

export type PoeResponsePurpose = 'STATUS_LOOKUP' | 'EVIDENCE_EXPLANATION' | 'EXPERIMENT_DESIGN';
export interface PoeResponseModelPort {
  describe?(): {state:string;route?:PoeRouteIdentity;reason?:string};
  respond(input: {purpose: PoeResponsePurpose; operatorText: string; evidence: PoeEvidenceResult; channel: PoeChannel; history?:Array<{actor:string;text:string}>}): Promise<{text: string; citations: string[]; route: PoeRouteIdentity; usage: {inputTokens: number | null; outputTokens: number | null; totalTokens: number | null; cost: number | null; currency: string | null; authority: PoeAuthority}}>;
}

export interface PoeRouteIdentity {providerId: string; accountProfileId?: string; modelId: string; providerModel?: string; nodeId: string; label?: string;}
export interface PoeBenchmarkCondition {
  route: PoeRouteIdentity;
  tools: string[];
  contextPolicy: string;
  fixtureSha256: string;
  softwareVersion: string;
  hardwareClass: string;
  quantization: string | null;
  cacheState: 'COLD' | 'WARM' | 'MIXED';
  providerEndpoint: string;
  authority: string;
  timeLimitMs: number;
}
export interface PoeBenchmarkMetric {id: string; label: string; kind: 'OBJECTIVE' | 'HUMAN_EVALUATION'; successCriterion: string; stageId?: string;}
export interface PoeBenchmarkProposalInput {
  decision: string;
  objective: string;
  whyNewEvidenceIsNeeded: string;
  conditions: PoeBenchmarkCondition[];
  stages: WorkParcelPlanStage[];
  metrics: PoeBenchmarkMetric[];
  repetitions: number;
  constraints?: string[];
}
export interface PoeFairnessFinding {field: string; severity: 'BLOCKING' | 'DISCLOSED'; message: string; routes: string[];}
export interface PoeBenchmarkProposal extends PoeBenchmarkProposalInput {
  schema: 'agent-control.poe-benchmark-proposal/v1';
  id: string;
  conversationId: string;
  revision: number;
  state: 'DRAFT' | 'FROZEN' | 'APPROVED' | 'SUBMITTED' | 'CANCELLED';
  fairness: {comparable: boolean; findings: PoeFairnessFinding[]};
  createdAt: string;
  updatedAt: string;
  frozenAt?: string;
  frozenSha256?: string;
  approvedAt?: string;
  approvedBy?: string;
  execution?: {parcelId: string; submittedAt: string; requestKey: string};
}
export interface PoeTurn {cancelled?:boolean;sharedSpeech?:unknown;
  recognitionMetrics?:import('./social-voice-providers.js').SpeechMetrics;
  synthesisMetrics?:import('./social-voice-providers.js').SpeechMetrics;
  voiceReference?:{sessionId:string;delegationId:string};
  purpose?: 'GREETING'|'RESULT'|'HANDOVER';
  speech?: {spokenText:string;voiceId:string;voiceSha256:string;audioSha256:string;generatedAt:string;};
  id: string;
  conversationId: string;
  at: string;
  actor: 'operator' | 'poe';
  channel: PoeChannel;
  modality: 'text' | 'voice';
  text: string;
  authority: PoeAuthority;
  contentTrust: 'OPERATOR_REQUEST' | 'UNTRUSTED_DATA' | 'AGENT_CONTROL_EVIDENCE';
  references: PoeObjectReference[];
  evidence: PoeGroundedFact[];
  route?: PoeRouteIdentity;
  responseMode?: 'DETERMINISTIC' | 'MODEL';
  usage?: {inputTokens: number | null; outputTokens: number | null; totalTokens: number | null; cost: number | null; currency: string | null; authority: PoeAuthority};
  latency?: {speechEndToTranscriptMs: number | null; transcriptToFirstResponseTokenMs: number | null; responseToFirstAudioMs: number | null; totalMs: number | null; authority: PoeAuthority};
}
export interface PoeConversation {
  schema: 'agent-control.poe-conversation/v1'; id: string; actorId: string; channel: PoeChannel; state: PoeState; createdAt: string; updatedAt: string; turns: PoeTurn[]; proposalIds: string[]; completedOperationIds?:string[]; announcedBatchIds?:string[]; announcedHandoverIds?:string[]; lastReference?: PoeObjectReference; speaking?: {turnId: string; startedAt: string; interruptedAt?: string; completedAt?: string};
}
export interface PoeProjection {
  schema: 'agent-control.poe/v1';
  reasoning?:{state:string;route?:PoeRouteIdentity;reason?:string};
  identity: typeof HOST_IDENTITY & {modelSelectable: boolean};
  state: PoeState;
  activeConversationId: string | null;
  conversations: Array<Omit<PoeConversation, 'turns'> & {turnCount: number}>;
  proposals: PoeBenchmarkProposal[];
  voice: {incarnation:string;sharedSpeech?:boolean;configured: boolean; recognition: boolean; synthesis: boolean; streaming: boolean; bargeIn: boolean; identity: string | null; limitation: string | null};
  observedAt: string;
}
export interface PoeBenchmarkExecutionPort {submit(input: {proposal: PoeBenchmarkProposal; actor: string; requestKey: string; plan: WorkParcelPlan}): {parcelId: string};}
export interface PoeEvent {type: 'conversation.changed' | 'proposal.changed' | 'speech.changed' | 'interrupted'; at: string; conversationId: string; proposalId?: string; state: PoeState; detail: Record<string, unknown>;}

interface PoeSnapshot {schema: 'agent-control.poe-store/v1'; conversations: PoeConversation[]; proposals: PoeBenchmarkProposal[]; events: PoeEvent[];}
export interface PoeOptions {conversationTimeZone?:string;sharedSpeech?:SharedSpeechAdapter;localBenchmarkUnavailable?:()=>Promise<string>;modelWatches?:{draft:(objective:string)=>unknown;brief:()=>unknown};localBenchmark?:{draft:(objective:string)=>ReturnType<typeof draftLocalBenchmarkObjective>};regression?:()=>unknown;operator?: PoeOperatorRuntime; file?: string; clock?: () => string; evidence: PoeEvidencePort; sessionVault?:PoeSessionVaultPort; responseModel?: PoeResponseModelPort; benchmark?: PoeBenchmarkExecutionPort; speech?: SpeechProvider; recognition?: SpeechRecognitionProvider; voice?: VoiceIdentity; onEvent?: (event: PoeEvent) => void;}

const MAX_TURNS = 500, MAX_EVENTS = 1_000;
const label = (route: PoeRouteIdentity) => `${route.providerId}/${route.accountProfileId ?? 'default'}/${route.modelId}${route.providerModel?' ['+route.providerModel+']':''}@${route.nodeId}`;
const sha = (value: unknown) => createHash('sha256').update(stable(value)).digest('hex');
const stable = (value: unknown): string => Array.isArray(value) ? `[${value.map(stable).join(',')}]` : value && typeof value === 'object' ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}` : JSON.stringify(value);
const cleanText = (value: unknown, code: string, maximum = 65_536) => {const text = String(value ?? '').trim(); if (!text || text.length > maximum) throw new Error(code); assertNoSensitiveMaterial(text, 'poe_credential_material_forbidden'); return text;};
const clone = <T>(value: T): T => structuredClone(value);

export class PoeRuntime {
  private readonly speechIncarnation=randomUUID();
  private generationEpoch=new Map<string,number>();
  private readonly conversations = new Map<string, PoeConversation>();
  private readonly proposals = new Map<string, PoeBenchmarkProposal>();
  private readonly events: PoeEvent[] = [];
  private readonly clock: () => string;
  private readonly speechControllers = new Map<string, AbortController>();
  constructor(private readonly options: PoeOptions) {
    this.clock = options.clock ?? (() => new Date().toISOString());
    if (options.voice) {validateVoice(options.voice); if (options.voice.kind === 'cloned') throw new Error('poe_voice_must_be_original');}
    this.load();
  }
  createConversation(input: {actorId: string; channel: PoeChannel; id?: string}) {
    const actorId = cleanText(input.actorId, 'poe_actor_invalid', 192), id = input.id ?? `poe-conversation:${randomUUID()}`;
    if (!['dashboard','whatsapp','voice','mobile'].includes(input.channel) || this.conversations.has(id)) throw new Error('poe_conversation_invalid');
    const at = this.clock(), conversation: PoeConversation = {schema:'agent-control.poe-conversation/v1',id,actorId,channel:input.channel,state:'IDLE',createdAt:at,updatedAt:at,turns:[],proposalIds:[]};
    this.conversations.set(id, conversation); this.record(conversation, 'conversation.changed', {action:'created'}); return clone(conversation);
  }
  greeting(id:string,actor:string){
    const conversation=this.mustConversation(id);if(conversation.actorId!==actor||conversation.channel!=='dashboard')throw new Error('poe_conversation_actor_mismatch');
    const existing=conversation.turns.find(turn=>turn.purpose==='GREETING');if(existing)return {turn:clone(existing),conversation:clone(conversation)};
    this.setState(conversation,'LISTENING',{reason:'authenticated operator greeting'});
    const turn=this.addTurn(conversation,{purpose:'GREETING',actor:'poe',channel:'dashboard',modality:'text',text:hostGreeting(Boolean(this.options.operator)),authority:'AGENT_CONTROL',contentTrust:'AGENT_CONTROL_EVIDENCE',references:[],evidence:[]});this.save();return {turn,conversation:clone(conversation)};
  }
  regression(){return this.options.regression?.()??{state:'UNAVAILABLE',reason:'No qualification runner configured.'};}
  knowledge(){return this.options.operator?.knowledgeProjection()??null;}
  knowledgeSource(id:string){if(!this.options.operator)throw new Error('poe_knowledge_source_missing');return this.options.operator.knowledgeSource(id);}
  conversation(id: string) {return clone(this.mustConversation(id));}
  proposal(id: string) {return clone(this.mustProposal(id));}
  projection(): PoeProjection {
    const conversations = [...this.conversations.values()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
    const active = conversations[0] ?? null, voice = this.options.voice;
    return {schema:'agent-control.poe/v1',reasoning:this.options.responseModel?.describe?.()??{state:this.options.responseModel?'CONFIGURED':'UNAVAILABLE',reason:this.options.responseModel?'Route is disclosed on each completed reply.':'No conversational model is configured.'},identity:{...HOST_IDENTITY,modelSelectable:Boolean(this.options.responseModel)},state:active?.state ?? 'IDLE',activeConversationId:active?.id ?? null,conversations:conversations.map(({turns,...item})=>({...clone(item),turnCount:turns.length})),proposals:[...this.proposals.values()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(clone),voice:{incarnation:this.speechIncarnation,sharedSpeech:Boolean(this.options.sharedSpeech),configured:Boolean(voice||this.options.sharedSpeech),recognition:Boolean(this.options.recognition||this.options.sharedSpeech),synthesis:Boolean(this.options.speech||this.options.sharedSpeech),streaming:Boolean(this.options.sharedSpeech)|| (this.options.speech?.capabilities().streaming ?? false),bargeIn:!this.options.sharedSpeech,identity:this.options.sharedSpeech?'mallow':voice?.id ?? null,limitation:this.options.sharedSpeech?'Shared Speech transport configured; readiness checked per request. Push-to-talk and Stop cancel playback. Acoustic barge-in is not available through the qualified SDK.':this.options.speech?.capabilities().streaming ? null : 'Provider exposes complete-audio synthesis; first audio is available only after synthesis completes.'},observedAt:this.clock()};
  }
  async ask(input: {sharedSpeech?:{rawStt:string;requestId:string;clientId?:string;sessionId:string;generationId?:unknown;provider?:unknown;model?:unknown};voiceReference?:{sessionId:string;delegationId:string};conversationId: string; text: string; channel?: PoeChannel; modality?: 'text'|'voice'; reference?: PoeObjectReference; contentTrust?: PoeTurn['contentTrust']}) {
    const conversation = this.mustConversation(input.conversationId); cleanText(input.text, 'poe_turn_invalid'); const text = input.text;
    const epoch=(this.generationEpoch.get(conversation.id)??0)+1;this.generationEpoch.set(conversation.id,epoch);
    const contextualExplanation=Boolean(input.reference??conversation.lastReference)&&/^\s*(?:why\b|explain\b|what happened\b|how did\b)/i.test(text);
    if (input.channel && input.channel !== conversation.channel) throw new Error('poe_channel_provenance_mismatch');
    this.setState(conversation,'LISTENING',{reason:'operator turn accepted'});
    const operatorTurn = this.addTurn(conversation,{...(input.sharedSpeech?{sharedSpeech:input.sharedSpeech}:{}),...(input.voiceReference?{voiceReference:input.voiceReference}:{}),actor:'operator',channel:conversation.channel,modality:input.modality ?? 'text',text,authority:'OPERATOR',contentTrust:input.contentTrust ?? 'OPERATOR_REQUEST',references:input.reference?[input.reference]:[],evidence:[]});
    const control=text.trim().replace(/[’‘]/g,"'").replace(/^mallow[, ]+/i,'').replace(/[.!?]+$/,'').trim();
    const greeting=conversationGreeting(control,this.clock(),this.options.conversationTimeZone);
    if(greeting){
      const turn=this.addTurn(conversation,{actor:'poe',channel:conversation.channel,modality:input.modality??'text',text:greeting,authority:'AGENT_CONTROL',contentTrust:'AGENT_CONTROL_EVIDENCE',references:[],evidence:[],responseMode:'DETERMINISTIC'});
      this.setState(conversation,'EXPLAINING',{control:'social-greeting',timeZone:this.options.conversationTimeZone??Intl.DateTimeFormat().resolvedOptions().timeZone});this.save();return {operatorTurn,turn,conversation:clone(conversation),evidence:{title:'Conversation greeting',summary:greeting,facts:[],related:[]}};
    }
    const isDate=/^(?:what(?:'s| is) (?:the |today's )?date(?: today)?|what date is it|what day is it|tell me (?:the |today's )date)$/i.test(control);
    const isRepeat=/^repeat(?: that| your previous answer)?$/i.test(control);
    if(/^(?:stop|cancel|stop speaking|stop talking)$/.test(control.toLowerCase())){
      this.bargeIn(conversation.id,conversation.actorId,conversation.speaking?.turnId);
      const replyText='Stopped speaking. Executing jobs are unaffected.';
      const turn=this.addTurn(conversation,{actor:'poe',channel:conversation.channel,modality:input.modality??'text',text:replyText,authority:'AGENT_CONTROL',contentTrust:'AGENT_CONTROL_EVIDENCE',references:[],evidence:[],responseMode:'DETERMINISTIC'});this.save();return {operatorTurn,turn,conversation:clone(conversation),evidence:{title:'Conversation control',summary:replyText,facts:[],related:[]}};
    }
    if(isDate||isRepeat){
      const last=conversation.turns.at(-2),previous=last?.actor==='poe'?last:undefined;
      const at=this.clock(),date=new Date(at);if(isDate&&!Number.isFinite(date.getTime()))throw Error('poe_runtime_clock_invalid');
      const replyText=isDate?`The date is ${date.toLocaleDateString('en-GB',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long',year:'numeric'})} (UTC).`:previous&&!previous.cancelled?previous.text:'There is no valid previous answer to repeat in this conversation.';
      const facts:PoeGroundedFact[]=isDate?[{label:'Runtime clock (UTC)',value:at,authority:'AGENT_CONTROL',informationKind:'LIVE_OBSERVED',observedAt:at,evidence:[`runtime-clock:${operatorTurn.id}`]}]:previous&&!previous.cancelled?clone(previous.evidence):[];
      const turn=this.addTurn(conversation,{actor:'poe',channel:conversation.channel,modality:input.modality??'text',text:replyText,authority:isDate?'AGENT_CONTROL':previous?.authority??'AGENT_CONTROL',contentTrust:'AGENT_CONTROL_EVIDENCE',references:!isDate&&previous&&!previous.cancelled?clone(previous.references):[],evidence:facts,responseMode:'DETERMINISTIC'});this.setState(conversation,'EXPLAINING',{control:isDate?'date':'repeat'});this.save();return {operatorTurn,turn,conversation:clone(conversation),evidence:{title:'Conversation control',summary:replyText,facts,related:[]}};
    }
    if((input.contentTrust??'OPERATOR_REQUEST')==='OPERATOR_REQUEST'&&this.options.modelWatches&&/keep an eye|watch.*model|interesting overnight|changed while.*slept/i.test(text)){
      const isWatch=/keep an eye|watch.*model/i.test(text),value=isWatch?this.options.modelWatches.draft(text):this.options.modelWatches.brief();
      const reply=this.addTurn(conversation,{actor:'poe',channel:conversation.channel,modality:'text',text:`${isWatch?'Proposed Model Watch. Review and approve the complete policy in Model Watches before automation starts.':'Recorded overnight intelligence. No result implies no established winner.'}\n\n${JSON.stringify(value,null,2)}`,authority:'AGENT_CONTROL',contentTrust:'AGENT_CONTROL_EVIDENCE',references:[],evidence:[]});this.save();return {conversation:clone(conversation),turn:clone(reply),operatorTurn:clone(operatorTurn),evidence:{title:'Model Watch',summary:reply.text,facts:[],related:[]}};
    }
    if((input.contentTrust??'OPERATOR_REQUEST')==='OPERATOR_REQUEST'&&!contextualExplanation&&isLocalBenchmarkObjective(text)&&!this.options.localBenchmark) {
      const detail=await this.options.localBenchmarkUnavailable?.()??'No qualified local benchmark execution adapter is configured. Discover this device, choose a compatible runtime and review the workload and resource limits before provisioning.';
      const reply=this.addTurn(conversation,{actor:'poe',channel:conversation.channel,modality:'text',text:'Agent Control can run local deterministic jobs without a model. '+detail+' No model has been downloaded or benchmarked by this request.',authority:'AGENT_CONTROL',contentTrust:'AGENT_CONTROL_EVIDENCE',references:[],evidence:[{label:'Local benchmark execution',value:'CONFIGURATION_REQUIRED',authority:'AGENT_CONTROL',evidence:[]}]});
      this.setState(conversation,'EXPLAINING',{reason:'local benchmark capability unavailable'});this.save();return {conversation:clone(conversation),turn:clone(reply),operatorTurn:clone(operatorTurn),evidence:{title:'Local benchmark readiness',summary:reply.text,facts:reply.evidence,related:[]}};
    }
    if((input.contentTrust??'OPERATOR_REQUEST')==='OPERATOR_REQUEST'&&!contextualExplanation&&isLocalBenchmarkObjective(text)&&this.options.localBenchmark) {
      const draft=this.options.localBenchmark.draft(text),proposal=this.proposeBenchmark(conversation.id,draft.proposal);
      conversation.lastReference={kind:'benchmark',id:proposal.id};
      const reply=this.addTurn(conversation,{actor:'poe',channel:conversation.channel,modality:'text',text:`Mallow worked example: Find the best local LLM for your workload.\n\n${draft.reviewSummary}\n\nSpecification ${draft.specSha256}\n${JSON.stringify(draft.spec,null,2)}\n\nThis is a proposal. No acquisition, runtime start, or production routing change has occurred.`,authority:'AGENT_CONTROL',contentTrust:'AGENT_CONTROL_EVIDENCE',references:[{kind:'benchmark',id:proposal.id}],evidence:[{label:'Readiness',value:draft.readiness.state,authority:'AGENT_CONTROL',evidence:[draft.specSha256]},{label:'Immutable benchmark specification',value:draft.specSha256,authority:'AGENT_CONTROL',evidence:[draft.specSha256]}]});
      this.save();return {conversation:clone(conversation),turn:clone(reply),operatorTurn:clone(operatorTurn),proposal:clone(proposal),evidence:{title:'Mallow benchmark proposal',summary:draft.reviewSummary,facts:reply.evidence,related:reply.references}};
    }
    let reference = input.reference ?? inferReference(text) ?? conversation.lastReference;
    const draftId=[...conversation.proposalIds].reverse().find(id=>this.proposals.get(id)?.state==='DRAFT'),amendment=(input.contentTrust??'OPERATOR_REQUEST')==='OPERATOR_REQUEST'&&draftId?draftAmendment(text,this.mustProposal(draftId)):undefined;
    if(draftId&&amendment){const draft=this.mustProposal(draftId);this.reviseBenchmark(draftId,draft.revision,amendment);reference={kind:'benchmark',id:draftId,label:'updated draft'};}
    this.setState(conversation, reference?.kind === 'crew-member' ? 'OBSERVING_CREW' : 'INVESTIGATING', {reference:reference?.kind ?? 'overview'});
    const ownProposal=reference?.kind==='benchmark'?this.proposals.get(reference.id):undefined;
    const priorAnswer=[...conversation.turns].reverse().find(turn=>turn.actor==='poe'&&turn.evidence.length);
    const vaultRequest=/\b(?:session|history|historical|previous work|why (?:did|was)|which commit|past decision)\b/i.test(text),vaultMatches=vaultRequest?this.options.sessionVault?.search(text,8):undefined;
    const vaultEvidence:PoeEvidenceResult|undefined=vaultMatches?.length?{title:'Session Vault history',summary:`Found ${vaultMatches.length} immutable historical session record${vaultMatches.length===1?'':'s'}. These indexed summaries link to provider-native evidence; they do not replace it or grant execution authority.`,facts:vaultMatches.flatMap(match=>match.matches.slice(0,3).map(event=>({label:`${match.providerId}@${match.nodeId} · ${event.kind}`,value:event.summary,authority:'AGENT_CONTROL' as const,informationKind:'HISTORICAL_EVIDENCE' as const,observedAt:event.at,evidence:[`session-vault:${match.sessionId}:${event.eventId}`,`sha256:${match.sourceObjectSha256}`]}))),related:[]}:undefined;
    const operatorEvidence:PoeEvidenceResult|undefined = contextualExplanation&&reference?undefined:vaultEvidence??(/(?:show|what).*evidence.*(?:that|answer)|sources.*(?:that|answer)/i.test(text)&&priorAnswer?{title:'Evidence supporting the previous answer',summary:'These are the exact retained sources and observations used for that answer, not newly inferred claims.',facts:priorAnswer.evidence,related:priorAnswer.references}:await (async()=>{const result=await observeBounded(()=>this.options.operator?.query(text, clone(conversation), input.reference ?? conversation.lastReference),1000);return result.state?{title:'Evidence lookup unavailable',summary:`Evidence lookup ${result.state.toLowerCase()}; no current observation.`,facts:(priorAnswer?.evidence??[]).map(f=>({...f,informationKind:f.informationKind==='LIVE_OBSERVED'?'HISTORICAL_EVIDENCE' as const:f.informationKind})),related:[],unavailable:result.state}:result.value;})());
    const evidence = clone(operatorEvidence ?? (ownProposal ? proposalEvidence(ownProposal) : reference ? this.options.evidence.resolve(reference) : focusOverviewEvidence(this.options.evidence.overview(),text)));
    if(/\btranscripts?\b|conversation history/i.test(text)){
      const transcript=this.transcript(conversation.id);
      evidence.facts.push({label:'Current natural transcript',value:JSON.stringify({conversationId:conversation.id,snapshotTurnCount:conversation.turns.length,bytes:Buffer.byteLength(transcript),sha256:createHash('sha256').update(transcript).digest('hex'),dashboardControl:conversation.channel==='dashboard'?'Transcript':null,exportPath:`/api/poe/conversations/${encodeURIComponent(conversation.id)}/transcript`,snapshotBoundary:'Complete retained conversation before this answer; export requires the existing authenticated channel controls.'}),authority:'AGENT_CONTROL',informationKind:'LIVE_OBSERVED',observedAt:this.clock(),evidence:[`poe:conversation:${conversation.id}:transcript`]});
      if(evidence.title==='Knowledge unavailable'){delete evidence.unavailable;evidence.title='Current natural transcript';evidence.summary='This conversation has a retained natural transcript. The snapshot below describes the real export before this answer is added.';}
    }
    if (operatorEvidence) reference = operatorEvidence.reference;
    conversation.lastReference = reference ? clone(reference) : undefined;
    let response = operatorEvidence ? `${evidence.title}\n\n${evidence.summary}\n\n${evidence.facts.map(fact=>`${fact.label}: ${fact.value===null?'unavailable':String(fact.value).length>240?'See the sourced record below.':String(fact.value)}`).join('\n')}` : groundedResponse(evidence), route:PoeRouteIdentity|undefined, usage:PoeTurn['usage'], responseMode:'DETERMINISTIC'|'MODEL'='DETERMINISTIC', authority:PoeAuthority='AGENT_CONTROL';
    if(this.options.responseModel&&(!evidence.unavailable||evidence.title==='Knowledge unavailable')&&evidence.title!=='Review job proposal'){this.setState(conversation,'THINKING',{purpose:responsePurpose(reference)});try{const modeled=await this.options.responseModel.respond({purpose:responsePurpose(reference),operatorText:text,evidence:clone(evidence),channel:conversation.channel,history:conversation.turns.slice(-7,-1).map(turn=>({actor:turn.actor,text:turn.text.slice(0,1600)}))});validateModeledResponse(modeled,evidence);response=cleanText(modeled.text,'poe_model_response_invalid');route=clone(modeled.route);usage=clone(modeled.usage);responseMode='MODEL';authority='PROVIDER_REPORTED';}catch{response=`${response}\n\nThe selected conversational model route was unavailable or returned an invalid grounded response. I have used Agent Control's deterministic evidence rendering instead; no substitute model was silently selected.`;this.record(conversation,'conversation.changed',{modelResponse:'failed-closed',fallback:'deterministic-grounded-renderer'});}}
    if(this.generationEpoch.get(conversation.id)!==epoch)throw new Error('poe_generation_cancelled');
    const guarded=responseMode==='MODEL'||['FAILED','TIMEOUT'].includes(evidence.unavailable??'')?guardResponse({text:response,request:text,evidence,now:this.clock(),requestId:operatorTurn.id,forceProjection:['FAILED','TIMEOUT'].includes(evidence.unavailable??'')}):{changed:false,text:response,record:null};if(guarded.changed){response=guarded.text;responseMode='DETERMINISTIC';authority='AGENT_CONTROL';this.record(conversation,'conversation.changed',{grounding:guarded.record});}
    if(this.generationEpoch.get(conversation.id)!==epoch)throw new Error('poe_generation_cancelled');
    this.setState(conversation, evidence.unavailable ? 'BLOCKED' : evidence.title === 'Review job proposal' ? 'WAITING_FOR_APPROVAL' : reference?.kind==='crew-member'?'OBSERVING_CREW':evidence.title==='Registered schedules'?'SCHEDULING':'EXPLAINING',{evidence: evidence.facts.length, unavailable:Boolean(evidence.unavailable),responseMode});
    const turn = this.addTurn(conversation,{actor:'poe',channel:conversation.channel,modality:input.modality ?? 'text',text:response,authority,contentTrust:'AGENT_CONTROL_EVIDENCE',references:[...(reference?[reference]:[]),...evidence.related],evidence:evidence.facts,responseMode,...(route?{route}:{}) ,...(usage?{usage}:{})});
    this.save(); return {operatorTurn,turn,conversation:clone(conversation),evidence};
  }
  async operatorProjection(id: string, actor: string) {
    const conversation = this.mustConversation(id);
    if(conversation.actorId !== actor || conversation.channel !== 'dashboard') throw new Error('poe_conversation_actor_mismatch');
    const benchmarkParcelIds=[...this.proposals.values()].filter(proposal=>proposal.conversationId===id&&proposal.approvedBy===actor&&proposal.state==='SUBMITTED'&&proposal.execution).map(proposal=>proposal.execution!.parcelId);
    const projection=await this.options.operator?.projection(actor,id,benchmarkParcelIds);
    if(!projection)return null;
    if(projection.batch.running>0&&conversation.state!=='WORKING')this.setState(conversation,'WORKING',{parcelIds:projection.batch.parcelIds});
    for(const handover of projection.handovers){
      if(conversation.announcedHandoverIds?.includes(handover.id))continue;
      (conversation.announcedHandoverIds??=[]).push(handover.id);this.setState(conversation,'HANDOFF',{batonId:handover.batonId,received:handover.received});
      this.addTurn(conversation,{purpose:'HANDOVER',actor:'poe',channel:'dashboard',modality:'text',text:handover.text,authority:'AGENT_CONTROL',contentTrust:'AGENT_CONTROL_EVIDENCE',references:[{kind:'parcel',id:handover.parcelId}],evidence:[{label:'Sealed handover',value:JSON.stringify(handover),authority:'AGENT_CONTROL',informationKind:'LIVE_OBSERVED',observedAt:this.clock(),evidence:[`parcel:${handover.parcelId}:baton:${handover.batonId}`]}]});
    }
    for(const item of projection.proposals){
      if(item.executionStatus==='RUNNING'&&conversation.state!=='WORKING')this.setState(conversation,'WORKING',{operation:item.id,parcelId:item.parcelId,status:item.executionStatus});
      if(!item.executionStatus||!['SUCCEEDED','FAILED','CANCELLED'].includes(item.executionStatus)||conversation.completedOperationIds?.includes(item.id))continue;
      (conversation.completedOperationIds??=[]).push(item.id);
      this.setState(conversation,item.executionStatus==='SUCCEEDED'?'SUCCEEDED':item.executionStatus==='CANCELLED'?'INTERRUPTED':'FAILED',{operation:item.id,parcelId:item.parcelId,status:item.executionStatus});
      this.addTurn(conversation,{actor:'poe',channel:'dashboard',modality:'text',text:`Work Parcel ${item.parcelId} is ${item.executionStatus}. ${item.execution?.summary??'Inspect its governed execution record for the result.'}`,authority:'AGENT_CONTROL',contentTrust:'AGENT_CONTROL_EVIDENCE',references:[{kind:'parcel',id:item.parcelId!},...(item.execution?.related??[])],evidence:item.execution?.facts??[]});
    }
    if(projection.batch.reconciled&&!conversation.announcedBatchIds?.includes(projection.batch.id)){
      (conversation.announcedBatchIds??=[]).push(projection.batch.id);
      this.setState(conversation,projection.batch.failed||projection.batch.blocked?'FAILED':projection.batch.cancelled?'INTERRUPTED':'SUCCEEDED',{parcelIds:projection.batch.parcelIds,reconciled:true});
      this.addTurn(conversation,{purpose:'RESULT',actor:'poe',channel:'dashboard',modality:'text',text:projection.batch.text+' '+projection.batch.outputs,authority:'AGENT_CONTROL',contentTrust:'AGENT_CONTROL_EVIDENCE',references:projection.batch.parcelIds.map(id=>({kind:'parcel' as const,id})),evidence:[{label:'Reconciled requested set',value:JSON.stringify(projection.batch),authority:'AGENT_CONTROL',informationKind:'LIVE_OBSERVED',observedAt:this.clock(),evidence:projection.batch.parcelIds.map(id=>`parcel:${id}`)}]});
    }
    this.save();return projection;
  }
  approveOperator(id: string, proposalId: string, hash: string, actor: string) {
    const conversation = this.mustConversation(id);
    if(conversation.actorId !== actor || conversation.channel !== 'dashboard') throw new Error('poe_conversation_actor_mismatch');
    if(!this.options.operator) throw new Error('poe_operator_unconfigured');
    const proposal = this.options.operator.approve(proposalId, hash, clone(conversation));
    this.setState(conversation,'OBSERVING_CREW',{parcelId:proposal.parcelId, operation:proposalId});
    this.addTurn(conversation,{actor:'poe',channel:'dashboard',modality:'text',text:proposal.operation==='CANCEL'?`Cancellation requested for ${proposal.parcelId}. The runtime determines when cleanup is complete.`:`The approved request is submitted as ${proposal.parcelId}. The Work Parcel runtime now owns execution and verification.`,authority:'AGENT_CONTROL',contentTrust:'AGENT_CONTROL_EVIDENCE',references:[{kind:'parcel',id:proposal.parcelId!}],evidence:[]});
    conversation.lastReference={kind:'parcel',id:proposal.parcelId!}; this.save();
    return {proposal,conversation:clone(conversation)};
  }
  async *sharedSpeechForTurn(conversationId:string,turnId:string,actor:string){
    const c=this.mustConversation(conversationId);if(c.actorId!==actor)throw Error('poe_conversation_actor_mismatch');if(!this.options.sharedSpeech)throw Error('poe_shared_speech_unconfigured');
    const turn=c.turns.find(t=>t.id===turnId&&t.actor==='poe');if(!turn||turn.cancelled)throw Error('poe_turn_invalid');
    c.speaking={turnId,startedAt:this.clock()};const trace:Array<unknown>=[];turn.sharedSpeech={requestedVoice:'mallow',spokenText:turn.text,events:trace};this.save();
    try{for await(const event of this.options.sharedSpeech.speak(conversationId,turnId,turn.text)){if(turn.cancelled)throw Error('poe_speech_interrupted');const {audio,...metadata}=event;trace.push({...metadata,...(typeof audio==='string'?{audioSha256:createHash('sha256').update(Buffer.from(audio,'base64')).digest('hex')}:{}),observedAt:this.clock()});this.save();yield {...event,turnId,spokenText:turn.text};}if(c.speaking?.turnId===turnId)c.speaking.completedAt=this.clock();}
    finally{this.save();}
  }
  async speechForTurn(conversationId: string, turnId: string, actor: string) {
    const conversation=this.mustConversation(conversationId);
    if(conversation.actorId!==actor)throw new Error('poe_conversation_actor_mismatch');
    if(!this.options.speech||!this.options.voice||!this.options.recognition)throw new Error('poe_voice_unconfigured');
    const turn=conversation.turns.find(item=>item.id===turnId&&item.actor==='poe');
    if(!turn)throw new Error('poe_turn_invalid');
    this.speechControllers.get(conversationId)?.abort();
    const controller=new AbortController(); this.speechControllers.set(conversationId,controller);
    conversation.speaking={turnId,startedAt:this.clock()};
    this.setState(conversation,'THINKING',{speech:'synthesizing',turnId});
    const spokenText=prepareSpokenText(turn.text.split('\n\n').slice(0,2).join('. '));
    try {
      const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(180_000)]);
      const audio=await this.options.speech.synthesize({text:spokenText,voice:this.options.voice,signal});
      validateAudio(audio.bytes,audio.mime);
      const observed=await this.options.recognition.transcribe({bytes:audio.bytes,mime:audio.mime,signal});
      if(!speechContentCoverage(spokenText,observed.text).matched)throw new Error('poe_speech_content_mismatch');
      if(controller.signal.aborted)throw new Error('poe_speech_interrupted');
      turn.synthesisMetrics=redactSensitiveValue(audio.metrics);
      turn.speech={spokenText,voiceId:this.options.voice.id,voiceSha256:sha(this.options.voice),audioSha256:createHash('sha256').update(audio.bytes).digest('hex'),generatedAt:this.clock()};
      conversation.speaking.completedAt=this.clock(); this.setState(conversation,'EXPLAINING',{speech:'ready',turnId});this.save();
      return {turnId,spokenText,bytes:audio.bytes,mime:audio.mime,sha256:createHash('sha256').update(audio.bytes).digest('hex'),metrics:redactSensitiveValue(audio.metrics)};
    } catch {
      this.setState(conversation,controller.signal.aborted?'INTERRUPTED':'FAILED',{speech:controller.signal.aborted?'interrupted':'synthesis-or-content-validation-failed'});
      throw new Error(controller.signal.aborted?'poe_speech_interrupted':'poe_speech_validation_failed');
    } finally {if(this.speechControllers.get(conversationId)===controller)this.speechControllers.delete(conversationId);}
  }
  proposeBenchmark(conversationId: string, input: PoeBenchmarkProposalInput) {
    const conversation = this.mustConversation(conversationId); this.validateBenchmarkInput(input); this.setState(conversation,'DESIGNING_EXPERIMENT',{decision:input.decision});
    const at=this.clock(), id=`poe-benchmark:${randomUUID()}`, proposal:PoeBenchmarkProposal={schema:'agent-control.poe-benchmark-proposal/v1',id,conversationId,revision:1,state:'DRAFT',...clone(input),fairness:assessFairness(input.conditions),createdAt:at,updatedAt:at};
    this.proposals.set(id,proposal); conversation.proposalIds.push(id); this.record(conversation,'proposal.changed',{proposalId:id,state:proposal.state,comparable:proposal.fairness.comparable},id); return clone(proposal);
  }
  reviseBenchmark(id: string, revision: number, changes: Partial<PoeBenchmarkProposalInput>) {
    const current=this.mustProposal(id); if(current.state!=='DRAFT'||current.revision!==revision)throw new Error('poe_proposal_revision_conflict');
    const next:PoeBenchmarkProposalInput={decision:changes.decision??current.decision,objective:changes.objective??current.objective,whyNewEvidenceIsNeeded:changes.whyNewEvidenceIsNeeded??current.whyNewEvidenceIsNeeded,conditions:changes.conditions??current.conditions,stages:changes.stages??current.stages,metrics:changes.metrics??current.metrics,repetitions:changes.repetitions??current.repetitions,constraints:changes.constraints??current.constraints};this.validateBenchmarkInput(next);
    Object.assign(current,clone(next),{revision:current.revision+1,updatedAt:this.clock(),fairness:assessFairness(next.conditions)});const conversation=this.mustConversation(current.conversationId);this.setState(conversation,'DESIGNING_EXPERIMENT',{proposalId:id,revision:current.revision});this.record(conversation,'proposal.changed',{proposalId:id,state:current.state,revision:current.revision,comparable:current.fairness.comparable},id);return clone(current);
  }
  freezeBenchmark(id:string,revision:number){const proposal=this.mustProposal(id);if(proposal.state!=='DRAFT'||proposal.revision!==revision)throw new Error('poe_proposal_revision_conflict');if(!proposal.fairness.comparable)throw new Error('poe_benchmark_unfair');proposal.state='FROZEN';proposal.frozenAt=this.clock();proposal.updatedAt=proposal.frozenAt;proposal.frozenSha256=proposalHash(proposal);const conversation=this.mustConversation(proposal.conversationId);this.setState(conversation,'WAITING_FOR_APPROVAL',{proposalId:id,sha256:proposal.frozenSha256});this.record(conversation,'proposal.changed',{proposalId:id,state:proposal.state,sha256:proposal.frozenSha256},id);return clone(proposal);}
  approveBenchmark(id:string,input:{revision:number;frozenSha256:string;actor:string}){const proposal=this.mustProposal(id),actor=cleanText(input.actor,'poe_actor_invalid',192);if(proposal.state!=='FROZEN'||proposal.revision!==input.revision||proposal.frozenSha256!==input.frozenSha256||proposalHash(proposal)!==proposal.frozenSha256)throw new Error('poe_proposal_approval_stale');if(!this.options.benchmark)throw new Error('poe_benchmark_execution_unconfigured');const requestKey=sha({conversationId:proposal.conversationId,proposalId:proposal.id,revision:proposal.revision,frozenSha256:proposal.frozenSha256}),expanded=expandRepetitions(proposal.stages,proposal.repetitions),plan:WorkParcelPlan={objective:proposal.objective,constraints:proposal.constraints,successCriteria:benchmarkCriteria(proposal),planner:{kind:'deterministic',reason:`${HOST_IDENTITY.name} proposal ${proposal.id} was frozen, fairness-checked and explicitly approved by ${actor}; ${proposal.repetitions} repetition(s) materialized`},stages:expanded};let result:{parcelId:string};try{result=this.options.benchmark.submit({proposal:clone(proposal),actor,requestKey,plan});}catch(error){const conversation=this.mustConversation(proposal.conversationId);this.record(conversation,'proposal.changed',{proposalId:id,state:'FROZEN',execution:'failed-closed'},id);throw error;}proposal.state='APPROVED';proposal.approvedAt=this.clock();proposal.approvedBy=actor;proposal.updatedAt=proposal.approvedAt;proposal.state='SUBMITTED';proposal.execution={parcelId:result.parcelId,submittedAt:this.clock(),requestKey};proposal.updatedAt=proposal.execution.submittedAt;const conversation=this.mustConversation(proposal.conversationId);this.setState(conversation,'OBSERVING_CREW',{parcelId:result.parcelId});this.record(conversation,'proposal.changed',{proposalId:id,state:proposal.state,parcelId:result.parcelId,requestKey},id);return clone(proposal);}
  async transcribeTurn(conversationId:string,bytes:Uint8Array,mime:string,actor:string) {
    const conversation=this.mustConversation(conversationId);
    if(conversation.actorId!==actor)throw new Error('poe_conversation_actor_mismatch');
    if(this.options.sharedSpeech){
      if(conversation.actorId!==actor||conversation.channel!=='dashboard')throw Error('poe_conversation_actor_mismatch');
      const result=await this.options.sharedSpeech.transcribe(conversationId,bytes,mime);
      return await this.ask({conversationId,text:result.text,modality:'voice',contentTrust:'UNTRUSTED_DATA',sharedSpeech:{rawStt:result.text,...result.provenance}});
    }
    if(!this.options.recognition)throw new Error('poe_voice_unconfigured');
    validateAudio(bytes,mime); this.setState(conversation,'LISTENING',{speech:'transcribing'});
    const result=await this.options.recognition.transcribe({bytes,mime,signal:AbortSignal.timeout(120_000)});
    const answer=await this.ask({conversationId,text:result.text,modality:'voice',contentTrust:'UNTRUSTED_DATA'});
    const turn=conversation.turns.find(t=>t.id===answer.operatorTurn.id)!;turn.recognitionMetrics=redactSensitiveValue(result.metrics);this.save();return {...answer,operatorTurn:clone(turn),conversation:clone(conversation)};
  }
  async voiceTurn(input:{conversationId:string;bytes:Uint8Array;mime:string;speechEndedAt?:number}){
    const conversation=this.mustConversation(input.conversationId);if(!this.options.recognition||!this.options.speech||!this.options.voice)throw new Error('poe_voice_unconfigured');validateAudio(input.bytes,input.mime);const started=Date.now(),speechEnded=input.speechEndedAt??started,recognition=await this.options.recognition.transcribe({bytes:input.bytes,mime:input.mime,signal:AbortSignal.timeout(120_000)}),transcribed=Date.now(),answer=await this.ask({conversationId:conversation.id,text:recognition.text,modality:'voice',contentTrust:'UNTRUSTED_DATA'}),controller=new AbortController();this.speechControllers.set(conversation.id,controller);conversation.speaking={turnId:answer.turn.id,startedAt:this.clock()};this.setState(conversation,'SPEAKING',{turnId:answer.turn.id});
    try{const audio=await this.options.speech.synthesize({text:answer.turn.text,voice:this.options.voice,signal:controller.signal});validateAudio(audio.bytes,audio.mime);const completedAudio=Date.now(),streaming=this.options.speech.capabilities().streaming,latency={speechEndToTranscriptMs:Math.max(0,transcribed-speechEnded),transcriptToFirstResponseTokenMs:null,responseToFirstAudioMs:streaming&&Number.isFinite(audio.metrics.firstAudioMs)?audio.metrics.firstAudioMs:null,totalMs:Math.max(0,completedAudio-speechEnded),authority:'ESTIMATED' as const};const stored=this.mustConversation(conversation.id).turns.find(turn=>turn.id===answer.turn.id)!;stored.latency=latency;conversation.speaking.completedAt=this.clock();this.setState(conversation,'EXPLAINING',{speech:'completed'});this.speechControllers.delete(conversation.id);this.save();return {...answer,audio:{bytes:audio.bytes,mime:audio.mime,sha256:createHash('sha256').update(audio.bytes).digest('hex'),metrics:redactSensitiveValue(audio.metrics)},latency};}
    catch(error){this.speechControllers.delete(conversation.id);if(controller.signal.aborted){this.setState(conversation,'LISTENING',{speech:'interrupted'});throw new Error('poe_speech_interrupted');}this.setState(conversation,'EXPLAINING',{speech:'failed'});throw error;}
  }
  bargeIn(conversationId:string,actor:string,playbackTurnId?:string){if(this.mustConversation(conversationId).actorId!==actor)throw Error('poe_conversation_actor_mismatch');const sharedActive=Boolean(this.options.sharedSpeech?.isActive(conversationId));this.generationEpoch.set(conversationId,(this.generationEpoch.get(conversationId)??0)+1);void this.options.sharedSpeech?.cancel(conversationId).catch(()=>{this.record(this.mustConversation(conversationId),'speech.changed',{cancellation:'remote-unconfirmed-local-fenced'});});const conversation=this.mustConversation(conversationId);cleanText(actor,'poe_actor_invalid',192);const controller=this.speechControllers.get(conversationId),requested=playbackTurnId?cleanText(playbackTurnId,'poe_playback_turn_invalid',192):undefined,latestVoice=[...conversation.turns].reverse().find(turn=>turn.actor==='poe'&&(turn.modality==='voice'||turn.id===conversation.speaking?.turnId)),sameBoundary=Boolean(requested&&conversation.speaking?.turnId===requested),replaceableBoundary=!conversation.speaking||Boolean(conversation.speaking.completedAt||conversation.speaking.interruptedAt),playback=Boolean(requested&&latestVoice?.id===requested&&(sameBoundary?!conversation.speaking?.interruptedAt:replaceableBoundary));if(this.options.sharedSpeech){const target=conversation.turns.find(t=>t.id===(requested??conversation.speaking?.turnId));if(target)target.cancelled=true;}if(controller)controller.abort();if(playback&&conversation.speaking?.turnId!==requested)conversation.speaking={turnId:requested!,startedAt:latestVoice!.at};if(conversation.speaking&&(controller||playback||sharedActive))conversation.speaking.interruptedAt=this.clock();this.setState(conversation,'LISTENING',{speech:'interrupted',speechBoundary:sharedActive?'shared-speech':controller?'synthesis':playback?'client-playback':'none',workParcelCancellation:false});this.record(conversation,'interrupted',{turnId:conversation.speaking?.turnId??null,speechBoundary:sharedActive?'shared-speech':controller?'synthesis':playback?'client-playback':'none',workParcelCancellation:false});return {interrupted:Boolean(controller||playback||sharedActive),workParcelCancelled:false,conversation:clone(conversation)};}
  transcript(conversationId:string){const conversation=this.mustConversation(conversationId);return `# ${HOST_IDENTITY.name} conversation ${conversation.id}\n\nChannel: ${conversation.channel}\nActor: ${conversation.actorId}\nCreated: ${conversation.createdAt}\n\n## Exact initiating operator prompt\n\n${conversation.turns.find(turn=>turn.actor!=='poe')?.text??'No operator prompt has been submitted.'}\n\n## Chronological interaction\n\n${conversation.turns.map(turn=>`## ${turn.actor==='poe'?HOST_IDENTITY.name:'Operator'} · ${turn.at}\n\n${turn.text}\n\nAuthority: ${turn.authority}\nResponse mode: ${turn.responseMode??'not applicable'}${turn.route?`\nRoute: ${label(turn.route)}`:''}${turn.usage?`\nUsage: input ${turn.usage.inputTokens??'unavailable'}; output ${turn.usage.outputTokens??'unavailable'}; total ${turn.usage.totalTokens??'unavailable'}; cost ${turn.usage.cost??'unavailable'} ${turn.usage.currency??''}; authority ${turn.usage.authority}`:''}\nReferences: ${turn.references.map(item=>`${item.kind}:${item.id}`).join(', ')||'none'}${turn.speech?`\nSpoken output: ${turn.speech.spokenText}\nVoice: ${turn.speech.voiceId} (configuration SHA-256 ${turn.speech.voiceSha256})\nAudio SHA-256: ${turn.speech.audioSha256}`:''}${turn.recognitionMetrics?`\nTranscription telemetry (provider reported): ${JSON.stringify(turn.recognitionMetrics)}; monetary cost unknown`:''}${turn.synthesisMetrics?`\nSynthesis telemetry (provider reported): ${JSON.stringify(turn.synthesisMetrics)}; monetary cost unknown`:''}${turn.voiceReference?`\nVoice session: ${turn.voiceReference.sessionId}; delegation: ${turn.voiceReference.delegationId}`:''}${turn.sharedSpeech?`\nShared Speech transport: ${JSON.stringify(turn.sharedSpeech)}`:''}\nEvidence: ${JSON.stringify(turn.evidence)}${turn.latency?`\nLatency: speech→transcript ${turn.latency.speechEndToTranscriptMs??'unavailable'}ms; transcript→response ${turn.latency.transcriptToFirstResponseTokenMs??'unavailable'}ms; response→audio ${turn.latency.responseToFirstAudioMs??'unavailable'}ms; total ${turn.latency.totalMs??'unavailable'}ms`:''}`).join('\n\n')}`;}
  private validateBenchmarkInput(input:PoeBenchmarkProposalInput){cleanText(input.decision,'poe_benchmark_decision_required');cleanText(input.objective,'poe_benchmark_objective_required');cleanText(input.whyNewEvidenceIsNeeded,'poe_benchmark_evidence_reason_required');if(input.conditions.length<2||input.stages.length<1||input.metrics.length<1||!Number.isSafeInteger(input.repetitions)||input.repetitions<1||input.repetitions>100)throw new Error('poe_benchmark_plan_invalid');assertNoSensitiveMaterial(JSON.stringify(input),'poe_credential_material_forbidden');for(const condition of input.conditions){if(!condition.route.providerId||!condition.route.modelId||!condition.route.nodeId||!condition.fixtureSha256.match(/^[a-f0-9]{64}$/)||condition.timeLimitMs<1)throw new Error('poe_benchmark_condition_invalid');}for(const metric of input.metrics)if(!metric.id||!metric.label||!metric.successCriterion||metric.stageId&&!input.stages.some(stage=>stage.id===metric.stageId))throw new Error('poe_benchmark_metric_invalid');}
  private addTurn(conversation:PoeConversation,input:Omit<PoeTurn,'id'|'conversationId'|'at'>){const turn:PoeTurn={id:`poe-turn:${randomUUID()}`,conversationId:conversation.id,at:this.clock(),...clone(input)};assertNoSensitiveMaterial(JSON.stringify(turn),'poe_credential_material_forbidden');conversation.turns.push(turn);if(conversation.turns.length>MAX_TURNS)conversation.turns.splice(0,conversation.turns.length-MAX_TURNS);conversation.updatedAt=turn.at;this.record(conversation,'conversation.changed',{turnId:turn.id,actor:turn.actor});return clone(turn);}
  private setState(conversation:PoeConversation,state:PoeState,detail:Record<string,unknown>){conversation.state=state;conversation.updatedAt=this.clock();this.record(conversation,'conversation.changed',{...detail,state});}
  private record(conversation:PoeConversation,type:PoeEvent['type'],detail:Record<string,unknown>,proposalId?:string){const event:PoeEvent={type,at:this.clock(),conversationId:conversation.id,state:conversation.state,detail:redactSensitiveValue(detail),...(proposalId?{proposalId}:{})};this.events.push(event);if(this.events.length>MAX_EVENTS)this.events.shift();this.save();try{this.options.onEvent?.(clone(event));}catch{/* durable POE state remains authoritative */}}
  private mustConversation(id:string){const value=this.conversations.get(id);if(!value)throw new Error('poe_conversation_missing');return value;}
  private mustProposal(id:string){const value=this.proposals.get(id);if(!value)throw new Error('poe_proposal_missing');return value;}
  private load(){if(!this.options.file||!fs.existsSync(this.options.file))return;const value=JSON.parse(fs.readFileSync(this.options.file,'utf8')) as PoeSnapshot;if(value.schema!=='agent-control.poe-store/v1'||!Array.isArray(value.conversations)||!Array.isArray(value.proposals)||!Array.isArray(value.events))throw new Error('poe_store_invalid');for(const item of value.conversations)this.conversations.set(item.id,item);for(const item of value.proposals)this.proposals.set(item.id,item);this.events.push(...value.events.slice(-MAX_EVENTS));}
  private save(){if(!this.options.file)return;const snapshot:PoeSnapshot={schema:'agent-control.poe-store/v1',conversations:[...this.conversations.values()].map(clone),proposals:[...this.proposals.values()].map(clone),events:this.events.map(clone)};assertNoSensitiveMaterial(JSON.stringify(snapshot),'poe_credential_material_forbidden');fs.mkdirSync(path.dirname(this.options.file),{recursive:true,mode:0o700});const temporary=`${this.options.file}.${process.pid}.tmp`;fs.writeFileSync(temporary,`${JSON.stringify(snapshot,null,2)}\n`,{mode:0o600});fs.renameSync(temporary,this.options.file);}
}

export function assessFairness(conditions:PoeBenchmarkCondition[]){const findings:PoeFairnessFinding[]=[];if(conditions.length<2)return{comparable:true,findings};const blocking:Array<keyof PoeBenchmarkCondition>=['contextPolicy','fixtureSha256','cacheState','authority','timeLimitMs'];for(const field of blocking){const values=[...new Set(conditions.map(item=>JSON.stringify(item[field])))];if(values.length>1)findings.push({field,severity:'BLOCKING',message:`${field} differs across candidates; results would not isolate the intended route decision.`,routes:conditions.map(item=>`${label(item.route)}=${String(item[field])}`)});}for(const field of ['softwareVersion','hardwareClass','quantization','providerEndpoint'] as Array<keyof PoeBenchmarkCondition>){const values=[...new Set(conditions.map(item=>JSON.stringify(item[field])))];if(values.length>1)findings.push({field,severity:'DISCLOSED',message:`${field} differs across candidates and must remain attached to the result.`,routes:conditions.map(item=>`${label(item.route)}=${String(item[field])}`)});}const tools=[...new Set(conditions.map(item=>[...item.tools].sort().join(',')))];if(tools.length>1)findings.push({field:'tools',severity:'BLOCKING',message:'Tool access differs across candidates.',routes:conditions.map(item=>`${label(item.route)}=${[...item.tools].sort().join(',')}`)});return{comparable:!findings.some(item=>item.severity==='BLOCKING'),findings};}
function proposalHash(proposal:PoeBenchmarkProposal){const {state:_state,updatedAt:_updatedAt,frozenAt:_frozenAt,frozenSha256:_frozenSha256,approvedAt:_approvedAt,approvedBy:_approvedBy,execution:_execution,...sealed}=proposal;return sha(sealed);}
function inferReference(text:string):PoeObjectReference|undefined{const match=text.match(/\b(model|job|run|parcel|runtime(?:\s+map)?|process(?:\s+map)?|lane|baton|workflow|benchmark|session|crew|capability|verification|governor)\s+([a-zA-Z0-9:._@/-]{1,256})/i);if(!match)return undefined;const map:Record<string,PoeObjectKind>={model:'model',job:'job',run:'run',parcel:'parcel',runtime:'runtime-map','runtime map':'runtime-map',process:'runtime-map','process map':'runtime-map',lane:'lane',baton:'baton',workflow:'workflow',benchmark:'benchmark',session:'execution-session',crew:'crew-member',capability:'capability-manifest',verification:'verification',governor:'governor-decision'};return{kind:map[match[1]!.toLowerCase()]!,id:match[2]!};}
function draftAmendment(text:string,proposal:PoeBenchmarkProposal):Partial<PoeBenchmarkProposalInput>|undefined{let match=text.match(/\b(?:set|change|use|make)(?:\s+the)?\s+(?:repetitions?|runs?)(?:\s+to)?\s+(\d{1,3})\b/i);if(match)return{repetitions:Number(match[1])};match=text.match(/^\s*(?:add\s+)?constraint\s*:\s*(.+)$/i);if(match)return{constraints:[...(proposal.constraints??[]),cleanText(match[1],'poe_benchmark_constraint_invalid',2_048)]};match=text.match(/^\s*(?:set|change)(?:\s+the)?\s+objective\s*(?:to|:)\s*(.+)$/i);if(match)return{objective:cleanText(match[1],'poe_benchmark_objective_required')};return undefined;}
function expandRepetitions(stages:WorkParcelPlanStage[],repetitions:number){if(repetitions===1)return clone(stages);return Array.from({length:repetitions},(_,index)=>stages.map(stage=>({...clone(stage),id:`${stage.id}-r${index+1}`,name:`${stage.name} · repetition ${index+1}`,dependsOn:(stage.dependsOn??[]).map(id=>`${id}-r${index+1}`)}))).flat();}
function benchmarkCriteria(proposal:PoeBenchmarkProposal):NonNullable<WorkParcelPlan['successCriteria']>{const result:NonNullable<WorkParcelPlan['successCriteria']>=[];for(const metric of proposal.metrics.filter(item=>item.kind==='OBJECTIVE')){if(!metric.stageId){result.push({id:metric.id,kind:'CUSTOM',description:metric.successCriterion,source:'USER'});continue;}for(let index=0;index<proposal.repetitions;index++){const stageId=proposal.repetitions===1?metric.stageId:`${metric.stageId}-r${index+1}`;result.push({id:proposal.repetitions===1?metric.id:`${metric.id}-r${index+1}`,kind:'STAGE_VERIFIED',description:metric.successCriterion,source:'USER',stageId,requiredEvidence:[`stage:${stageId}:verified`]});}}return result;}
function responsePurpose(reference?:PoeObjectReference):PoeResponsePurpose{return reference?.kind==='benchmark'?'EXPERIMENT_DESIGN':reference?'EVIDENCE_EXPLANATION':'STATUS_LOOKUP';}
function validateModeledResponse(value:Awaited<ReturnType<PoeResponseModelPort['respond']>>,evidence:PoeEvidenceResult){if(!value||!value.text?.trim()||!value.route?.providerId||!value.route.modelId||!value.route.nodeId||!Array.isArray(value.citations)||evidence.facts.length>0&&value.citations.length===0||!value.usage||!['AGENT_CONTROL','OPERATOR','PROVIDER_REPORTED','ESTIMATED','UNAVAILABLE'].includes(value.usage.authority))throw new Error('poe_model_response_invalid');const available=new Set(evidence.facts.flatMap(item=>[item.label,...item.evidence]));if(value.citations.some(item=>!available.has(item)))throw new Error('poe_model_citation_invalid');assertNoSensitiveMaterial(JSON.stringify(value),'poe_credential_material_forbidden');}
function focusOverviewEvidence(result:PoeEvidenceResult,text:string):PoeEvidenceResult{if(result.unavailable||/\bstatus\b/i.test(text))return result;const selectors:RegExp[]=[];if(/\b(?:waiting|queued|pending)\b/i.test(text))selectors.push(/\b(?:waiting|queued|pending)\b/i);if(/\b(?:active|running|current work|working)\b/i.test(text))selectors.push(/\b(?:active|running)\b/i);if(/\bapprovals?\b/i.test(text))selectors.push(/\bapprovals?\b/i);if(/\b(?:systems?|machines?|nodes?|resources?)\b/i.test(text))selectors.push(/\b(?:systems?|machines?|nodes?|resources?)\b/i);if(/\bhealth\b/i.test(text))selectors.push(/\bhealth\b/i);if(/\bmodels?\b/i.test(text))selectors.push(/\bmodels?\b/i);if(selectors.length===0)return result;const facts=result.facts.filter(fact=>selectors.some(selector=>selector.test(fact.label)));if(facts.length===0)return result;const summary=facts.length===1?`The current ${facts[0]!.label.toLowerCase()} is ${facts[0]!.value===null?'unavailable':String(facts[0]!.value)}.`:`The requested current values are ${facts.map(fact=>`${fact.label.toLowerCase()} ${fact.value===null?'unavailable':String(fact.value)}`).join(' and ')}.`;return{...result,summary,facts};}
function groundedResponse(result:PoeEvidenceResult){if(result.unavailable)return `${result.title}. ${result.unavailable} I don’t have the evidence to answer that yet. Let’s check the source before drawing a conclusion.`;const facts=result.facts.map(item=>`${item.label}: ${item.value===null?'unavailable':String(item.value)} (${item.authority.toLowerCase().replaceAll('_',' ')})${item.limitation?` — ${item.limitation}`:''}`).join('\n');return `${result.title}\n\n${result.summary}${facts?`\n\n${facts}`:''}`;}
function proposalEvidence(proposal:PoeBenchmarkProposal):PoeEvidenceResult{return{reference:{kind:'benchmark',id:proposal.id},title:`Benchmark proposal ${proposal.id}`,summary:proposal.state==='DRAFT'?'This proposal is editable and has no execution authority.':proposal.state==='FROZEN'?'The conditions are sealed; execution still requires explicit approval.':proposal.state==='SUBMITTED'?`The approved proposal entered the normal Work Parcel lifecycle as ${proposal.execution?.parcelId}.`:`Proposal state: ${proposal.state}.`,facts:[{label:'State',value:proposal.state,authority:'AGENT_CONTROL',evidence:[`poe-proposal:${proposal.id}`]},{label:'Comparable',value:proposal.fairness.comparable,authority:'AGENT_CONTROL',evidence:[`poe-proposal:${proposal.id}:fairness`]},{label:'Blocking fairness findings',value:proposal.fairness.findings.filter(item=>item.severity==='BLOCKING').length,authority:'AGENT_CONTROL',evidence:[`poe-proposal:${proposal.id}:fairness`]},{label:'Repetitions',value:proposal.repetitions,authority:'OPERATOR',evidence:[`poe-proposal:${proposal.id}:revision:${proposal.revision}`]},{label:'Work Parcel',value:proposal.execution?.parcelId??null,authority:proposal.execution?'AGENT_CONTROL':'UNAVAILABLE',evidence:proposal.execution?[`parcel:${proposal.execution.parcelId}`]:[],limitation:proposal.execution?undefined:'Not submitted.'}],related:proposal.execution?[{kind:'parcel',id:proposal.execution.parcelId}]:[]};}
