const jobState = {jobs: [], parcels: [], runs: [], queue: [], workers: [], resources: [], systems: [], locks: [], artifacts: [], outputMetrics: null, efficiencyMetrics: null, invocations: [], configuration: null, selectedConfiguration: null, configurationRestartRequired: false, selectedJob: null, selectedRun: null, selectedSystem: null, search: ''};
let tokenElapsedTimer = null;
let linkedParcelScrolled = null;
const terminalRunStatuses = new Set(['SUCCEEDED', 'FAILED', 'DEGRADED', 'CANCELLED', 'MISSED']);
const retryableRunStatuses = new Set(['FAILED', 'DEGRADED', 'CANCELLED']);
const baseRefresh = refresh;

refresh = async () => {
  await baseRefresh();
  const endpoints = ['/api/jobs', '/api/parcels', '/api/runs', '/api/queue', '/api/workers', '/api/resources', '/api/systems', '/api/artifacts', '/api/command-output/metrics', '/api/efficiency', '/api/efficiency/invocations?limit=500'];
  const [jobs, parcels, runs, queue, workers, locks, systems, artifacts, outputMetrics, efficiencyMetrics, invocations] = await Promise.all(endpoints.map(async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} ${response.status}`);
    return response.json();
  }));
  Object.assign(jobState, {jobs, parcels, runs, queue, workers, resources: state.snapshot?.resources || [], locks, systems, artifacts, outputMetrics, efficiencyMetrics, invocations});
  const linkedRun = new URL(location.href).searchParams.get('messagingRun');
  if(linkedRun && !jobState.selectedRun){const run=runs.find(item=>item.id===linkedRun);if(run){jobState.selectedJob=run.jobId;jobState.selectedRun=run.id;}}
  const linkedJob=new URL(location.href).searchParams.get('job');if(linkedJob&&jobs.some(job=>job.metadata.id===linkedJob))jobState.selectedJob=linkedJob;
  const linkedSystem=new URL(location.href).searchParams.get('system');if(linkedSystem&&systems.some(system=>system.id===linkedSystem))jobState.selectedSystem=linkedSystem;
  const linkedLane=Number(new URL(location.href).searchParams.get('lane'));if(linkedLane&&state.snapshot?.lanes?.some(lane=>lane.id===linkedLane))state.selected=linkedLane;
  if (!jobState.selectedJob && jobs.length) jobState.selectedJob = jobs[0].metadata.id;
  if (jobState.selectedJob && !jobs.some(job => job.metadata.id === jobState.selectedJob)) jobState.selectedJob = jobs[0]?.metadata.id ?? null;
  if (!jobState.selectedSystem && systems.length) jobState.selectedSystem = systems[0].id;
  if (jobState.selectedSystem && !systems.some(system => system.id === jobState.selectedSystem)) jobState.selectedSystem = systems[0]?.id ?? null;
  renderJobs();
  const linkedParcel=new URL(location.href).searchParams.get('parcel');
  if(linkedParcel&&linkedParcelScrolled!==linkedParcel){const card=[...document.querySelectorAll('.parcel-card')].find(node=>node.dataset.parcelId===linkedParcel);if(card){card.scrollIntoView({block:'start'});linkedParcelScrolled=linkedParcel;}}
  renderJobRunLanes();
  renderSystems();
  renderConfiguration();
};

renderSystem = snapshot => {
  const items = [['Scheduler', snapshot.paused ? 'PAUSED' : 'ACTIVE'], ['Running', snapshot.jobs.running], ['Waiting', snapshot.jobs.waiting], ['Retrying', snapshot.jobs.reconnecting], ['Auth blocked', snapshot.jobs.authenticationBlocked], ['Cleanup uncertain', snapshot.jobs.cleanupUncertain], ['Queued', snapshot.jobs.queued], ['Jobs', snapshot.jobs.total], ['Approvals', snapshot.outstandingApprovals], ['Context tokens avoided', snapshot.tokenAwareOutput?.contextTokensAvoided || 0], ['Resources', snapshot.resources.length]];
  document.querySelector('#system-summary').innerHTML = `<div class="summary-grid">${items.map(([label, value]) => `<div class="summary-item"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}</div>`;
  renderTokenRouting(snapshot.tokenBatonRouting);
  renderRetrieval(snapshot.retrieval);
};

function renderRetrieval(retrieval) {
  const root=document.querySelector('#retrieval-routing');if(!root)return;
  const totals=retrieval?.totals,attempts=retrieval?.attempts||[],latest=attempts.at(-1),packet=(retrieval?.packets||[]).at(-1);
  if(!retrieval?.policy?.enabled&&!attempts.length){root.innerHTML='<div class="compact-empty">Governed retrieval is disabled. Existing full-context behaviour remains available.</div>';return;}
  const path=attempts.slice(-6).map(item=>`${item.strategy}/${item.providerId} ${item.outcome}`).join(' → ')||'Awaiting retrieval intent';
  root.innerHTML=`<article class="token-thread"><div><strong>${esc(latest?.providerId||'No active provider')}</strong><span class="status-pill">${esc(latest?.outcome||'READY')}</span></div><p>Strategy path: ${esc(path)}</p><p>Evidence: ${esc(tokenNumber(totals?.evidenceCount))} items · ${esc(tokenNumber(totals?.evidenceTokens))} estimated tokens</p><p>Context saved: ${esc(tokenNumber(totals?.contextTokensSaved))} tokens · raw bytes avoided ${esc(tokenNumber(totals?.rawBytesAvoided))}</p><p>Queries: ${esc(tokenNumber(totals?.queries))} · escalations ${esc(tokenNumber(totals?.escalations))} · latency ${esc(tokenNumber(totals?.retrievalLatencyMs))}ms · cost ${esc(tokenMoney(packet?.retrievalCost))}</p><p>Freshness: ${esc(latest?.freshness||'not observed')} · index ${esc(latest?.indexState||'not observed')} · ${esc(retrieval.policy.allowedLocality.join('/'))}</p></article>`;
}

function tokenNumber(value) { return typeof value === 'number' ? value.toLocaleString() : 'unknown'; }
function tokenMoney(cost) { return typeof cost?.amount === 'number' ? `${cost.amount.toFixed(4)} ${cost.currency || ''} ${cost.authority === 'authoritative' ? '' : '(estimated)'}`.trim() : 'unknown'; }
function tokenElapsed(thread) { const latest = thread.latest || {}, started = Date.parse(thread.startedAt || ''); return thread.active && Number.isFinite(started) ? Math.max(0, Date.now() - started) : latest.elapsedMs || 0; }
function scheduleTokenElapsedRefresh(routing) { if (tokenElapsedTimer) { clearInterval(tokenElapsedTimer); tokenElapsedTimer = null; } if ((routing?.threads || []).some(thread => thread.active)) tokenElapsedTimer = setInterval(() => renderTokenRouting(state.snapshot?.tokenBatonRouting), 1_000); }
function renderTokenRouting(routing) {
  const root = document.querySelector('#token-routing'); if (!root) return;
  const threads = routing?.threads || [];
  if (!threads.length) { root.innerHTML = '<div class="compact-empty">No live agent/thread telemetry yet.</div>'; scheduleTokenElapsedRefresh(routing); return; }
  root.innerHTML = threads.map(thread => {
    const point = thread.latest || {}, context = point.context || {}, percent = typeof point.contextPercent === 'number' ? `${Math.round(point.contextPercent)}%` : 'unknown';
    const parcel = (routing.parcels || []).find(item => item.parcelId === thread.parcelId), routeLabel = item => `${item.providerId}/${item.accountLabel || item.accountProfileId || 'default'}/${item.modelId}@${item.providerExecutionNodeId || item.nodeId || 'controller'} [work:${item.workloadNodeId || 'controller'} cred:${item.credentialNodeId || 'provider-default'}]`, chain = parcel?.byModel?.map(item => `${routeLabel(item)} ${tokenNumber(item.totalTokens)} total (${tokenNumber(item.freshInputTokens)} fresh + ${tokenNumber(item.cachedInputTokens)} cache read + ${tokenNumber(item.cacheWriteTokens)} cache write; ${tokenNumber(item.outputTokens)} output)`).join(' → ') || 'No parcel totals';
    const nextDecision = [...(routing.decisions || [])].reverse().find(item => item.threadId === thread.id && item.target), nextRoute = nextDecision?.target ? routeLabel(nextDecision.target) : 'none selected';
    const currentThreshold = thread.governor?.currentThreshold === null || thread.governor?.currentThreshold === undefined ? 'none' : `${thread.governor.currentThreshold}%`, nextThreshold = thread.governor?.nextThreshold === null || thread.governor?.nextThreshold === undefined ? 'none' : `${thread.governor.nextThreshold}%`, lifecycle = [...(routing.contextLifecycle || [])].reverse().find(item => item.threadId === thread.id);
    return `<article class="token-thread ${esc(String(thread.governor?.state || 'CONTINUE').toLowerCase())}"><div><strong>${esc(thread.providerId)} / ${esc(thread.accountLabel || thread.accountProfileId || 'default account')} / ${esc(thread.modelId)} @ ${esc(thread.providerExecutionNodeId || thread.nodeId || 'controller')}</strong><span class="status-pill">${esc(thread.active ? thread.governor?.state || 'CONTINUE' : 'COMPLETED')}</span></div><p>Locality: workload ${esc(thread.workloadNodeId || 'controller')} · provider execution ${esc(thread.providerExecutionNodeId || thread.nodeId || 'controller')} · credentials ${esc(thread.credentialNodeId || 'provider default')}</p><p>Account plan: ${esc(thread.accountPlan ? `${thread.accountPlan} (${thread.accountPlanAuthority || 'authority unknown'})` : 'not reliably known')} · ${esc(thread.accountQualification || 'not applicable')} / ${esc(thread.accountAvailability || 'default')} · next route ${esc(nextRoute)}</p><p>Context: ${esc(tokenNumber(context.tokens))} / ${esc(tokenNumber(context.limitTokens))} — ${esc(percent)} <small>${esc(context.authority || 'unavailable')}</small></p><p>Context lifecycle: ${esc(lifecycle ? `${lifecycle.kind} · ${lifecycle.authority} · ${lifecycle.source}` : 'no transition observed')}</p><p>Tokens: input ${esc(tokenNumber(point.cumulative?.inputTokens))} (${esc(tokenNumber(point.cumulative?.freshInputTokens))} fresh + ${esc(tokenNumber(point.cumulative?.cachedInputTokens))} cache read + ${esc(tokenNumber(point.cumulative?.cacheWriteTokens))} cache write) · output ${esc(tokenNumber(point.cumulative?.outputTokens))} · total ${esc(tokenNumber(point.cumulative?.totalTokens))}</p><p>Cost: ${esc(tokenMoney(point.cost))} · elapsed ${esc(Math.round(tokenElapsed(thread) / 1000))}s</p><p>Governor: ${esc(thread.governor?.state || 'CONTINUE')} · current ${esc(currentThreshold)} → next ${esc(nextThreshold)}</p><p class="token-parcel">Parcel: ${esc(chain)} = ${esc(tokenNumber(parcel?.totalTokens))} total (${esc(tokenNumber(parcel?.freshInputTokens))} fresh + ${esc(tokenNumber(parcel?.cachedInputTokens))} cache read + ${esc(tokenNumber(parcel?.cacheWriteTokens))} cache write)</p></article>`;
  }).join('');
  scheduleTokenElapsedRefresh(routing);
}

const baseLaneRender = renderLane;
renderLane = lane => {
  baseLaneRender(lane);
  if (!lane) return;
  const laneDetail = document.querySelector('#lane-detail');
  const laneLiveness = window.AgentControlRunningState.liveness(lane.status === 'working' ? 'RUNNING' : lane.status.toUpperCase(), lane.lastMeaningfulActivity);
  if (lane.status === 'working') {
    const model = lane.model && lane.model !== 'unassigned' ? lane.model : 'Planner selecting route';
    const target = lane.executionTarget || lane.ptys?.[0]?.owner || 'Execution node not yet reported';
    laneDetail.insertAdjacentHTML('afterbegin', `<section class="lane-live is-running ${laneLiveness.stale ? 'is-stale' : ''}" aria-live="polite"><span class="activity-pulse" aria-hidden="true"></span><span><strong>RUNNING · ${esc(model)}</strong><small>${esc(target)} · ${esc(lane.routeReason || 'Routing rationale not reported')}</small></span><span class="running-time"><b>${esc(lane.elapsedMs ? durationLabel(new Date(Date.now() - lane.elapsedMs).toISOString()) : 'Starting')}</b><small>${esc(laneLiveness.label)}</small></span></section>`);
  }
  const activity = document.querySelector('#tab-activity .data-grid');
  const elapsed = lane.elapsedMs ? `${Math.round(lane.elapsedMs / 1000)}s` : 'Not running';
  activity.insertAdjacentHTML('beforeend', `<div class="data-card"><label>Execution target</label><p>${esc(lane.executionTarget || 'Not assigned')}</p></div><div class="data-card"><label>Elapsed execution</label><p>${esc(elapsed)}</p></div>`);
  const evidence = document.querySelector('#tab-evidence');
  const sources = lane.contextSources.map(source => {
    const href = safeHref(source.url);
    const reference = href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(source.description)}</a>` : `<span>${esc(source.description)} · ${esc(source.localRef || source.id)}</span>`;
    return `<div class="evidence-row"><span class="evidence-type">${esc(source.type)}</span>${reference}<span class="status-pill">${esc(source.accessibility)}</span></div>`;
  }).join('');
  evidence.insertAdjacentHTML('beforeend', `<h3>Context sources</h3><div class="evidence-list">${sources || '<div class="data-card"><p>No external context source is attached.</p></div>'}</div>`);
};

function safeHref(value) {
  if (!value) return null;
  try { const parsed = new URL(value); return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null; }
  catch { return null; }
}
function scheduleLabel(job) { return job.schedules.length ? job.schedules.map(item => `${item.spec.cron} ${item.spec.timezone}`).join(' · ') : 'Manual'; }
function statusClass(status) { return status === 'RUNNING' ? 'running' : ['FAILED', 'DEGRADED', 'DISCONNECTED', 'CLEANUP_UNCERTAIN', 'OFFLINE'].includes(status) ? 'error' : ['BUSY', 'QUEUED', 'WAITING', 'WAITING_FOR_WORKER', 'WAITING_FOR_DEPENDENCY', 'WAITING_FOR_RESOURCE', 'WAITING_FOR_APPROVAL', 'AUTHENTICATION_BLOCKED', 'RECONNECTING', 'CANCELLING', 'CANCEL_PENDING', 'RETRY_PENDING'].includes(status) ? 'waiting' : ''; }
function timeLabel(value, fallback = '--') { return value ? new Date(value).toLocaleString() : fallback; }
function durationLabel(start, end) { if (!start) return 'Not started'; const milliseconds = Math.max(0, Date.parse(end || new Date().toISOString()) - Date.parse(start)); return milliseconds < 1000 ? `${milliseconds}ms` : `${Math.round(milliseconds / 1000)}s`; }
function ageLabel(value) { if (!value) return '--'; const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 1000)); return seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m` : `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`; }
function deadlineLabel(value) { const at=Date.parse(value||'');if(!Number.isFinite(at))return'No recovery deadline';const seconds=Math.max(0,Math.ceil((at-Date.now())/1000));return seconds===0?`Deadline reached · ${timeLabel(value)}`:`${seconds}s remaining · ${timeLabel(value)}`; }
function deadlineMarkup(value) { return value?`<span data-real-deadline="${esc(value)}">${esc(deadlineLabel(value))}</span>`:'No recovery deadline'; }
function durationMarkup(start, end, live) { const label = esc(durationLabel(start, end)); return live ? `<span data-live-start="${esc(start)}">${label}</span>` : label; }
function runningClass(run) { if (run?.status !== 'RUNNING') return ''; return `is-running${window.AgentControlRunningState.liveness(run.status, run.updatedAt || run.requestedAt).stale ? ' is-stale' : ''}`; }

function renderParcelLive(parcel, activeStage) {
  if (!activeStage || !['RUNNING', 'WAITING'].includes(parcel.status)) return '';
  const runningState = window.AgentControlRunningState, rollup = runningState.rollup(parcel.stages), liveness = runningState.liveness(parcel.status, parcel.updatedAt);
  const run = activeStage.runId ? jobState.runs.find(item => item.id === activeStage.runId) : undefined;
  const currentStep = run?.steps.find(step => ['RUNNING', 'WAITING_FOR_WORKER', 'WAITING_FOR_DEPENDENCY', 'WAITING_FOR_RESOURCE', 'WAITING_FOR_APPROVAL', 'AUTHENTICATION_BLOCKED', 'RECONNECTING', 'CANCEL_PENDING', 'CLEANUP_UNCERTAIN', 'RETRY_PENDING'].includes(step.status)) || run?.steps.at(-1);
  const invocation = run ? jobState.invocations.filter(item => item.runId === run.id).at(-1) : undefined;
  const latestEvents = [...parcel.provenance.map(item => ({...item, source: 'parcel'})), ...(run?.provenance || []).map(item => ({...item, source: 'run'}))].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-4);
  const latest = latestEvents.at(-1), nextStage = parcel.stages[parcel.stages.indexOf(activeStage) + 1], requested = activeStage.requestedRoute;
  const route = activeStage.actualRoute, worker = route?.workers.join(', ') || run?.selectedWorkers.join(', ') || 'Not reported';
  const provider = invocation?.provider || (route ? route.provider || 'Control action' : 'Not reported'), account = invocation?.accountProfileId || route?.accountLabel || route?.accountProfile || requested?.accountProfile || 'Default / none', model = invocation?.model || (route ? route.model || 'No model' : 'Not reported'), profile = invocation?.harnessProfile || (route ? route.profile || 'Control action' : requested?.profile || 'Not reported');
  const attempt = currentStep?.attempts?.length ? `${currentStep.attempts.length}` : 'Not reported';
  const verification = currentStep?.verification ? `${currentStep.verification.passed.length}/${currentStep.verification.required.length} checks passed${currentStep.verification.failed.length ? ` · ${currentStep.verification.failed.length} failed` : ''}` : 'Not reported';
  const baton = activeStage.dependsOn.length ? activeStage.dependsOn.every(id => parcel.stages.find(stage => stage.id === id)?.baton) ? 'Received from every predecessor' : 'Awaiting predecessor baton' : 'No predecessor required';
  const usage = runningState.usage(parcel.telemetry), currentActivity = currentStep?.waitingReason || activeStage.waitingReason || currentStep?.action || latest?.detail || 'Execution active; finer activity not reported';
  const requestedRoute = requested ? `${requested.provider || 'policy-selected provider'} / ${requested.accountProfile || 'policy-selected account'} / ${requested.modelRole || requested.model || 'policy-selected model role'} / ${requested.profile || 'policy-selected profile'}` : 'Normal Agent Control routing policy';
  const why = [parcel.audit?.planningRationale, requested?.reason].filter(Boolean).join(' · ') || 'No concise routing rationale reported';
  const detailRows = [['Parcel', parcel.id], ['Stage', activeStage.name], ['Job', activeStage.job], ['Run ID', activeStage.runId || 'Not reported'], ['Current state', activeStage.status], ['Current action / latest event', currentActivity], ['Node / machine', worker], ['Requested route', requestedRoute], ['Actual provider', provider], ['Account profile', account], ['Account qualification', route?.accountProfile ? `${route.accountQualification || 'unknown'} / ${route.accountAvailability || 'unknown'}` : 'not applicable'], ['Account plan', route?.accountPlan ? `${route.accountPlan} (${route.accountPlanAuthority || 'authority unknown'})` : 'not reliably known'], ['Model', model], ['Harness profile', profile], ['Attempt / retry', attempt], ['Why this route/model?', why], ['Started', timeLabel(activeStage.startedAt)], ['Last state transition', timeLabel(latest?.at)], ['Verification', verification], ['Baton', baton], ['Next stage', nextStage ? `${nextStage.name} · after ${activeStage.name} succeeds` : 'Final stage'], ['Usage', usage.label]];
  const tooltip = detailRows.slice(0, 12).map(([label, value]) => `<span><b>${esc(label)}</b>${esc(value)}</span>`).join('');
  const chain = rollup.stages.map((stage, index) => `<li class="rollup-${esc(stage.status.toLowerCase())}"><span>${stage.active ? '●' : stage.status === 'SUCCEEDED' ? '✓' : stage.blocked ? '×' : '○'}</span><strong>${esc(`${index + 1}. ${stage.name}`)}</strong><small>${esc(stage.status)}${stage.waiting ? ' · dependency not yet complete' : stage.blocked ? ' · dependency failed' : ''}</small></li>`).join('');
  const events = latestEvents.length ? latestEvents.map(item => `<li><time>${esc(new Date(item.at).toLocaleTimeString())}</time><span>${esc(item.type)} · ${esc(item.detail)}</span></li>`).join('') : '<li><span>No execution event reported yet</span></li>';
  const expanded = detailRows.map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
  const drill = run ? `<button type="button" class="button secondary" data-run="${esc(run.id)}">Inspect authoritative Job / Run / evidence</button>` : '';
  return `<section class="parcel-live ${parcel.status === 'RUNNING' ? 'is-running' : 'is-waiting'} ${liveness.stale ? 'is-stale' : ''}" aria-live="polite"><details class="running-inspector"><summary class="running-summary"><span class="activity-pulse" aria-hidden="true"></span><span><strong>${esc(parcel.status)} · ${rollup.position ? `Stage ${rollup.position} of ${rollup.total}` : activeStage.status}</strong><small>${esc(activeStage.name)} · ${esc(provider === 'Not reported' && activeStage.status === 'RUNNING' ? 'Control action or route not yet reported' : `${provider} / ${account} / ${model}`)}</small></span><span class="running-time"><b data-live-start="${esc(activeStage.startedAt || parcel.createdAt)}">${esc(durationLabel(activeStage.startedAt || parcel.createdAt))}</b><small data-live-liveness="${esc(parcel.updatedAt)}" data-live-state="${esc(parcel.status)}">${esc(liveness.label)}</small></span><span class="running-popover" role="tooltip"><b>Current activity</b>${tooltip}<em>Press Enter or click to expand authoritative detail.</em></span></summary><div class="running-expanded"><div class="running-route">${esc(provider)} → ${esc(account)} → ${esc(model)} · ${esc(profile)}<small>${esc(usage.label)}</small></div><div class="routing-why"><span class="eyebrow">Why this model / route?</span><p>${esc(why)}</p></div><div class="running-detail-grid">${expanded}</div><div class="running-drill"><div><span class="eyebrow">Parcel chain</span><ol>${chain}</ol></div><div><span class="eyebrow">Latest actual events</span><ol class="running-events">${events}</ol></div></div>${drill}</div></details></section>`;
}

function renderParcelAudit(parcel) {
  const audit = parcel.audit; if (!audit) return '';
  const totals = audit.totals, cost = totals.cost === null ? 'Unavailable' : `${totals.currency || ''} ${totals.cost} (${totals.costBasis})`.trim();
  const plan = parcel.stages.map((stage, index) => `<li><strong>${index + 1}. ${esc(stage.name)}</strong><span>${esc(stage.job)} · depends on ${esc(stage.dependsOn.join(', ') || 'nothing')}</span><span>Requested: ${esc(stage.requestedRoute ? `${stage.requestedRoute.provider || 'policy'} / ${stage.requestedRoute.modelRole || stage.requestedRoute.model || 'policy'} / ${stage.requestedRoute.profile || 'policy'}` : 'normal policy')}</span><span>Actual: ${esc(stage.actualRoute ? `${stage.actualRoute.provider || 'no model'} / ${stage.actualRoute.model || 'no model'} / ${stage.actualRoute.profile || 'control action'} · ${stage.actualRoute.workers.join(', ') || 'no worker'}` : 'Not reported')}</span></li>`).join('');
  const alternatives = audit.alternatives.length ? audit.alternatives.map(item => `<li><strong>${esc(item.candidate)}</strong><span>${item.eligible ? 'eligible' : 'rejected'} · ${esc(item.reasons.join(', ') || 'no reason reported')}</span></li>`).join('') : '<li><span>No candidate alternatives were reported at decision time.</span></li>';
  const timeline = audit.timeline.map(item => `<li><time>${esc(new Date(item.at).toLocaleTimeString())}</time><strong>${esc(item.summary)}</strong><span>${esc(item.detail)}</span></li>`).join('');
  const invocations = audit.invocations.length ? audit.invocations.map(item => { const accounting = item.costAccounting, price = accounting?.cloud?.pricingBasis, local = accounting?.localEnergy; const costDetail = accounting?.billingMode === 'SUBSCRIPTION_QUOTA' && item.calculatedCost === null && item.providerReportedCost === null ? `SUBSCRIPTION / QUOTA CONSUMPTION · ${accounting.subscription?.unitsConsumed ?? 'unknown'} ${accounting.subscription?.unitLabel ?? 'units'} · reset ${accounting.subscription?.resetAt ?? accounting.subscription?.resetPeriod ?? 'unknown'}` : price ? `${price.currency} input ${price.inputPerMillionTokens}/M · cache read ${price.cachedInputPerMillionTokens ?? 'unpriced'}/M · cache write ${price.cacheWritePerMillionTokens ?? 'unpriced'}/M · output ${price.outputPerMillionTokens}/M · ${price.tableId}@${price.version} (${price.source})` : item.costBasis; const localDetail = local ? ` · local ${local.energyWh ?? 'unknown'} Wh / ${local.estimatedElectricityCost ?? 'unknown'} ${local.currency ?? ''} (${local.estimate ? 'estimate' : 'measured'})` : ''; const identity = item.providerModel ? `${item.providerModel} · role ${item.logicalRole || 'explicit'} · qualification ${item.qualificationVersion}` : item.profile; const cache = item.cacheEvidence ? `cache reused ${item.cacheEvidence.reusedTokens ?? 'unavailable'} · processed ${item.cacheEvidence.processedPromptTokens ?? 'unavailable'} · ${item.cacheEvidence.authority}` : 'cache evidence unavailable'; return `<tr><td>${esc(item.provider)}<br><small>${esc(item.route)}</small></td><td>${esc(item.registryModelId || item.model)}<br><small>${esc(identity)}</small><br><small>${esc(cache)}</small></td><td>${esc(item.node ?? 'Not reported')}</td><td>${esc(item.freshInputTokens ?? 'Not reported')} / ${esc(item.cachedInputTokens ?? 'Not reported')} / ${esc(item.cacheWriteTokens ?? 'Not reported')}</td><td>${esc(item.outputTokens ?? 'Not reported')} / ${esc(item.reasoningTokens ?? 'Not reported')}</td><td>${esc(item.totalTokens ?? 'Not reported')}</td><td>${esc(item.providerReportedCost ?? item.calculatedCost ?? 'Not reported')}<br><small>${esc(costDetail + localDetail)}</small></td><td>${esc(durationLabel(item.startedAt, item.completedAt))}</td></tr>`; }).join('') : '<tr><td colspan="8">No model invocation recorded. Deterministic control actions consume no model tokens.</td></tr>';
  const decisionLink = audit.orchestrationDecisionId ? `<p><button type="button" class="button secondary" data-adaptive-decision-link="${esc(audit.orchestrationDecisionId)}">Open routing decision tree</button></p>` : '';
  return `<details class="parcel-audit"><summary><span>Audit</span><small>WHAT · WHY · WHO · COST</small></summary><div class="audit-body">${decisionLink}<section><span class="eyebrow">What did I ask?</span><p>${esc(parcel.prompt)}</p></section><section><span class="eyebrow">Plan and rationale</span><p>${esc(audit.classification)} · ${esc(audit.planningRationale)}</p><ol class="audit-plan">${plan}</ol></section><section><span class="eyebrow">Resources considered at decision time</span><ul class="audit-alternatives">${alternatives}</ul></section><section><span class="eyebrow">Routing and execution timeline</span><ol class="audit-timeline">${timeline}</ol></section><section><span class="eyebrow">Invocation → Job → Stage → Parcel accounting</span><div class="audit-table-wrap"><table><thead><tr><th>Provider / route</th><th>Model / profile</th><th>Node</th><th>Fresh / read / write</th><th>Output / reasoning</th><th>Total</th><th>Cost</th><th>Model time</th></tr></thead><tbody>${invocations}</tbody></table></div><p class="audit-total">${esc(totals.models.length ? totals.models.join(', ') : 'No model')} · ${esc(totals.invocations)} invocation(s) · ${esc(totals.totalTokens ?? 'tokens unavailable')} · cache writes ${esc(totals.cacheWriteTokens ?? 'unavailable')} · ${esc(cost)} · model ${esc(durationLabel(parcel.createdAt, new Date(Date.parse(parcel.createdAt) + totals.modelExecutionMs).toISOString()))} · wall ${esc(durationLabel(parcel.createdAt, parcel.endedAt))}</p></section><section><span class="eyebrow">Final state and verification</span><p>${esc(parcel.status)} · ${esc(parcel.decision?.summary || 'Execution still active')}</p></section></div></details>`;
}

function renderParcelContext(parcel) {
  const context=parcel.context;if(!context)return'';const metrics=context.metrics||{},open=(context.questions||[]).filter(item=>item.status==='OPEN'),criteria=context.criteria||[],amendments=(context.amendments||[]).filter(item=>item.status==='ACCEPTED');
  const questions=open.map(question=>`<section class="question-panel"><label>${esc(question.priority)} question · ${esc(question.consequence)} consequence</label><p>${esc(question.text)}</p><small>Only stages ${esc(question.dependentStageIds.join(', ')||'explicitly unblocked')} are waiting · asked ${esc(timeLabel(question.createdAt))}</small><div class="question-answer"><input data-question-input="${esc(question.id)}" aria-label="Answer ${esc(question.id)}" placeholder="Answer without stopping independent work"><button class="button" data-answer-question="${esc(question.id)}" data-parcel-id="${esc(parcel.id)}">Answer</button></div></section>`).join('');
  const criteriaRows=criteria.map(item=>`<li class="${esc(item.status.toLowerCase())}"><span><strong>${esc(item.status)}</strong> · ${esc(item.description)} <small>${esc(item.source)} / ${esc(item.sourceActor)}${item.stageId?` / ${esc(item.stageId)}`:''}</small></span>${item.status==='PENDING'?`<span class="criterion-actions"><button class="button secondary" data-evaluate-criterion="${esc(item.id)}" data-parcel-id="${esc(parcel.id)}" data-status="PASS">Pass</button><button class="button secondary danger" data-evaluate-criterion="${esc(item.id)}" data-parcel-id="${esc(parcel.id)}" data-status="FAIL">Fail</button></span>`:''}</li>`).join('');
  return `${questions}<details class="parcel-audit parcel-context"><summary><span>Persistent context</span><small>ACTIVE STATE · IMMUTABLE EVENTS · RETRIEVAL · BOUNDED BATONS</small></summary><div class="audit-body"><section><span class="eyebrow">Current authoritative state</span><p>${esc(context.active.currentInterpretation)}</p><p>Stages ${esc(context.active.currentStageIds.join(', ')||'none active')} · route ${esc(context.active.currentRoute||'not selected')} · model ${esc(context.active.currentModel||'not selected')} · node ${esc(context.active.currentNode||'not selected')}</p></section><div class="parcel-context-board"><div><b>${esc(context.events.length)} immutable events</b><small>${esc(byteLabel(metrics.eventLedgerBytes))} durable history</small></div><div><b>${esc(byteLabel(metrics.latestBatonBytes))} latest baton</b><small>${esc(metrics.latestBatonEstimatedTokens??0)} estimated tokens</small></div><div><b>${esc(byteLabel(metrics.historicalBytesExcludedFromLatestBaton))} excluded</b><small>${esc(metrics.estimatedHistoricalTokensExcluded??0)} historical tokens retrieved only when needed</small></div></div><section><span class="eyebrow">Success criteria</span><ul class="criteria-list">${criteriaRows||'<li>No explicit criterion recorded</li>'}</ul><div class="criterion-entry"><select data-criterion-kind="${esc(parcel.id)}" aria-label="Success criterion kind"><option value="CUSTOM">Custom</option><option value="EXPECTED_RESULT">Expected result</option><option value="TESTS_PASS">Tests pass</option><option value="ARTIFACT_EXISTS">Artifact exists</option><option value="REPOSITORY_CLEAN">Repository clean</option><option value="DEPLOYMENT_HEALTHY">Deployment healthy</option><option value="EVIDENCE_CAPTURED">Evidence captured</option><option value="REVIEWER_PASS">Reviewer pass</option><option value="USER_APPROVAL">User approval</option><option value="STAGE_VERIFIED">Stage verified</option></select><input data-criterion-input="${esc(parcel.id)}" aria-label="Add success criterion" placeholder="Define a durable success condition"><button class="button secondary" data-add-criterion="${esc(parcel.id)}">Add criterion</button></div></section><section><span class="eyebrow">Accepted steering</span><p>${esc(amendments.map(item=>item.instruction).join(' · ')||'No amendments; original goal remains authoritative.')}</p><div class="question-answer"><input data-steering-input="${esc(parcel.id)}" aria-label="Steer parcel" placeholder="Add a durable instruction or constraint"><button class="button secondary" data-steer-parcel="${esc(parcel.id)}">Steer</button></div></section><section><span class="eyebrow">Governed history retrieval</span><div class="question-answer"><input data-retrieval-input="${esc(parcel.id)}" aria-label="Search parcel history" placeholder="Find a decision, failure, test or route"><button class="button secondary" data-retrieve-parcel="${esc(parcel.id)}">Retrieve</button></div><small>${esc(metrics.retrievals??0)} retrievals · ${esc(metrics.retrievedEvents??0)} events returned; each lookup is audited.</small></section></div></details>`;
}

function bindParcelContextControls(){document.querySelectorAll('[data-answer-question]').forEach(button=>button.addEventListener('click',()=>{const questionId=button.dataset.answerQuestion,parcelId=button.dataset.parcelId,input=document.querySelector(`[data-question-input="${CSS.escape(questionId)}"]`),answer=input?.value?.trim();if(!answer){toast('Enter an answer first');return}jobCommand(`/api/parcels/${encodeURIComponent(parcelId)}/questions/${encodeURIComponent(questionId)}/answer`,{answer}).catch(showError)}));document.querySelectorAll('[data-add-criterion]').forEach(button=>button.addEventListener('click',()=>{const parcelId=button.dataset.addCriterion,input=document.querySelector(`[data-criterion-input="${CSS.escape(parcelId)}"]`),kind=document.querySelector(`[data-criterion-kind="${CSS.escape(parcelId)}"]`)?.value||'CUSTOM',description=input?.value?.trim();if(!description){toast('Enter a success criterion first');return}jobCommand(`/api/parcels/${encodeURIComponent(parcelId)}/criteria`,{kind,description,requiredEvidence:[]}).catch(showError)}));document.querySelectorAll('[data-evaluate-criterion]').forEach(button=>button.addEventListener('click',()=>{const parcelId=button.dataset.parcelId,criterionId=button.dataset.evaluateCriterion,status=button.dataset.status;jobCommand(`/api/parcels/${encodeURIComponent(parcelId)}/criteria/${encodeURIComponent(criterionId)}/evaluate`,{status,evidence:[`operator:${status.toLowerCase()}`]}).catch(showError)}));document.querySelectorAll('[data-steer-parcel]').forEach(button=>button.addEventListener('click',()=>{const parcelId=button.dataset.steerParcel,input=document.querySelector(`[data-steering-input="${CSS.escape(parcelId)}"]`),instruction=input?.value?.trim();if(!instruction){toast('Enter a steering instruction first');return}jobCommand(`/api/parcels/${encodeURIComponent(parcelId)}/steering`,{instruction}).catch(showError)}));document.querySelectorAll('[data-retrieve-parcel]').forEach(button=>button.addEventListener('click',()=>{const parcelId=button.dataset.retrieveParcel,input=document.querySelector(`[data-retrieval-input="${CSS.escape(parcelId)}"]`),query=input?.value?.trim();if(!query){toast('Enter a history query first');return}jobCommand(`/api/parcels/${encodeURIComponent(parcelId)}/context/retrieve`,{query}).then(result=>toast(`Retrieved ${result.length} context events`)).catch(showError)}))}

function renderWorkflowPreview(job) {
  const parameters = Object.entries(job.spec.parameters || {}).map(([name, definition]) => `${name}: ${definition.type}${definition.required ? ' · required' : ''}${definition.default === undefined ? '' : ` · default ${definition.default}`}`);
  const steps = job.spec.steps.map((step, index) => `<li><span>${index + 1}</span><div><strong>${esc(step.name || step.id)}</strong><small>${esc(step.action)} · requires ${esc(step.requires.join(', ') || 'no capabilities')}</small><small>Verification: ${esc(step.verification?.join(', ') || 'none declared')}</small></div></li>`).join('');
  return `<section class="workflow-preview" aria-label="Selected workflow details"><p>${esc(job.metadata.description || 'No workflow description supplied.')}</p><div class="workflow-preview-facts"><span><b>Version</b>${esc(job.metadata.version)}</span><span><b>Schedule</b>${esc(scheduleLabel(job))}</span><span><b>Priority</b>${esc(job.spec.priority)}</span><span><b>Concurrency</b>${esc(job.spec.concurrency)}</span></div><span class="eyebrow">Steps</span><ol>${steps}</ol><span class="eyebrow">Parameters</span><p class="workflow-parameters">${esc(parameters.join(' · ') || 'No parameters')}</p><small class="workflow-preview-hint">The full definition, Run controls, history, evidence and artifacts are open in the main pane.</small></section>`;
}

function renderJobs() {
  const jobs = jobState.jobs, selected = jobs.find(job => job.metadata.id === jobState.selectedJob);
  document.querySelector('#job-count').textContent = jobs.length;
  document.querySelector('#job-list').innerHTML = jobs.length ? jobs.map(job => { const isSelected = job.metadata.id === jobState.selectedJob; return `<div class="workflow-catalog-item ${isSelected ? 'selected' : ''}"><button class="job-card ${isSelected ? 'active' : ''} ${runningClass(job.latestRun)}" data-job="${esc(job.metadata.id)}" aria-expanded="${isSelected}"><span><strong>${esc(job.metadata.name)}</strong><small>${esc(job.metadata.id)} · v${esc(job.metadata.version)}</small></span><span class="status-pill ${statusClass(job.latestRun?.status)}">${esc(job.latestRun?.status || 'NEVER RUN')}</span><small>${esc(scheduleLabel(job))}</small><span class="workflow-disclosure" aria-hidden="true">${isSelected ? '−' : '+'}</span></button>${isSelected ? renderWorkflowPreview(job) : ''}</div>`; }).join('') : '<div class="data-card"><p>No Job manifests loaded.</p></div>';
  document.querySelectorAll('[data-job]').forEach(button => button.addEventListener('click', () => { jobState.selectedJob = button.dataset.job; jobState.selectedRun = null; renderJobs(); }));
  renderJobDetail(selected);
  renderQueue();
  renderRunHistory();
  renderManagedNodes();
  renderWorkersAndLocks();
  renderCommandOutputMetrics();
  renderHarnessEfficiencyMetrics();
  renderParcels();
  bindRunLinks();
}

function renderParcels() {
  document.querySelector('#parcel-count').textContent = jobState.parcels.length;
  document.querySelector('#parcel-list').innerHTML = jobState.parcels.length ? jobState.parcels.map(parcel => {
    const t = parcel.telemetry, activeStage = parcel.stages.find(stage => ['RUNNING', 'WAITING'].includes(stage.status));
    const stages = parcel.stages.map(stage => `<div class="parcel-stage ${stage.status === 'BLOCKED' ? 'parcel-blocked' : ''} ${stage.status === 'RUNNING' ? 'is-running' : ''}"><strong>${esc(stage.name)}</strong><span class="status-pill ${statusClass(stage.status)}">${esc(stage.status)}</span><small>${esc(stage.job)} · depends on ${esc(stage.dependsOn.join(', ') || 'nothing')} · executor ${esc(stage.executor||'not assigned')}</small><small>requires ${esc(stage.requiredCapabilities?.join(', ')||'no additional capability')} · outputs ${esc(stage.outputs?.join(', ')||'job-declared artifacts')}</small><small class="parcel-route">requested ${esc(stage.requestedRoute ? `${stage.requestedRoute.provider || 'policy'} / ${stage.requestedRoute.modelRole || stage.requestedRoute.model || 'policy'} / ${stage.requestedRoute.profile || 'policy'} — ${stage.requestedRoute.reason}` : 'normal policy')}<br>actual ${esc(stage.actualRoute ? `${stage.actualRoute.provider || 'no model'} / ${stage.actualRoute.model || 'no model'} / ${stage.actualRoute.profile || 'control action'} · workers ${stage.actualRoute.workers.join(', ') || 'none'} — ${stage.actualRoute.reason}` : 'waiting for execution')}</small>${stage.waitingReason || stage.error ? `<small>${esc(stage.waitingReason || stage.error)}</small>` : ''}</div>`).join('');
    const live = renderParcelLive(parcel, activeStage);
    const decision = parcel.decision ? `<section class="parcel-decision ${parcel.decision.outcome === 'FAIL_CLOSED' ? 'decision-failed' : ''}"><div><span class="eyebrow">Agent Control decision</span><strong>${esc(parcel.decision.title)}</strong></div><span class="status-pill ${parcel.decision.outcome === 'FAIL_CLOSED' ? 'error' : ''}">${esc(parcel.decision.outcome)}</span><p>${esc(parcel.decision.summary)}</p><ul>${parcel.decision.evidence.map(item => `<li>${esc(item)}</li>`).join('')}</ul>${parcel.decision.blockedStages.length ? `<small>Not dispatched: ${esc(parcel.decision.blockedStages.join(' · '))}</small>` : ''}<small>Authority: ${esc(parcel.decision.authority)} · no external harness interpretation required</small></section>` : '';
    const totals = parcel.audit?.totals;
    const summary = totals ? `<div class="parcel-cost-summary"><span>${esc(totals.models.length ? totals.models.join(', ') : 'Control action · no model')}</span><span>${esc(totals.invocations)} invocation${totals.invocations === 1 ? '' : 's'}</span><span>${esc(totals.totalTokens ?? 'tokens unavailable')}</span><span>${esc(totals.cost === null ? 'cost unavailable' : `${totals.currency || ''} ${totals.cost}`.trim())}</span><span>${esc(durationLabel(parcel.createdAt, parcel.endedAt))} wall</span></div>` : '';
    const integrity = parcel.transportIntegrity ? `<div class="parcel-integrity"><span>Transport integrity <b>${esc(parcel.transportIntegrity.state)}</b></span><span>score ${esc(parcel.transportIntegrity.score)}%</span><span>contract ${esc(parcel.transportIntegrity.contractSha256.slice(0, 16))}…</span></div>` : '<div class="parcel-integrity"><span>Transport integrity <b>LEGACY_UNBOUND</b></span></div>';
    return `<article class="parcel-card ${parcel.status === 'RUNNING' ? 'is-running' : ''}"><div class="parcel-head"><strong>${esc(parcel.objective)}</strong><span class="status-pill ${statusClass(parcel.status)}">${esc(parcel.status)}</span><p>${esc(parcel.prompt)}</p></div><div class="parcel-metrics"><span>${esc(parcel.planner.kind)} planner</span><span>${esc(durationLabel(parcel.createdAt, parcel.endedAt))}</span><span>tokens ${esc(t.totalTokens ?? 'unavailable')}</span><span>cost ${esc(t.cost === null ? 'unavailable' : `${t.currency || ''} ${t.cost}`.trim())}</span></div>${integrity}${summary}${live}${decision}${renderParcelContext(parcel)}${stages}${renderParcelAudit(parcel)}</article>`;
  }).join('') : '<div class="compact-empty">No natural-language work submitted yet.</div>';
  bindParcelContextControls();
  document.querySelectorAll('.parcel-card').forEach((node,index)=>{node.dataset.parcelId=jobState.parcels[index]?.id||'';});
}

function byteLabel(value) {
  if (value === null || value === undefined) return '--';
  const units = ['B', 'KB', 'MB', 'GB', 'TB']; let number = Number(value), unit = 0;
  if (!Number.isFinite(number)) return '--';
  while (number >= 1000 && unit < units.length - 1) { number /= 1000; unit++; }
  return `${number.toFixed(unit > 1 ? 1 : 0)}${units[unit]}`;
}

function uptimeLabel(value) {
  if (value === null || value === undefined) return '--';
  const seconds = Number(value); if (!Number.isFinite(seconds)) return '--';
  const days = Math.floor(seconds / 86400), hours = Math.floor(seconds % 86400 / 3600), minutes = Math.floor(seconds % 3600 / 60);
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function resourceMetric(node, key, fallback = null) {
  const metric = node?.measurements?.[key];
  return metric || {value: fallback, source: 'legacy probe · source unavailable', authority: fallback === null ? 'unavailable' : 'unknown', freshness: fallback === null ? 'unavailable' : 'unknown', observedAt: node?.lastHeartbeatAt || null, limitations: []};
}

function resourceMetricMeta(metric) {
  const timestamp = metric.observedAt ? timeLabel(metric.observedAt) : 'timestamp unavailable';
  return `${metric.source || 'source unavailable'} · ${metric.authority || 'authority unavailable'} · ${metric.freshness || 'freshness unavailable'} · ${timestamp}`;
}

function numericMetric(value) { return Number.isFinite(value) ? value : '--'; }

function renderManagedNodes() {
  const rows = jobState.resources.filter(resource => resource.node);
  document.querySelector('#managed-node-list').innerHTML = rows.length ? rows.map(resource => {
    const node = resource.node, memory = node.memory, busiest = [...(node.storage || [])].sort((a, b) => b.usedPercent - a.usedPercent)[0], load = node.cpu?.load;
    const uptime = resourceMetric(node, 'uptimeSeconds', node.uptimeSeconds), busy = resourceMetric(node, 'cpuBusyPercent'), availableMemory = resourceMetric(node, 'memoryAvailableBytes', memory?.availableBytes ?? null), totalMemory = resourceMetric(node, 'memoryTotalBytes', memory?.totalBytes ?? null);
    const links = (node.connectivity || []).map(item => `${item.label} ${item.state}`).join(', ') || 'not configured';
    return `<div class="compact-row worker-row managed-node-card"><strong>${esc(resource.name)}</strong><span class="status-pill ${statusClass(node.state)}">${esc(node.state)}</span><small>${esc(node.os?.name || resource.platform)} · ${esc(node.os?.kernel || 'kernel unknown')} · uptime ${esc(uptimeLabel(uptime.value))}</small><small>Heartbeat ${esc(timeLabel(node.lastHeartbeatAt))} · CPU busy ${esc(busy.value === null ? '--' : `${busy.value.toFixed(1)}%`)} · load ${esc(load ? `${numericMetric(load.one)}/${numericMetric(load.five)}/${numericMetric(load.fifteen)}` : '--')} · memory ${esc(`${byteLabel(availableMemory.value)} free / ${byteLabel(totalMemory.value)}`)}</small><small>Telemetry CPU: ${esc(resourceMetricMeta(busy))}</small><small>Workload ${esc(node.currentWorkload || 'none')} · maintenance ${esc(node.maintenance.state)} · connectivity ${esc(links)}${busiest ? ` · ${esc(busiest.mount)} ${esc(byteLabel(busiest.availableBytes))} free` : ''}</small><small>${esc(node.capabilities.join(', ') || 'No discovered capabilities')}</small></div>`;
  }).join('') : '<div class="compact-empty">No managed nodes configured</div>';
}

function renderJobDetail(job) {
  document.querySelector('#job-empty').hidden = Boolean(job);
  const detail = document.querySelector('#job-detail');
  detail.hidden = !job;
  if (!job) return;
  const selectedRun = jobState.selectedRun ? jobState.runs.find(run => run.id === jobState.selectedRun) : job.latestRun;
  const steps = (selectedRun?.steps || job.spec.steps).map(step => renderStep(step)).join('');
  const schedules = job.schedules.map(schedule => `<div class="schedule-row"><span><strong>${esc(schedule.metadata.name)}</strong><small>${esc(schedule.spec.cron)} · ${esc(schedule.spec.timezone)} · ${esc(schedule.spec.missedRunPolicy)}</small></span><span class="status-pill ${schedule.state?.enabled ? '' : 'neutral'}">${schedule.state?.enabled ? 'ENABLED' : 'DISABLED'}</span><small>Previous ${esc(timeLabel(schedule.state?.previousScheduledAt))} · Next ${esc(timeLabel(schedule.state?.nextScheduledAt))}</small></div>`).join('');
  const nextRun = job.schedules.map(schedule => schedule.state?.nextScheduledAt).filter(Boolean).sort()[0];
  const submitted = selectedRun ? `<section class="run-evidence"><div class="data-card full-width"><label>Immutable submitted parameters for ${esc(selectedRun.id)}</label>${Object.entries(selectedRun.parameters || {}).map(([name, value]) => `<p><strong>${esc(name)}</strong></p><pre>${esc(typeof value === 'string' ? value : JSON.stringify(value, null, 2))}</pre>`).join('') || '<p>No submitted parameters.</p>'}</div></section>` : '';
  detail.innerHTML = `<div class="authority-note"><strong>3.3 authority boundary</strong><span>The dashboard requests work. Agent Control owns scheduling, policy, placement, approvals and cancellation. Model routing remains separate from worker placement.</span></div><div class="job-header"><div><span class="eyebrow">${esc(job.metadata.id)} · v${esc(job.metadata.version)}</span><h2>${esc(job.metadata.name)}</h2><p>${esc(job.metadata.description || '')}</p></div><span class="status-pill ${job.spec.enabled === false ? 'neutral' : ''}">${job.spec.enabled === false ? 'DISABLED' : 'ENABLED'}</span></div><div class="metrics"><div class="metric"><span>Next run</span><strong>${esc(timeLabel(nextRun, 'Manual / disabled'))}</strong></div><div class="metric"><span>Last run</span><strong>${esc(timeLabel(job.latestRun?.requestedAt, 'Never'))}</strong></div><div class="metric"><span>Priority</span><strong>${esc(job.spec.priority)}</strong></div><div class="metric"><span>Concurrency</span><strong>${esc(job.spec.concurrency)}</strong></div></div>${selectedRun ? renderRunEfficiency(selectedRun) : ''}${submitted}<div class="job-run-heading"><div><span class="eyebrow">New attempt</span><h3>Run parameters</h3></div><small>Edits below affect only a new run, never the selected historical result.</small></div><form id="run-parameters" class="data-grid">${Object.entries(job.spec.parameters || {}).map(([name, definition]) => renderParameterField(name, definition)).join('')}</form><div class="control-strip"><button class="button" id="run-job">Run now</button><button class="button secondary" id="reset-job-parameters">Reset parameters</button>${job.schedules.map(schedule => `<button class="button secondary" data-schedule-command="${schedule.state?.enabled ? 'disable' : 'enable'}" data-schedule="${esc(schedule.metadata.id)}">${schedule.state?.enabled ? 'Disable' : 'Enable'} ${esc(schedule.metadata.name)}</button>`).join('')}</div>${schedules ? `<div class="schedule-list">${schedules}</div>` : ''}<div class="job-run-heading"><div><span class="eyebrow">${selectedRun ? `Run ${esc(selectedRun.id)}` : 'Definition'}</span><h3>Steps</h3></div>${selectedRun ? `<small>${esc(selectedRun.trigger.type)} · ${esc(selectedRun.trigger.actor)} · ${esc(durationLabel(selectedRun.startedAt, selectedRun.endedAt))}</small>` : ''}</div><div class="job-steps">${steps}</div>${selectedRun ? renderRunControls(selectedRun) + renderRunLineage(selectedRun) + renderRunEvidence(selectedRun) : ''}`;
  if (selectedRun) detail.insertAdjacentHTML('beforeend', renderInvocationHistory(selectedRun));
  const parameterForm = document.querySelector('#run-parameters');
  window.AgentControlDashboardParameters.bind(job.metadata.id, parameterForm);
  document.querySelector('#reset-job-parameters').addEventListener('click', () => { window.AgentControlDashboardParameters.clear(job.metadata.id, parameterForm); renderJobs(); });
  document.querySelector('#run-job').addEventListener('click', () => { const form = document.querySelector('#run-parameters'); if (!form.reportValidity()) return; let parameters; try { parameters = window.AgentControlDashboardParameters.collect(job.spec.parameters || {}, form); } catch (error) { showError(error); return; } jobCommand(`/api/jobs/${encodeURIComponent(job.metadata.id)}/run`, {parameters}).then(result => { window.AgentControlDashboardParameters.clear(job.metadata.id, form); jobState.selectedRun = result.id; renderJobs(); }).catch(showError); });
  document.querySelectorAll('[data-schedule]').forEach(button => button.addEventListener('click', () => jobCommand(`/api/schedules/${encodeURIComponent(button.dataset.schedule)}/${button.dataset.scheduleCommand}`, {}).catch(showError)));
  bindRunCommands(selectedRun);
  bindArtifactContentButtons();
}

function renderParameterField(name, definition) {
  const required = definition.required ? ' required' : '', limits = `${definition.minimum === undefined ? '' : ` min="${esc(definition.minimum)}"`}${definition.maximum === undefined ? '' : ` max="${esc(definition.maximum)}"`}`;
  if (definition.type === 'boolean') return `<label class="data-card"><span>${esc(name)}</span><input type="checkbox" data-job-parameter="${esc(name)}"${definition.default ? ' checked' : ''}></label>`;
  if (definition.enum) return `<label class="data-card"><span>${esc(name)}</span><select data-job-parameter="${esc(name)}"${required}>${definition.enum.map(value => `<option value="${esc(value)}"${Object.is(value, definition.default) ? ' selected' : ''}>${esc(value)}</option>`).join('')}</select></label>`;
  if (definition.type === 'string' && /prompt/i.test(name)) return `<label class="data-card full-width"><span>${esc(name)}</span><textarea rows="12" data-job-parameter="${esc(name)}"${required}>${esc(definition.default ?? '')}</textarea></label>`;
  const numeric = ['integer', 'number'].includes(definition.type), value = definition.default === undefined ? '' : definition.default;
  return `<label class="data-card"><span>${esc(name)}</span><input type="${numeric ? 'number' : 'text'}"${numeric ? ` step="${definition.type === 'integer' ? '1' : 'any'}"` : ''}${limits} value="${esc(value)}" data-job-parameter="${esc(name)}"${required}></label>`;
}

function renderStep(step) {
  const attempts = step.attempts?.length ? `${step.attempts.length} attempt${step.attempts.length === 1 ? '' : 's'}` : 'Not attempted';
  const worker = step.placement?.selected || step.attempts?.at(-1)?.workerId || 'Not placed';
  const verification = Array.isArray(step.verification) ? `Verification required: ${step.verification.join(', ') || 'none'}` : step.verification ? `Verification ${step.verification.passed.length}/${step.verification.required.length}` : 'Verification not declared';
  const recovery=step.nextAttemptAt||step.recoveryDeadlineAt||step.remainingRetryBudget!==undefined?`<small>Next retry/check ${esc(timeLabel(step.nextAttemptAt))} · remaining retry budget ${esc(step.remainingRetryBudget??'unknown')} · ${deadlineMarkup(step.recoveryDeadlineAt)}</small>`:'';
  const cleanup=step.cleanup?`<small>Cleanup ${esc(step.cleanup.outcome)} · verified ${esc(timeLabel(step.cleanup.completedAt))} · ${esc(step.cleanup.processes?.length??0)} process identity record(s)</small>`:'';
  const effects=(step.governance?.effects||[]).map(item=>`${item.kind} ${item.resource.id}`).join(' · '),external=(step.externalOperations||[]).map(item=>`${item.state} ${item.resource.id}`).join(' · '),governance=effects||external?`<small>Resolved effects: ${esc(effects||'none')}<br>External operation truth: ${esc(external||'none')}</small>`:'';
  return `<div class="job-step"><span class="step-mark ${statusClass(step.status)}">${esc(step.status === 'SUCCEEDED' ? '✓' : step.status === 'RUNNING' ? '●' : '○')}</span><div><strong>${esc(step.name || step.id)}</strong><small>${esc(step.action)} · worker ${esc(worker)} · ${esc(attempts)} · ${esc(durationLabel(step.startedAt, step.endedAt))}</small><small>${esc(verification)}</small>${governance}${recovery}${cleanup}${step.waitingReason ? `<p>${esc(step.waitingReason)}</p>` : ''}${step.error ? `<p class="error-text">${esc(step.error)}</p>` : ''}</div><span class="status-pill ${statusClass(step.status)}">${esc(step.status || 'DEFINED')}</span></div>`;
}

function renderRunControls(run) {
  const approvals = [...new Set(run.steps.filter(step => step.status === 'WAITING_FOR_APPROVAL' && step.approval).map(step => step.approval))];
  const cancel = terminalRunStatuses.has(run.status) ? '' : '<button class="button danger" data-run-command="cancel">Cancel run</button>';
  const retry = retryableRunStatuses.has(run.status) ? '<button class="button secondary" data-run-command="retry">Retry run</button>' : '';
  const approve = approvals.map(policy => `<button class="button warning" data-run-command="approve" data-policy="${esc(policy)}">Approve ${esc(policy)}</button>`).join('');
  return cancel || retry || approve ? `<div class="control-strip run-controls">${cancel}${retry}${approve}</div>` : '';
}

function bindRunCommands(run) {
  if (!run) return;
  document.querySelectorAll('[data-run-command]').forEach(button => button.addEventListener('click', () => {
    const commandName = button.dataset.runCommand;
    if (commandName === 'cancel' && !confirm(`Cancel ${run.id}?`)) return;
    const body = commandName === 'approve' ? {policy: button.dataset.policy} : {};
    jobCommand(`/api/runs/${encodeURIComponent(run.id)}/${commandName}`, body).then(result => { if (commandName === 'retry' && result?.id) { jobState.selectedJob = result.jobId; jobState.selectedRun = result.id; renderJobs(); } }).catch(showError);
  }));
}

function renderRunLineage(run) {
  const links = [['Replaces', run.lineage?.replacesRunId], ['Replaced by', run.lineage?.replacedByRunId], ['Retry of', run.lineage?.retryOfRunId], ['Retried by', run.lineage?.retriedByRunId]].filter(([, id]) => id);
  return links.length ? `<section class="run-evidence"><div class="data-card full-width"><label>Replacement / retry lineage</label>${links.map(([label, id]) => `<button class="button secondary" data-run="${esc(id)}">${esc(label)} ${esc(id)}</button>`).join(' ')}</div></section>` : '';
}

function renderJobRunLanes() {
  const list = document.querySelector('#lane-list'); if (!list) return;
  const active = jobState.runs.filter(run => !terminalRunStatuses.has(run.status));
  const recentTerminal = jobState.runs.filter(run => terminalRunStatuses.has(run.status) && (run.lineage?.replacedByRunId || run.lineage?.retriedByRunId)).slice(0, 8);
  const cards = [...active, ...recentTerminal].map(run => { const invocation = jobState.invocations.filter(item => item.runId === run.id).at(-1); const phase = invocation?.phase || run.steps.find(step => !['SUCCEEDED', 'FAILED', 'TIMED_OUT', 'CANCELLED'].includes(step.status))?.status || run.status; const relation = run.lineage?.replacesRunId ? `replacement for ${run.lineage.replacesRunId}` : run.lineage?.retryOfRunId ? `retry of ${run.lineage.retryOfRunId}` : run.lineage?.replacedByRunId ? `replaced by ${run.lineage.replacedByRunId}` : run.lineage?.retriedByRunId ? `retried by ${run.lineage.retriedByRunId}` : 'original attempt'; return `<button class="lane-card job-run-lane ${runningClass(run)}" data-run="${esc(run.id)}"><span class="lane-card-top"><span><span class="dot ${esc(statusClass(run.status))}"></span> <span class="lane-name">${esc(run.jobId)}</span></span><span class="status-pill ${statusClass(run.status)}">${esc(run.status)}</span></span><span class="lane-task-compact">${esc(phase)} · ${esc(relation)}</span><span class="lane-meta"><span>${esc(run.id)}</span><span>${esc(invocation ? `${invocation.provider}/${invocation.model}` : 'provider pending')}</span></span></button>`; }).join('');
  if (cards) list.insertAdjacentHTML('afterbegin', `<div class="eyebrow">Governed Job lanes</div>${cards}`);
  bindRunLinks();
}

function renderRunEvidence(run) {
  const artifactRows = jobState.artifacts.filter(item => item.runId === run.id);
  const artifacts = artifactRows.length ? artifactRows.map(item => `<div class="artifact-row"><span class="artifact-chip">${esc(item.name)}</span><span>${esc(item.type)} · ${esc(item.schema)} · ${esc(item.size)} bytes</span><code>sha256:${esc(item.sha256)}</code><small>${esc(item.provenance.action)} · ${esc(item.provenance.workerId)} · ${esc(item.retention)}</small><button type="button" class="button secondary" data-artifact-content="${esc(item.id)}">Open complete content</button></div>`).join('') : '<span class="muted">No artifacts</span>';
  const rationale = run.steps.flatMap(step => step.placement ? [`${step.id}: ${step.placement.selected || 'none'} — ${step.placement.reasons.join(', ')}${step.placement.rejected.length ? `; rejected ${step.placement.rejected.map(item => `${item.workerId} (${item.reasons.join(', ')})`).join('; ')}` : ''}`] : []).join('\n');
  const verification = run.steps.map(step => `${step.id}: ${(step.verification?.passed || []).join(', ') || 'no passing evidence'}${step.verification?.failed.length ? `; failed ${step.verification.failed.join(', ')}` : ''}`).join('\n');
  const provenance = run.provenance.map(item => `${timeLabel(item.at)} · ${item.type}: ${item.detail}`).join('\n');
  const governance=run.steps.flatMap(step=>(step.externalOperations||[]).map(item=>`${step.id}: ${item.effect} ${item.resource.id} → ${item.state}${item.decisionId?` · decision ${item.decisionId}`:''}${item.reason?` · ${item.reason}`:''}`)).join('\n');
  return `<div class="run-evidence"><div class="data-card full-width"><label>Artifacts</label><div>${artifacts}</div></div><div class="data-card"><label>Verification</label><p>${esc(verification || 'No verification observations')}</p></div><div class="data-card"><label>Worker placement</label><p>${esc(rationale || 'Not placed')}</p></div><div class="data-card"><label>External operation truth</label><p>${esc(governance||'No consequential external operation proposed')}</p></div><div class="data-card"><label>Errors</label><p>${esc(run.errors.join(', ') || 'None')}</p></div><div class="data-card"><label>Structured log / provenance</label><p>${esc(provenance || 'No events recorded')}</p></div></div>`;
}

function artifactTranscriptMarkup(value) {
  const artifact = value.artifact || {}, content = value.content || {}, parcel = jobState.parcels.find(item => item.stages.some(stage => stage.runId === artifact.runId));
  const original = parcel ? `<article><span class="eyebrow">Original initiating prompt</span><pre>${esc(parcel.prompt)}</pre></article>` : '';
  const events = Array.isArray(content.transcript) ? content.transcript.map((event, index) => `<article><span class="eyebrow">${esc(`${index + 1}. ${event.type || 'event'} · ${event.at || 'time unavailable'}`)}</span><pre>${esc(JSON.stringify(event, null, 2))}</pre></article>`).join('') : '';
  const remainder = {...content}; delete remainder.transcript;
  return `<header><div><span class="eyebrow">Agent Control managed evidence</span><h2>Complete native transcript</h2><p>${esc(artifact.name || artifact.id)} · sha256:${esc(artifact.sha256 || 'unavailable')}</p></div><button type="button" class="button secondary" data-close-artifact>Close</button></header><div class="artifact-transcript-body">${original}${events}<article><span class="eyebrow">Independent verification, mutation and remaining artifact fields</span><pre>${esc(JSON.stringify(remainder, null, 2))}</pre></article></div>`;
}

async function openArtifactContent(id) {
  if (state.operatorAuth !== 'authenticated') { openOperator('Authenticate as operator before opening managed artifact content.'); return; }
  const response = await fetch(`/api/artifacts/${encodeURIComponent(id)}/content`, {headers: {Authorization: `Bearer ${state.token}`}}), value = await response.json();
  if (response.status === 401) { authenticationExpired(); throw new Error('Operator authentication required'); }
  if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
  let dialog = document.querySelector('#artifact-content-dialog');
  if (!dialog) { dialog = document.createElement('dialog'); dialog.id = 'artifact-content-dialog'; dialog.className = 'artifact-content-dialog'; document.body.append(dialog); }
  dialog.innerHTML = artifactTranscriptMarkup(value); dialog.querySelector('[data-close-artifact]').addEventListener('click', () => dialog.close()); dialog.showModal();
}

function bindArtifactContentButtons() { document.querySelectorAll('[data-artifact-content]').forEach(button => button.addEventListener('click', () => openArtifactContent(button.dataset.artifactContent).catch(showError))); }

function renderQueue() {
  const rows = jobState.queue;
  document.querySelector('#queue-count').textContent = rows.length;
  document.querySelector('#job-queue').innerHTML = rows.length ? rows.map(item => {
    const missing = item.missingCapabilities.length ? `Missing: ${item.missingCapabilities.join(', ')}` : `Eligible: ${item.eligibleWorkers.join(', ') || 'none proven'}`;
    const recovery=item.nextAttemptAt||item.recoveryDeadlineAt||item.remainingRetryBudget!==undefined?`<small>Next retry/check ${esc(timeLabel(item.nextAttemptAt))} · budget ${esc(item.remainingRetryBudget??'unknown')} · ${deadlineMarkup(item.recoveryDeadlineAt)}</small>`:'';
    return `<button class="compact-row queue-row" data-run="${esc(item.runId)}"><strong>${esc(item.jobId)} · ${esc(item.priority)}</strong><span class="status-pill ${statusClass(item.status)}">${esc(item.status)}</span><small>${esc(item.stepId)} · age ${esc(ageLabel(item.queuedAt))}</small><small>${esc(item.reason || 'Ready for dispatch')}</small><small>${esc(missing)}</small>${recovery}${item.scheduledAt ? `<small>Scheduled ${esc(timeLabel(item.scheduledAt))}</small>` : ''}</button>`;
  }).join('') : '<div class="compact-empty">Queue is empty</div>';
}

function renderRunHistory() {
  const query = jobState.search.trim().toLowerCase();
  const runs = jobState.runs.filter(run => !query || [run.id, run.jobId, run.status, run.trigger.type, ...run.selectedWorkers].some(value => String(value).toLowerCase().includes(query))).slice(0, 50);
  document.querySelector('#run-history').innerHTML = runs.length ? runs.map(run => `<button class="compact-row ${runningClass(run)}" data-run="${esc(run.id)}"><strong>${esc(run.jobId)}</strong><span class="status-pill ${statusClass(run.status)}">${esc(run.status)}</span><small>${esc(timeLabel(run.requestedAt))} · ${esc(run.trigger.type)} · ${durationMarkup(run.startedAt || run.requestedAt, run.endedAt, !terminalRunStatuses.has(run.status))}</small><small>Workers: ${esc(run.selectedWorkers.join(', ') || 'none')}</small></button>`).join('') : '<div class="compact-empty">No matching runs</div>';
}

function renderWorkersAndLocks() {
  const workers = jobState.workers;
  document.querySelector('#worker-list').innerHTML = workers.length ? workers.map(worker => `<div class="compact-row worker-row"><strong>${esc(worker.id)}</strong><span class="status-pill ${statusClass(worker.health === 'offline' ? 'FAILED' : worker.health.toUpperCase())}">${esc(worker.health)}</span><small>Capacity ${esc(worker.active)}/${esc(worker.capacity)} · observed ${esc(timeLabel(worker.observedAt))}</small><small>${esc(worker.capabilities.join(', ') || 'No capabilities')}</small></div>`).join('') : '<div class="compact-empty">No workers registered</div>';
  document.querySelector('#resource-locks').innerHTML = jobState.locks.length ? `<span class="subheading">Active resource locks</span>${jobState.locks.map(lock => `<button class="compact-row" data-run="${esc(lock.runId)}"><strong>${esc(lock.resource)}</strong><span class="status-pill waiting">HELD</span><small>${esc(lock.runId)} · step ${esc(lock.stepId)} · since ${esc(timeLabel(lock.acquiredAt))}</small></button>`).join('')}` : '<div class="compact-empty">No resource locks held</div>';
}

function renderCommandOutputMetrics() {
  const metrics = jobState.outputMetrics;
  const element = document.querySelector('#command-output-metrics');
  if (!metrics || !metrics.commandsObserved) { element.innerHTML = '<div class="compact-empty">No command output observed this session</div>'; return; }
  const reduction = metrics.estimatedTokensOriginal ? Math.max(0, Math.round(metrics.contextTokensAvoided / metrics.estimatedTokensOriginal * 100)) : 0;
  element.innerHTML = `<div class="compact-row worker-row"><strong>Context tokens avoided</strong><span class="status-pill">${esc(metrics.contextTokensAvoided)}</span><small>${esc(reduction)}% effective reduction after expansions</small><small>${esc(metrics.commandsCompacted)} compacted / ${esc(metrics.commandsObserved)} observed · ${esc(metrics.expansionRequests)} expansions · ${esc(metrics.fullResultRequests)} full-result requests</small><small>${esc(byteLabel(metrics.originalOutputBytes))} authoritative → ${esc(byteLabel(metrics.returnedOutputBytes))} model-facing</small></div>`;
}

function renderRunEfficiency(run) {
  const values = jobState.invocations.filter(item => item.runId === run.id);
  const latest = values.at(-1), known = selector => values.length > 0 && values.every(item => selector(item) !== null), sum = selector => values.reduce((total, item) => total + (selector(item) || 0), 0);
  const pending = latest?.state === 'RUNNING' || !terminalRunStatuses.has(run.status), fresh = pending ? 'awaiting authoritative update' : known(item => item.usage.freshInputTokens) ? sum(item => item.usage.freshInputTokens) : null, cached = pending ? 'awaiting authoritative update' : known(item => item.usage.cachedInputTokens) ? sum(item => item.usage.cachedInputTokens) : null, output = pending ? 'awaiting authoritative update' : known(item => item.usage.outputTokens) ? sum(item => item.usage.outputTokens) : null;
  const reasoning = pending ? 'awaiting completion' : known(item => item.usage.reasoningTokens) ? sum(item => item.usage.reasoningTokens) : null, total = pending ? 'awaiting completion' : known(item => item.usage.totalProcessedTokens) ? sum(item => item.usage.totalProcessedTokens) : null;
  const mixedCurrencies = new Set(values.map(item => item.currency).filter(Boolean)).size > 1;
  const cost = pending ? 'awaiting completion' : mixedCurrencies ? null : values.length > 0 && values.every(item => item.providerReportedCost !== null) ? sum(item => item.providerReportedCost) : values.length > 0 && values.every(item => item.calculatedCost !== null) ? sum(item => item.calculatedCost) : null;
  const subscription = values.some(item => item.costAccounting?.billingMode === 'SUBSCRIPTION_QUOTA');
  const activeStep = run.steps.find(step => !['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(step.status)) || run.steps.at(-1), stage = latest?.phase || activeStep?.status || run.status;
  const verification = activeStep?.verification ? `${activeStep.verification.passed.length}/${activeStep.verification.required.length} passed${activeStep.verification.failed.length ? ` · ${activeStep.verification.failed.length} failed` : ''}` : 'Unavailable';
  const lastActivity = latest?.phaseUpdatedAt || run.updatedAt || run.requestedAt, liveness = window.AgentControlRunningState.liveness(run.status, lastActivity);
  const route = executionRouteSummary(activeStep);
  const routing = latest?.routing, routingReason = routing?.escalationReason || activeStep?.placement?.reasons?.join(', ') || 'Awaiting placement';
  const context = routing ? `${routing.originalContextTokens ?? 'unknown'} → ${routing.contextPacketTokens ?? 'unknown'} tokens · ${routing.retainedEvidenceIds.length} evidence item(s)` : 'Not a Context Compiler run';
  const costLabel = subscription && cost === null ? 'SUBSCRIPTION / QUOTA CONSUMPTION' : mixedCurrencies ? 'Unavailable (mixed currencies)' : cost === null ? 'Unavailable' : `${latest?.currency || ''} ${cost}`.trim();
  const recoveryStep=run.steps.find(step=>step.nextAttemptAt||step.recoveryDeadlineAt||['AUTHENTICATION_BLOCKED','RECONNECTING','CANCEL_PENDING','CLEANUP_UNCERTAIN'].includes(step.status));
  const budget=latest?.runtimeBudget, budgetProfile=budget?`${budget.profile} · turn ${latest.turnNumber}/${budget.turnBudget} · ${budget.admission}`:'Legacy / unavailable';
  const budgetClocks=budget?`job ${Math.round(budget.absoluteJobDeadlineMs/1000)}s · model ${Math.round(budget.modelCallDeadlineMs/1000)}s · tool ${Math.round(budget.toolCallDeadlineMs/1000)}s`:'Unavailable';
  const budgetSafety=budget?`no progress ${Math.round(budget.noProgressDeadlineMs/1000)}s · verify ${Math.round(budget.verificationReserveMs/1000)}s · cleanup ${Math.round(budget.cleanupReserveMs/1000)}s · terminal ${budget.terminalCompletionTurns}`:'Unavailable';
  return `<div class="metrics active-run-telemetry ${runningClass(run)}"><div class="metric"><span>Stage</span><strong>${run.status === 'RUNNING' ? '<span class="activity-pulse" aria-hidden="true"></span> ' : ''}${esc(routing?.stage || stage)}</strong></div><div class="metric"><span>Provider / model</span><strong>${esc(latest ? `${latest.provider} / ${latest.model}` : route.provider)}</strong></div><div class="metric"><span>Routing sequence</span><strong>${esc(routing?.sequence?.join(' → ') || 'Direct route')}</strong></div><div class="metric"><span>Gemma confidence</span><strong>${esc(routing?.compilerConfidence ?? 'Not reported')}</strong></div><div class="metric"><span>Context / retained evidence</span><strong>${esc(context)}</strong></div><div class="metric"><span>Capability / route</span><strong>${esc(route.capability)}</strong></div><div class="metric"><span>Node / transport</span><strong>${esc(`${route.node} / ${route.transport}`)}</strong></div><div class="metric"><span>Engine</span><strong>${esc(route.engine)}</strong></div><div class="metric"><span>Routing reason</span><strong>${esc(routingReason)}</strong></div><div class="metric"><span>Elapsed</span><strong>${durationMarkup(run.startedAt || run.requestedAt, run.endedAt, !terminalRunStatuses.has(run.status))}</strong></div><div class="metric"><span>Last provider / control signal</span><strong>${terminalRunStatuses.has(run.status) ? esc(ageLabel(lastActivity)) + ' ago at completion' : `<span data-live-liveness="${esc(lastActivity)}" data-live-state="${esc(run.status)}">${esc(liveness.label)}</span>`}</strong></div><div class="metric"><span>Recovery / waiting</span><strong>${recoveryStep?`${esc(recoveryStep.waitingReason||recoveryStep.status)} · next ${esc(timeLabel(recoveryStep.nextAttemptAt))} · budget ${esc(recoveryStep.remainingRetryBudget??'unknown')} · ${deadlineMarkup(recoveryStep.recoveryDeadlineAt)}`:'No recovery wait'}</strong></div><div class="metric"><span>Input fresh / cached</span><strong>${esc(fresh ?? 'Unavailable')} / ${esc(cached ?? 'Unavailable')}</strong></div><div class="metric"><span>Output / reasoning / total</span><strong>${esc(output ?? 'Unavailable')} / ${esc(reasoning ?? 'Unavailable')} / ${esc(total ?? 'Unavailable')}</strong></div><div class="metric"><span>Accumulated cost</span><strong>${esc(costLabel)}</strong></div><div class="metric"><span>Runtime budget</span><strong>${esc(budgetProfile)}</strong></div><div class="metric"><span>Job / model / tool deadlines</span><strong>${esc(budgetClocks)}</strong></div><div class="metric"><span>Progress / reserves / terminal</span><strong>${esc(budgetSafety)}</strong></div><div class="metric"><span>Verification</span><strong>${esc(latest?.verifierResult || verification)}</strong></div></div>`;
}

function renderInvocationHistory(run) {
  const values = jobState.invocations.filter(item => item.runId === run.id);
  const rows = values.length ? values.map(item => {
    const cache = item.cacheEvidence ? `cache ${item.cacheEvidence.reusedTokens ?? 'unavailable'} reused / ${item.cacheEvidence.processedPromptTokens ?? 'unavailable'} processed · ${item.cacheEvidence.authority}` : `cache ${item.usage.cachedInputTokens ?? 'unavailable'} · evidence unavailable`;
    const usage = item.state === 'RUNNING' ? 'awaiting completion' : item.usage.totalProcessedTokens === null ? `usage unavailable · ${cache}` : `${item.usage.freshInputTokens ?? 'unknown'} in · ${item.usage.outputTokens ?? 'unknown'} out · ${item.usage.totalProcessedTokens} total · ${cache}`;
    const cost = item.costAccounting?.billingMode === 'SUBSCRIPTION_QUOTA' && item.calculatedCost === null && item.providerReportedCost === null ? `SUBSCRIPTION / QUOTA CONSUMPTION${item.costAccounting.subscription?.unitsConsumed === null || item.costAccounting.subscription?.unitsConsumed === undefined ? '' : ` · ${item.costAccounting.subscription.unitsConsumed} ${item.costAccounting.subscription.unitLabel}`}` : item.costSource === 'reported' ? `${item.currency || ''} ${item.providerReportedCost}`.trim() + ' reported' : item.costSource === 'estimated' ? `${item.currency || ''} ${item.calculatedCost}`.trim() + ' estimated' : 'cost unavailable';
    const routing = item.routing ? `${item.routing.activeTier} · ${item.routing.stage}${item.routing.escalationReason ? ` · ${item.routing.escalationReason}` : ''}` : item.phase;
    return `<tr><td><code>${esc(item.id)}</code><br><small>${esc(item.laneId)} · ${esc(item.stepId || item.taskId)}</small></td><td>${esc(item.provider)}<br><small>${esc(item.model)}</small></td><td>${esc(item.state)}<br><small>${esc(routing)}</small></td><td>${esc(timeLabel(item.startedAt))}<br><small>${esc(durationLabel(item.startedAt, item.completedAt))}</small></td><td>${esc(usage)}<br><small>${esc(item.usageSource)}</small></td><td>${esc(cost)}</td><td>${esc(item.outcome)}<br><small>verification ${esc(item.verifierResult)}</small></td></tr>`;
  }).join('') : '<tr><td colspan="7">No provider invocation recorded for this run.</td></tr>';
  const phases = ['QUEUED', 'DISPATCHED', 'request sent', 'waiting for provider', 'response received', 'processing', 'verification', terminalRunStatuses.has(run.status) ? run.status : 'terminal outcome'];
  const reached = new Set(['QUEUED', ...(run.startedAt ? ['DISPATCHED'] : []), ...values.flatMap(item => item.phase === 'complete' ? ['request sent', 'waiting for provider', 'response received', 'processing', 'verification', 'complete'] : item.phase === 'verification' ? ['request sent', 'waiting for provider', 'response received', 'processing', 'verification'] : item.phase === 'processing' ? ['request sent', 'waiting for provider', 'response received', 'processing'] : item.phase === 'response received' ? ['request sent', 'waiting for provider', 'response received'] : item.phase === 'waiting for provider' ? ['request sent', 'waiting for provider'] : item.phase === 'request sent' ? ['request sent'] : []), ...(terminalRunStatuses.has(run.status) ? [run.status] : [])]);
  const lifecycle = `<div class="phase-track">${phases.map((phase, index) => `<span class="phase ${reached.has(phase) ? 'done' : ''}">${esc(phase)}</span>${index < phases.length - 1 ? '<span class="phase-arrow">→</span>' : ''}`).join('')}</div>`;
  return `<section class="run-evidence"><div class="data-card full-width"><label>Invocation lifecycle</label>${lifecycle}<div class="audit-table-wrap"><table><thead><tr><th>Invocation / lane / step</th><th>Provider / model</th><th>State / phase</th><th>Started / duration</th><th>Usage</th><th>Cost</th><th>Outcome</th></tr></thead><tbody>${rows}</tbody></table></div></div></section>`;
}

function executionRouteSummary(step) {
  const required = step?.capabilityRequest?.requires?.map(item => item.id) || [], capability = required.find(item => item.startsWith('chatgpt.')) || required.find(item => item.startsWith('browser.')) || 'Control action';
  if (capability === 'chatgpt.web') return {provider:'ChatGPT',capability,node:step?.placement?.selected || 'Awaiting placement',transport:'authenticated browser',engine:'Edge / approved bridge'};
  if (capability === 'chatgpt.android') return {provider:'ChatGPT',capability,node:step?.placement?.selected || 'Awaiting placement',transport:'authorised Android UI',engine:'Android UI'};
  if (capability.startsWith('browser.')) return {provider:'Browser worker · no model',capability,node:step?.placement?.selected || 'Awaiting placement',transport:'local browser process',engine:'Chromium/Playwright'};
  return {provider:'Unavailable until provider reports',capability,node:step?.placement?.selected || 'Awaiting placement',transport:'Not reported',engine:'Not reported'};
}

function renderHarnessEfficiencyMetrics() {
  const element = document.querySelector('#harness-efficiency-metrics'), metrics = jobState.efficiencyMetrics, overall = metrics?.overall;
  if (!overall?.invocations) { element.innerHTML = '<div class="compact-empty">No model invocation telemetry recorded</div>'; return; }
  const cache = overall.cacheEffectiveness === null ? 'unknown' : `${Math.round(overall.cacheEffectiveness * 100)}%`;
  const cpvo = overall.costPerVerifiedOutcome === null ? 'unknown' : `${overall.currency || ''} ${overall.costPerVerifiedOutcome.toFixed(4)}`.trim();
  element.innerHTML = `<div class="compact-row worker-row"><strong>Cost per verified outcome</strong><span class="status-pill">${esc(cpvo)}</span><small>${esc(overall.verifiedSuccesses)} verified successes / ${esc(overall.jobs)} jobs · ${esc(overall.modelTurns)} turns</small><small>Fresh ${esc(overall.freshInputTokens ?? 'unknown')} · cached ${esc(overall.cachedInputTokens ?? 'unknown')} · output ${esc(overall.outputTokens ?? 'unknown')}</small><small>Cache effectiveness ${esc(cache)} · escalation ${esc(metrics.escalationRate === null ? 'unknown' : `${Math.round(metrics.escalationRate * 100)}%`)}</small></div>`;
}

function bindRunLinks() {
  document.querySelectorAll('[data-run]').forEach(button => button.addEventListener('click', () => {
    const run = jobState.runs.find(item => item.id === button.dataset.run);
    if (run) { jobState.selectedJob = run.jobId; jobState.selectedRun = run.id; document.querySelector('[data-view="jobs"]')?.click(); renderJobs(); }
  }));
}

function readinessClass(value) { return value === 'AVAILABLE' ? 'available' : value === 'BUSY' || value === 'AUTH REQUIRED' ? 'waiting' : value === 'OFFLINE' || value === 'DEGRADED' ? 'error' : 'neutral'; }
function bytes(value) { if (!Number.isFinite(value)) return '--'; const units=['B','KiB','MiB','GiB','TiB']; let size=value,index=0; while(size>=1024&&index<units.length-1){size/=1024;index++;} return `${size.toFixed(index>1?1:0)} ${units[index]}`; }
function renderSystems() {
  const list=document.querySelector('#systems-list'), detail=document.querySelector('#system-detail'), empty=document.querySelector('#system-detail-empty'); if(!list)return;
  document.querySelector('#system-count').textContent=jobState.systems.length;
  list.innerHTML=jobState.systems.length?jobState.systems.map(system=>`<button class="system-card ${system.id===jobState.selectedSystem?'active':''}" data-system="${esc(system.id)}"><span><strong>${esc(system.name)}</strong><small>${esc(system.type)} · ${esc(system.transport||'transport not reported')}</small></span><span class="status-pill ${readinessClass(system.execution)}">${esc(system.execution)}</span><span class="system-scan"><b>Reachable</b> ${esc(system.reachable)} · <b>Auth</b> ${esc(system.authentication)} · <b>Capacity</b> ${esc(system.active??'--')}/${esc(system.capacity??'--')}</span>${system.blockingReason?`<small class="system-blocker">${esc(system.blockingReason)}</small>`:''}</button>`).join(''):'<div class="compact-empty">No registered systems</div>';
  document.querySelectorAll('[data-system]').forEach(button=>button.addEventListener('click',()=>{jobState.selectedSystem=button.dataset.system;renderSystems()}));
  const system=jobState.systems.find(item=>item.id===jobState.selectedSystem); empty.hidden=Boolean(system); detail.hidden=!system; if(!system)return;
  const node=system.node, storage=node?.storage||[], workloads=node?.workloads||[], invocation=system.recentInvocation;
  detail.innerHTML=`<header class="system-detail-header"><div><span class="eyebrow">${esc(system.type)} · ${esc(system.id)}</span><h2>${esc(system.name)}</h2><p>${esc(system.blockingReason||'Agent Control currently has sufficient readiness evidence for dispatch.')}</p></div><span class="status-pill ${readinessClass(system.execution)}">${esc(system.execution)}</span></header><div class="control-strip"><button class="button" data-check-system="${esc(system.id)}" ${state.operatorAuth==='authenticated'?'':'disabled'}>Check now</button><small>Lightweight, non-destructive canonical probe</small></div><section class="system-detail-grid">${[['Registered','yes'],['Reachable',system.reachable],['Authentication',system.authentication],['Execution',system.execution],['Platform',system.platform||'--'],['Transport',system.transport||'--'],['Capacity',`${system.active??'--'} / ${system.capacity??'--'}`],['Last check',timeLabel(system.lastCheckAt)],['Last successful probe',timeLabel(system.lastSuccessfulProbeAt)],['Last successful Job',timeLabel(system.lastSuccessfulJobAt)],['Latency',system.latencyMs===null?'--':`${system.latencyMs}ms`],['Qualification',system.qualification||'--']].map(([label,value])=>`<div class="data-card"><label>${esc(label)}</label><p>${esc(value)}</p></div>`).join('')}</section>${node?`<section class="system-section"><h3>Identity & resources</h3><div class="system-detail-grid">${[['Hostname',node.hostname||'--'],['OS',[node.os?.name,node.os?.version].filter(Boolean).join(' ')||'--'],['Architecture',node.os?.architecture||'--'],['CPU',`${node.cpu?.logical??'--'} logical · load ${node.cpu?.load?.one??'--'}`],['RAM available',`${bytes(node.memory?.availableBytes)} / ${bytes(node.memory?.totalBytes)}`],['Current workload',node.currentWorkload||'none']].map(([label,value])=>`<div class="data-card"><label>${esc(label)}</label><p>${esc(value)}</p></div>`).join('')}</div>${storage.map(item=>`<div class="system-storage"><strong>${esc(item.mount)}</strong><span>${esc(bytes(item.availableBytes))} free / ${esc(bytes(item.totalBytes))} · ${esc(item.usedPercent)}% used</span></div>`).join('')}</section>`:''}<section class="system-section"><h3>Agent Control & governance</h3><div class="data-card"><label>Capabilities</label><p>${esc(system.capabilities.join(', ')||'none reported')}</p></div>${workloads.map(item=>`<div class="data-card"><label>${esc(item.id)}</label><p>${esc(item.state)} · ${item.protected?'protected':'unprotected'} · ${esc(item.evidence.join(', '))}</p></div>`).join('')}<div class="data-card"><label>Last error</label><p>${esc(system.lastError||'none recorded')}</p></div></section>${invocation?`<section class="system-section"><h3>Recent provider invocation</h3><div class="system-detail-grid"><div class="data-card"><label>Observed</label><p>${esc(timeLabel(invocation.at))}</p></div><div class="data-card"><label>Latency</label><p>${esc(invocation.latencyMs===null?'--':`${invocation.latencyMs}ms`)}</p></div><div class="data-card"><label>Tokens</label><p>${esc(invocation.totalTokens??'not reported')}</p></div><div class="data-card"><label>Cost</label><p>${esc(invocation.cost===null?'not reported':`${invocation.cost} ${invocation.currency||''}`)}</p></div></div></section>`:''}`;
  detail.querySelector('[data-check-system]')?.addEventListener('click',event=>{event.currentTarget.disabled=true;jobCommand(`/api/systems/${encodeURIComponent(system.id)}/check`,{}).catch(showError)});
}

function configurationItems() {
  if (!jobState.configuration) return [];
  return [
    ...jobState.configuration.resources.map(item=>({kind:'resource',label:'machine',item})),
    ...jobState.configuration.providers.map(item=>({kind:'provider',label:'provider',item})),
    ...jobState.configuration.models.map(item=>({kind:'model',label:'model',item})),
    ...jobState.configuration.services.map(item=>({kind:'service',label:'service',item})),
    ...(jobState.configuration.spark?[{kind:'spark',label:'fast execution',item:{id:'fast-execution',...jobState.configuration.spark}}]:[]),
    ...(jobState.configuration.adaptiveOrchestration?[{kind:'adaptive',label:'adaptive routing',item:{id:'adaptive-orchestration',name:'Adaptive multi-model orchestration',...jobState.configuration.adaptiveOrchestration}}]:[]),
    ...(jobState.configuration.cacheAwareExperts?[{kind:'cache-experts',label:'Warm Expert policy',item:{id:'cache-aware-experts',name:'Cache-Aware Expert Delegation',...jobState.configuration.cacheAwareExperts}}]:[]),
    ...(jobState.configuration.learnedSkills?[{kind:'learned-skills',label:'Learned Specialist policy',item:{id:'learned-skills',name:'Governed Learned Specialists',...jobState.configuration.learnedSkills}}]:[]),
    ...(jobState.configuration.deterministicSkills?[{kind:'deterministic-skills',label:'Deterministic Skill policy',item:{id:'deterministic-skills',name:'Governed Deterministic Skills',...jobState.configuration.deterministicSkills}}]:[]),
  ].sort((a,b)=>(a.item.name||a.item.id).localeCompare(b.item.name||b.item.id));
}

function configurationTemplate(kind) {
  if(kind==='provider') return {id:'new-provider',name:'New provider',kind:'openai-compatible',baseUrl:'https://provider.example/v1',wireApi:'responses',enabled:true,auth:{type:'bearer-env',env:'PROVIDER_API_KEY'},parallelism:1,costClass:'metered',capabilities:[]};
  if(kind==='model') return {id:'new-model',provider:'new-provider',providerModel:'provider/model-id',displayName:'New model',enabled:true,capabilities:['coding'],roles:[],qualification:{state:'UNTESTED',evidence:[]}};
  if(kind==='service') return {id:'new-service',name:'New service',healthUrl:'https://service.example/health',optional:true,requiresAuth:true,credentialEnv:'SERVICE_API_KEY'};
  if(kind==='spark') return {id:'fast-execution',enabled:false,model:'gpt-5.3-codex-spark',modelRole:'fast-execution',maximumFiles:1,maximumChangedLines:80,maximumAttempts:1,maximumSubagents:0,maximumContextTokens:2048,verificationRequired:true};
  if(kind==='adaptive') return {id:'adaptive-orchestration',name:'Adaptive multi-model orchestration',enabled:true,minimumSamplesForPreference:3,minimumQualityScore:0.7,maxEvidenceAgeDays:90,policyQualityFloor:0.6,maxRouteCost:null,maxRouteLatencyMs:null,qualityWeight:0.5,reliabilityWeight:0.2,costWeight:0.15,latencyWeight:0.1,confidenceWeight:0.05,explorationRate:0.1};
  if(kind==='cache-experts') return {id:'cache-aware-experts',name:'Cache-Aware Expert Delegation',enabled:true,hotMinutes:10,warmMinutes:60,expiryMinutes:240,hotReuseRatio:0.7,minimumReuseRatio:0.25,highCompatibilityMaximumDelta:0.25,partialCompatibilityMaximumDelta:0.6,maximumScoreBonus:0.15,allowDerivedPreference:false};
  if(kind==='learned-skills') return {id:'learned-skills',name:'Governed Learned Specialists',enabled:true,routingEnabled:false,minimumImprovement:0.1,maximumQualificationAgeDays:90,requireHumanDatasetApproval:true};
  if(kind==='deterministic-skills')return{id:'deterministic-skills',name:'Governed Deterministic Skills',enabled:true,routingEnabled:false,minimumDistinctParcels:3,maximumValidationAgeDays:90};
  return {id:'new-system',name:'New system',platform:'unknown',transport:{type:'ssh',host:'hostname',user:'operator'},capabilities:[]};
}

async function loadConfiguration() {
  const note=document.querySelector('#configuration-auth-note'), form=document.querySelector('#configuration-form'), status=document.querySelector('#configuration-save-state');
  if(state.operatorAuth!=='authenticated'){jobState.configuration=null;form.hidden=true;note.hidden=false;note.className='configuration-notice';note.textContent='Authenticate as operator to read or change system configuration.';status.textContent='AUTH REQUIRED';renderConfiguration();return;}
  status.textContent='LOADING';
  const response=await fetch('/api/configuration',{headers:{Authorization:`Bearer ${state.token}`}});
  if(response.status===401){authenticationExpired();return;}
  const result=await response.json(); if(!response.ok)throw new Error(result.error||`HTTP ${response.status}`);
  jobState.configuration=result;status.textContent=jobState.configurationRestartRequired?'RESTART REQUIRED':'CURRENT';note.hidden=true;renderConfiguration();
}

function selectConfiguration(kind,id,item) {
  jobState.selectedConfiguration={kind,id,item:structuredClone(item)};
  document.querySelector('#configuration-original-id').value=id||'';
  document.querySelector('#configuration-kind').value=kind;
  document.querySelector('#configuration-json').value=JSON.stringify(item,null,2);
  document.querySelector('#configuration-editor-title').textContent=id?`Edit ${item.name||item.id}`:`Add ${kind==='resource'?'machine':kind}`;
  document.querySelector('#configuration-form').hidden=false;
  document.querySelector('#configuration-auth-note').hidden=true;
  renderConfiguration();
}

function renderConfiguration() {
  const list=document.querySelector('#configuration-list'), count=document.querySelector('#configuration-count'); if(!list)return;
  const items=configurationItems(); count.textContent=items.length;
  if(!jobState.configuration){list.innerHTML='<div class="compact-empty">Authenticate to load configuration</div>';return;}
  list.innerHTML=items.length?items.map(({kind,label,item})=>`<button class="system-card ${jobState.selectedConfiguration?.kind===kind&&jobState.selectedConfiguration?.id===item.id?'active':''}" data-configuration-kind="${esc(kind)}" data-configuration-id="${esc(item.id)}"><span><strong>${esc(item.name||item.id)}</strong><small class="configuration-kind">${esc(label)}</small></span><span class="status-pill neutral">CONFIGURED</span><span class="system-scan"><b>ID</b> ${esc(item.id)}${item.credentialEnv||item.credentialFileEnv?` · <b>Credential</b> referenced`:''}</span></button>`).join(''):'<div class="compact-empty">No configured systems</div>';
  list.querySelectorAll('[data-configuration-id]').forEach(button=>button.addEventListener('click',()=>{const found=configurationItems().find(value=>value.kind===button.dataset.configurationKind&&value.item.id===button.dataset.configurationId);if(found)selectConfiguration(found.kind,found.item.id,found.item)}));
}

async function saveConfiguration() {
  let item; try{item=JSON.parse(document.querySelector('#configuration-json').value)}catch{throw new Error('Configuration JSON is invalid')}
  const kind=document.querySelector('#configuration-kind').value, originalId=document.querySelector('#configuration-original-id').value||undefined;
  const spark=kind==='spark'?Object.fromEntries(Object.entries(item).filter(([key])=>key!=='id')):null;
  const adaptive=kind==='adaptive'?Object.fromEntries(Object.entries(item).filter(([key])=>!['id','name'].includes(key))):null;
  const cacheAwareExperts=kind==='cache-experts'?Object.fromEntries(Object.entries(item).filter(([key])=>!['id','name'].includes(key))):null;
  const learnedSkills=kind==='learned-skills'?Object.fromEntries(Object.entries(item).filter(([key])=>!['id','name'].includes(key))):null;
  const deterministicSkills=kind==='deterministic-skills'?Object.fromEntries(Object.entries(item).filter(([key])=>!['id','name'].includes(key))):null;
  const response=await fetch(kind==='spark'?'/api/configuration/spark':kind==='adaptive'?'/api/configuration/adaptive-orchestration':kind==='cache-experts'?'/api/configuration/cache-aware-experts':kind==='learned-skills'?'/api/configuration/learned-skills':kind==='deterministic-skills'?'/api/configuration/deterministic-skills':'/api/configuration/systems',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${state.token}`},body:JSON.stringify(kind==='spark'?{revision:jobState.configuration.revision,spark,actor:'web-operator'}:kind==='adaptive'?{revision:jobState.configuration.revision,adaptiveOrchestration:adaptive,actor:'web-operator'}:kind==='cache-experts'?{revision:jobState.configuration.revision,cacheAwareExperts,actor:'web-operator'}:kind==='learned-skills'?{revision:jobState.configuration.revision,learnedSkills,actor:'web-operator'}:kind==='deterministic-skills'?{revision:jobState.configuration.revision,deterministicSkills,actor:'web-operator'}:{revision:jobState.configuration.revision,kind,originalId,item,actor:'web-operator'})});
  if(response.status===401){authenticationExpired();throw new Error('Operator authentication required')}
  const result=await response.json(); if(!response.ok){if(response.status===409)await loadConfiguration();throw new Error(result.error||`HTTP ${response.status}`)}
  jobState.configuration=result;jobState.configurationRestartRequired=result.restartRequired;const savedItem=kind==='adaptive'?{id:'adaptive-orchestration',name:'Adaptive multi-model orchestration',...(result.adaptiveOrchestration||adaptive)}:kind==='cache-experts'?{id:'cache-aware-experts',name:'Cache-Aware Expert Delegation',...(result.cacheAwareExperts||cacheAwareExperts)}:kind==='learned-skills'?{id:'learned-skills',name:'Governed Learned Specialists',...(result.learnedSkills||learnedSkills)}:kind==='deterministic-skills'?{id:'deterministic-skills',name:'Governed Deterministic Skills',...(result.deterministicSkills||deterministicSkills)}:item;jobState.selectedConfiguration={kind,id:savedItem.id,item:structuredClone(savedItem)};
  const note=document.querySelector('#configuration-auth-note');note.hidden=false;note.className='configuration-notice success';note.textContent=result.restartRequired?`Saved ${item.id}. Restart Agent Control to apply the new inventory and readiness probes.`:`Saved ${item.id}. The model registry was validated and reloaded.`;
  document.querySelector('#configuration-save-state').textContent=result.restartRequired?'RESTART REQUIRED':'CURRENT';document.querySelector('#configuration-original-id').value=savedItem.id;renderConfiguration();toast(kind==='spark'?'Fast execution configuration saved':kind==='adaptive'?'Adaptive routing configuration saved':kind==='cache-experts'?'Warm Expert policy saved':kind==='learned-skills'?'Learned Specialist policy saved':kind==='deterministic-skills'?'Deterministic Skill policy saved':'System configuration saved');
}

async function jobCommand(url, body) {
  if (state.operatorAuth !== 'authenticated') { openOperator(); throw new Error('Operator authentication required'); }
  const response = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${state.token}`}, body: JSON.stringify({...body, actor: 'web-operator'})});
  const result = await response.json();
  if (response.status === 401) { authenticationExpired(); throw new Error('Operator authentication required'); }
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  toast('Job command accepted by Agent Control');
  await refresh();
  return result;
}

window.AgentControlArtifacts={openContent:openArtifactContent};
document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('#natural-task-form').addEventListener('submit', event => { event.preventDefault(); const prompt = document.querySelector('#natural-task-prompt').value; jobCommand('/api/parcels', {prompt}).then(() => { document.querySelector('#natural-task-prompt').value = ''; }).catch(showError); });
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-view]').forEach(item => item.classList.toggle('active', item === button));
    const view = button.dataset.view;
    if(view!=='poe'){document.body.dataset.currentView=view;document.querySelector('#home-workspace').hidden=view!=='home';}
    if(view==='home')window.AgentControlFirstRun?.activate();
    if(view==='poe'){document.dispatchEvent(new Event('poe:open'));return;}
    document.querySelector('#factory-workspace').hidden = view !== 'factory';
    document.querySelector('#estate-workspace').hidden = view !== 'estate';
    document.querySelector('#jobs-workspace').hidden = view !== 'jobs';
    document.querySelector('#work-board-workspace').hidden = view !== 'work-board';
    document.querySelector('#runtime-map-workspace').hidden = view !== 'runtime-map';
    document.querySelector('#lanes-workspace').hidden = view !== 'lanes';
    document.querySelector('#sessions-workspace').hidden = view !== 'sessions';
    document.querySelector('#vault-workspace').hidden = view !== 'vault';
    document.querySelector('#systems-workspace').hidden = view !== 'systems';
    document.querySelector('#usage-workspace').hidden = view !== 'usage';
    if(view==='usage')window.AgentControlUsage?.activate();
    document.querySelector('#model-watches-workspace').hidden = view !== 'model-watches';
    if(view==='model-watches')window.AgentControlModelWatches?.activate();
    document.querySelector('#models-workspace').hidden = view !== 'models';
    document.querySelector('#crew-workspace').hidden = view !== 'crew';
    document.querySelector('#poe-workspace').hidden = view !== 'poe';
    document.querySelector('#configuration-workspace').hidden = view !== 'configuration';
    document.querySelector('#environment-workspace').hidden = view !== 'environment';
    document.querySelector('#routing-workspace').hidden = view !== 'routing';
    document.querySelector('#experts-workspace').hidden = view !== 'experts';
    document.querySelector('#specialists-workspace').hidden = view !== 'specialists';
    if(view==='configuration')loadConfiguration().catch(showError);
    if(view==='environment')window.AgentControlEnvironmentDiscovery?.activate();
    if(view==='runtime-map')window.AgentControlRuntimeMap?.activate();
  }));
  document.querySelector('#health').addEventListener('click',()=>document.querySelector('[data-view="systems"]').click());
  document.querySelector('#run-search').addEventListener('input', event => { jobState.search = event.target.value; renderRunHistory(); bindRunLinks(); });
  document.querySelectorAll('[data-add-configuration]').forEach(button=>button.addEventListener('click',()=>{if(state.operatorAuth!=='authenticated'){openOperator();return}const kind=button.dataset.addConfiguration;selectConfiguration(kind,'',configurationTemplate(kind))}));
  document.querySelector('#configuration-form').addEventListener('submit',event=>{event.preventDefault();saveConfiguration().catch(showError)});
  document.querySelector('#configuration-reset').addEventListener('click',()=>{const selected=jobState.selectedConfiguration;if(selected)selectConfiguration(selected.kind,selected.id,selected.item)});
  setInterval(() => { document.querySelectorAll('[data-live-start]').forEach(node => { node.textContent = durationLabel(node.dataset.liveStart); }); document.querySelectorAll('[data-live-activity]').forEach(node => { node.textContent = `${ageLabel(node.dataset.liveActivity)} ago`; }); document.querySelectorAll('[data-live-liveness]').forEach(node => { const live = window.AgentControlRunningState.liveness(node.dataset.liveState, node.dataset.liveLiveness); node.textContent = live.label; node.closest('.parcel-live, .active-run-telemetry')?.classList.toggle('is-stale', live.stale); }); document.querySelectorAll('[data-real-deadline]').forEach(node=>{node.textContent=deadlineLabel(node.dataset.realDeadline)}); }, 1000);
  setInterval(() => refresh().catch(showError), 5000);
});
