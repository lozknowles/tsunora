(function attachAgentControlBots(root) {
  const states = ['idle', 'queued', 'working', 'reviewing', 'waiting', 'awaiting_operator', 'blocked', 'resource_pressure', 'recovering', 'handing_over', 'completed', 'failed', 'cancelling', 'cancelled', 'offline', 'stale', 'unknown'];
  const labels = {idle: 'Idle', queued: 'Queued', working: 'Working', reviewing: 'Reviewing', waiting: 'Waiting', awaiting_operator: 'Awaiting operator', blocked: 'Blocked', resource_pressure: 'Resource pressure', recovering: 'Recovering', handing_over: 'Handing over', completed: 'Completed', failed: 'Failed', cancelling: 'Cancelling', cancelled: 'Cancelled', offline: 'Offline', stale: 'Stale', unknown: 'Unknown'};
  const icons = {idle: '○', queued: '▤', working: '▶', reviewing: '⌕', waiting: '◷', awaiting_operator: '!', blocked: '⊘', resource_pressure: '△', recovering: '↻', handing_over: '⇢', completed: '✓', failed: '×', cancelling: '◒', cancelled: '■', offline: '⌁', stale: '◴', unknown: '?'};
  const idleLookDurationMs = 45_000;
  const identities = {
    'lane-master': {name: 'Cadence', role: 'Controller & Lane Dispatcher', area: 'Lanes, queue and capacity', accessory: 'conductor baton and three-lane crown'},
    'prompt-reviewer': {name: 'Quill', role: 'Work Parcel Reviewer', area: 'Task entry and readiness', accessory: 'document visor and marking quill'},
    'parcel-coordinator': {name: 'Relay', role: 'Tool & Execution Worker', area: 'Work Parcels, tools and handovers', accessory: 'parcel harness and relay baton'},
    'model-scout': {name: 'Lumen', role: 'Model Router & Scout', area: 'Models, providers and qualification', accessory: 'survey lens and signal dish'},
    'resource-guardian': {name: 'Rook', role: 'Resource & Node Guardian', area: 'Systems, remote nodes and resources', accessory: 'shield frame and pressure gauge'},
    'quality-inspector': {name: 'Verity', role: 'Verification & Evidence Inspector', area: 'Validation, transcripts and run evidence', accessory: 'inspection lens and check seal'},
  };

  function effectiveMotion(preference, systemReduced) {
    if (preference === 'off') return 'off';
    if (systemReduced || preference === 'reduced') return 'reduced';
    return 'full';
  }

  function shouldAcknowledge(previous, current, options = {}) {
    return Boolean(previous && previous.state !== 'completed' && current?.state === 'completed' && current.freshness === 'current' && options.streamLive !== false && options.initial !== true);
  }

  function idleDisposition(member, now = Date.now()) {
    if (!member || member.state !== 'idle' || (member.activity?.kind && member.activity.kind !== 'NONE')) return null;
    const updatedAt = Date.parse(member.lastUpdatedAt || '');
    if (!Number.isFinite(updatedAt)) return 'sleeping';
    return Math.max(0, now - updatedAt) < idleLookDurationMs ? 'looking' : 'sleeping';
  }

  function shouldWake(previous, current) {
    return Boolean(previous?.rest === 'sleeping' && current && current.state !== 'idle' && current.activity?.kind && current.activity.kind !== 'NONE');
  }

  function animationExpression(member, previous) {
    if (shouldWake(previous, member)) return 'WAKING';
    return member?.animationCue?.expression || (member?.state === 'idle' ? 'AMBIENT_IDLE' : member?.state === 'completed' ? 'SUCCESS_ACKNOWLEDGEMENT' : 'WORKING');
  }

  function normalizePreference(value, accepted, fallback) { return accepted.includes(value) ? value : fallback; }
  let artworkSequence = 0;
  root.AgentControlBots = {artwork: botSvg, states: [...states], labels: {...labels}, icons: {...icons}, identities: Object.fromEntries(Object.entries(identities).map(([id, identity]) => [id, {...identity}])), idleLookDurationMs, effectiveMotion, shouldAcknowledge, shouldWake, animationExpression, idleDisposition, normalizePreference};
  if (typeof document === 'undefined') return;

  const runtime = {
    previous: new Map(),
    initial: true,
    gallery: new Map(),
    motion: readPreference('agent-control-character-motion', ['full', 'reduced', 'off'], 'full'),
    display: readPreference('agent-control-character-display', ['on', 'off'], 'on'),
    galleryTheme: 'dashboard',
    suppressNextAcknowledgement: false,
    observer: null,
    focusId: null,
    batonFocusId: null,
  };
  const defaultGalleryStates = ['working', 'reviewing', 'handing_over', 'queued', 'resource_pressure', 'completed'];
  Object.keys(identities).forEach((id, index) => runtime.gallery.set(id, defaultGalleryStates[index]));

  function readPreference(key, accepted, fallback) {
    try { return normalizePreference(localStorage.getItem(key), accepted, fallback); }
    catch { return fallback; }
  }

  function writePreference(key, value) {
    try { localStorage.setItem(key, value); }
    catch { /* Browser storage may be disabled; the in-memory setting still applies. */ }
  }

  function systemReducedMotion() { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function applyPreferences() {
    const effective = effectiveMotion(runtime.motion, systemReducedMotion());
    document.documentElement.dataset.botMotion = effective;
    document.documentElement.dataset.botDisplay = runtime.display;
    document.querySelectorAll('[data-bot-motion]').forEach(button => button.classList.toggle('active', button.dataset.botMotion === runtime.motion));
    document.querySelectorAll('[data-bot-display]').forEach(button => button.classList.toggle('active', button.dataset.botDisplay === runtime.display));
    document.querySelectorAll('[data-gallery-theme]').forEach(button => button.classList.toggle('active', button.dataset.galleryTheme === runtime.galleryTheme));
    const gallery = document.querySelector('#crew-gallery'); if (gallery) gallery.dataset.galleryTheme = runtime.galleryTheme;
    const note = document.querySelector('#crew-motion-note');
    if (note) note.textContent = systemReducedMotion() && runtime.motion === 'full' ? 'System reduced-motion is active, so Full is safely capped at Reduced.' : `Operational character animation: ${effective}. Character state text and icons remain available in every mode.`;
  }

  function duration(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'not running';
    const seconds = Math.max(0, Math.round(value / 1000));
    return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }

  function age(value) {
    const parsed = Date.parse(value || '');
    if (!Number.isFinite(parsed)) return 'not reported';
    const seconds = Math.max(0, Math.floor((Date.now() - parsed) / 1000));
    return seconds < 60 ? `${seconds}s ago` : seconds < 3600 ? `${Math.floor(seconds / 60)}m ago` : `${Math.floor(seconds / 3600)}h ago`;
  }

  function roleAccessory(id) {
    if (id === 'lane-master') return '<g class="bot-role-accessory bot-conductor"><path class="bot-accent-fill" d="M56 35h68l-9-10H68z"/><circle cx="75" cy="23" r="4"/><circle cx="90" cy="19" r="4"/><circle cx="105" cy="23" r="4"/><path class="bot-tool bot-baton" d="M131 82l24-29"/><circle class="bot-accent-fill" cx="156" cy="51" r="3"/></g>';
    if (id === 'prompt-reviewer') return '<g class="bot-role-accessory bot-editor"><rect class="bot-paper" x="63" y="94" width="54" height="38" rx="4"/><path d="M72 104h34M72 112h26M72 120h20"/><path class="bot-tool bot-quill" d="M117 121c13-17 20-25 29-28-2 10-8 20-26 31z"/><path d="M120 124l-5 6"/></g>';
    if (id === 'parcel-coordinator') return '<g class="bot-role-accessory bot-dispatcher"><path class="bot-accent-fill bot-pack" d="M60 91h60v38H60z"/><path d="M60 103h60M90 91v38"/><path class="bot-tool bot-relay" d="M132 100h22"/><path class="bot-accent-fill bot-relay-token" d="M149 94l10 6-10 6z"/></g>';
    if (id === 'model-scout') return '<g class="bot-role-accessory bot-scout"><path class="bot-accent-fill bot-dish" d="M116 29c18 4 26 15 29 29-15 0-27-8-29-29z"/><path d="M132 45l13-12"/><circle class="bot-lens" cx="105" cy="67" r="16"/><path class="bot-tool bot-scope" d="M117 78l18 16"/></g>';
    if (id === 'resource-guardian') return '<g class="bot-role-accessory bot-guardian"><path class="bot-accent-fill bot-shield" d="M48 83l18 7v17c0 13-8 23-18 28-10-5-18-15-18-28V90z"/><circle class="bot-gauge" cx="112" cy="108" r="19"/><path class="bot-gauge-needle" d="M112 108l10-10"/><path d="M98 108a14 14 0 0 1 28 0"/></g>';
    return '<g class="bot-role-accessory bot-inspector"><circle class="bot-lens" cx="121" cy="100" r="20"/><path class="bot-tool bot-magnifier" d="M136 115l17 17"/><path class="bot-accent-stroke bot-check-seal" d="M69 108l8 8 17-20"/></g>';
  }

  function activeToolArtwork(kind) {
    if (kind === 'SEARCH') return '<g class="bot-active-tool bot-active-search"><circle cx="28" cy="82" r="10"/><path d="M35 89l9 9M22 82h12"/></g>';
    if (kind === 'CODE_EDIT') return '<g class="bot-active-tool bot-active-code"><rect x="20" y="76" width="28" height="18" rx="3"/><path d="M25 82l5 4-5 4M34 90h8M43 72l7-7"/></g>';
    if (kind === 'FILE') return '<g class="bot-active-tool bot-active-file"><path d="M21 67h21l7 7v25H21zM42 67v8h7M27 82h16M27 89h12"/></g>';
    if (kind === 'WEB_BROWSER') return '<g class="bot-active-tool bot-active-browser"><rect x="18" y="69" width="34" height="27" rx="4"/><path d="M18 77h34M24 73h.1M29 73h.1M26 85h18"/></g>';
    if (kind === 'REMOTE_MACHINE') return '<g class="bot-active-tool bot-active-remote"><rect x="17" y="70" width="36" height="27" rx="4"/><path d="M23 80l5 4-5 4M32 89h13M35 68v-8M30 63h10"/></g>';
    if (kind === 'BENCHMARK') return '<g class="bot-active-tool bot-active-test"><path d="M19 91h8l4-14 7 23 5-16h10"/><circle cx="36" cy="84" r="18"/></g>';
    if (kind === 'VOICE') return '<g class="bot-active-tool bot-active-voice"><path d="M18 84h5l3-10 5 20 5-27 5 26 4-9h8"/></g>';
    if (kind === 'SOCIAL') return '<g class="bot-active-tool bot-active-social"><path d="M18 70h31v21H31l-8 7v-7h-5zM25 78h17M25 84h12"/></g>';
    if (kind === 'MODEL_DISCOVERY') return '<g class="bot-active-tool bot-active-model"><circle cx="29" cy="80" r="5"/><circle cx="49" cy="68" r="4"/><circle cx="49" cy="94" r="4"/><path d="M33 77l12-7M33 84l12 8M20 65q-11 15 0 30"/></g>';
    if (kind === 'GENERIC_TOOL') return '<g class="bot-active-tool bot-active-generic"><circle cx="32" cy="82" r="12"/><path d="M32 65v7M32 92v7M15 82h7M42 82h7M20 70l5 5M39 89l5 5M44 70l-5 5M25 89l-5 5"/></g>';
    return '';
  }

  function botSvg(member, expression) {
    const id = Object.prototype.hasOwnProperty.call(identities, member.id) ? member.id : 'quality-inspector';
    const stateName = states.includes(member.state) ? member.state : 'unknown';
    const paintId = `crew-art-${++artworkSequence}`;
    const headRadius = id === 'resource-guardian' ? 18 : id === 'prompt-reviewer' ? 22 : 26;
    const expressionName = String(expression || 'STILL').toLowerCase().replaceAll('_', '-').replace(/[^a-z0-9-]/g, ''), toolKind = member.activity?.tool?.kind || null;
    return `<svg class="agent-bot bot-${id} bot-state-${stateName} bot-expression-${expressionName}" data-animation-authority="presentation-only" data-art-style="morrow-crew" viewBox="0 0 180 150" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="${paintId}-ceramic" x1="0" y1="0" x2=".85" y2="1"><stop stop-color="#fff2dc"/><stop offset=".48" stop-color="#d9d0bd"/><stop offset="1" stop-color="#9faaa7"/></linearGradient>
        <linearGradient id="${paintId}-armour" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#466570"/><stop offset=".5" stop-color="#263f4b"/><stop offset="1" stop-color="#142932"/></linearGradient>
        <linearGradient id="${paintId}-copper" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f2c99b"/><stop offset=".45" stop-color="#bf865b"/><stop offset="1" stop-color="#735443"/></linearGradient>
      </defs>
      <ellipse class="bot-shadow" cx="90" cy="141" rx="49" ry="6"/>
      <g class="bot-float">
        <g class="bot-antenna"><path d="M90 38V24"/><circle class="bot-accent-fill bot-antenna-light" cx="90" cy="19" r="5"/><circle class="bot-glint" cx="88.5" cy="17.5" r="1.5"/></g>
        <g class="bot-body">
          <path class="bot-leg" d="M72 126v13M108 126v13"/><path class="bot-foot" d="M61 140h22M97 140h22"/>
          <rect class="bot-shell" fill="url(#${paintId}-armour)" x="52" y="86" width="76" height="47" rx="17"/>
          <path class="bot-panel" fill="url(#${paintId}-armour)" d="M68 91L90 100 112 91 114 123Q90 133 66 123Z"/>
          <path class="bot-copper-seam" d="M112 95L78 115V127"/>
          <path class="bot-trim" d="M60 97L66 92M116 92L121 98M59 124h10M109 125h11"/>
          <g class="bot-crew-badge"><circle cx="107" cy="111" r="8"/><circle class="bot-badge-light" cx="104" cy="108" r="1.5"/><circle class="bot-badge-light" cx="110" cy="111" r="1.5"/><circle class="bot-badge-light" cx="105" cy="115" r="1.5"/></g>
        </g>
        <g class="bot-head">
          <rect class="bot-shell" fill="url(#${paintId}-ceramic)" x="45" y="36" width="90" height="57" rx="${headRadius}"/>
          <path class="bot-face" fill="url(#${paintId}-ceramic)" d="M61 48Q90 41 119 48L121 73Q116 87 90 88 64 87 59 73Z"/>
          <path class="bot-panel-seam" d="M90 37V43M58 45L52 52M123 46L130 53M58 82L53 85M123 82L128 85"/>
          <g class="bot-temple"><ellipse fill="url(#${paintId}-copper)" cx="47" cy="65" rx="9" ry="15"/><ellipse class="bot-temple-inset" cx="46" cy="65" rx="5" ry="10"/><circle class="bot-badge-light" cx="46" cy="65" r="2"/></g>
          <path class="bot-brow" d="M68 55Q75 52 82 55M97 54Q104 50 111 54"/>
          <g class="bot-eye-direction"><g class="bot-eyes"><path class="bot-eye-socket" d="M66 63Q75 57 84 63V70Q76 76 67 71ZM96 62Q105 56 114 62L113 71Q104 75 96 69Z"/><ellipse cx="76" cy="66" rx="4" ry="5.5"/><ellipse cx="105" cy="65" rx="4" ry="5.5"/><circle class="bot-glint" cx="75" cy="64" r="1.3"/><circle class="bot-glint" cx="104" cy="63" r="1.3"/></g><g class="bot-sleep-eyes"><path d="M69 66q7 7 14 0M97 66q7 7 14 0"/></g></g>
          <path class="bot-mouth bot-mouth-neutral" d="M83 80q7 4 14-1"/><path class="bot-mouth bot-mouth-smile" d="M81 77q9 10 18 0"/><path class="bot-mouth bot-mouth-frown" d="M81 82q9-10 18 0"/>
          <circle class="bot-fastener" cx="60" cy="76" r="1.5"/><circle class="bot-fastener" cx="120" cy="76" r="1.5"/>
        </g>
        <g class="bot-sleep-signals"><text x="132" y="54">z</text><text x="143" y="42">z</text><text x="156" y="28">Z</text></g>
        <g class="bot-arms"><path class="bot-arm bot-arm-left" d="M53 99L34 114"/><path class="bot-arm bot-arm-right" d="M127 99l19 15"/><circle class="bot-shoulder" fill="url(#${paintId}-copper)" cx="53" cy="99" r="6"/><circle class="bot-shoulder" fill="url(#${paintId}-copper)" cx="127" cy="99" r="6"/><circle class="bot-hand" fill="url(#${paintId}-ceramic)" cx="32" cy="114" r="7"/><circle class="bot-hand" fill="url(#${paintId}-ceramic)" cx="148" cy="114" r="7"/><path class="bot-finger" d="M29 112l5 4M146 111l4 5"/></g>
        ${roleAccessory(id)}
        <g class="bot-state-props">
          <g class="bot-task-card"><rect x="128" y="72" width="28" height="35" rx="3"/><path d="M134 82h16M134 89h13M134 96h10"/></g>
          <g class="bot-hourglass"><path d="M143 73h18M143 101h18M146 75c0 10 12 10 12 24M158 75c0 10-12 10-12 24"/></g>
          <g class="bot-barrier"><path d="M25 116h130M36 105v27M144 105v27"/><path class="bot-accent-stroke" d="M43 111l14 11m8-11 14 11m8-11 14 11m8-11 14 11"/></g>
          <g class="bot-alert"><path d="M145 69l15 27h-30z"/><path d="M145 77v10M145 91h.1"/></g>
          <g class="bot-recovery-gear"><circle cx="149" cy="86" r="13"/><path d="M149 67v7M149 98v7M130 86h7M161 86h7M136 73l5 5M157 94l5 5M162 73l-5 5M141 94l-5 5"/></g>
          <g class="bot-handoff"><path class="bot-tool" d="M119 105h39"/><path class="bot-accent-fill bot-handoff-token" d="M145 96l15 9-15 9z"/></g>
          <path class="bot-complete-mark" d="M132 82l9 9 18-23"/>
          <path class="bot-failure-mark" d="M137 72l20 20M157 72l-20 20"/>
          <path class="bot-cancel-mark" d="M135 84h25"/>
          <g class="bot-offline-mark"><path d="M138 70v14M154 70v14M134 84h24v8c0 8-5 13-12 13s-12-5-12-13z"/><path d="M146 105v10"/></g>
          <g class="bot-stale-mark"><circle cx="147" cy="84" r="15"/><path d="M147 75v10l7 4"/></g>
          <text class="bot-unknown-mark" x="147" y="95" text-anchor="middle">?</text>
        </g>
        ${activeToolArtwork(toolKind)}
      </g>
    </svg>`;
  }

  function facts(member) {
    const values = [];
    if (member.current) values.push(member.current);
    if (member.elapsedMs !== null && member.elapsedMs !== undefined) values.push(`Elapsed ${duration(member.elapsedMs)}`);
    values.push(`Updated ${age(member.lastUpdatedAt)}`);
    values.push(`${member.instrumentation?.coverage || 'unavailable'} telemetry`);
    return values.join(' · ');
  }

  function signals(member) {
    const values = Array.isArray(member.signals) ? member.signals : [];
    return values.length ? `<span class="bot-signals" aria-label="Concurrent states">${values.map(item => `<span class="bot-signal bot-signal-${esc(item.state)}"><span aria-hidden="true">${esc(icons[item.state] || '?')}</span>${esc(item.count)} ${esc(item.label)}</span>`).join('')}</span>` : '';
  }

  function characterCard(member, options = {}) {
    const fallback = identities[member.id] || identities['quality-inspector'], identity = {...fallback, name: member.name || fallback.name, role: member.role || fallback.role, area: member.area || fallback.area}, stateName = states.includes(member.state) ? member.state : 'unknown', label = labels[stateName], rest = idleDisposition({...member, state: stateName}, options.now), expression = animationExpression(member, options.previous), activity = member.activity?.kind || 'NONE', operational = member.operationalState || stateName.toUpperCase(), restClass = rest ? ` bot-rest-${rest}` : '', expressionClass = ` bot-expression-${String(expression).toLowerCase().replaceAll('_', '-')}`, activityClass = ` bot-activity-${String(activity).toLowerCase().replaceAll('_', '-')}`, completeAck = options.acknowledge ? ' bot-acknowledge' : '', compact = options.compact ? ' bot-card-compact' : '', simulated = options.simulated ? ' bot-card-simulated' : '', interactive = options.navigable || options.focusable, tag = interactive ? 'button' : 'article';
    const action = options.navigable ? ` type="button" data-bot-character-nav="${esc(member.id)}"` : options.focusable ? ` type="button" data-bot-character-focus="${esc(member.id)}"` : '';
    const aria = interactive ? ` aria-label="${esc(`${identity.name}, ${identity.role}: ${operational}; ${member.activity?.label || label}. ${member.summary} ${options.navigable ? `Open ${identity.area}.` : 'Open human-readable explanation.'}`)}"` : '';
    const activityLabel = member.activity?.label || (stateName === 'idle' ? 'No active work' : label), tool = member.activity?.tool;
    const renderKey = [member.id, member.transitionKey || 'unreported', stateName, rest || 'none', expression, activity, tool?.kind || 'none', operational, options.acknowledge ? 'ack' : 'steady', options.compact ? 'compact' : 'full', options.simulated ? 'simulated' : 'live'].join('|');
    return `<${tag} class="bot-card bot-${esc(member.id)} bot-state-${esc(stateName)}${esc(restClass)}${esc(expressionClass)}${esc(activityClass)}${completeAck}${compact}${simulated}" data-bot-character-id="${esc(member.id)}" data-bot-render-key="${esc(renderKey)}" data-bot-rest="${esc(rest || 'none')}" data-bot-expression="${esc(expression)}" data-operational-state="${esc(operational)}" data-activity="${esc(activity)}" data-transition-key="${esc(member.transitionKey || 'unreported')}"${action}${aria}>
      <span class="bot-portrait">${botSvg({...member, id: member.id, state: stateName}, expression)}<span class="bot-state-pill"><span aria-hidden="true">${esc(icons[stateName])}</span>${esc(operational)}</span></span>
      <span class="bot-copy"><span class="bot-identity"><strong>${esc(identity.name)}</strong><small>${esc(identity.role)}</small>${options.simulated ? '<b class="bot-simulated-label">SIMULATED</b>' : ''}</span><span class="bot-activity-line"><b>${esc(activity)}</b><span>${esc(activityLabel)}</span>${tool ? `<i>${esc(tool.kind)}</i>` : ''}</span><span class="bot-summary">${esc(member.summary)}</span><span class="bot-reason">${esc(member.reason)}</span>${signals(member)}<span class="bot-facts">${esc(facts(member))}</span><span class="bot-next"><b>Next</b> ${esc(member.nextAction)}</span>${member.instrumentation?.limitation ? `<span class="bot-limitation">${esc(member.instrumentation.limitation)}</span>` : ''}<span class="bot-animation-label">Presentation only: ${esc(String(expression).toLowerCase().replaceAll('_', ' '))}</span></span>
    </${tag}>`;
  }

  function cardElement(markup) {
    const template = document.createElement('template'); template.innerHTML = markup.trim();
    return template.content.firstElementChild;
  }

  function preserveOrReplace(current, desired) {
    if (current?.dataset?.botRenderKey === desired?.dataset?.botRenderKey) {
      const factsNode = current.querySelector('.bot-facts'), desiredFacts = desired.querySelector('.bot-facts');
      if (factsNode && desiredFacts) factsNode.textContent = desiredFacts.textContent;
      return current;
    }
    if (current) current.replaceWith(desired); else return desired;
    return desired;
  }

  function reconcileSingleCard(container, markup) {
    const desired = cardElement(markup), current = container.firstElementChild;
    preserveOrReplace(current, desired);
    if (!current) container.append(desired);
    while (container.children.length > 1) container.lastElementChild.remove();
  }

  function reconcileCardList(container, markups) {
    markups.forEach((markup, index) => {
      const desired = cardElement(markup), current = container.children[index];
      preserveOrReplace(current, desired);
      if (!current) container.append(desired);
    });
    while (container.children.length > markups.length) container.lastElementChild.remove();
  }

  function simulatedMember(id, stateName, mixed = false) {
    const identity = identities[id], mixedSignals = mixed ? id === 'lane-master' ? [{state: 'working', label: 'active', count: 3}, {state: 'blocked', label: 'blocked', count: 1}, {state: 'queued', label: 'queued', count: 2}] : [{state: stateName, label: 'preview', count: 1}] : [];
    const operationalState = stateName === 'working' ? 'EXECUTING' : stateName === 'reviewing' ? 'VERIFYING' : stateName === 'completed' ? 'SUCCEEDED' : stateName === 'failed' ? 'FAILED' : stateName === 'cancelled' ? 'CANCELLED' : stateName === 'recovering' ? 'RECOVERING' : stateName === 'queued' ? 'PLANNING' : stateName === 'idle' ? 'IDLE' : 'WAITING';
    const activityKind = stateName === 'working' ? id === 'parcel-coordinator' ? 'CODING' : id === 'model-scout' ? 'MODEL_DISCOVERY' : 'USING_TOOL' : stateName === 'reviewing' ? 'VERIFYING' : stateName === 'handing_over' ? 'PASSING_BATON' : 'NONE';
    return {id, ...identity, state: stateName, stateLabel: labels[stateName], operationalState, activity: {kind: activityKind, label: activityKind === 'NONE' ? 'No active work' : 'Simulated activity preview', source: {authority: 'Agent Control', type: 'simulation', id: null, at: null, detail: 'Preview only'}, tool: activityKind === 'CODING' ? {kind: 'CODE_EDIT', label: 'code editor', action: 'simulation', capabilities: []} : activityKind === 'MODEL_DISCOVERY' ? {kind: 'MODEL_DISCOVERY', label: 'model discovery', action: 'simulation', capabilities: []} : null}, animationCue: {expression: stateName === 'idle' ? 'AMBIENT_IDLE' : stateName === 'completed' ? 'SUCCESS_ACKNOWLEDGEMENT' : stateName === 'failed' ? 'CONCERNED' : 'WORKING', label: 'preview', authority: 'presentation-only', sourceType: 'simulation'}, summary: mixed && id === 'lane-master' ? 'Three lanes working; two queued; one blocked.' : `${identity.role} ${labels[stateName].toLowerCase()} pose preview.`, reason: 'Simulated gallery state; no production event or capability is claimed.', nextAction: 'Choose another state to inspect its visual and text equivalent.', counts: {active: mixed ? 3 : 0, queued: mixed ? 2 : 0, waiting: 0, blocked: mixed ? 1 : 0, completed: 0, failed: 0}, signals: mixedSignals, elapsedMs: stateName === 'working' ? 38_000 : null, lastUpdatedAt: new Date().toISOString(), freshness: stateName === 'stale' ? 'stale' : 'current', instrumentation: {coverage: 'unavailable', source: 'isolated gallery simulation', limitation: 'Preview data never enters Agent Control runtime state.'}};
  }

  function renderGallery() {
    const gallery = document.querySelector('#crew-gallery'), vocabulary = document.querySelector('#crew-state-vocabulary'); if (!gallery || !vocabulary) return;
    gallery.innerHTML = Object.keys(identities).map(id => {
      const selected = runtime.gallery.get(id) || 'idle', member = simulatedMember(id, selected, runtime.galleryPreset === 'mixed');
      return `<div class="bot-gallery-item">${characterCard(member, {simulated: true})}<label>Preview state<select data-gallery-character="${esc(id)}" aria-label="Preview state for ${esc(identities[id].name)}">${states.map(value => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(labels[value])}</option>`).join('')}</select></label></div>`;
    }).join('');
    vocabulary.innerHTML = states.map(value => `<button type="button" class="bot-state-chip bot-signal-${esc(value)}" data-gallery-state-all="${esc(value)}"><span aria-hidden="true">${esc(icons[value])}</span>${esc(labels[value])}</button>`).join('');
    gallery.dataset.galleryTheme = runtime.galleryTheme;
    observeBots();
  }

  function routeText(route) { return route?.label || 'route not reported'; }
  function statusClass(value) { return String(value || 'unknown').toLowerCase().replace(/[^a-z0-9_-]+/g, '-'); }
  function toolBadge(tool) { return tool ? `<span class="crew-tool-badge crew-tool-${esc(statusClass(tool.kind))}">${esc(tool.kind)} · ${esc(tool.action)}</span>` : ''; }

  function renderParcel(parcel) {
    const identity = identities[parcel.owner] || identities['lane-master'];
    const stations = Object.entries(identities).map(([id, item]) => `<span class="crew-station ${id === parcel.owner ? 'active' : ''}" data-character="${esc(id)}"><b>${esc(item.name)}</b><small>${esc(item.role)}</small>${id === parcel.owner ? '<i class="crew-parcel-marker" aria-hidden="true">◆</i>' : ''}</span>`).join('<span class="crew-station-link" aria-hidden="true">→</span>');
    const stages = (parcel.stages || []).map(stage => { const running = String(stage.status).toUpperCase() === 'RUNNING', worker = running ? `<span class="crew-worker-bot" aria-label="${esc(stage.worker || 'Recorded stage worker')} is active"><i aria-hidden="true"><b></b><b></b></i>${esc(stage.worker || 'active worker')}</span>` : ''; return `<li class="crew-stage crew-stage-${esc(statusClass(stage.status))}" data-stage-id="${esc(stage.id)}"><span><b>${esc(stage.name)}</b><em>${esc(stage.status)}</em></span><small>${stage.dependencies?.length ? `After ${esc(stage.dependencies.join(', '))}` : 'Entry stage'}${stage.worker ? ` · ${esc(stage.worker)}` : ''}</small>${worker}${toolBadge(stage.tool)}${stage.route ? `<small class="crew-stage-route">${esc(stage.route)}</small>` : ''}</li>`; }).join('');
    return `<article class="crew-parcel" data-parcel-id="${esc(parcel.id)}" data-parcel-state="${esc(parcel.operationalState)}"><header><div><span class="eyebrow">Real Work Parcel</span><h3>${esc(parcel.id)}</h3></div><span class="status-pill ${esc(statusClass(parcel.status))}">${esc(parcel.status)}</span></header><p>${esc(parcel.objective)}</p><div class="crew-parcel-metrics"><span>${esc(parcel.progress.completed)}/${esc(parcel.progress.total)} complete</span><span>${esc(parcel.progress.active)} active</span>${parcel.parallelActive > 1 ? `<strong>${esc(parcel.parallelActive)} PARALLEL</strong>` : ''}</div><small class="crew-role-map-label">Role ownership · actual concurrent dependency graph is shown below</small><div class="crew-stations" aria-label="Current Parcel owner: ${esc(identity.name)}">${stations}</div><p class="crew-owner-copy"><b>${esc(identity.name)}</b> · ${esc(parcel.ownerReason)}</p><ol class="crew-stage-rail">${stages || '<li class="crew-stage">No governed stages projected.</li>'}</ol>${parcel.route ? `<p class="crew-route"><b>Current route</b> ${esc(parcel.route)}</p>` : ''}</article>`;
  }

  function renderBaton(transfer) {
    const context = transfer.contextPercent === null || transfer.contextPercent === undefined ? '' : ` · context ${Number(transfer.contextPercent).toFixed(1)}%`;
    const trigger=transfer.triggerKind?` · ${transfer.triggerKind}${transfer.triggerCode?` / ${transfer.triggerCode}`:''}`:'';
    return `<button type="button" class="crew-baton ${transfer.active ? 'active' : ''}" data-baton-focus="${esc(transfer.id)}"><span class="crew-baton-route"><span>${esc(routeText(transfer.from))}</span><i aria-hidden="true"><b>▰</b>→</i><span>${esc(routeText(transfer.to))}</span></span><strong>${esc(transfer.outcome)}${esc(context)}${esc(trigger)}</strong><small>${esc(transfer.reason)}</small><em>Open exact recorded reason</em></button>`;
  }

  function renderModelActivity(item) {
    const eligibility = item.routingEligible === true ? ' · routing enabled' : item.routingEligible === false ? ' · routing disabled' : '';
    return `<article class="crew-model-event ${item.failure ? 'failed' : ''}"><header><b>${esc([item.provider, item.model].filter(Boolean).join(' / ') || 'Model intelligence')}</b><time>${esc(age(item.at))}</time></header><strong>${esc(item.action.replaceAll('-', ' '))}${esc(eligibility)}</strong><p>${esc(item.explanation)}</p>${item.failure ? `<small>Recorded failure: ${esc(item.failure)}${item.httpStatus ? ` · HTTP ${esc(item.httpStatus)}` : ''}</small>` : ''}</article>`;
  }

  function renderFocus() {
    const panel = document.querySelector('#crew-human-explanation'); if (!panel) return;
    const crew = state.snapshot?.characterCrew;
    const baton = runtime.batonFocusId && crew?.batonTransfers?.find(item => item.id === runtime.batonFocusId);
    if (baton) {
      panel.innerHTML = `<div><span class="eyebrow">Level 2 · Human explanation</span><h2>Why did this baton move?</h2><p>${esc(baton.explanation)}</p><dl><div><dt>Authority</dt><dd>Agent Control ${esc(baton.sourceType)}</dd></div><div><dt>Trigger</dt><dd>${esc(baton.triggerKind || 'Recorded handoff')}${baton.triggerCode ? ` · ${esc(baton.triggerCode)}` : ''}${baton.triggerReason ? `<br>${esc(baton.triggerReason)}` : ''}</dd></div><div><dt>Source event</dt><dd>${esc(baton.sourceEventId)}</dd></div><div><dt>Sealed baton</dt><dd>${esc(baton.batonId || 'ID not projected')}</dd></div><div><dt>Recorded at</dt><dd>${esc(new Date(baton.at).toLocaleString())}</dd></div></dl></div><button type="button" class="button secondary" data-bot-character-nav="parcel-coordinator">Level 3 · Open engineering evidence</button>`;
      panel.hidden = false; return;
    }
    const member = crew?.members?.find(item => item.id === runtime.focusId);
    if (!member) { panel.hidden = true; panel.innerHTML = ''; return; }
    panel.innerHTML = `<div><span class="eyebrow">Level 2 · Human explanation</span><h2>${esc(member.name)} · ${esc(member.operationalState)}</h2><p>${esc(member.narration?.text || member.summary)}</p><p>${esc(member.narration?.detail || member.reason)}</p><dl><div><dt>Recorded activity</dt><dd>${esc(member.activity?.kind || 'NONE')} · ${esc(member.activity?.source?.type || 'none')} ${member.activity?.source?.id ? `#${esc(member.activity.source.id)}` : ''}</dd></div><div><dt>Model / provider / lane</dt><dd>${esc(member.current || 'No active route or lane reported')}</dd></div><div><dt>Elapsed</dt><dd>${esc(duration(member.elapsedMs))}</dd></div><div><dt>Progress</dt><dd>${esc(member.counts?.completed || 0)} complete · ${esc(member.counts?.active || 0)} active · ${esc(member.counts?.waiting || 0)} waiting · ${esc(member.counts?.failed || 0)} failed</dd></div><div><dt>Animation</dt><dd>${esc(member.animationCue?.expression || 'STILL')} · presentation only</dd></div><div><dt>When idle</dt><dd>${esc(member.idlePersonality || 'Watches for authoritative work.')}</dd></div><div><dt>When working</dt><dd>${esc(member.workingPersonality || 'Projects recorded activity.')}</dd></div></dl></div><button type="button" class="button secondary" data-bot-character-nav="${esc(member.id)}">Level 3 · Open engineering evidence</button>`;
    panel.hidden = false;
  }

  function renderWorkflow() {
    const crew = state.snapshot?.characterCrew;
    const headline = document.querySelector('#crew-headline'), narration = document.querySelector('#crew-narration'), parcels = document.querySelector('#crew-parcel-flow'), batons = document.querySelector('#crew-baton-flow'), models = document.querySelector('#crew-model-flow');
    if (headline) headline.textContent = crew?.headline || 'Awaiting authoritative Agent Control state.';
    if (narration) narration.innerHTML = crew?.narration?.length ? crew.narration.map(item => `<li data-character="${esc(item.characterId)}"><b>${esc(identities[item.characterId]?.name || item.characterId)}</b><span>${esc(item.text)}</span></li>`).join('') : '<li><b>Crew</b><span>No active operation is recorded.</span></li>';
    if (parcels) parcels.innerHTML = crew?.parcels?.length ? crew.parcels.slice(0, 6).map(renderParcel).join('') : '<div class="compact-empty">No Work Parcel flow is recorded.</div>';
    if (batons) batons.innerHTML = crew?.batonTransfers?.length ? crew.batonTransfers.slice(0, 6).map(renderBaton).join('') : '<div class="compact-empty">No real baton transfer is recorded.</div>';
    if (models) models.innerHTML = crew?.modelActivity?.length ? crew.modelActivity.slice(0, 6).map(renderModelActivity).join('') : '<div class="compact-empty">No recent provider/model discovery event is recorded.</div>';
    renderFocus();
  }

  function renderCharacters() {
    const crew = state.snapshot?.characterCrew, members = crew?.members || [];
    const acknowledgements = new Map(), previousValues = new Map(runtime.previous);
    for (const member of members) {
      const previous = previousValues.get(member.id), acknowledge = shouldAcknowledge(previous, member, {initial: runtime.initial, streamLive: document.querySelector('#stream-state')?.textContent === 'LIVE' && !runtime.suppressNextAcknowledgement}), slot = document.querySelector(`[data-bot-slot="${member.id}"]`);
      acknowledgements.set(member.id, acknowledge);
      if (slot) reconcileSingleCard(slot, characterCard(member, {compact: true, navigable: true, acknowledge, previous}));
      runtime.previous.set(member.id, {state: member.state, transitionKey: member.transitionKey, rest: idleDisposition(member)});
    }
    const live = document.querySelector('#crew-live-grid');
    if (live) {
      if (members.length) reconcileCardList(live, members.map(member => characterCard(member, {focusable: true, acknowledge: acknowledgements.get(member.id), previous: previousValues.get(member.id)})));
      else live.innerHTML = '<div class="compact-empty">No character projection is available from this Agent Control server.</div>';
    }
    const ageNode = document.querySelector('#crew-live-age'); if (ageNode) ageNode.textContent = crew ? `SNAPSHOT ${age(crew.observedAt).toUpperCase()}` : 'AWAITING SNAPSHOT';
    const modeNode = document.querySelector('#crew-execution-mode'); if (modeNode) { const mode = crew?.executionMode; modeNode.textContent = mode === 'CONTROLLED_FAULT_INJECTION' ? 'CONTROLLED FAULT INJECTION' : mode === 'SIMULATED' ? 'SIMULATED / TEST DATA' : mode === 'LIVE' ? 'LIVE / REAL EXECUTION' : 'NO ACTIVE EXECUTION'; modeNode.className = `status-pill ${mode === 'CONTROLLED_FAULT_INJECTION' ? 'waiting' : mode === 'SIMULATED' ? 'neutral' : mode === 'LIVE' ? 'available' : 'neutral'}`; }
    renderWorkflow();
    runtime.initial = false;
    if (document.querySelector('#stream-state')?.textContent === 'LIVE') runtime.suppressNextAcknowledgement = false;
    applyPreferences();
    observeBots();
    document.dispatchEvent(new CustomEvent('agent-control:crew-rendered', {detail: {observedAt: crew?.observedAt || null, renderedAt: performance.now()}}));
  }

  function observeBots() {
    if (!('IntersectionObserver' in root)) return;
    runtime.observer?.disconnect();
    runtime.observer = new IntersectionObserver(entries => entries.forEach(entry => entry.target.classList.toggle('bot-offscreen', !entry.isIntersecting)), {rootMargin: '40px'});
    document.querySelectorAll('.agent-bot').forEach(node => runtime.observer.observe(node));
  }

  function navigate(id) {
    const member = state.snapshot?.characterCrew?.members?.find(item => item.id === id); if (!member) return;
    document.querySelector(`[data-view="${member.navigation.view}"]`)?.click();
    if (member.navigation.tab) document.querySelector(`[data-job-platform-tab="${member.navigation.tab}"]`)?.click();
    requestAnimationFrame(() => { const target = document.querySelector(member.navigation.target); if (!target) return; if (!target.matches('input,textarea,button,select,a[href],[tabindex]')) target.setAttribute('tabindex', '-1'); target.focus({preventScroll: true}); target.scrollIntoView({behavior: effectiveMotion(runtime.motion, systemReducedMotion()) === 'full' ? 'smooth' : 'auto', block: 'center'}); });
  }

  function setGalleryPreset(value) {
    runtime.galleryPreset = value;
    if (value === 'stale') Object.keys(identities).forEach(id => runtime.gallery.set(id, 'stale'));
    else if (value === 'mixed') ['working', 'reviewing', 'handing_over', 'queued', 'resource_pressure', 'reviewing'].forEach((stateName, index) => runtime.gallery.set(Object.keys(identities)[index], stateName));
    else { runtime.galleryPreset = 'reset'; Object.keys(identities).forEach((id, index) => runtime.gallery.set(id, defaultGalleryStates[index])); }
    renderGallery();
  }

  const previousRefresh = refresh;
  refresh = async () => { await previousRefresh(); renderCharacters(); };

  document.addEventListener('DOMContentLoaded', () => {
    const galleryPanel = document.querySelector('#crew-gallery-panel'), galleryEnabled = new URLSearchParams(location.search).get('crewGallery') === '1';
    if (galleryPanel) galleryPanel.hidden = !galleryEnabled;
    if (galleryEnabled) renderGallery();
    applyPreferences();
    document.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target : null; if (!target) return;
      const nav = target.closest('[data-bot-character-nav]'); if (nav) navigate(nav.dataset.botCharacterNav);
      const focus = target.closest('[data-bot-character-focus]'); if (focus) { runtime.focusId = focus.dataset.botCharacterFocus; runtime.batonFocusId = null; renderFocus(); document.querySelector('#crew-human-explanation')?.scrollIntoView({behavior: effectiveMotion(runtime.motion, systemReducedMotion()) === 'full' ? 'smooth' : 'auto', block: 'nearest'}); }
      const baton = target.closest('[data-baton-focus]'); if (baton) { runtime.batonFocusId = baton.dataset.batonFocus; runtime.focusId = null; renderFocus(); document.querySelector('#crew-human-explanation')?.scrollIntoView({behavior: effectiveMotion(runtime.motion, systemReducedMotion()) === 'full' ? 'smooth' : 'auto', block: 'nearest'}); }
      const motion = target.closest('[data-bot-motion]'); if (motion) { runtime.motion = motion.dataset.botMotion; writePreference('agent-control-character-motion', runtime.motion); applyPreferences(); }
      const display = target.closest('[data-bot-display]'); if (display) { runtime.display = display.dataset.botDisplay; writePreference('agent-control-character-display', runtime.display); applyPreferences(); }
      const theme = target.closest('[data-gallery-theme]'); if (theme) { runtime.galleryTheme = theme.dataset.galleryTheme; applyPreferences(); }
      const preset = target.closest('[data-gallery-preset]'); if (preset) setGalleryPreset(preset.dataset.galleryPreset);
      const all = target.closest('[data-gallery-state-all]'); if (all) { runtime.galleryPreset = 'single'; Object.keys(identities).forEach(id => runtime.gallery.set(id, all.dataset.galleryStateAll)); renderGallery(); }
    });
    document.addEventListener('change', event => { const target = event.target instanceof Element ? event.target : null, select = target?.closest('[data-gallery-character]'); if (!select) return; runtime.galleryPreset = 'custom'; runtime.gallery.set(select.dataset.galleryCharacter, select.value); renderGallery(); });
    document.addEventListener('visibilitychange', () => { document.documentElement.dataset.botPageActive = document.hidden ? 'false' : 'true'; });
    document.documentElement.dataset.botPageActive = document.hidden ? 'false' : 'true';
    const streamState = document.querySelector('#stream-state');
    if (streamState && 'MutationObserver' in root) new MutationObserver(() => { if (streamState.textContent === 'RECONNECTING') runtime.suppressNextAcknowledgement = true; }).observe(streamState, {childList: true, characterData: true, subtree: true});
    const media = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null; media?.addEventListener?.('change', applyPreferences);
  });
})(typeof window === 'undefined' ? globalThis : window);
