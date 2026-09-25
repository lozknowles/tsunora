const sessionView = {sessions: [], executions: [], transfers: [], delegations: [], parcels: [], fastAttempts: [], runtime: null, selected: null};

async function loadSessions() {
  const paths = ['/api/sessions', '/api/executions', '/api/context-transfers', '/api/delegations', '/api/parcels', '/api/fast-execution-attempts', '/api/runtime'];
  const [sessions, executions, transfers, delegations, parcels, fastAttempts, runtime] = await Promise.all(paths.map(async url => {
    const response = await fetch(url), value = await response.json();
    if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
    return value;
  }));
  Object.assign(sessionView, {sessions, executions, transfers, delegations, parcels, fastAttempts, runtime});
  if (!sessionView.selected || !sessions.some(item => item.id === sessionView.selected)) sessionView.selected = sessions[0]?.id ?? null;
  renderSessions();
}

function sessionParcels(sessionId) {
  return sessionView.parcels.filter(item => item.attribution?.sessionId === sessionId);
}

function renderSessionsBase() {
  const list = document.querySelector('#sessions-list'), detail = document.querySelector('#session-detail'), empty = document.querySelector('#session-detail-empty');
  if (!list) return;
  document.querySelector('#session-count').textContent = sessionView.sessions.length;
  list.innerHTML = sessionView.sessions.length ? sessionView.sessions.map(item => {
    const activeParcels = sessionParcels(item.id).filter(parcel => !['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(parcel.status));
    return `<button class="system-card ${item.id === sessionView.selected ? 'active' : ''}" data-session-id="${esc(item.id)}"><span><strong>${esc(item.id)}</strong><small>${esc(item.mode)} · creator ${esc(item.creatorActorId)}</small></span><span class="status-pill ${item.status === 'ACTIVE' ? 'available' : 'neutral'}">${esc(item.status)}</span><span class="system-scan"><b>Participants</b> ${esc(item.participants.length)} · <b>Active parcels</b> ${esc(activeParcels.length)} · <b>Context</b> ${esc(item.contextPolicy)}</span></button>`;
  }).join('') : '<div class="compact-empty">No governed sessions recorded</div>';
  list.querySelectorAll('[data-session-id]').forEach(button => button.addEventListener('click', () => { sessionView.selected = button.dataset.sessionId; renderSessions(); }));

  const session = sessionView.sessions.find(item => item.id === sessionView.selected);
  empty.hidden = Boolean(session); detail.hidden = !session;
  if (!session) return;
  const runs = sessionView.executions.filter(item => item.sessionId === session.id), transfers = sessionView.transfers.filter(item => item.sessionId === session.id), delegations = sessionView.delegations.filter(item => item.sessionId === session.id), parcels = sessionParcels(session.id), fastAttempts = sessionView.fastAttempts.filter(item => item.sessionId === session.id);
  const models = [...new Set(runs.map(item => item.model?.modelId).filter(Boolean))], agents = [...new Set(runs.map(item => item.agentId))], runtimes = [...new Set(runs.map(item => `${item.runtime.nodeId}/${item.runtime.transport}/${item.runtime.sandboxState}`))];
  const knownCost = runs.length > 0 && runs.every(item => typeof item.cost === 'number') ? runs.reduce((sum, item) => sum + item.cost, 0) : null;
  const knownInput = runs.length > 0 && runs.every(item => typeof item.inputTokens === 'number') ? runs.reduce((sum, item) => sum + item.inputTokens, 0) : null;
  const batonRows = transfers.map(item => `${item.sourceActorId} → ${item.targetActorId}: ${item.selected.reduce((sum, entry) => sum + entry.estimatedTokens, 0)}/${item.contextBudget} tokens · ${item.transferredContextHash.slice(0, 12)}… · ${item.selectionReason}`);
  const delegationRows = delegations.map(item => `${item.sourceActorId}/${item.sourceAgentId ?? 'human'} → ${item.targetActorId}/${item.targetAgentId} · ${item.actualModel ?? item.requestedModel ?? 'model pending'} · ${item.status}`);
  const fastRows = fastAttempts.map(item => `${item.executionClass} — ${item.actualModel ?? item.requestedModel}: ${item.outcome} / ${item.verification} · ${item.escalationReason ?? 'no escalation'} · successor ${item.successorModel ?? item.successorExecutionClass ?? 'none'}`);
  detail.innerHTML = `<header class="system-detail-header"><div><span class="eyebrow">${esc(session.mode)} session</span><h2>${esc(session.id)}</h2><p>Created by ${esc(session.creatorActorId)} at ${esc(session.createdAt)}</p></div><span class="status-pill ${session.status === 'ACTIVE' ? 'available' : 'neutral'}">${esc(session.status)}</span></header><div class="system-detail-grid"><div class="data-card"><b>Participants</b><span>${esc(session.participants.map(item => `${item.actorId} (${item.capabilities.join(', ') || 'observe'})`).join(' · '))}</span></div><div class="data-card"><b>Permissions</b><span>${esc(session.permissions.capabilities.join(', ') || 'none')}</span></div><div class="data-card"><b>Active parcels</b><span>${esc(parcels.map(item => `${item.id} (${item.status})`).join(' · ') || 'none')}</span></div><div class="data-card"><b>Context policy</b><span>${esc(session.contextPolicy)}</span></div><div class="data-card"><b>Models</b><span>${esc(models.join(', ') || 'none invoked')}</span></div><div class="data-card"><b>Chain usage / cost</b><span>${esc(knownInput ?? 'unknown')} input tokens · ${esc(knownCost ?? 'unknown')} ${esc(runs.find(item => item.currency)?.currency ?? '')}</span></div><div class="data-card"><b>Runtime identities used</b><span>${esc(runtimes.join(' · ') || 'no execution recorded')}</span></div><div class="data-card"><b>ACP endpoints</b><span>Adapter core available · transport endpoint not configured</span></div></div><section class="system-section"><span class="eyebrow">Fast execution</span><h3>Execution class / actual model / verification / escalation</h3><p>${esc(fastRows.join('\n') || 'No governed Spark routing decision recorded.')}</p></section><section class="system-section"><span class="eyebrow">Agent graph</span><h3>${esc(agents.join(' → ') || 'No delegated agents')}</h3><p>${esc(delegationRows.join('\n') || runs.map(item => `${item.parentRunId ? `${item.parentRunId} → ` : ''}${item.runId}: ${item.actorId} / ${item.agentId} / ${item.model?.modelId ?? 'no model'} / ${item.runtime.nodeId} / ${item.status}`).join('\n') || 'No execution provenance recorded.')}</p></section><section class="system-section"><span class="eyebrow">Context transfers</span><h3>Baton trace</h3><p>${esc(batonRows.join('\n') || 'No context transfer recorded.')}</p></section><section class="system-section"><span class="eyebrow">Provenance evidence</span><h3>Actor → Session → Work Parcel → Agent → Model → Provider → Runtime → Node/Resource → Evidence</h3><p>${esc(runs.flatMap(item => item.evidenceIds).join(', ') || 'No evidence recorded.')}</p></section>`;
}

function renderSessions() {
  renderSessionsBase();
  renderRuntimeDetails();
}

function renderRuntimeDetails() {
  const detail=document.querySelector('#session-detail'),session=sessionView.sessions.find(item=>item.id===sessionView.selected),runtime=sessionView.runtime;
  if(!detail||detail.hidden||!session||!runtime)return;
  const transports=runtime.acp.transports.map(item=>`${item.transport}: ${item.connection} / auth ${item.authentication}`);
  const acpSessions=runtime.acp.sessions.filter(item=>item.governedSessionId===session.id);
  const acpCard=[...detail.querySelectorAll('.data-card')].find(node=>node.querySelector('b')?.textContent==='ACP endpoints');
  if(acpCard)acpCard.querySelector('span').textContent=`v${runtime.acp.protocolVersion} · ${transports.join(' · ')}`;
  const contracts=runtime.contracts;
  const contractRows=contracts.map(item=>`${item.id} · ${item.state} · ${item.active.agentId}/${item.active.modelId??'model pending'}/${item.active.providerId??'provider pending'} · ${item.active.nodeId}/${item.active.runtimeId} · process ${item.process.state} · PTY ${item.pty.state} · writer ${item.pty.writeOwner??'none'} · participants ${item.pty.participants.map(value=>`${value.actorId}:${value.access}`).join(', ')||'none'} · approvals ${item.approvalRequests.length} · baton ${item.baton.sizeBytes}B/${item.baton.sha256.slice(0,12)}… · verification ${item.verification.state}`).join('\n');
  const handoffRows=runtime.handoffs.map(item=>`${item.outcome} ${item.status} · ${item.contractId}${item.childContractId?` → ${item.childContractId}`:''} · ${item.originatingActorId} → ${item.receivingActorId??'control'} · baton ${item.batonSizeBytes}B/${item.batonSha256.slice(0,12)}… · authority ${item.authorityTransferred.join(', ')||'none'}${item.authorityWithheld.length?` · withheld ${item.authorityWithheld.join(', ')}`:''} · verification ${item.verificationOutcome}${item.approvalReasons.length?` · approval ${item.approvalReasons.join(', ')}`:''}`).join('\n');
  const acpRows=acpSessions.map(item=>`${item.acpSessionId} · actor ${item.actorId} · ${item.closed?'closed':'active'} · parcels ${item.parcelIds.join(', ')||'none'} · deliveries ${item.deliveryCount}`).join('\n');
  detail.insertAdjacentHTML('beforeend',`<section class="system-section"><span class="eyebrow">ACP v${esc(runtime.acp.protocolVersion)}</span><h3>Transport / connection / authentication</h3><p>${esc(transports.join('\n'))}</p><p>${esc(acpRows||'No ACP session is bound to this governed session.')}</p></section><section class="system-section"><span class="eyebrow">Contract-owned execution</span><h3>Contract / agent / model / provider / node / process / PTY</h3><p>${esc(contractRows||'No durable 3.6 contract state recorded.')}</p></section><section class="system-section"><span class="eyebrow">Governed handoffs</span><h3>Outcome / escalation / baton / authority / verification</h3><p>${esc(handoffRows||'No 3.6 handoff state recorded.')}</p></section>`);
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('[data-view="sessions"]')?.addEventListener('click', () => loadSessions().catch(showError));
});
