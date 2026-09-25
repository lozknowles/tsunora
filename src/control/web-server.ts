import type {LabourExchange} from './labour-exchange.js';
import type {WorkOrder} from './labour-types.js';
import os from 'node:os';
import {estateResourceAlias} from './estate-remote.js';
import type {EstateDiscovery} from './estate-discovery.js';
import {FactoryStream} from './factory-stream.js';
import {VoiceError, type VoiceTransportRuntime} from './voice-transport.js';
import {isAndroidUserspace,observeAndroid} from './android-environment.js';
import {DefaultDiscoveryProbe} from './environment-discovery.js';
import {usageQuerySchema} from './usage-projection.js';
import {publicRuntimeMap,publicDiscoveryProjection} from './public-runtime-map.js';
import {createHash, timingSafeEqual} from 'node:crypto';
import fs from 'node:fs';
import type {ArchitectureDiagnostics} from './architecture-diagnostics.js';
import http, {type IncomingMessage, type ServerResponse} from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {AgentControlService, ControlEvent} from './application-service.js';
import {parseOutputAuthorityScope, parseOutputExpansionRequest} from './token-aware-output.js';
import {JobManifestError} from './job-catalog.js';
import {configPath, loadConfig} from './config.js';
import {ConfigurationStore} from './configuration-store.js';
import {ParameterizedJobError} from './parameterized-job-registry.js';
import type {OpenWAAdapter} from './openwa.js';
import type {SocialVoiceCoordinator} from './social-voice.js';
import {redactSensitiveText} from './security-redaction.js';
import type {AdaptiveEvidenceKind, AdaptiveLeagueFilter} from './adaptive-orchestration.js';
import type {ExecutionSessionMode, ExecutionSessionSignal} from './execution-session.js';
import {projectUxSession, UX_SESSION_AUDIENCES, type UxSessionAnnotationStore, type UxSessionAudience, type UxSessionShareStore, type UxSessionStore} from './ux-session.js';
import type {SessionVaultRuntime} from './session-vault.js';
import {capabilityDefinition} from './capability-adapter-registry.js';
import type {SecurityAuditRuntime} from './security-audit.js';
import type {DirectInferenceRuntime} from './direct-inference.js';
import type {WorkBoardRuntime,BoardOperation,SchedulerResource} from './work-board.js';
import type {ContainmentSupervisor,KillScope} from './containment.js';
import type {ModelImprovementRuntime,ImprovementMode} from './model-improvement.js';
import {costRoutingProjection,explainConfiguredCostRouting} from './cost-routing-projection.js';
import type {CostRoutingLedger} from './cost-performance-routing.js';
import type {WorkspacePreferenceStore} from './workspace-preferences.js';

export interface WebServerOptions {labourExchange?:LabourExchange;labourEvidenceDirectory?:string;estate?:EstateDiscovery;estateEnabled?:boolean;diagnostics?:ArchitectureDiagnostics;factoryEnabled?:boolean;voiceTransport?:VoiceTransportRuntime;host?: string; port?: number; operatorToken?: string; operatorAuthorizer?: (request: IncomingMessage, authority: 'control.read' | 'control.mutate') => boolean; allowedOrigins?: string[]; assetsDir?: string; configFile?: string; costRoutingLedger?:CostRoutingLedger; openwa?:OpenWAAdapter; socialVoice?:SocialVoiceCoordinator; uxSessions?:UxSessionStore; uxSessionShares?:UxSessionShareStore; uxSessionAnnotations?:UxSessionAnnotationStore; uxSessionPlayerDir?:string;sessionVault?:SessionVaultRuntime; securityAudits?:SecurityAuditRuntime; directInference?:DirectInferenceRuntime; workBoards?:WorkBoardRuntime; containment?:ContainmentSupervisor; workspacePreferences?:WorkspacePreferenceStore; modelImprovement?:ModelImprovementRuntime;}
const MAX_BODY = 64 * 1024;
const SECRET_KEY = /token|secret|password|credential|authorization|cookie|api[-_]?key/i;
const SAFE_TOKEN_ACCOUNTING_KEY = /^(?:tokenAwareOutput|tokenBatonRouting|providerReportedTokens|contextTokens|contextLimitTokens|contextTokensAvoided|contextTokensSaved|evidenceTokens|estimatedTokensOriginal|estimatedTokensReturned|estimatedTokensSaved|estimatedOriginalTokens|estimatedReturnedTokens|estimatedTokensAvoided|expansionTokensReturned|inputTokens|freshInputTokens|cachedInputTokens|reusedTokens|processedPromptTokens|retainedPromptTokens|cacheWriteTokens|outputTokens|maximumInputTokens|maximumOutputTokens|maximumContextTokens|maximumEvidenceTokens|reasoningTokens|totalTokens|totalProcessedTokens|startupContextTokens|taskContextTokens|retrievedContextTokens|repositoryContextTokens|conversationHistoryTokens|totalEstimatedContextTokens|repeatedContextCostEstimate|tokenEfficiency|tokensPerSuccessfulTask|freshTokensPerSuccessfulTask|tokensPerVerifiedOutcome|freshTokensPerVerifiedOutcome|estimatedTokens|limitTokens|tokensLimit|tokensRemaining|draftTokens|bestDraftTokens|tokensPerSecond|baselineTokensPerSecond|bestSpeculativeTokensPerSecond|energyPerToken|contextPercent|continuePercent|prepareBatonPercent|compactPercent|handoffPercent|prompt_tokens|completion_tokens|input_tokens|output_tokens|reasoning_tokens|total_tokens|cached_tokens|prompt_tokens_details|input_tokens_details|prompt_per_token_ms|predicted_per_token_ms|rateCeilingUsdPerMillionTokens|tokenCeiling|inputTokensEstimated|outputTokensRequested)$/;
const SAFE_CONFIG_REFERENCE_KEY = /^(?:credentialEnv|credentialFileEnv|credentialStore|credentialConfigured|credentialStatus|credentialReference|credentialNodeId|identityFile)$/;
const DOMAIN_STATUS = new Map<string, number>([
  ['diagnostic_permission_denied',403],['diagnostic_permission_invalid',400],['diagnostic_sources_invalid',400],['diagnostic_window_invalid',400],['diagnostic_inventory_stale',409],['diagnostic_assessment_missing',404],['diagnostic_permission_missing',404],
  ['approval_policy_required', 400], ['approval_policy_not_waiting', 409], ['run_not_retryable', 409], ['job_disabled', 409],
  ['job_missing', 404], ['run_missing', 404], ['schedule_missing', 404], ['artifact_missing', 404], ['system_missing', 404], ['system_check_unavailable', 409],
  ['output_handle_invalid', 404], ['output_handle_expired', 410], ['output_handle_scope_denied', 403],
  ['output_expansion_request_invalid', 400], ['output_expansion_mode_invalid', 400], ['token_aware_output_unconfigured', 503],
  ['output_expansion_unknown_field', 400], ['output_expansion_context_invalid', 400], ['output_expansion_file_required', 400],
  ['output_expansion_files_invalid', 400], ['output_expansion_lines_invalid', 400], ['output_expansion_range_invalid', 400],
  ['output_expansion_selector_unsupported', 400], ['output_expansion_selector_outside_result', 403],
  ['output_scope_invalid', 400], ['output_scope_unknown_field', 400], ['output_scope_identity_missing', 400], ['output_scope_generation_invalid', 400],
  ['execution_session_missing', 404], ['execution_session_runtime_unconfigured', 503], ['execution_session_adapter_unavailable', 503],
  ['execution_session_identity_invalid', 400], ['execution_session_text_required', 400], ['execution_session_sequence_invalid', 400], ['execution_session_input_invalid', 400],
  ['execution_session_observer_authority_required', 403], ['execution_session_operator_authority_required', 403], ['execution_session_attachment_actor_mismatch', 403], ['execution_session_watch_read_only', 403], ['execution_session_write_fenced', 403],
  ['execution_session_not_live', 409], ['execution_session_identity_mismatch', 409], ['execution_session_attachment_missing', 409], ['execution_session_interactive_attachment_held', 409],
  ['execution_session_mode_unsupported', 409], ['execution_session_input_unsupported', 409], ['execution_session_resize_unsupported', 409], ['execution_session_signal_unsupported', 409],
  ['execution_session_take_control_unsupported', 409], ['execution_session_take_control_reconciliation_unavailable', 409], ['execution_session_take_control_not_active', 409], ['execution_session_control_return_required', 409],
  ['workspace_identity_invalid',400],['workspace_reference_invalid',400],['workspace_search_cursor_invalid',400],['workspace_preferences_actor_required',400],['workspace_favourites_limit',409],['workspace_preferences_snapshot_invalid',409],['workspace_preferences_unconfigured',503],
  ['ux_session_missing',404],['ux_session_share_missing',404],['ux_session_share_denied',401],['ux_session_share_revoked',410],['ux_session_share_expired',410],['ux_session_event_missing',404],['ux_session_audience_invalid',400],['ux_session_annotation_empty',400],
  ['work_parcel_prompt_required', 400], ['work_parcel_plan_empty', 400], ['work_parcel_stage_id_invalid', 400], ['work_parcel_stage_invalid', 400], ['work_parcel_route_invalid', 400], ['work_parcel_reasoning_plan_invalid', 400], ['work_parcel_dependency_cycle', 400],
  ['work_parcel_reasoning_planner_unconfigured', 503], ['work_parcel_missing', 404], ['work_parcel_exists', 409], ['work_parcels_unconfigured', 503],
  ['parcel_success_criterion_invalid', 400], ['parcel_success_criterion_exists', 409], ['parcel_success_criterion_missing', 404], ['parcel_success_criterion_stage_missing', 404], ['parcel_success_criterion_evaluation_invalid', 400],
  ['parcel_question_invalid', 400], ['parcel_question_exists', 409], ['parcel_question_missing', 404], ['parcel_question_not_open', 409], ['parcel_question_origin_missing', 404], ['parcel_question_dependency_missing', 404], ['parcel_question_dependency_already_started', 409], ['parcel_question_answer_invalid', 400],
  ['parcel_steering_invalid', 400], ['parcel_steering_stage_missing', 404], ['parcel_steering_superseded_amendment_invalid', 409], ['parcel_context_event_chain_invalid', 409], ['parcel_context_event_hash_invalid', 409], ['parcel_baton_projection_budget_exceeded', 409],
  ['capability_intelligence_unconfigured', 503], ['capability_intelligence_snapshot_invalid', 409], ['capability_candidate_invalid', 400], ['capability_candidate_exists', 409], ['capability_candidate_missing', 404], ['capability_candidate_transition_invalid', 409], ['capability_candidate_classification_required', 400], ['capability_candidate_decision_required', 400], ['capability_route_unavailable', 409], ['capability_id_invalid', 400],
  ['model_intelligence_unconfigured', 503], ['model_qualification_suite_unconfigured', 503], ['model_intelligence_snapshot_invalid', 409], ['model_evaluation_batch_exists', 409], ['model_evaluation_batch_missing', 404], ['model_evaluation_batch_not_queued', 409], ['model_evaluation_batch_terminal', 409], ['model_evaluation_candidates_required', 400], ['model_evaluation_candidate_duplicate', 400], ['model_evaluation_suite_identity_mismatch', 409], ['model_status_transition_invalid', 409], ['model_qualified_transition_evidence_insufficient', 409], ['model_preferred_transition_requires_approval', 403], ['model_preferred_transition_evidence_insufficient', 409],
  ['job_runtime_unconfigured', 503],
  ['runtime_safety_decision_missing', 404], ['runtime_safety_decision_not_approvable', 409], ['runtime_safety_snapshot_invalid', 409],
  ['adaptive_orchestration_unconfigured', 503], ['adaptive_decision_missing', 404],
  ['poe_unconfigured', 503], ['poe_conversation_missing', 404], ['poe_proposal_missing', 404], ['poe_conversation_invalid', 400], ['poe_turn_invalid', 400], ['poe_channel_provenance_mismatch', 409], ['poe_conversation_actor_mismatch', 403],
  ['poe_operation_ownership_denied',403], ['poe_operation_approval_stale',409], ['poe_operation_readiness_blocked',409], ['poe_operator_unconfigured',503], ['poe_speech_validation_failed',502], ['poe_speech_interrupted',409], ['poe_proposal_revision_conflict', 409], ['poe_proposal_approval_stale', 409], ['poe_benchmark_unfair', 409], ['poe_benchmark_execution_unconfigured', 503], ['poe_benchmark_plan_invalid', 400], ['poe_benchmark_condition_invalid', 400], ['poe_benchmark_metric_invalid', 400], ['poe_voice_unconfigured', 503],
    ['provider_missing', 404], ['model_missing', 404], ['model_role_missing', 404], ['model_registry_unconfigured', 503], ['model_route_unconfigured', 409], ['model_route_unavailable', 409], ['model_fallback_disabled', 409], ['provider_authentication_required', 409], ['account_profile_missing', 404], ['account_profile_unavailable', 409],
    ['provider_catalog_unconfigured', 503], ['provider_catalog_model_missing', 404], ['provider_catalog_model_unavailable', 409], ['provider_discovery_disabled', 409], ['provider_discovery_adapter_unavailable', 409], ['provider_catalog_model_not_qualified', 409], ['provider_credential_format_invalid', 400], ['provider_catalog_adjudication_invalid', 400], ['provider_catalog_adjudication_exists', 409],
    ['identity_control_plane_unconfigured', 503], ['session_missing', 404], ['execution_missing', 404],
    ['execution_session_runtime_unconfigured', 503], ['execution_session_missing', 404], ['execution_session_attachment_missing', 404], ['execution_session_not_live', 409], ['execution_session_identity_mismatch', 409], ['execution_session_interactive_attachment_held', 409], ['execution_session_control_return_required', 409], ['execution_session_operator_authority_required', 403], ['execution_session_attachment_actor_mismatch', 403], ['execution_session_watch_read_only', 403], ['execution_session_write_fenced', 403], ['execution_session_input_invalid', 400], ['execution_session_resize_unsupported', 409], ['execution_session_signal_unsupported', 409], ['execution_session_input_unsupported', 409], ['execution_session_take_control_unsupported', 409], ['execution_session_take_control_reconciliation_unavailable', 409], ['execution_session_take_control_not_active', 409],
]);

export function startWebDashboard(service: AgentControlService, options: WebServerOptions = {}) {
  const host = options.host ?? '127.0.0.1', port = options.port ?? 4310;
  const assetsDir = options.assetsDir ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../assets/dashboard');
  const factory = options.factoryEnabled===false||process.env.AGENT_CONTROL_FACTORY_VIEW==='off'?null:new FactoryStream(()=>({...service.factorySource(),boards:options.workBoards?.list()??[],kills:options.containment?.list().kills??[]}));
  const unsubscribeFactory=factory&&service.events?.subscribe?service.events.subscribe(()=>factory.publish()):null;
  const estateStream=options.estate&&options.estateEnabled!==false&&process.env.AGENT_CONTROL_ESTATE_VIEW!=='off'?new FactoryStream(()=>options.estate!.projection(),250):null;
  const unsubscribeEstate=estateStream?options.estate!.subscribe(()=>estateStream.publish()):null;
  const server = http.createServer((request, response) => void handle(service, request, response, {...options, host, port, assetsDir},factory,estateStream).catch(error => replyError(response, error)));
  server.on('close',()=>{factory?.close();estateStream?.close();unsubscribeEstate?.();unsubscribeFactory?.();});
  server.listen(port, host);
  return server;
}

async function handle(service: AgentControlService, request: IncomingMessage, response: ServerResponse, options: Required<Pick<WebServerOptions, 'host' | 'port' | 'assetsDir'>> & WebServerOptions, factory:FactoryStream|null,estateStream:FactoryStream|null) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  response.setHeader('Cache-Control', 'no-store');
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${options.host}:${options.port}`}`);
  const method = request.method ?? 'GET';
  if(url.pathname.startsWith('/api/labour-exchange')){
    validateOperatorRequest(request,options);
    const exchange=options.labourExchange;if(!exchange)return json(response,503,{error:'labour_exchange_unconfigured'});
    if(method==='GET'&&url.pathname==='/api/labour-exchange')return json(response,200,exchange.projection());
    if(method==='GET'&&url.pathname==='/api/labour-exchange/events'){
      response.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','X-Accel-Buffering':'no'});
      const send=()=>{if(response.destroyed)return;if(response.writableLength>4*1024*1024){response.destroy();return;}response.write('data: '+JSON.stringify(redact(exchange.projection()))+'\n\n');};
      exchange.events.on('event',send);send();const heartbeat=setInterval(()=>{if(!response.destroyed)response.write(': heartbeat\n\n');},15000);
      response.on('close',()=>{clearInterval(heartbeat);exchange.events.off('event',send);});return;
    }
    if(method==='POST'&&url.pathname==='/api/labour-exchange/video-evidence'){
      validateOrigin(request,options);validateOperatorRequest(request,options,'control.mutate');
      if(!options.labourEvidenceDirectory)return json(response,503,{error:'labour_video_storage_unconfigured'});
      if(!(request.headers['content-type']??'').startsWith('video/webm'))return json(response,415,{error:'webm_required'});
      const chunks:Buffer[]=[];let size=0;
      for await(const chunk of request){const b=Buffer.from(chunk);size+=b.length;if(size>32*1024*1024)return json(response,413,{error:'video_too_large'});chunks.push(b);}
      const bytes=Buffer.concat(chunks);if(bytes.length<4||bytes.subarray(0,4).toString('hex')!=='1a45dfa3')return json(response,400,{error:'webm_header_required'});
      const hash=createHash('sha256').update(bytes).digest('hex'),name='labour-video-'+hash+'.webm',target=path.join(options.labourEvidenceDirectory,name);
      fs.mkdirSync(options.labourEvidenceDirectory,{recursive:true});if(!fs.existsSync(target))fs.writeFileSync(target,bytes,{flag:'wx',mode:0o600});
      const receipt={schema:'agent-control.labour-video-receipt/v1',name,sha256:hash,bytes:size,receivedAt:new Date().toISOString(),ledgerHead:exchange.ledger.events().at(-1)?.hash??null,authority:'BROWSER_CAPTURE_NOT_LEDGER_ATTESTATION'};
      fs.writeFileSync(target+'.json',JSON.stringify(receipt,null,2),{mode:0o600});return json(response,201,receipt);
    }
    if(method==='POST'&&url.pathname==='/api/labour-exchange/orders'){
      validateMutationRequest(request,options);const body=await readJson(request);return json(response,201,await exchange.submit(body as unknown as WorkOrder));
    }
    return json(response,404,{error:'not_found'});
  }
  if(url.pathname.startsWith('/api/estate/')){
    validateOperatorRequest(request,options);const e=options.estate;if(!e)return json(response,503,{error:'estate_unconfigured'});
    const suffix=url.pathname.slice('/api/estate'.length);
    if(method==='GET'){
      if(suffix==='/labels'){const labels:Record<string,string>={};if(url.searchParams.get('privacy')!=='public'){labels['host:controller-local']=os.hostname().slice(0,120);for(const r of e.options.config().resources){if(e.targets.some(t=>t.resourceId===r.id))labels[`host:${estateResourceAlias(r.id)}`]=String(r.name||r.id).slice(0,120);}}return json(response,200,{labels,authority:'AUTHENTICATED_OPERATOR_PRESENTATION_ONLY'});}
      if(suffix==='/catalog')return json(response,200,e.catalog());
      if(suffix==='/history')return json(response,200,e.history());
      if(suffix==='/search')return json(response,200,e.projection(url.searchParams.get('q')??''));
      if(suffix==='/events'){if(!estateStream)return json(response,404,{error:'estate_view_disabled'});estateStream.sample();return estateStream.connect(request,response);}
      if(suffix==='/snapshot'){if(!estateStream)return json(response,404,{error:'estate_view_disabled'});return json(response,200,estateStream.sample());}
      if(suffix==='/replay')return json(response,200,e.replay(url.searchParams.get('id')??e.latest()?.id??''));
    }
    if(method==='POST'){validateMutationRequest(request,options);const body=await readJson(request);
      if(suffix==='/permissions')return json(response,201,e.grant(body,'web-operator'));
      if(suffix==='/revoke')return json(response,200,e.revoke(String(body.permissionId??''),'web-operator'));
      if(suffix==='/runs'){e.assertPermission(String(body.permissionId??''),'web-operator');return json(response,201,service.createJobRun('discover-estate',{permissionId:body.permissionId},'web-operator'));}
      if(suffix==='/use'){const snapshot=e.snapshot(String(body.snapshotId??''));e.assertPermission(snapshot.permissionId,'web-operator');return json(response,201,service.createJobRun('estate-system-observation',{snapshotId:snapshot.id},'web-operator'));}
    }
    return json(response,404,{error:'not_found'});
  }
  if(url.pathname.startsWith('/api/environment-discovery/diagnostics')){
    validateOperatorRequest(request,options);const d=options.diagnostics;if(!d)throw httpError(503,'diagnostics_unconfigured');
    const suffix=url.pathname.slice('/api/environment-discovery/diagnostics'.length);
    if(method==='GET'&&suffix==='')return json(response,200,d.projection());
    const assessment=suffix.match(/^\/assessments\/(assessment-[a-f0-9-]+)(\/report)?$/);
    if(method==='GET'&&assessment){if(assessment[2]){const report=d.report(assessment[1]!);response.writeHead(200,{'Content-Type':'text/markdown; charset=utf-8'});return response.end(report);}return json(response,200,d.assessment(assessment[1]!));}
    if(method==='POST'){validateMutationRequest(request,options);const body=await readJson(request);
      if(suffix==='/enumerate')return json(response,200,await d.enumerate());
      if(suffix==='/permissions')return json(response,201,d.grant(body,'web-operator'));
      const revoke=suffix.match(/^\/permissions\/(permission-[a-f0-9-]+)\/revoke$/);if(revoke)return json(response,200,d.revoke(revoke[1]!,'web-operator'));
      if(suffix==='/runs'){d.assertPermission(String(body.permissionId??''));return json(response,201,service.createJobRun('architecture-health',{permissionId:body.permissionId},'web-operator'));}
    }
    return json(response,404,{error:'not_found'});
  }
  if(url.pathname.startsWith('/api/factory/')){
    validateOperatorRequest(request,options);
    if(!factory)return json(response,404,{error:'factory_view_disabled'});
    if(method!=='GET')return json(response,405,{error:'factory_read_only'});
    if(url.pathname==='/api/factory/events')return factory.connect(request,response);
    if(url.pathname==='/api/factory/snapshot')return json(response,200,factory.sample());
    if(url.pathname==='/api/factory/replay')return json(response,200,factory.journal.replay(url.searchParams.get('after')??undefined));
    return json(response,404,{error:'not_found'});
  }
  if (method === 'GET' && url.pathname === '/api/operator-auth') return json(response, 200, operatorAuthentication(request, options));
  if(method==='GET'&&url.pathname==='/api/model-improvement'){validateOperatorRequest(request,options);if(!options.modelImprovement)throw httpError(503,'model_improvement_unconfigured');return json(response,200,options.modelImprovement.projection());}
  if(method==='POST'&&url.pathname==='/api/model-improvement/mode'){validateMutationRequest(request,options);if(!options.modelImprovement)throw httpError(503,'model_improvement_unconfigured');const body=await readJson(request);return json(response,200,{mode:options.modelImprovement.setMode(String(body.mode??'') as ImprovementMode)});}
  const improvementPromotion=url.pathname.match(/^\/api\/model-improvement\/experiments\/([^/]+)\/promotion$/);
  if(method==='POST'&&improvementPromotion){validateMutationRequest(request,options);if(!options.modelImprovement)throw httpError(503,'model_improvement_unconfigured');const body=await readJson(request),id=decodeURIComponent(improvementPromotion[1]!);return json(response,200,options.modelImprovement.decidePromotion(id,{approved:body.approved===true,actor:'web-operator',reason:String(body.reason??''),evidence:Array.isArray(body.evidence)?body.evidence.map(String):[],candidateSha256:String(body.candidateSha256??''),proposalSha256:String(body.proposalSha256??'')}));}
  const workBoardMatch=url.pathname.match(/^\/api\/work-boards(?:\/([^/]+)(?:\/(operation|proposal|reconcile))?)?$/);
  if(method==='GET'&&workBoardMatch){validateOperatorRequest(request,options);if(!options.workBoards)throw httpError(503,'work_boards_unconfigured');const id=workBoardMatch[1]&&decodeURIComponent(workBoardMatch[1]);return json(response,200,id?options.workBoards.get(id):{boards:options.workBoards.list()});}
  if(method==='POST'&&workBoardMatch){validateMutationRequest(request,options);if(!options.workBoards)throw httpError(503,'work_boards_unconfigured');const body=await readJson(request),id=workBoardMatch[1]&&decodeURIComponent(workBoardMatch[1]),action=workBoardMatch[2],actor='web-operator';if(!id)return json(response,201,options.workBoards.create({id:typeof body.id==='string'?body.id:undefined,title:String(body.title??''),workspace:String(body.workspace??''),project:String(body.project??''),lanes:Array.isArray(body.lanes)?body.lanes as never:undefined,actor}));if(action==='operation')return json(response,200,options.workBoards.apply(id,Number(body.expectedVersion),body.operation as BoardOperation,actor,String(body.reason??'web-operator')));if(action==='proposal'){const proposal=options.workBoards.proposal(id,String(body.instruction??''),{actor,itemId:typeof body.itemId==='string'?body.itemId:undefined,referenceItems:body.referenceItems&&typeof body.referenceItems==='object'?body.referenceItems as Record<string,string>:undefined});return body.apply===true?json(response,200,options.workBoards.applyProposal(id,Number(body.expectedVersion),proposal,actor)):json(response,200,proposal);}if(action==='reconcile')return json(response,200,options.workBoards.reconcile(id,Number(body.expectedVersion),Array.isArray(body.resources)?body.resources as SchedulerResource[]:[],actor));}
  if(method==='POST'&&url.pathname==='/api/containment/preview'){validateMutationRequest(request,options);if(!options.containment)throw httpError(503,'containment_unconfigured');const body=await readJson(request);return json(response,200,options.containment.preview(body.scope as KillScope));}
  if(method==='POST'&&url.pathname==='/api/containment/kill'){validateMutationRequest(request,options);if(!options.containment)throw httpError(503,'containment_unconfigured');const body=await readJson(request);return json(response,200,await options.containment.kill(body.scope as KillScope,'web-operator',String(body.reason??'')));}
  if(method==='GET'&&url.pathname==='/api/containment/timeline'){validateOperatorRequest(request,options);if(!options.containment)throw httpError(503,'containment_unconfigured');return json(response,200,options.containment.timeline());}
  const directEvidence=url.pathname.match(/^\/api\/lab\/direct-inference\/evidence\/(direct-inference%3A[a-f0-9]{64}|direct-inference:[a-f0-9]{64})$/i);
  if(method==='GET'&&directEvidence){validateOperatorRequest(request,options);if(!options.directInference)throw httpError(503,'direct_inference_unconfigured');return json(response,200,options.directInference.evidence(decodeURIComponent(directEvidence[1])));}
  if(method==='POST'&&url.pathname==='/api/lab/direct-inference'){
    validateMutationRequest(request,options);if(!options.directInference)throw httpError(503,'direct_inference_unconfigured');const body=await readJson(request);
    return json(response,200,await options.directInference.invoke({prompt:String(body.prompt??''),...(typeof body.model==='string'?{model:body.model}:{}),...(typeof body.modelRole==='string'?{modelRole:body.modelRole}:{}),nodeId:String(body.nodeId??''),requiredCapabilities:Array.isArray(body.requiredCapabilities)?body.requiredCapabilities.map(String):undefined,maximumOutputTokens:body.maximumOutputTokens===undefined?undefined:Number(body.maximumOutputTokens),timeoutMs:body.timeoutMs===undefined?undefined:Number(body.timeoutMs),jobId:typeof body.jobId==='string'?body.jobId:undefined,runId:typeof body.runId==='string'?body.runId:undefined,stepId:typeof body.stepId==='string'?body.stepId:undefined}));
  }
  const securityAuditMatch=url.pathname.match(/^\/api\/security-audits(?:\/([^/]+)(?:\/(resume|coverage|findings|export|revalidate))?)?$/);
  if(method==='GET'&&securityAuditMatch){
    validateOperatorRequest(request,options);if(!options.securityAudits)throw httpError(503,'security_audit_unconfigured');const id=securityAuditMatch[1]&&decodeURIComponent(securityAuditMatch[1]),action=securityAuditMatch[2];
    if(!id)return json(response,200,{audits:options.securityAudits.list()});
    if(!action)return json(response,200,options.securityAudits.get(id));
    if(action==='coverage')return json(response,200,{auditId:id,coverage:options.securityAudits.get(id).coverage});
    if(action==='findings'){const verdict=url.searchParams.get('verdict');const findings=options.securityAudits.get(id).findings.filter(item=>!verdict||item.verdict===verdict);return json(response,200,{auditId:id,findings});}
    if(action==='export'){const result=options.securityAudits.export(id,String(url.searchParams.get('report')??'report') as never);return json(response,200,{name:path.basename(result.path),sha256:result.sha256,content:result.content});}
  }
  if(method==='GET'&&url.pathname==='/api/security-audit-comparison'){validateOperatorRequest(request,options);if(!options.securityAudits)throw httpError(503,'security_audit_unconfigured');return json(response,200,options.securityAudits.compare(String(url.searchParams.get('left')??''),String(url.searchParams.get('right')??'')));}
  if(method==='POST'&&securityAuditMatch){
    validateMutationRequest(request,options);if(!options.securityAudits)throw httpError(503,'security_audit_unconfigured');const body=await readJson(request),id=securityAuditMatch[1]&&decodeURIComponent(securityAuditMatch[1]),action=securityAuditMatch[2],actor='web-operator';
    if(!id){const audit=options.securityAudits.start({repositoryRoot:String(body.repositoryRoot??''),scope:Array.isArray(body.scope)?body.scope.map(String):undefined,sourceRevision:String(body.sourceRevision??''),baselineAuditId:typeof body.baselineAuditId==='string'?body.baselineAuditId:undefined,sandbox:body.sandbox&&typeof body.sandbox==='object'&&!Array.isArray(body.sandbox)?body.sandbox as never:undefined,actor});const run=service.createJobRun('security-audit',{auditId:audit.id},actor);return json(response,201,{audit:options.securityAudits.linkRun(audit.id,run.id,actor),run});}
    if(action==='resume'){if(typeof body.sourceRoot!=='string'||!body.sourceRoot.trim())throw httpError(400,'security_audit_source_snapshot_required');const audit=options.securityAudits.resume(id,actor),run=service.createJobRun('security-audit-continuation',{auditId:id,sourceRoot:body.sourceRoot},actor);return json(response,202,{audit:options.securityAudits.linkRun(id,run.id,actor),run});}
    if(action==='revalidate')return json(response,200,options.securityAudits.revalidate(id,String(body.sourceRevision??''),Array.isArray(body.changedFiles)?body.changedFiles.map(String):[],actor));
  }
  if (url.pathname === '/api/integrations/openwa/webhook' && method === 'POST') {
    if (!options.openwa) return json(response,503,{error:'integration_disabled'});
    const chunks: Buffer[] = []; let size=0;
    for await(const chunk of request) { size+=chunk.length; if(size>MAX_BODY) throw httpError(413,'request_too_large'); chunks.push(Buffer.from(chunk)); }
    try { return json(response,200,options.openwa.receive(Buffer.concat(chunks),request.headers)); }
    catch { return json(response,403,{error:'webhook_rejected'}); }
  }
  if(method==='GET'&&url.pathname==='/api/session-vault'){validateOperatorRequest(request,options);if(!options.sessionVault)throw httpError(503,'session_vault_unconfigured');return json(response,200,options.sessionVault.projection());}
  if(method==='GET'&&url.pathname==='/api/session-vault/search'){validateOperatorRequest(request,options);if(!options.sessionVault)throw httpError(503,'session_vault_unconfigured');return json(response,200,{query:url.searchParams.get('q')??'',results:options.sessionVault.search(url.searchParams.get('q')??'',Number(url.searchParams.get('limit')??20))});}
  if(method==='GET'&&url.pathname==='/api/session-vault/discover'){validateOperatorRequest(request,options);if(!options.sessionVault)throw httpError(503,'session_vault_unconfigured');return json(response,200,await options.sessionVault.discover(url.searchParams.get('provider')??undefined));}
  if(method==='POST'&&url.pathname==='/api/session-vault/capture'){validateMutationRequest(request,options);if(!options.sessionVault)throw httpError(503,'session_vault_unconfigured');const body=await readJson(request);return json(response,201,await options.sessionVault.capture(String(body.providerId??''),String(body.nativeId??'')));}
  const sharedSession=url.pathname.match(/^\/api\/share\/ux\/([^/]+)$/);
  if(method==='GET'&&sharedSession){
    if(!options.uxSessions||!options.uxSessionShares)throw httpError(503,'ux_session_runtime_unconfigured');
    const token=request.headers.authorization?.replace(/^Bearer\s+/i,'')??'',share=options.uxSessionShares.resolve(decodeURIComponent(sharedSession[1]),token),record=readUxSession(options.uxSessions,share.sessionId);
    if(record.sha256!==share.sessionSha256)throw httpError(409,'ux_session_share_integrity_failed');
    return json(response,200,{...projectUxSession(record,share.audience),annotations:options.uxSessionAnnotations?.list(record.id,share.audience)??[]});
  }
  if(method==='GET'&&(/^\/share\/ux\/[^/]+$/.test(url.pathname)||['/session-player.css','/session-player.js'].includes(url.pathname))){
    const root=options.uxSessionPlayerDir??path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../assets/session-player');
    const asset=url.pathname.endsWith('.css')?'session-player.css':url.pathname.endsWith('.js')?'session-player.js':'index.html';
    return serveUxPlayerAsset(response,root,asset);
  }
  if (url.pathname.startsWith('/api/')) validateOperatorRequest(request, options);
  if(url.pathname.startsWith('/api/voice/')) {
    const voice=options.voiceTransport;
    if(!voice)throw httpError(503,'voice_transport_unconfigured');
    try {
      if(method==='GET'&&url.pathname==='/api/voice/availability')return json(response,200,voice.availability());
      if(method==='GET'&&url.pathname==='/api/voice/sessions')return json(response,200,voice.list(url.searchParams.get('conversationId')??'','web-operator'));
      if(method==='POST'&&url.pathname==='/api/voice/sessions'){
        validateMutationRequest(request,options);const body=await readJson(request);
        return json(response,201,await voice.start(String(body.conversationId??''),'web-operator',String(body.sdp??'')));
      }
      const match=url.pathname.match(/^\/api\/voice\/sessions\/([^/]+)(?:\/(heartbeat|close|stop-speaking|history))?$/);
      if(match){const id=decodeURIComponent(match[1]!);
        if(method==='GET'&&match[2]==='history')return json(response,200,{history:voice.history(id,'web-operator')});
        if(method==='GET'&&!match[2])return json(response,200,voice.get(id,'web-operator'));
        if(method==='POST'){validateMutationRequest(request,options);
          if(match[2]==='heartbeat')return json(response,200,voice.heartbeat(id,'web-operator'));
          if(match[2]==='close')return json(response,200,await voice.close(id,'web-operator'));
          if(match[2]==='stop-speaking')return json(response,200,voice.stopSpeaking(id,'web-operator'));
        }
      }
      throw httpError(404,'voice_route_missing');
    }catch(error){if(error instanceof VoiceError)return json(response,error.status,{error:error.code,domain:error.domain,textAvailable:true});throw error;}
  }

  const uxSessionMatch=url.pathname.match(/^\/api\/ux-sessions\/([^/]+)(?:\/(shares|annotations))?$/);
  if(method==='GET'&&url.pathname==='/api/ux-sessions'){validateOperatorRequest(request,options);if(!options.uxSessions)throw httpError(503,'ux_session_runtime_unconfigured');return json(response,200,options.uxSessions.list().map(record=>({id:record.id,title:record.title,startedAt:record.startedAt,completedAt:record.completedAt,sha256:record.sha256,outcome:record.outcome})));}
  if(method==='GET'&&uxSessionMatch&&!uxSessionMatch[2]){validateOperatorRequest(request,options);if(!options.uxSessions)throw httpError(503,'ux_session_runtime_unconfigured');return json(response,200,projectUxSession(readUxSession(options.uxSessions,decodeURIComponent(uxSessionMatch[1])),'AUTHORISED_FULL_EVIDENCE'));}
  if(method==='POST'&&uxSessionMatch){
    validateMutationRequest(request,options);if(!options.uxSessions)throw httpError(503,'ux_session_runtime_unconfigured');const record=readUxSession(options.uxSessions,decodeURIComponent(uxSessionMatch[1])),body=await readJson(request);
    if(uxSessionMatch[2]==='shares'){if(!options.uxSessionShares)throw httpError(503,'ux_session_runtime_unconfigured');const audience=String(body.audience??'EXECUTION_OVERVIEW') as UxSessionAudience;if(!UX_SESSION_AUDIENCES.includes(audience))throw httpError(400,'ux_session_audience_invalid');return json(response,201,options.uxSessionShares.create(record,audience,{expiresAt:typeof body.expiresAt==='string'?body.expiresAt:undefined}));}
    if(uxSessionMatch[2]==='annotations'){if(!options.uxSessionAnnotations)throw httpError(503,'ux_session_runtime_unconfigured');const audience=String(body.audience??'AUTHORISED_FULL_EVIDENCE') as UxSessionAudience;if(!UX_SESSION_AUDIENCES.includes(audience))throw httpError(400,'ux_session_audience_invalid');return json(response,201,options.uxSessionAnnotations.add(record,{eventId:String(body.eventId??''),reviewerId:'web-operator',comment:String(body.comment??''),audience,workParcelId:typeof body.workParcelId==='string'?body.workParcelId:undefined}));}
  }
  if(url.pathname==='/api/social-voice/summary' || url.pathname==='/api/social-voice/approval' || url.pathname==='/api/social-voice/approval-grant'){
    validateOperatorRequest(request,options);validateMutationRequest(request,options);
    if(method!=='POST')return json(response,405,{error:'method_not_allowed'});
    const body=await readJson(request);
    if(!options.openwa||!options.socialVoice||typeof body.sender!=='string')return json(response,400,{error:'social_configuration_required'});
    if(url.pathname.endsWith('/summary')){if(typeof body.reference!=='string'||typeof body.requestKey!=='string')return json(response,400,{error:'invalid_summary'});return json(response,200,await options.socialVoice.requestSummary({channel:'openwa',account:options.openwa.config.sessionId,sender:body.sender,conversation:body.sender},body.reference,body.requestKey));}
    if(url.pathname.endsWith('approval-grant')){if(typeof body.enabled!=='boolean')return json(response,400,{error:'invalid_grant'});return json(response,200,options.openwa.grantSocialApproval(body.sender,body.enabled));}
    if(typeof body.parcel!=='string'||typeof body.run!=='string'||typeof body.action!=='string')return json(response,400,{error:'invalid_approval'});
    return json(response,200,await options.socialVoice.requestApproval({channel:'openwa',account:options.openwa.config.sessionId,sender:body.sender,conversation:body.sender},body.parcel,body.run,body.action));
  }
  if(url.pathname==='/api/social-voice'||url.pathname==='/api/social-voice/transcript'){
    validateOperatorRequest(request,options);
    if(method!=='GET')return json(response,405,{error:'method_not_allowed'});
    return json(response,200,url.pathname.endsWith('/transcript')?{transcript:options.socialVoice?.transcript()??''}:options.socialVoice?.projection()??{state:'not_configured'});
  }

  if (url.pathname.startsWith('/api/integrations/openwa')) {
    validateOperatorRequest(request,options);
    if (!options.openwa) return json(response,200,{enabled:false,state:'not_configured'});
    const action=url.pathname.slice('/api/integrations/openwa'.length);
    if(method==='GET' && !action) return json(response,200,options.openwa.status());
    if(method==='POST') {
      validateMutationRequest(request,options); const body=await readJson(request);
      try {
        let result: unknown = {ok:true};
        if(action==='/enabled' && typeof body.enabled==='boolean') options.openwa.setEnabled(body.enabled);
        else if(action==='/health') result=await options.openwa.checkHealth();
        else if(action==='/qr') result=await options.openwa.qr();
        else if(action==='/reconnect') result=await options.openwa.reconnectSession();
        else if(action==='/pair') result=options.openwa.beginPairing();
        else if(action==='/confirm' && typeof body.hash==='string' && Array.isArray(body.grants) && body.grants.every(v=>typeof v==='string')) result=options.openwa.confirmPairing(body.hash,body.grants as string[]);
        else if(action==='/revoke' && typeof body.sender==='string') options.openwa.revoke(body.sender);
        else if(action==='/preferences' && typeof body.sender==='string' && typeof body.progress==='boolean') options.openwa.preferences(body.sender,body.progress);
        else if(action==='/retry' && Number.isSafeInteger(body.id)) options.openwa.retry(body.id as number,body.acknowledgeUncertain===true);
        else return json(response,400,{error:'invalid_integration_request'});
        return json(response,200,result);
      } catch { return json(response,409,{error:'integration_action_unavailable_check_connection_pairing_and_grants'}); }
    }
    return json(response,404,{error:'not_found'});
  }

  if(method==='GET'&&url.pathname==='/api/deployment'){validateOperatorRequest(request,options);return json(response,200,isAndroidUserspace()?await observeAndroid(new DefaultDiscoveryProbe()):{profile:'STANDARD',localModelRequired:false});}
  if (method === 'GET' && url.pathname === '/api/status') return json(response, 200, service.snapshot());
  if(method==='GET'&&url.pathname==='/api/poe/regression'){validateOperatorRequest(request,options);return json(response,200,service.poeRegression());}
  if(method==='GET'&&url.pathname==='/api/poe/knowledge'){validateOperatorRequest(request,options);return json(response,200,service.poeKnowledge());}
  const knowledgeSource=url.pathname.match(/^\/api\/poe\/knowledge\/sources\/([^/]+)$/);if(method==='GET'&&knowledgeSource){validateOperatorRequest(request,options);return json(response,200,service.poeKnowledgeSource(decodeURIComponent(knowledgeSource[1])));}
  const greetingMatch=url.pathname.match(/^\/api\/poe\/conversations\/([^/]+)\/greeting$/);if(method==='POST'&&greetingMatch){validateOrigin(request,options);validateOperatorRequest(request,options);return json(response,200,service.greetPoe(decodeURIComponent(greetingMatch[1]),'web-operator'));}
  const operatorApi=url.pathname.match(/^\/api\/poe\/conversations\/([^/]+)\/(operator|approve-job|speech|speech-stream|transcribe|greeting)$/);
  if(operatorApi){
    validateOperatorRequest(request,options); const id=decodeURIComponent(operatorApi[1]!);
    if(method==='GET'&&operatorApi[2]==='operator')return json(response,200,await service.poeOperator(id,'web-operator'));
    if(method==='POST'){
      validateOrigin(request,options);
      if(operatorApi[2]==='transcribe') {const bytes=await readBounded(request,8*1024*1024);return json(response,200,await service.transcribePoe(id,bytes,String(request.headers['content-type']??'').split(';')[0]!, 'web-operator'));}
      const body=await readJson(request);
      if(operatorApi[2]==='approve-job')return json(response,202,service.approvePoeOperator(id,String(body.proposalId??''),String(body.hash??''),'web-operator'));
      if(operatorApi[2]==='speech-stream'){
        const conversation=service.poeConversation(id);if(conversation.actorId!=='web-operator')throw Error('poe_conversation_actor_mismatch');
        const turnId=String(body.turnId??'');const stream=service.sharedSpeakPoe(id,turnId,'web-operator');
        response.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-store','x-accel-buffering':'no'});
        const cancel=()=>{if(!response.writableEnded)service.interruptPoe(id,'web-operator',turnId);};response.once('close',cancel);
        try{for await(const event of stream){if(response.destroyed)break;if(!response.write('data: '+JSON.stringify(event)+'\n\n'))await new Promise<void>(resolve=>{const done=()=>{response.off('drain',done);response.off('close',done);resolve();};response.once('drain',done);response.once('close',done);});}}catch{if(!response.destroyed)response.write('data: '+JSON.stringify({type:'speech.failed',error:'shared_speech_unavailable',turnId})+'\n\n');}finally{response.off('close',cancel);response.end();}return;
      }
      if(operatorApi[2]==='speech'){const audio=await service.speakPoe(id,String(body.turnId??''),'web-operator');return json(response,200,{...audio,bytes:Buffer.from(audio.bytes).toString('base64')});}
    }
  }
  if(method==='GET'&&url.pathname==='/api/personal-league'){validateOperatorRequest(request,options);return json(response,200,service.personalLeague(String(url.searchParams.get('benchmark')??''),String(url.searchParams.get('comparison')??'')));}
  if(method==='GET'&&url.pathname==='/api/model-watches'){validateOperatorRequest(request,options);return json(response,200,service.modelWatchProjection());}
  if(method==='GET'&&url.pathname==='/api/poe/voice-epoch'){validateOperatorRequest(request,options);return json(response,200,{incarnation:service.poeProjection().voice.incarnation});}
  if (method === 'GET' && url.pathname === '/api/poe') { validateOperatorRequest(request, options); return json(response, 200, service.poeProjection()); }
  if (method === 'GET' && url.pathname === '/api/configuration') { validateOperatorRequest(request, options); return json(response, 200, new ConfigurationStore(options.configFile ?? configPath()).read()); }
  if (method === 'GET' && url.pathname === '/api/environment-discovery') { validateOperatorRequest(request, options); return json(response, 200, url.searchParams.get('privacy')==='public'?publicDiscoveryProjection(service.environmentDiscoveryProjection()):service.environmentDiscoveryProjection()); }
  if (method === 'GET' && url.pathname === '/api/estate-heartbeat') { validateOperatorRequest(request, options); return json(response,200,service.estateHeartbeat()); }
  if (method === 'GET' && url.pathname === '/api/estate-map') { validateOperatorRequest(request, options); return json(response, 200, url.searchParams.get('privacy')==='public'?publicRuntimeMap(service.estateMap()):service.estateMap()); }
  if (method === 'GET' && url.pathname === '/api/capability-adapters') { validateOperatorRequest(request, options); return json(response, 200, service.capabilityAdapterProjection()); }
  const capabilityAdapterExportMatch = url.pathname.match(/^\/api\/capability-adapters\/([^/]+)\/export$/);
  if (method === 'GET' && capabilityAdapterExportMatch) { validateOperatorRequest(request, options); return json(response, 200, service.exportCapabilityAdapter(decodeURIComponent(capabilityAdapterExportMatch[1]))); }
  if (method === 'GET' && url.pathname === '/api/installation') { validateOperatorRequest(request, options); return json(response, 200, service.installationProjection()); }
  if (method === 'GET' && url.pathname === '/api/lanes') return json(response, 200, service.snapshot().lanes);
  if (method === 'GET' && url.pathname === '/api/providers') return json(response, 200, service.snapshot().providers);
  if (method === 'GET' && url.pathname === '/api/models/providers') return json(response, 200, service.modelProviders());
  if (method === 'GET' && url.pathname === '/api/models/accounts') return json(response, 200, service.modelAccountProfiles());
  if (method === 'GET' && url.pathname === '/api/models') return json(response, 200, service.models());
  if (method === 'GET' && url.pathname === '/api/models/routes') return json(response, 200, service.modelRoutes());
  if (method === 'GET' && url.pathname === '/api/capability-intelligence') return json(response, 200, service.capabilityIntelligenceProjection());
  if (method === 'GET' && url.pathname === '/api/model-intelligence') return json(response, 200, service.modelIntelligenceProjection());
  if (method === 'GET' && url.pathname === '/api/provider-catalog') return json(response, 200, service.providerCatalogProjection());
  if (method === 'GET' && url.pathname === '/api/routing/cost-performance') return json(response,200,costRoutingProjection(loadConfig(options.configFile ?? configPath())));
  if (method === 'GET' && url.pathname === '/api/runtime-safety') return json(response, 200, service.runtimeSafetyDecisions(url.searchParams.get('runId') ?? undefined));
  if (method === 'GET' && url.pathname === '/api/sessions') return json(response, 200, service.sessions());
  if (method === 'GET' && url.pathname === '/api/context-transfers') return json(response, 200, service.contextTransfers(url.searchParams.get('sessionId') ?? undefined));
  if (method === 'GET' && url.pathname === '/api/delegations') return json(response, 200, service.delegations(url.searchParams.get('sessionId') ?? undefined));
  if (method === 'GET' && url.pathname === '/api/executions') return json(response, 200, service.executionProvenance());
  if (method === 'GET' && url.pathname === '/api/fast-execution-attempts') return json(response, 200, service.fastExecutionAttempts());
  if (method === 'GET' && url.pathname === '/api/runtime') return json(response, 200, service.runtime());
  const observabilityMatch=url.pathname.match(/^\/api\/observability\/(nodes|runs)\/([^/]+)(?:\/(resources))?$/);
  if(method==='GET'&&observabilityMatch){
    validateOperatorRequest(request,options);
    const id=decodeURIComponent(observabilityMatch[2]);
    if(id.length>240)throw httpError(400,'observability_identity_invalid');
    if(observabilityMatch[1]==='nodes')return json(response,200,observabilityMatch[3]?await service.nodeDashboardResources(id):service.nodeDashboard(id));
    if(observabilityMatch[3])throw httpError(404,'observability_route_missing');
    return json(response,200,service.runInspector(id,url.searchParams.get('operation')??undefined));
  }
  if(method==='GET'&&url.pathname==='/api/workspaces'){validateOperatorRequest(request,options);const query=url.searchParams.get('query'),cursor=url.searchParams.get('cursor'),limit=url.searchParams.get('limit');return json(response,200,query!==null||cursor!==null||limit!==null?service.searchWorkspaces({query:query??'',cursor,limit:limit===null?undefined:Number(limit)}):service.workspaces());}
  if(method==='GET'&&url.pathname==='/api/workspace-preferences'){validateOperatorRequest(request,options);if(!options.workspacePreferences)throw httpError(503,'workspace_preferences_unconfigured');return json(response,200,options.workspacePreferences.list('web-operator'));}
  if(method==='POST'&&url.pathname==='/api/workspace-preferences/favourite'){validateMutationRequest(request,options);if(!options.workspacePreferences)throw httpError(503,'workspace_preferences_unconfigured');const body=await readJson(request);return json(response,200,options.workspacePreferences.set('web-operator',String(body.workspaceId??''),body.favourite===true));}
  const workspaceMatch=url.pathname.match(/^\/api\/workspaces\/([^/]+)$/);
  if(method==='GET'&&workspaceMatch){validateOperatorRequest(request,options);const id=decodeURIComponent(workspaceMatch[1]!);if(id.length>1024)throw httpError(400,'workspace_identity_invalid');return json(response,200,service.workspace(id));}
  if (method === 'GET' && url.pathname === '/api/runtime-map') { validateOperatorRequest(request, options); const replayAt=url.searchParams.get('at')??undefined;if(replayAt&&Number.isNaN(Date.parse(replayAt)))throw httpError(400,'runtime_map_replay_time_invalid');if(url.searchParams.has('runId'))return json(response,200,service.runtimeRunMap(url.searchParams.get('runId')!));return json(response,200,service.runtimeMap(url.searchParams.get('parcelId')??undefined,replayAt)); }
  if (method === 'GET' && url.pathname === '/api/runtime-map/compare') { validateOperatorRequest(request, options); const left=url.searchParams.get('left'),right=url.searchParams.get('right');if(!left||!right)throw httpError(400,'runtime_map_compare_ids_required');return json(response,200,service.compareRuntimeMaps(left,right)); }
  if (method === 'GET' && url.pathname === '/api/token-routing') return json(response, 200, service.tokenRouting());
  if (method === 'GET' && url.pathname === '/api/retrieval') return json(response, 200, service.retrievalProjection());
  if (method === 'GET' && url.pathname === '/api/router') return json(response, 200, service.allRoutes());
  if (method === 'GET' && url.pathname === '/api/evidence') return json(response, 200, service.snapshot().lanes.map(lane => ({laneId: lane.id, task: lane.task, verification: lane.verification, batonEvidence: lane.baton.evidence, contextSourceIds: lane.baton.contextSourceIds})));
  if (method === 'GET' && url.pathname === '/api/events') return eventStream(service, request, response);
  if (method === 'GET' && url.pathname === '/api/jobs') return json(response, 200, service.jobs());
  if (method === 'GET' && url.pathname === '/api/agent-templates') return json(response, 200, service.agentTemplates());
  if (method === 'GET' && url.pathname === '/api/job-definitions') return json(response, 200, service.jobDefinitions());
  if (method === 'GET' && url.pathname === '/api/saved-jobs') return json(response, 200, service.savedJobs());
  if (method === 'GET' && url.pathname === '/api/job-schedules') return json(response, 200, service.parameterizedSchedules());
  if (method === 'GET' && url.pathname === '/api/job-runs') return json(response, 200, service.parameterizedRuns(url.searchParams.get('savedJobId') ?? undefined));
  if (method === 'GET' && url.pathname === '/api/parcels') return json(response, 200, service.parcels());
  if (method === 'GET' && url.pathname === '/api/schedules') return json(response, 200, service.schedules());
  if (method === 'GET' && url.pathname === '/api/runs') return json(response, 200, service.runs(url.searchParams.get('jobId') ?? undefined));
  if (method === 'GET' && url.pathname === '/api/queue') return json(response, 200, service.jobQueue());
  if (method === 'GET' && url.pathname === '/api/workers') return json(response, 200, service.workers());
  if (method === 'GET' && url.pathname === '/api/nodes') return json(response, 200, service.nodes());
  if (method === 'GET' && url.pathname === '/api/systems') return json(response, 200, service.systems());
  if (method === 'GET' && url.pathname === '/api/resources') return json(response, 200, service.resourceLocks());
  if (method === 'GET' && url.pathname === '/api/artifacts') return json(response, 200, service.artifacts(url.searchParams.get('runId') ?? undefined));
  if (method === 'GET' && url.pathname === '/api/command-output') return json(response, 200, service.commandOutputs());
  if (method === 'GET' && url.pathname === '/api/command-output/metrics') return json(response, 200, service.commandOutputMetrics());
  if(method==='POST'&&url.pathname==='/api/usage/reset'){validateMutationRequest(request,options);const body=await readJson(request);return json(response,200,service.resetUsage(String(body.confirmation??''),String(body.digest??'')));}
  if(method==='GET'&&['/api/usage','/api/usage/answer','/api/usage/observations'].includes(url.pathname)){validateOperatorRequest(request,options);const query={period:url.searchParams.get('period')??'today',groupBy:url.searchParams.get('groupBy')??'model',...(url.searchParams.has('start')?{start:url.searchParams.get('start')}:{}),...(url.searchParams.has('end')?{end:url.searchParams.get('end')}:{}),...(url.searchParams.has('limit')?{limit:Number(url.searchParams.get('limit'))}:{}),filters:Object.fromEntries([...url.searchParams].filter(([k])=>k.startsWith('filter.')).map(([k,v])=>[k.slice(7),v]))};const parsed=usageQuerySchema.safeParse(query);if(!parsed.success)return json(response,400,{error:'usage_query_invalid'});return json(response,200,url.pathname.endsWith('/answer')?service.usageAnswer(parsed.data):url.pathname.endsWith('/observations')?service.usageObservations(parsed.data):service.usage(parsed.data));}
  if (method === 'GET' && url.pathname === '/api/efficiency') return json(response, 200, service.harnessEfficiencyMetrics());
  if (method === 'GET' && url.pathname === '/api/orchestration/models') return json(response, 200, service.adaptiveModelLeague(url.searchParams.get('taskClass') ?? undefined, adaptiveLeagueFilter(url)));
  if (method === 'GET' && url.pathname === '/api/orchestration/workflows') return json(response, 200, service.adaptiveWorkflowLeague(url.searchParams.get('taskClass') ?? undefined, adaptiveLeagueFilter(url)));
  if (method === 'GET' && url.pathname === '/api/orchestration/decisions') return json(response, 200, service.adaptiveDecisions());
  if (method === 'GET' && url.pathname === '/api/cache-experts') return json(response, 200, service.cacheExpertRegistry());
  if (method === 'GET' && url.pathname === '/api/learned-specialists') return json(response, 200, service.learnedSpecialists());
  if (method === 'GET' && url.pathname === '/api/deterministic-skills') return json(response,200,service.deterministicSkillProjection());
  if (method === 'GET' && url.pathname === '/api/energy') return json(response, 200, service.energyProjection());
  if (method === 'GET' && url.pathname === '/api/efficiency/invocations') {
    const requestedLimit = Number(url.searchParams.get('limit') ?? 200);
    const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0 ? Math.min(1_000, requestedLimit) : 200;
    return json(response, 200, service.modelInvocations({limit, runId: url.searchParams.get('runId') ?? undefined, jobId: url.searchParams.get('jobId') ?? undefined}));
  }
  if (method === 'GET' && url.pathname === '/api/execution-sessions') { validateOperatorRequest(request, options); return json(response, 200, service.executionSessionProjection()); }
  const liveSessionMatch = url.pathname.match(/^\/api\/execution-sessions\/([^/]+)(?:\/(events|stream|transcript|attach|detach|input|resize|signal|return-control))?$/);
  if (method === 'GET' && liveSessionMatch) {
    validateOperatorRequest(request, options); const id = decodeURIComponent(liveSessionMatch[1]), action = liveSessionMatch[2];
    if (!action) return json(response, 200, service.executionSession(id));
    if (action === 'events') return json(response, 200, service.executionSessionEvents(id, Number(url.searchParams.get('after') ?? 0)));
    if (action === 'transcript') return json(response, 200, service.executionSessionTranscript(id));
    if (action === 'stream') return executionSessionStream(service, id, Number(url.searchParams.get('after') ?? 0), request, response);
  }
  const resetStateMatch=url.pathname.match(/^\/api\/targets\/([^/]+)\/reset-recovery$/);
  if(method==='GET'&&resetStateMatch){validateOperatorRequest(request,options);return json(response,200,service.targetResetState(decodeURIComponent(resetStateMatch[1])));}
  const jobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)(?:\/(runs|run))?$/), runMatch = url.pathname.match(/^\/api\/runs\/([^/]+)(?:\/(cancel|retry|approve|resume|verify-cleanup|apply-target-boundary))?$/), definitionMatch = url.pathname.match(/^\/api\/job-definitions\/([^/]+)(?:\/([0-9]+))?$/), savedJobMatch = url.pathname.match(/^\/api\/saved-jobs\/([^/]+)(?:\/(run|enable|disable|export))?$/), parameterizedRunMatch = url.pathname.match(/^\/api\/job-runs\/([^/]+)(?:\/(cancel|resume-authentication|transcript))?$/), parcelMatch = url.pathname.match(/^\/api\/parcels\/([^/]+)(?:\/(cancel))?$/), parcelQuestionsMatch = url.pathname.match(/^\/api\/parcels\/([^/]+)\/questions(?:\/([^/]+)\/answer)?$/), parcelCriteriaMatch = url.pathname.match(/^\/api\/parcels\/([^/]+)\/criteria(?:\/([^/]+)\/evaluate)?$/), parcelSteeringMatch = url.pathname.match(/^\/api\/parcels\/([^/]+)\/steering$/), parcelRetrievalMatch = url.pathname.match(/^\/api\/parcels\/([^/]+)\/context\/retrieve$/), decisionMatch = url.pathname.match(/^\/api\/orchestration\/decisions\/([^/]+)(?:\/(report))?$/), parcelDecisionMatch = url.pathname.match(/^\/api\/parcels\/([^/]+)\/(decision-tree|decision-report)$/), capabilityCandidateMatch = url.pathname.match(/^\/api\/capability-candidates(?:\/([^/]+)\/transition)?$/), modelIntelligenceRouteMatch = url.pathname.match(/^\/api\/model-intelligence\/routes\/([^/]+)\/transition$/), providerCatalogMatch = url.pathname.match(/^\/api\/provider-catalog\/providers\/([^/]+)(?:\/models\/([^/]+)\/(callability|smoke|adjudications|routing-enable|routing-disable)|\/(discover))?$/), systemMatch = url.pathname.match(/^\/api\/systems\/([^/]+)(?:\/(check))?$/), accountMatch = url.pathname.match(/^\/api\/models\/accounts\/([^/]+)\/([^/]+)\/(qualify)$/), modelMatch = url.pathname.match(/^\/api\/models\/([^/]+)(?:\/(qualify|route))?$/), sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/), executionMatch = url.pathname.match(/^\/api\/executions\/([^/]+)$/), scheduleMatch = url.pathname.match(/^\/api\/schedules\/([^/]+)\/(enable|disable)$/), artifactContentMatch = url.pathname.match(/^\/api\/artifacts\/([^/]+)\/content$/), artifactMatch = url.pathname.match(/^\/api\/artifacts\/([^/]+)$/), outputExpansionMatch = url.pathname.match(/^\/api\/command-output\/([^/]+)\/expand$/), poeConversationMatch=url.pathname.match(/^\/api\/poe\/conversations\/([^/]+)(?:\/(turns|voice|transcript|proposals|interrupt))?$/), poeProposalMatch=url.pathname.match(/^\/api\/poe\/proposals\/([^/]+)(?:\/(freeze|approve))?$/), templateMatch=url.pathname.match(/^\/api\/agent-templates\/([^/]+)(?:\/(readiness|use))?$/);
  if(method==='GET'&&poeConversationMatch){validateOperatorRequest(request,options);const id=decodeURIComponent(poeConversationMatch[1]);if(poeConversationMatch[2]==='transcript')return json(response,200,{transcript:service.poeTranscript(id,'web-operator')});if(!poeConversationMatch[2])return json(response,200,service.poeConversation(id));}
  if(method==='POST'&&poeConversationMatch?.[2]==='voice'){
    validateOperatorRequest(request,options);validateOrigin(request,options);const mime=String(request.headers['content-type']??'').split(';')[0],bytes=await readBounded(request,8*1024*1024),result=await service.voicePoe(decodeURIComponent(poeConversationMatch[1]),bytes,mime,'web-operator',Number(request.headers['x-speech-ended-at']??Date.now()));
    return json(response,200,{...result,audio:{...result.audio,bytes:Buffer.from(result.audio.bytes).toString('base64')}});
  }
  if (method === 'GET' && definitionMatch) return json(response, 200, service.jobDefinition(decodeURIComponent(definitionMatch[1]), definitionMatch[2] ? Number(definitionMatch[2]) : undefined));
  if(method==='GET'&&templateMatch&&!templateMatch[2])return json(response,200,service.agentTemplate(decodeURIComponent(templateMatch[1]),url.searchParams.get('version')??undefined));
  if (method === 'GET' && savedJobMatch?.[2] === 'export') return json(response, 200, service.exportSavedJob(decodeURIComponent(savedJobMatch[1])));
  if (method === 'GET' && savedJobMatch && !savedJobMatch[2]) return json(response, 200, service.savedJob(decodeURIComponent(savedJobMatch[1])));
  if (method === 'GET' && parameterizedRunMatch?.[2] === 'transcript') return json(response, 200, service.parameterizedRunTranscript(decodeURIComponent(parameterizedRunMatch[1])));
  if (method === 'GET' && parameterizedRunMatch && !parameterizedRunMatch[2]) return json(response, 200, service.parameterizedRun(decodeURIComponent(parameterizedRunMatch[1])));
  if (method === 'GET' && jobMatch && !jobMatch[2]) return json(response, 200, service.job(decodeURIComponent(jobMatch[1])));
  if (method === 'GET' && jobMatch?.[2] === 'runs') return json(response, 200, service.runs(decodeURIComponent(jobMatch[1])));
  if (method === 'GET' && runMatch?.[2] === 'resume') { validateOperatorRequest(request, options);return json(response,200,service.inspectJobRunResume(decodeURIComponent(runMatch[1]))); }
  if (method === 'GET' && runMatch && !runMatch[2]) return json(response, 200, service.run(decodeURIComponent(runMatch[1])));
  if (method === 'GET' && parcelMatch && !parcelMatch[2]) return json(response, 200, service.parcel(decodeURIComponent(parcelMatch[1])));
  if (method === 'GET' && decisionMatch && !decisionMatch[2]) return json(response, 200, service.adaptiveDecision(decodeURIComponent(decisionMatch[1])));
  if (method === 'GET' && decisionMatch?.[2] === 'report') return json(response, 200, service.adaptiveReport(decodeURIComponent(decisionMatch[1])));
  if (method === 'GET' && parcelDecisionMatch?.[2] === 'decision-tree') return json(response, 200, service.adaptiveDecision(decodeURIComponent(service.parcel(decodeURIComponent(parcelDecisionMatch[1])).audit.orchestrationDecisionId ?? '')));
  if (method === 'GET' && parcelDecisionMatch?.[2] === 'decision-report') return json(response, 200, service.adaptiveParcelReport(decodeURIComponent(parcelDecisionMatch[1])));
  if (method === 'GET' && systemMatch && !systemMatch[2]) return json(response, 200, service.system(decodeURIComponent(systemMatch[1])));
  if (method === 'GET' && modelMatch && !modelMatch[2]) return json(response, 200, service.model(decodeURIComponent(modelMatch[1])));
  if (method === 'GET' && sessionMatch) return json(response, 200, service.session(decodeURIComponent(sessionMatch[1])));
  if (method === 'GET' && executionMatch) return json(response, 200, service.executionChain(decodeURIComponent(executionMatch[1])));
  if (method === 'GET' && artifactContentMatch) { validateOperatorRequest(request, options); return json(response, 200, service.artifactContent(decodeURIComponent(artifactContentMatch[1]))); }
  if (method === 'GET' && artifactMatch) return json(response, 200, service.artifact(decodeURIComponent(artifactMatch[1])));
  const laneMatch = url.pathname.match(/^\/api\/lanes\/(\d+)(?:\/(.+))?$/);
  if (method === 'GET' && laneMatch && !laneMatch[2]) return json(response, 200, service.lane(Number(laneMatch[1])));
  if (method === 'GET' && laneMatch?.[2] === 'router') return json(response, 200, service.latestRoute(Number(laneMatch[1])) ?? null);

  if(method==='POST'&&url.pathname==='/api/routing/cost-performance/explain'){validateOperatorRequest(request,options);const body=await readJson(request);return json(response,200,explainConfiguredCostRouting(loadConfig(options.configFile??configPath()),body as never));}
  if (method === 'POST') {
    validateMutationRequest(request, options);
    const body = await readJson(request), actor = 'web-operator';
    if(templateMatch?.[2]==='readiness')return json(response,200,service.agentTemplateReadiness(decodeURIComponent(templateMatch[1]),String(body.version??''),String(body.job??''),Array.isArray(body.permissions)?body.permissions as Array<{kind:string;scope:string}>:[]));
    if(templateMatch?.[2]==='use')return json(response,201,service.useAgentTemplate(decodeURIComponent(templateMatch[1]),{version:String(body.version??''),digest:String(body.digest??''),job:String(body.job??''),jobDigest:String(body.jobDigest??''),parameters:body.parameters&&typeof body.parameters==='object'&&!Array.isArray(body.parameters)?body.parameters as Record<string,unknown>:{},permissions:Array.isArray(body.permissions)?body.permissions as Array<{kind:string;scope:string}>:[],prompt:String(body.prompt??''),requestKey:String(body.requestKey??'')},actor));
    if(url.pathname==='/api/model-watches/propose')return json(response,201,service.proposeModelWatch(body.watch));
    if(url.pathname==='/api/model-watches/approve')return json(response,200,service.approveModelWatch(String(body.digest??''),actor));
    if(url.pathname==='/api/model-watches/revoke')return json(response,200,service.revokeModelWatch(String(body.digest??''),actor));
    if(url.pathname==='/api/model-watches/run')return json(response,201,service.runModelWatch(String(body.digest??''),actor));
    if(url.pathname==='/api/personal-benchmarks')return json(response,201,service.definePersonalBenchmark(body.definition));
    if (url.pathname === '/api/environment-discovery/scans') return json(response, 201, await service.discoverEnvironment({mode:String(body.mode ?? 'QUICK_RESCAN') as never, testing:String(body.testing ?? 'SKIP_TESTING') as never, includeRemote:body.includeRemote === true, includeMemory:body.includeMemory === true}));
    if (url.pathname === '/api/environment-discovery/proposals') return json(response, 201, service.createEnvironmentProposal(String(body.scanId ?? ''), Array.isArray(body.recommendationIds) ? body.recommendationIds.map(String) : [], actor));
    if (url.pathname === '/api/installation/inspect') return json(response, 200, service.inspectInstallation(String(body.mode ?? 'UPDATE') as never, String(body.role ?? 'CONTROLLER') as never));
    if (url.pathname === '/api/capability-adapters') { const definition=capabilityDefinition({id:String(body.id??''),label:String(body.label??''),type:String(body.type??'TOOL') as never,detection:String(body.detection??'DECLARATIVE') as never}); return json(response,201,service.addCapabilityAdapter(definition,{nodeId:String(body.nodeId??'controller'),owner:'operator',...(typeof body.executable==='string'?{executable:body.executable}:{}),...(typeof body.endpoint==='string'?{endpoint:body.endpoint}:{})})); }
    if (url.pathname === '/api/capability-adapters/import') return json(response,201,service.importCapabilityAdapter(body.definition as never,{nodeId:String(body.nodeId??'controller'),owner:'operator',...(typeof body.executable==='string'?{executable:body.executable}:{}),...(typeof body.endpoint==='string'?{endpoint:body.endpoint}:{})}));
    const capabilityAdapterActionMatch=url.pathname.match(/^\/api\/capability-adapters\/([^/]+)\/(review|validate|test|approve|enable|disable|reject)$/);
    if(capabilityAdapterActionMatch){const id=decodeURIComponent(capabilityAdapterActionMatch[1]),action=capabilityAdapterActionMatch[2];if(action==='test')return json(response,200,await service.testCapabilityAdapter(id,String(body.sha256??'')));const states={review:'REVIEWED',validate:'VALIDATED',approve:'APPROVED',enable:'ENABLED',disable:'DISABLED',reject:'REJECTED'} as const;return json(response,200,service.transitionCapabilityAdapter(id,String(body.sha256??''),states[action as keyof typeof states]));}
    const environmentProposalActionMatch=url.pathname.match(/^\/api\/environment-discovery\/proposals\/([^/]+)\/(save|approve|apply|cancel)$/);
    if(environmentProposalActionMatch){const id=decodeURIComponent(environmentProposalActionMatch[1]),sha256=String(body.sha256??''),action=environmentProposalActionMatch[2];if(action==='save')return json(response,200,service.saveEnvironmentProposal(id,sha256));if(action==='approve')return json(response,200,service.approveEnvironmentProposal(id,sha256,actor));if(action==='apply')return json(response,200,service.applyEnvironmentProposal(id,sha256,actor));return json(response,200,service.cancelEnvironmentProposal(id,sha256));}
    if(url.pathname==='/api/poe/conversations'){if(body.channel&&body.channel!=='dashboard')return json(response,403,{error:'poe_channel_provenance_mismatch'});return json(response,201,service.createPoeConversation('dashboard',actor));}
    if(poeConversationMatch?.[2]==='turns')return json(response,201,await service.askPoe(decodeURIComponent(poeConversationMatch[1]),String(body.text??''),actor,body.reference&&typeof body.reference==='object'&&!Array.isArray(body.reference)?body.reference as never:undefined));
    if(poeConversationMatch?.[2]==='proposals')return json(response,201,service.proposePoeBenchmark(decodeURIComponent(poeConversationMatch[1]),body as never,actor));
    if(poeConversationMatch?.[2]==='interrupt')return json(response,200,service.interruptPoe(decodeURIComponent(poeConversationMatch[1]),actor,typeof body.playbackTurnId==='string'?body.playbackTurnId:undefined));
    if(poeProposalMatch&&!poeProposalMatch[2])return json(response,200,service.revisePoeBenchmark(decodeURIComponent(poeProposalMatch[1]),Number(body.revision),body.changes&&typeof body.changes==='object'&&!Array.isArray(body.changes)?body.changes as never:{},actor));
    if(poeProposalMatch?.[2]==='freeze')return json(response,200,service.freezePoeBenchmark(decodeURIComponent(poeProposalMatch[1]),Number(body.revision),actor));
    if(poeProposalMatch?.[2]==='approve')return json(response,202,service.approvePoeBenchmark(decodeURIComponent(poeProposalMatch[1]),Number(body.revision),String(body.frozenSha256??''),actor));
    if (liveSessionMatch?.[2] === 'attach') return json(response, 201, await service.attachExecutionSession(decodeURIComponent(liveSessionMatch[1]), String(body.mode ?? '') as ExecutionSessionMode, actor));
    if (liveSessionMatch?.[2] === 'detach') return json(response, 200, service.detachExecutionSession(decodeURIComponent(liveSessionMatch[1]), String(body.attachmentId ?? ''), actor));
    if (liveSessionMatch?.[2] === 'input') return json(response, 200, await service.inputExecutionSession(decodeURIComponent(liveSessionMatch[1]), String(body.attachmentId ?? ''), String(body.value ?? ''), body.sensitive === true, actor));
    if (liveSessionMatch?.[2] === 'resize') return json(response, 200, await service.resizeExecutionSession(decodeURIComponent(liveSessionMatch[1]), String(body.attachmentId ?? ''), Number(body.columns), Number(body.rows), actor));
    if (liveSessionMatch?.[2] === 'signal') return json(response, 200, await service.signalExecutionSession(decodeURIComponent(liveSessionMatch[1]), String(body.attachmentId ?? ''), String(body.signal ?? '') as ExecutionSessionSignal, actor));
    if (liveSessionMatch?.[2] === 'return-control') return json(response, 200, await service.returnExecutionSessionControl(decodeURIComponent(liveSessionMatch[1]), String(body.attachmentId ?? ''), {summary: String(body.summary ?? ''), ...(typeof body.batonId === 'string' ? {batonId: body.batonId} : {})}, actor));
    if (url.pathname === '/api/saved-jobs') { const {actor: _actor, ...input} = body; return json(response, 201, service.createSavedJob(input as never, actor)); }
    if (savedJobMatch && !savedJobMatch[2]) return json(response, 200, service.updateSavedJob(decodeURIComponent(savedJobMatch[1]), Number(body.revision), body.changes && typeof body.changes === 'object' && !Array.isArray(body.changes) ? body.changes as never : {}, actor));
    if (savedJobMatch?.[2] === 'run') return json(response, 201, service.runSavedJob(decodeURIComponent(savedJobMatch[1]), actor));
    if (savedJobMatch?.[2] === 'enable' || savedJobMatch?.[2] === 'disable') return json(response, 200, service.setSavedJobEnabled(decodeURIComponent(savedJobMatch[1]), savedJobMatch[2] === 'enable', Number(body.revision), actor));
    if (parameterizedRunMatch?.[2] === 'cancel') return json(response, 202, service.cancelParameterizedRun(decodeURIComponent(parameterizedRunMatch[1]), actor));
    if (parameterizedRunMatch?.[2] === 'resume-authentication') return json(response, 202, service.resumeParameterizedRunAuthentication(decodeURIComponent(parameterizedRunMatch[1]), actor));
    if (url.pathname === '/api/configuration/systems') {
      const file = options.configFile ?? configPath(), result = new ConfigurationStore(file).upsert({revision: body.revision, kind: body.kind, originalId: body.originalId, item: body.item});
      const changed = result.changed.kind;
      if (changed === 'model' || changed === 'provider') { const next = loadConfig(file); service.reloadModels(next.providers, next.models, next.modelRouting, actor); }
      else service.events.emit('configuration.changed', {kind: changed, id: result.changed.id, restartRequired: true}, undefined, actor);
      return json(response, 200, result);
    }
    if (url.pathname === '/api/configuration/model-routing') {
      const file = options.configFile ?? configPath(), result = new ConfigurationStore(file).updateModelRouting({revision: body.revision, modelRouting: body.modelRouting});
      const next = loadConfig(file); service.reloadModels(next.providers, next.models, next.modelRouting, actor);
      return json(response, 200, result);
    }
    if(url.pathname==='/api/configuration/cost-performance-routing/preview'){
      const file=options.configFile??configPath(),result=new ConfigurationStore(file).previewEstateCostPerformanceRouting({revision:body.revision,policy:body.policy});
      return json(response,200,result);
    }
    if(url.pathname==='/api/configuration/cost-performance-routing'){
      const file=options.configFile??configPath(),result=new ConfigurationStore(file).updateEstateCostPerformanceRouting({revision:body.revision,policy:body.policy,proposalSha256:body.proposalSha256,approvalReason:body.approvalReason,actor});
      if(result.approval)options.costRoutingLedger?.append('OVERRIDE',{scope:'estate',proposalSha256:result.proposalSha256,previousPolicy:result.previousPolicy,approvedPolicy:result.costPerformanceRouting?.estate??null,approval:result.approval});
      service.events.emit('configuration.changed',{kind:'cost-performance-routing',id:'estate',restartRequired:false,requiresApproval:result.requiresApproval,proposalSha256:result.proposalSha256},undefined,actor);
      return json(response,200,result);
    }
    if (url.pathname === '/api/configuration/spark') {
      const file = options.configFile ?? configPath(), result = new ConfigurationStore(file).updateSpark({revision: body.revision, spark: body.spark});
      service.events.emit('configuration.changed', {kind: 'spark', id: 'fast-execution', restartRequired: true}, undefined, actor);
      return json(response, 200, result);
    }
    if (url.pathname === '/api/configuration/adaptive-orchestration') {
      const file = options.configFile ?? configPath(), result = new ConfigurationStore(file).updateAdaptiveOrchestration({revision: body.revision, adaptiveOrchestration: body.adaptiveOrchestration});
      service.events.emit('configuration.changed', {kind: 'adaptive-orchestration', id: 'adaptive-orchestration', restartRequired: true}, undefined, actor);
      return json(response, 200, result);
    }
    if (url.pathname === '/api/configuration/cache-aware-experts') {
      const file = options.configFile ?? configPath(), result = new ConfigurationStore(file).updateCacheAwareExperts({revision: body.revision, cacheAwareExperts: body.cacheAwareExperts});
      service.events.emit('configuration.changed', {kind: 'cache-aware-experts', id: 'cache-aware-experts', restartRequired: true}, undefined, actor);
      return json(response, 200, result);
    }
    if (url.pathname === '/api/configuration/learned-skills') {
      const file = options.configFile ?? configPath(), result = new ConfigurationStore(file).updateLearnedSkills({revision: body.revision, learnedSkills: body.learnedSkills});
      service.events.emit('configuration.changed', {kind: 'learned-skills', id: 'learned-skills', restartRequired: true}, undefined, actor);
      return json(response, 200, result);
    }
    if(url.pathname==='/api/configuration/deterministic-skills'){const file=options.configFile??configPath(),result=new ConfigurationStore(file).updateDeterministicSkills({revision:body.revision,deterministicSkills:body.deterministicSkills});service.events.emit('configuration.changed',{kind:'deterministic-skills',id:'deterministic-skills',restartRequired:true},undefined,actor);return json(response,200,result);}
    if (url.pathname === '/api/cache-experts/invalidate') return json(response, 200, service.invalidateCacheExperts({providerId:typeof body.providerId==='string'?body.providerId:undefined,modelId:typeof body.modelId==='string'?body.modelId:undefined,sessionId:typeof body.sessionId==='string'?body.sessionId:undefined,cacheScopeId:typeof body.cacheScopeId==='string'?body.cacheScopeId:undefined,backendInstanceId:typeof body.backendInstanceId==='string'?body.backendInstanceId:undefined,reason:typeof body.reason==='string'?body.reason:undefined},actor));
    if (jobMatch?.[2] === 'run') return json(response, 201, service.createJobRun(decodeURIComponent(jobMatch[1]), body.parameters && typeof body.parameters === 'object' && !Array.isArray(body.parameters) ? body.parameters as Record<string, unknown> : {}, actor));
    if (url.pathname === '/api/parcels') return json(response, 201, await service.submitNaturalTask(String(body.prompt ?? ''), actor));
    if (capabilityCandidateMatch && !capabilityCandidateMatch[1]) return json(response, 201, service.discoverCapability({id: typeof body.id === 'string' ? body.id : undefined, title: String(body.title ?? ''), source: String(body.source ?? ''), providerRuntime: String(body.providerRuntime ?? ''), claimedCapability: String(body.claimedCapability ?? ''), whyItMatters: String(body.whyItMatters ?? ''), agentControlEquivalent: String(body.agentControlEquivalent ?? ''), evidence: Array.isArray(body.evidence) ? body.evidence.map(String) : []}, actor));
    if (capabilityCandidateMatch?.[1]) return json(response, 200, service.transitionCapability(decodeURIComponent(capabilityCandidateMatch[1]), {to: String(body.to ?? '') as never, reason: String(body.reason ?? ''), classification: typeof body.classification === 'string' ? body.classification as never : undefined, experiment: typeof body.experiment === 'string' ? body.experiment : undefined, measuredOutcome: typeof body.measuredOutcome === 'string' ? body.measuredOutcome : undefined, finalDecision: typeof body.finalDecision === 'string' ? body.finalDecision : undefined, evidence: Array.isArray(body.evidence) ? body.evidence.map(String) : []}, actor));
    if (url.pathname === '/api/model-evaluations') return json(response, 201, service.queueModelEvaluation(Array.isArray(body.modelIds) ? body.modelIds.map(String) : [], String(body.reason ?? 'Operator requested frozen qualification'), actor));
    if (modelIntelligenceRouteMatch) return json(response, 200, service.transitionModelRoute(decodeURIComponent(modelIntelligenceRouteMatch[1]), String(body.to ?? '') as never, String(body.reason ?? ''), actor, body.approved === true, Array.isArray(body.evidence) ? body.evidence.map(String) : []));
    if (providerCatalogMatch?.[4] === 'discover') return json(response, 200, await service.discoverProviderModels(decodeURIComponent(providerCatalogMatch[1]), actor));
    if (providerCatalogMatch?.[3] === 'callability') return json(response, 200, await service.probeProviderModelCallability(decodeURIComponent(providerCatalogMatch[1]), decodeURIComponent(providerCatalogMatch[2]), actor));
    if (providerCatalogMatch?.[3] === 'smoke') return json(response, 200, await service.smokeProviderModel(decodeURIComponent(providerCatalogMatch[1]), decodeURIComponent(providerCatalogMatch[2]), actor));
    if (providerCatalogMatch?.[3] === 'adjudications') return json(response, 201, service.adjudicateProviderEvidence(decodeURIComponent(providerCatalogMatch[1]), decodeURIComponent(providerCatalogMatch[2]), {evidenceKind: String(body.evidenceKind ?? '') as never, evidenceReference: String(body.evidenceReference ?? ''), attribution: String(body.attribution ?? '') as never, scoreDisposition: String(body.scoreDisposition ?? '') as never, reason: String(body.reason ?? ''), supersededBy: typeof body.supersededBy === 'string' ? body.supersededBy : undefined, supportingEvidence: Array.isArray(body.supportingEvidence) ? body.supportingEvidence.map(String) : []}, actor));
    if (providerCatalogMatch?.[3] === 'routing-enable' || providerCatalogMatch?.[3] === 'routing-disable') return json(response, 200, service.setProviderModelRoutingEligibility(decodeURIComponent(providerCatalogMatch[1]), decodeURIComponent(providerCatalogMatch[2]), providerCatalogMatch[3] === 'routing-enable', actor));
    if (systemMatch?.[2] === 'check') return json(response, 200, await service.checkSystem(decodeURIComponent(systemMatch[1]), actor));
    if (accountMatch?.[3] === 'qualify') return json(response, 200, await service.qualifyModelAccount(decodeURIComponent(accountMatch[1]), decodeURIComponent(accountMatch[2])));
    if (modelMatch?.[2] === 'qualify') return json(response, 200, await service.qualifyModel(decodeURIComponent(modelMatch[1]), String(body.nodeId ?? 'controller')));
    if (modelMatch?.[2] === 'route') return json(response, 200, service.routeModel({model: decodeURIComponent(modelMatch[1]), modelRole: typeof body.modelRole === 'string' ? body.modelRole : undefined, accountProfile: typeof body.accountProfile === 'string' ? body.accountProfile : undefined, nodeId: String(body.nodeId ?? 'controller'), requiredCapabilities: Array.isArray(body.requiredCapabilities) ? body.requiredCapabilities.map(String) : [], allowFallback: body.allowFallback !== false}));
    if (parcelMatch?.[2] === 'cancel') return json(response, 202, service.cancelParcel(decodeURIComponent(parcelMatch[1]), actor));
    if (parcelQuestionsMatch && !parcelQuestionsMatch[2]) return json(response, 201, service.askParcelQuestion(decodeURIComponent(parcelQuestionsMatch[1]), {text: String(body.text ?? ''), originatingStageId: typeof body.originatingStageId === 'string' ? body.originatingStageId : undefined, dependentStageIds: Array.isArray(body.dependentStageIds) ? body.dependentStageIds.map(String) : [], priority: typeof body.priority === 'string' ? body.priority as never : undefined, consequence: typeof body.consequence === 'string' ? body.consequence as never : undefined}, actor));
    if (parcelQuestionsMatch?.[2]) return json(response, 200, service.answerParcelQuestion(decodeURIComponent(parcelQuestionsMatch[1]), decodeURIComponent(parcelQuestionsMatch[2]), String(body.answer ?? ''), actor));
    if (parcelSteeringMatch) return json(response, 200, service.steerParcel(decodeURIComponent(parcelSteeringMatch[1]), {instruction: String(body.instruction ?? ''), constraints: Array.isArray(body.constraints) ? body.constraints.map(String) : [], affectedStageIds: Array.isArray(body.affectedStageIds) ? body.affectedStageIds.map(String) : [], supersedes: Array.isArray(body.supersedes) ? body.supersedes.map(String) : []}, actor));
    if (parcelCriteriaMatch && !parcelCriteriaMatch[2]) return json(response, 201, service.addParcelCriterion(decodeURIComponent(parcelCriteriaMatch[1]), {kind: String(body.kind ?? 'CUSTOM') as never, description: String(body.description ?? ''), stageId: typeof body.stageId === 'string' ? body.stageId : undefined, requiredEvidence: Array.isArray(body.requiredEvidence) ? body.requiredEvidence.map(String) : []}, actor));
    if (parcelCriteriaMatch?.[2]) return json(response, 200, service.evaluateParcelCriterion(decodeURIComponent(parcelCriteriaMatch[1]), decodeURIComponent(parcelCriteriaMatch[2]), {status: String(body.status ?? '') as never, evidence: Array.isArray(body.evidence) ? body.evidence.map(String) : [], detail: typeof body.detail === 'string' ? body.detail : undefined}, actor));
    if (parcelRetrievalMatch) return json(response, 200, service.retrieveParcelContext(decodeURIComponent(parcelRetrievalMatch[1]), {query: String(body.query ?? ''), limit: typeof body.limit === 'number' ? body.limit : undefined, types: Array.isArray(body.types) ? body.types.map(String) as never : undefined, stageIds: Array.isArray(body.stageIds) ? body.stageIds.map(String) : []}, actor));
    const environmentDiagnosticMatch=url.pathname.match(/^\/api\/targets\/([^/]+)\/environment-diagnostic$/);
    if(environmentDiagnosticMatch)return json(response,200,await service.diagnoseTargetEnvironment(decodeURIComponent(environmentDiagnosticMatch[1]),actor));
    const continuationMatch=url.pathname.match(/^\/api\/targets\/([^/]+)\/reset-continuations(?:\/([^/]+)\/execute)?$/);
    if(continuationMatch)return json(response,200,await (continuationMatch[2]?service.executeTargetContinuation(decodeURIComponent(continuationMatch[1]),decodeURIComponent(continuationMatch[2]),actor,body):service.prepareTargetContinuation(decodeURIComponent(continuationMatch[1]),actor,body)));
    const resetTargetMatch=url.pathname.match(/^\/api\/targets\/([^/]+)\/reset-recovery$/);
    if(resetTargetMatch)return json(response,200,await service.resetTarget(decodeURIComponent(resetTargetMatch[1]),actor,body));
    if(runMatch?.[2]==='apply-target-boundary')return json(response,200,await service.applyTargetBoundary(decodeURIComponent(runMatch[1]),actor,body));
    if (runMatch?.[2] === 'verify-cleanup') return json(response,200,await service.verifyJobCleanup(decodeURIComponent(runMatch[1]),actor));
    if (runMatch?.[2] === 'cancel') return json(response, 202, service.cancelJobRun(decodeURIComponent(runMatch[1]), actor));
    if (runMatch?.[2] === 'resume') return json(response,200,service.resumeJobRun(decodeURIComponent(runMatch[1]),actor,typeof body.requestKey==='string'?body.requestKey:'',typeof body.expiresAt==='string'?body.expiresAt:''));
    if (runMatch?.[2] === 'retry') return json(response, 201, service.retryJobRun(decodeURIComponent(runMatch[1]), actor));
    if (runMatch?.[2] === 'approve') return json(response, 200, service.approveJobRun(decodeURIComponent(runMatch[1]), String(body.policy ?? ''), actor));
    if (scheduleMatch) return json(response, 200, service.setScheduleEnabled(decodeURIComponent(scheduleMatch[1]), scheduleMatch[2] === 'enable', actor));
    if (outputExpansionMatch) {
      const scope = parseOutputAuthorityScope(body.scope);
      const expansion = parseOutputExpansionRequest(body.expansion);
      return json(response, 200, service.expandCommandOutput(decodeURIComponent(outputExpansionMatch[1]), expansion, scope));
    }
    if (!laneMatch?.[2]) throw httpError(404, 'route_not_found');
    const laneId = Number(laneMatch[1]), action = laneMatch[2];
    switch (action) {
      case 'pause': return json(response, 200, service.pauseLane(laneId, actor));
      case 'resume': return json(response, 200, service.resumeLane(laneId, actor));
      case 'priority': return json(response, 200, service.setPriority(laneId, Number(body.priority), actor));
      case 'mode': return json(response, 200, service.setMode(laneId, String(body.mode) as 'auto' | 'manual', actor));
      case 'task': return json(response, 200, service.submitTask(laneId, String(body.goal ?? ''), actor));
      case 'reroute': return json(response, 202, service.requestReroute(laneId, actor, String(body.reason ?? 'Operator requested route re-evaluation'), Number(body.confidence ?? .8)));
      case 'handoff': return json(response, 200, service.handoff(laneId, Number(body.toLaneId), String(body.holder ?? actor), actor));
      case 'clone': return json(response, 200, service.clone(laneId, Number(body.toLaneId), String(body.holder ?? actor), actor));
      case 'cancel': return json(response, 202, service.cancelLane(laneId, actor));
      case 'takeover': return json(response, 200, service.humanTakeover(laneId, actor));
      case 'return-ownership': return json(response, 200, service.returnOwnership(laneId, actor, String(body.agentId ?? '')));
      case 'verification/policy': return json(response, 200, service.setVerificationPolicy(laneId, {required: Array.isArray(body.required) ? body.required as never[] : [], requireHumanAcceptance: Boolean(body.requireHumanAcceptance)}, actor));
      case 'verification/claim': return json(response, 200, service.recordClaim(laneId, String(body.claim ?? ''), actor));
      case 'verification/evidence': return json(response, 201, service.addVerificationEvidence(laneId, {type: String(body.type) as never, description: String(body.description ?? ''), status: String(body.status) as never, reference: typeof body.reference === 'string' ? body.reference : undefined, hash: typeof body.hash === 'string' ? body.hash : undefined}, actor));
      case 'verification/verify': return json(response, 200, service.verifyClaim(laneId, actor));
      case 'verification/accept': return json(response, 200, service.acceptVerifiedClaim(laneId, actor));
      default: throw httpError(404, 'route_not_found');
    }
  }

  if (method === 'GET') return serveAsset(response, options.assetsDir, url.pathname);
  throw httpError(404, 'route_not_found');
}

function validateMutationRequest(request: IncomingMessage, options: WebServerOptions & {host: string; port: number}) {
  if (!options.operatorToken) throw httpError(503, 'operator_auth_not_configured');
  if ((request.headers['content-type'] ?? '').split(';')[0] !== 'application/json') throw httpError(415, 'json_content_type_required');
  validateOrigin(request,options);
  validateOperatorRequest(request, options, 'control.mutate');
}
function validateOrigin(request: IncomingMessage, options: WebServerOptions & {host: string; port: number}) {const origin=request.headers.origin,allowed=new Set(options.allowedOrigins??[`http://${options.host}:${options.port}`,`http://localhost:${options.port}`]);if(origin&&!allowed.has(origin))throw httpError(403,'origin_denied');}

function validateOperatorRequest(request: IncomingMessage, options: WebServerOptions, authority: 'control.read' | 'control.mutate' = 'control.read') {
  if (!options.operatorToken) throw httpError(503, 'operator_auth_not_configured');
  const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
  if (!secretEqual(supplied, options.operatorToken)) throw httpError(401, 'operator_authentication_required');
  if (options.operatorAuthorizer && !options.operatorAuthorizer(request, authority)) throw httpError(403, 'operator_authority_required');
}

function operatorAuthentication(request: IncomingMessage, options: WebServerOptions) {
  if (!options.operatorToken) return {state: 'disabled'};
  const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
  return {state: supplied && secretEqual(supplied, options.operatorToken) ? 'authenticated' : 'authentication_required'};
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) { const buffer = Buffer.from(chunk); size += buffer.length; if (size > MAX_BODY) throw httpError(413, 'request_too_large'); chunks.push(buffer); }
  if (!chunks.length) return {};
  try { const value = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(); return value; }
  catch { throw httpError(400, 'invalid_json'); }
}
async function readBounded(request:IncomingMessage,limit:number){const chunks:Buffer[]=[];let size=0;for await(const chunk of request){const buffer=Buffer.from(chunk);size+=buffer.length;if(size>limit)throw httpError(413,'request_too_large');chunks.push(buffer);}return Buffer.concat(chunks);}

function eventStream(service: AgentControlService, request: IncomingMessage, response: ServerResponse) {
  response.writeHead(200, {'Content-Type': 'text/event-stream; charset=utf-8', Connection: 'keep-alive', 'X-Accel-Buffering': 'no'});
  const send = (event: ControlEvent) => response.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(redact(event))}\n\n`);
  const after = Number(request.headers['last-event-id'] ?? 0);
  for (const event of service.events.history(Number.isFinite(after) ? after : 0)) send(event);
  response.write(`event: system.snapshot\ndata: ${JSON.stringify(redact(service.snapshot()))}\n\n`);
  const unsubscribe = service.events.subscribe(send);
  const heartbeat = setInterval(() => response.write(': keepalive\n\n'), 15000);
  request.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
}

function adaptiveLeagueFilter(url: URL): AdaptiveLeagueFilter {
  const evidence = url.searchParams.get('evidenceKind'), sort = url.searchParams.get('sort'), minQuality = optionalFraction(url.searchParams.get('minQuality')), maxAgeDays = optionalNumber(url.searchParams.get('maxAgeDays'), 0, 3_650);
  return {
    ...(url.searchParams.get('capability') ? {capability: url.searchParams.get('capability')!} : {}),
    ...(url.searchParams.get('providerId') ? {providerId: url.searchParams.get('providerId')!} : {}),
    ...(url.searchParams.get('modelId') ? {modelId: url.searchParams.get('modelId')!} : {}),
    ...(url.searchParams.get('modelVersion') ? {modelVersion: url.searchParams.get('modelVersion')!} : {}),
    ...(url.searchParams.get('location') && ['local', 'remote'].includes(url.searchParams.get('location')!) ? {location: url.searchParams.get('location') as 'local' | 'remote'} : {}),
    ...(evidence && ['BENCHMARK', 'QUALIFICATION', 'PRODUCTION_WORK_PARCEL'].includes(evidence) ? {evidenceKind: evidence as AdaptiveEvidenceKind} : {}),
    ...(minQuality === undefined ? {} : {minQuality}),
    ...(maxAgeDays === undefined ? {} : {maxAgeDays}),
    ...(sort && ['quality', 'cost', 'latency', 'reliability', 'confidence', 'samples', 'recent'].includes(sort) ? {sort: sort as AdaptiveLeagueFilter['sort']} : {}),
  };
}

function optionalFraction(value: string | null) { if (value === null || value === '') return undefined; const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : undefined; }
function optionalNumber(value: string | null, minimum: number, maximum: number) { if (value === null || value === '') return undefined; const parsed = Number(value); return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : undefined; }

function executionSessionStream(service: AgentControlService, id: string, requestedAfter: number, request: IncomingMessage, response: ServerResponse) {
  if (!Number.isSafeInteger(requestedAfter) || requestedAfter < 0) throw httpError(400, 'execution_session_sequence_invalid');
  // Resolve the session before committing response headers so a stale/missing
  // reference receives an ordinary authenticated JSON error.
  service.executionSession(id);
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  let cursor = requestedAfter, closed = false;
  const send = () => {
    if (closed) return;
    for (const event of service.executionSessionEvents(id, cursor)) {
      cursor = event.sequence;
      response.write(`id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(redact(event))}\n\n`);
    }
  };
  send();
  const polling = setInterval(send, 100), heartbeat = setInterval(() => response.write(': keepalive\n\n'), 15_000);
  polling.unref(); heartbeat.unref();
  request.on('close', () => { closed = true; clearInterval(polling); clearInterval(heartbeat); });
}

function serveAsset(response: ServerResponse, assetsDir: string, pathname: string) {
  const asset = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  if (!['tsunora.html','tsunora.css','tsunora.js','tsunora-mark.svg','dashboard-labour.js','dashboard-labour.css','job-identity.js','precision.css','precision-model.js','precision-shell.js','precision-renderer.js','dashboard-estate.js','dashboard-estate.css','estate-client.js','dashboard-diagnostics.js','dashboard-diagnostics.css','video-evidence.js','dashboard-factory.js','factory-renderer.js','factory-client.js','factory-layout.js','dashboard-factory.css','vendor/three.module.min.js','vendor/three.core.min.js','dashboard-work-board.js','dashboard-work-board.css','dashboard-theme.css','dashboard-mobile.js','manifest.webmanifest','pwa-icon.svg','service-worker.js','offline.html','dashboard-pwa.js','dashboard-usage.js','dashboard-usage.css','dashboard-social-voice.css', 'social-voice.html', 'dashboard-social-voice.js', 'dashboard-openwa.css', 'openwa.html', 'dashboard-openwa.js', 'index.html', 'dashboard.css', 'dashboard-fixes.css', 'dashboard-jobs.css', 'dashboard-bots.css', 'dashboard-wopr.css', 'dashboard-adaptive-orchestration.css', 'dashboard-live-shell.css', 'dashboard-poe.css', 'dashboard-cache-runtime.css', 'dashboard-learned-specialists.css', 'dashboard-session-vault.css', 'dashboard-runtime-map.css', 'dashboard-environment-discovery.css', 'dashboard.js', 'dashboard-parameters.js', 'dashboard-running-state.js', 'dashboard-enhancements.js', 'dashboard-parameterized-jobs.js', 'dashboard-models.js', 'dashboard-first-run.js','dashboard-first-run.css','dashboard-model-watches.js', 'dashboard-model-watches.css', 'dashboard-sessions.js', 'dashboard-bots.js', 'dashboard-wopr.js', 'dashboard-adaptive-orchestration.js', 'dashboard-live-shell.js', 'dashboard-voice-transport.js','dashboard-poe.js', 'dashboard-cache-experts.js', 'dashboard-learned-specialists.js', 'dashboard-session-vault.js', 'dashboard-observability-model.js','dashboard-observability.js','dashboard-observability.css','dashboard-workspaces.js','dashboard-workspaces.css','dashboard-security-audits.js','dashboard-runtime-map.js', 'dashboard-environment-discovery.js', 'dashboard-installation.js'].includes(asset)) throw httpError(404, 'not_found');
  const file = path.join(assetsDir, asset);
  if (!fs.existsSync(file)) throw httpError(404, 'dashboard_asset_missing');
  const type = asset.endsWith('.webmanifest') ? 'application/manifest+json' : asset.endsWith('.svg') ? 'image/svg+xml' : asset.endsWith('.html') ? 'text/html; charset=utf-8' : asset.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8';
  response.writeHead(200, {'Content-Type': type,'Cache-Control':'no-cache'}); response.end(fs.readFileSync(file));
}

function serveUxPlayerAsset(response:ServerResponse,root:string,asset:string){
  if(!['index.html','session-player.css','session-player.js'].includes(asset))throw httpError(404,'not_found');
  const file=path.join(root,asset);if(!fs.existsSync(file))throw httpError(404,'ux_session_player_asset_missing');
  const type=asset.endsWith('.html')?'text/html; charset=utf-8':asset.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8';
  response.writeHead(200,{'Content-Type':type});response.end(fs.readFileSync(file));
}
function readUxSession(store:UxSessionStore,id:string){try{return store.read(id);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')throw httpError(404,'ux_session_missing');throw error;}}

function json(response: ServerResponse, status: number, value: unknown) { response.writeHead(status, {'Content-Type': 'application/json; charset=utf-8'}); response.end(`${JSON.stringify(redact(value))}\n`); }
function replyError(response: ServerResponse, error: unknown) {
  if (error instanceof JobManifestError) return json(response, 400, {error: error.message, issues: error.issues});
  if (error instanceof ParameterizedJobError) {
    const status = /(?:missing|unknown_definition)$/.test(error.code) || ['saved_job_missing', 'job_run_missing'].includes(error.code) ? 404
      : /(?:conflict|overlap|immutable|disabled|exists|duplicate)/.test(error.code) ? 409 : 400;
    return json(response, status, {error: error.code, detail: error.message});
  }
  const item = error as Error & {status?: number}, domainCode = item.message.split(':')[0], knownDomain = DOMAIN_STATUS.has(domainCode), status = item.status ?? DOMAIN_STATUS.get(domainCode) ?? 500;
  json(response, status, {error: item.status || knownDomain ? item.message : 'internal_error'});
}
function httpError(status: number, message: string) { return Object.assign(new Error(message), {status}); }
function secretEqual(left: string, right: string) { const a = createHash('sha256').update(left).digest(), b = createHash('sha256').update(right).digest(); return timingSafeEqual(a, b); }
function redact(value: unknown, key = '', ancestors: string[] = []): unknown {
  const safeUsageTokenMetric=key==='tokens'&&value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')==='knownTotal,reported,total,value'&&Object.values(value).every(v=>v===null||typeof v==='number'&&Number.isFinite(v));
  const safeContextTokenCount = safeUsageTokenMetric || key === 'tokens' && ancestors.at(-1) === 'context';
  if (SECRET_KEY.test(key) && !safeContextTokenCount && !SAFE_TOKEN_ACCOUNTING_KEY.test(key) && !SAFE_CONFIG_REFERENCE_KEY.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return redactSensitiveText(value);
  if (Array.isArray(value)) return value.map(item => redact(item, '', ancestors));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redact(item, name, [...ancestors, key])]));
  return value;
}
