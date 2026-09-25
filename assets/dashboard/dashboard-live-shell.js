(() => {
  'use strict';
  const runtime = {sessions: [], selected: null, attachment: null, controller: null, cursor: 0, observedAt: 0};
  const activeStates = new Set(['STARTING', 'RUNNING', 'PAUSED']);
  const byId = id => document.getElementById(id);
  const safe = value => String(value ?? '').replace(/[&<>'"]/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]));
  const authHeaders = (json = false) => ({...(json ? {'Content-Type': 'application/json'} : {}), Authorization: `Bearer ${state.token}`});

  async function request(path, options = {}) {
    if (state.operatorAuth !== 'authenticated') throw new Error('Operator authentication is required for execution sessions.');
    const response = await fetch(path, {...options, headers: {...authHeaders(Boolean(options.body)), ...(options.headers || {})}});
    const value = await response.json();
    if (response.status === 401) authenticationExpired();
    if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
    return value;
  }

  function route(session) {
    const scope = session.scope || {};
    return [scope.providerId, scope.accountLabel, scope.modelId].filter(Boolean).join(' / ') || 'ordinary process';
  }

  function groupLabel(session) {
    const scope = session.scope || {};
    return scope.parcelId ? `Work Parcel ${scope.parcelId}` : `${scope.jobId} · run ${scope.runId}`;
  }

  function elapsed(session) {
    const endedAt = session.endedAt || (!activeStates.has(session.state) ? session.updatedAt : null);
    const end = endedAt ? Date.parse(endedAt) : Date.now(), start = Date.parse(session.startedAt);
    if (!Number.isFinite(start)) return 'unknown';
    const seconds = Math.max(0, Math.floor((end - start) / 1000));
    return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }

  function capabilityBadges(session) {
    const capabilities = session.capabilities;
    return [
      ['real output', capabilities.observableOutput], [capabilities.terminal, true], ['input', capabilities.interactiveInput],
      ['resize', capabilities.resize], ['reconnect', capabilities.reconnectable], ['remote', capabilities.remoteTransport],
    ].map(([label, available]) => `<i class="${available ? 'available' : ''}">${safe(label)} ${available ? 'yes' : 'no'}</i>`).join('');
  }

  function renderList() {
    const list = byId('live-shell-list'), count = byId('live-shell-count');
    if (!list || !count) return;
    const live = runtime.sessions.filter(session => activeStates.has(session.state)); count.textContent = String(live.length);
    if (state.operatorAuth !== 'authenticated') { list.innerHTML = '<div class="live-shell-empty">Authenticate as operator to inspect privileged execution sessions.</div>'; return; }
    if (!runtime.sessions.length) { list.innerHTML = '<div class="live-shell-empty">No real execution session has been created yet.</div>'; return; }
    const groups = new Map();
    for (const session of runtime.sessions.slice().sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt)).slice(0, 24)) {
      const key = groupLabel(session); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(session);
    }
    list.innerHTML = [...groups].map(([label, sessions]) => `<section class="live-shell-group"><h3>${safe(label)}</h3>${sessions.map(session => {
      const isLive = activeStates.has(session.state) && session.capabilities.modes.watch;
      return `<article class="live-shell-card ${isLive ? 'is-live' : ''}" data-live-shell-session-card="${safe(session.id)}"><div><strong>${safe(session.scope.crewRole || session.scope.workerId)} · ${safe(session.scope.stepId)}</strong><small>${safe(session.scope.nodeId)} · ${safe(route(session))}<br>${safe(session.id)} · ${safe(session.adapterId)} · ${safe(elapsed(session))}</small></div>${isLive ? `<button type="button" class="button" data-live-shell-open="${safe(session.id)}">Watch shell</button>` : `<button type="button" class="button secondary" data-live-shell-transcript-open="${safe(session.id)}">Transcript</button>`}<span class="live-shell-capabilities">${capabilityBadges(session)}</span></article>`;
    }).join('')}</section>`).join('');
    for(const session of runtime.sessions){const card=list.querySelector(`[data-live-shell-session-card="${CSS.escape(session.id)}"]`),runId=session.scope?.runId;if(card&&runId){window.AgentControlIdentity.apply(card,window.AgentControlIdentity.run(runId));card.classList.add('job-identity-rail');card.querySelector('strong')?.after(window.AgentControlIdentity.badge(runId,runId));}}
    document.querySelectorAll('[data-live-shell-open]').forEach(button => button.addEventListener('click', () => openSession(button.dataset.liveShellOpen, 'WATCH').catch(showError)));
    document.querySelectorAll('[data-live-shell-transcript-open]').forEach(button => button.addEventListener('click', () => openSession(button.dataset.liveShellTranscriptOpen, null, true).catch(showError)));
  }

  function bindCrew() {
    document.querySelectorAll('[data-bot-character-id]').forEach(card => {
      card.querySelector('.live-shell-inline-action')?.remove();
      const session = runtime.sessions.find(item => activeStates.has(item.state) && item.scope?.crewRole === card.dataset.botCharacterId && item.capabilities?.modes?.watch);
      if (!session) return;
      const action = document.createElement('span'); action.className = 'live-shell-inline-action'; action.setAttribute('role', 'button'); action.tabIndex = 0; action.textContent = `Watch real ${session.capabilities.terminal}`;
      const open = event => { event.preventDefault(); event.stopPropagation(); openSession(session.id, 'WATCH').catch(showError); };
      action.addEventListener('click', open); action.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') open(event); });
      card.querySelector('.bot-copy')?.append(action);
    });
  }

  async function loadSessions() {
    if (state.operatorAuth !== 'authenticated') { runtime.sessions = []; renderList(); bindCrew(); return; }
    runtime.sessions = await request('/api/execution-sessions'); renderList(); bindCrew();
    if (runtime.selected) {
      const updated = runtime.sessions.find(item => item.id === runtime.selected.id);
      if (updated) { runtime.selected = updated; runtime.observedAt = Date.now(); renderIdentity(); }
    }
  }

  function renderActivity() {
    const session = runtime.selected, badge = byId('live-shell-activity-state'), timer = byId('live-shell-activity-elapsed');
    if (!session || !badge || !timer) return;
    const stale = activeStates.has(session.state) && Date.now() - runtime.observedAt > 15000;
    const label = stale ? 'STATUS STALE' : session.state;
    if (badge.textContent !== label) badge.textContent = label;
    badge.classList.toggle('is-running', !stale && session.state === 'RUNNING');
    timer.textContent = `Elapsed ${elapsed(session)}${stale ? ' · last known state' : ''}`;
  }

  function renderIdentity() {
    const session = runtime.selected; if (!session) return;
    renderActivity();
    byId('live-shell-title').textContent = `${session.scope.crewRole || session.scope.workerId} · ${session.scope.stepId}`;
    if(session.scope.runId)byId('live-shell-title').append(' ',window.AgentControlIdentity.badge(session.scope.runId,session.scope.runId));
    byId('live-shell-subtitle').textContent = `${groupLabel(session)} · ${session.command}`;
    byId('live-shell-identity').innerHTML = [
      ['Session', session.id], ['Machine', session.scope.nodeId], ['Adapter', `${session.adapterId} / ${session.capabilities.terminal}`],
      ['Provider / model', route(session)], ['Job / step', `${session.scope.jobId} / ${session.scope.stepId}`], ['State / elapsed', `${session.state} / ${elapsed(session)}`],
    ].map(([label, value]) => `<div><span>${safe(label)}</span><strong>${safe(value)}</strong></div>`).join('');
    document.querySelectorAll('[data-live-shell-mode]').forEach(button => { const key = button.dataset.liveShellMode === 'WATCH' ? 'watch' : button.dataset.liveShellMode === 'INTERVENE' ? 'intervene' : 'takeControl'; button.hidden = !session.capabilities.modes[key] || !activeStates.has(session.state); button.disabled = runtime.attachment?.mode === button.dataset.liveShellMode; });
    renderAttachment();
  }

  function renderAttachment() {
    const attachment = runtime.attachment, session = runtime.selected;
    byId('live-shell-mode').textContent = attachment?.mode || 'DETACHED';
    byId('live-shell-mode').className = `status-pill ${attachment?.mode === 'TAKE_CONTROL' ? 'error' : attachment?.mode === 'INTERVENE' ? 'waiting' : attachment ? 'available' : 'neutral'}`;
    byId('live-shell-detach').disabled = !attachment || attachment.mode === 'TAKE_CONTROL';
    byId('live-shell-input-form').hidden = !attachment || attachment.mode === 'WATCH';
    byId('live-shell-controls').hidden = !attachment || attachment.mode === 'WATCH' || (!session?.capabilities.signals.length && !session?.capabilities.resize);
    byId('live-shell-return-form').hidden = attachment?.mode !== 'TAKE_CONTROL';
    byId('live-shell-resize-form').hidden = !session?.capabilities.resize;
    byId('live-shell-signals').innerHTML = attachment && attachment.mode !== 'WATCH' ? (session?.capabilities.signals || []).map(signal => `<button type="button" class="button ${signal === 'TERMINATE' ? 'danger' : 'secondary'}" data-live-shell-signal="${safe(signal)}">${safe(signal)}</button>`).join('') : '';
    document.querySelectorAll('[data-live-shell-signal]').forEach(button => button.addEventListener('click', () => sendSignal(button.dataset.liveShellSignal).catch(showError)));
    byId('live-shell-notice').textContent = attachment ? `${attachment.mode} attached as web operator. ${attachment.mode === 'WATCH' ? 'This view is read-only and cannot alter the job.' : 'Interactive actions are authenticated, fenced to this exact session and recorded without retaining input content.'}` : 'Detached. Select WATCH or another capability explicitly supported by this adapter.';
  }

  async function openSession(id, mode = 'WATCH', transcriptOnly = false) {
    if (runtime.selected?.id !== id) await closeAttachment();
    runtime.selected = await request(`/api/execution-sessions/${encodeURIComponent(id)}`); runtime.cursor = 0; runtime.observedAt = Date.now();
    byId('live-shell-output').textContent = ''; byId('live-shell-transcript-panel').hidden = true;
    renderIdentity(); byId('live-shell-dialog').showModal(); await startStream();
    if (mode && !transcriptOnly) await attach(mode); if (transcriptOnly) await showTranscript();
  }

  async function attach(mode) {
    if (!runtime.selected) return;
    if (mode !== 'WATCH' && !confirm(`${mode} grants privileged interaction with the real process on ${runtime.selected.scope.nodeId}. Continue?`)) return;
    if (runtime.attachment) await closeAttachment();
    runtime.attachment = await request(`/api/execution-sessions/${encodeURIComponent(runtime.selected.id)}/attach`, {method: 'POST', body: JSON.stringify({mode})});
    renderIdentity(); toast(`${mode} attached to ${runtime.selected.id}`);
  }

  async function closeAttachment() {
    if (!runtime.attachment || !runtime.selected) return;
    if (runtime.attachment.mode === 'TAKE_CONTROL') throw new Error('Return control to Agent Control before detaching.');
    const current = runtime.attachment; runtime.attachment = null;
    await request(`/api/execution-sessions/${encodeURIComponent(runtime.selected.id)}/detach`, {method: 'POST', body: JSON.stringify({attachmentId: current.id})}); renderAttachment();
  }

  function appendEvent(event) {
    const output = byId('live-shell-output'); if (!output || event.sequence <= runtime.cursor) return;
    runtime.cursor = event.sequence; const nearBottom = output.scrollHeight - output.scrollTop - output.clientHeight < 64;
    output.textContent += event.type === 'output' ? event.text || '' : `\n[${new Date(event.at).toLocaleTimeString()}] ${event.type} — ${event.detail}\n`;
    if (output.textContent.length > 2_000_000) output.textContent = `[Earlier display bytes omitted; durable transcript remains available.]\n${output.textContent.slice(-1_800_000)}`;
    if (nearBottom) output.scrollTop = output.scrollHeight;
    if (['process.exited', 'process.failed', 'session.disconnected'].includes(event.type)) loadSessions().catch(showError);
  }

  async function startStream() {
    runtime.controller?.abort(); const controller = new AbortController(); runtime.controller = controller;
    const id = runtime.selected.id, response = await fetch(`/api/execution-sessions/${encodeURIComponent(id)}/stream?after=${runtime.cursor}`, {headers: authHeaders(), signal: controller.signal});
    if (!response.ok || !response.body) throw new Error(`Execution stream HTTP ${response.status}`);
    const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
    void (async () => {
      try {
        while (true) {
          const {done, value} = await reader.read(); if (done) break; buffer += decoder.decode(value, {stream: true});
          const frames = buffer.split(/\r?\n\r?\n/); buffer = frames.pop() || '';
          for (const frame of frames) {
            const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
            if (data) appendEvent(JSON.parse(data));
          }
        }
      } catch (error) { if (error.name !== 'AbortError') byId('live-shell-notice').textContent = `Live stream disconnected: ${error.message}`; }
    })();
  }

  async function sendInput(event) {
    event.preventDefault(); if (!runtime.attachment || !runtime.selected) return;
    const field = byId('live-shell-input'), sensitive = byId('live-shell-sensitive').checked, raw = field.value; if (!raw) return;
    field.value = ''; byId('live-shell-sensitive').checked = false;
    await request(`/api/execution-sessions/${encodeURIComponent(runtime.selected.id)}/input`, {method: 'POST', body: JSON.stringify({attachmentId: runtime.attachment.id, value: raw.endsWith('\n') ? raw : `${raw}\n`, sensitive})});
    toast(sensitive ? 'Sensitive input sent; content withheld' : 'Input sent; content withheld from evidence');
  }

  async function sendSignal(signal) {
    if (!runtime.attachment || !runtime.selected) return; if (signal === 'TERMINATE' && !confirm('Terminate this exact execution session?')) return;
    await request(`/api/execution-sessions/${encodeURIComponent(runtime.selected.id)}/signal`, {method: 'POST', body: JSON.stringify({attachmentId: runtime.attachment.id, signal})}); toast(`${signal} sent to ${runtime.selected.id}`);
  }

  async function resize(event) {
    event.preventDefault(); if (!runtime.attachment || !runtime.selected) return;
    await request(`/api/execution-sessions/${encodeURIComponent(runtime.selected.id)}/resize`, {method: 'POST', body: JSON.stringify({attachmentId: runtime.attachment.id, columns: Number(byId('live-shell-columns').value), rows: Number(byId('live-shell-rows').value)})});
  }

  async function returnControl(event) {
    event.preventDefault(); if (!runtime.attachment || !runtime.selected) return;
    const summary = byId('live-shell-reconciliation').value.trim(); if (!summary) return;
    await request(`/api/execution-sessions/${encodeURIComponent(runtime.selected.id)}/return-control`, {method: 'POST', body: JSON.stringify({attachmentId: runtime.attachment.id, summary})});
    const attachment = runtime.attachment; runtime.attachment = null; byId('live-shell-reconciliation').value = '';
    await request(`/api/execution-sessions/${encodeURIComponent(runtime.selected.id)}/detach`, {method: 'POST', body: JSON.stringify({attachmentId: attachment.id})}); renderAttachment(); toast('Control returned after reconciliation');
  }

  async function showTranscript() {
    if (!runtime.selected) return; const value = await request(`/api/execution-sessions/${encodeURIComponent(runtime.selected.id)}/transcript`);
    byId('live-shell-transcript-content').textContent = value.content; byId('live-shell-transcript-panel').hidden = false;
  }

  async function closeDialog() {
    try { await closeAttachment(); } catch (error) { showError(error); return; }
    runtime.controller?.abort(); runtime.controller = null; byId('live-shell-dialog').close();
  }

  setInterval(() => { if (byId('live-shell-dialog')?.open) renderActivity(); }, 1000);

  const previousRefresh = refresh;
  refresh = async () => { await previousRefresh(); await loadSessions(); };
  window.AgentControlLiveShell = {openSession};
  document.addEventListener('DOMContentLoaded', () => {
    byId('live-shell-close').addEventListener('click', () => closeDialog().catch(showError)); byId('live-shell-detach').addEventListener('click', () => closeAttachment().catch(showError));
    byId('live-shell-input-form').addEventListener('submit', event => sendInput(event).catch(showError)); byId('live-shell-resize-form').addEventListener('submit', event => resize(event).catch(showError)); byId('live-shell-return-form').addEventListener('submit', event => returnControl(event).catch(showError));
    byId('live-shell-transcript').addEventListener('click', () => showTranscript().catch(showError)); byId('live-shell-transcript-close').addEventListener('click', () => { byId('live-shell-transcript-panel').hidden = true; });
    document.querySelectorAll('[data-live-shell-mode]').forEach(button => button.addEventListener('click', () => attach(button.dataset.liveShellMode).catch(showError)));
    document.addEventListener('agent-control:event-received', event => {
      if (event.detail?.type === 'execution.session_changed') loadSessions().catch(showError);
    });
  });
})();
