(function activityMatrixRuntime(root) {
  'use strict';

  const selectionKey = 'agent-control-persistent-usage-selection';
  const runtime = {selection: readSelection(), indicator: null, timer: null};

  function escape(value) { return String(value ?? '').replace(/[&<>'"]/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character])); }
  function readSelection() { try { return localStorage.getItem(selectionKey) || ''; } catch { return ''; } }
  function writeSelection(value) { runtime.selection = value; try { localStorage.setItem(selectionKey, value); } catch {} }
  function number(value) { return typeof value === 'number' && Number.isFinite(value) ? Intl.NumberFormat().format(value) : 'Unavailable'; }
  function money(cost) { return typeof cost?.amount === 'number' && cost.currency ? `${cost.amount.toFixed(6)} ${cost.currency} · ${cost.authority || 'authority unavailable'}` : 'Unavailable'; }
  function age(at) { const parsed=Date.parse(at||''); if(!Number.isFinite(parsed))return'Not recorded'; const seconds=Math.max(0,Math.floor((Date.now()-parsed)/1000));return seconds<60?`${seconds}s ago`:seconds<3600?`${Math.floor(seconds/60)}m ago`:`${Math.floor(seconds/3600)}h ago`; }
  function elapsed(thread) { const recorded=Number(thread?.latest?.elapsedMs); if(!thread?.active)return Number.isFinite(recorded)?recorded:null; const since=Date.now()-Date.parse(thread.startedAt||''); return Math.max(Number.isFinite(recorded)?recorded:0,Number.isFinite(since)?since:0); }
  function duration(milliseconds) { if(typeof milliseconds!=='number'||!Number.isFinite(milliseconds))return'Unavailable'; const seconds=Math.max(0,Math.floor(milliseconds/1000));return seconds<60?`${seconds}s`:`${Math.floor(seconds/60)}m ${seconds%60}s`; }
  function routeLabel(value) { return [value?.providerId || value?.provider || 'Provider unavailable', value?.accountLabel || value?.accountProfileId || null, value?.modelId || value?.model || 'Model unavailable'].filter(Boolean).join(' / '); }
  function modelChain(parcel) { if(!parcel?.byModel?.length)return'Usage chain unavailable'; return parcel.byModel.map(item=>`${routeLabel(item)} ${number(item.totalTokens)}`).join(' → ')+` = ${number(parcel.totalTokens)} total`; }
  function latestThreads(routing) { return [...(routing?.threads||[])].sort((left,right)=>Date.parse(right.updatedAt||right.latest?.at||0)-Date.parse(left.updatedAt||left.latest?.at||0)); }

  function choices(snapshot) {
    const threads=latestThreads(snapshot?.tokenBatonRouting), lanes=snapshot?.lanes||[];
    return [
      ...threads.map(thread=>({id:`thread:${thread.id}`,label:`Thread · ${routeLabel(thread)} · ${thread.active?'active':'complete'}`})),
      ...lanes.map(lane=>({id:`lane:${lane.id}`,label:`Lane ${lane.id} · ${lane.name||lane.task||lane.status}`})),
    ];
  }

  function selectAvailable(snapshot) {
    const available=choices(snapshot), ids=new Set(available.map(item=>item.id));
    if(!ids.has(runtime.selection)) {
      const active=latestThreads(snapshot?.tokenBatonRouting).find(thread=>thread.active);
      writeSelection(active?`thread:${active.id}`:available[0]?.id||'');
    }
    return available;
  }

  function usageMetric(label,value,detail='') { return `<span class="persistent-usage-metric"><small>${escape(label)}</small><b>${escape(value)}</b>${detail?`<em>${escape(detail)}</em>`:''}</span>`; }

  function renderUsage() {
    const snapshot=typeof state==='object'?state.snapshot:null, rootNode=document.querySelector('#persistent-usage-summary'), select=document.querySelector('#persistent-usage-select');
    if(!rootNode||!select)return;
    const available=selectAvailable(snapshot);
    select.innerHTML=available.length?available.map(item=>`<option value="${escape(item.id)}" ${item.id===runtime.selection?'selected':''}>${escape(item.label)}</option>`).join(''):'<option value="">No run, thread or lane telemetry</option>';
    if(!snapshot||!runtime.selection){rootNode.innerHTML='<span class="usage-awaiting">No execution telemetry is available. Missing values are not treated as zero.</span>';return;}
    if(runtime.selection.startsWith('lane:')){
      const id=runtime.selection.slice(5),lane=(snapshot.lanes||[]).find(item=>String(item.id)===id);
      if(!lane){writeSelection('');return renderUsage();}
      rootNode.innerHTML=usageMetric('Route',lane.model||'Provider/model unavailable')+usageMetric('Operational state',String(lane.status||'UNKNOWN').toUpperCase(),lane.task||'No activity detail')+usageMetric('Context','Unavailable','Lane has no associated provider context sample')+usageMetric('Input / cached','Unavailable','No token thread linked')+usageMetric('Output / total','Unavailable','No token thread linked')+usageMetric('Cost','Unavailable','Not reported for this lane');return;
    }
    const id=runtime.selection.slice(7),routing=snapshot.tokenBatonRouting||{},thread=(routing.threads||[]).find(item=>item.id===id);
    if(!thread){writeSelection('');return renderUsage();}
    const point=thread.latest||{},context=point.context||{},cumulative=point.cumulative||{},parcel=(routing.parcels||[]).find(item=>item.parcelId===thread.parcelId),percent=typeof point.contextPercent==='number'?point.contextPercent:null;
    const contextLabel=typeof context.tokens==='number'&&typeof context.limitTokens==='number'&&percent!==null?`${number(context.tokens)} / ${number(context.limitTokens)} — ${Math.round(percent)}%`:'Unavailable';
    const contextDetail=`${context.authority||'unavailable'} · ${context.source||'provider did not report'}`;
    const current=thread.active?`ACTIVE · ${thread.governor?.state||'CONTINUE'}`:'COMPLETED';
    const next=thread.governor?.nextThreshold===null||thread.governor?.nextThreshold===undefined?'No further context threshold':`next ${thread.governor.nextThreshold}%`;
    const pressureValue=percent===null?100:Math.max(0,Math.min(100,percent));
    rootNode.innerHTML=`<progress class="persistent-context-pressure" max="100" value="${pressureValue}" data-authority="${escape(context.authority||'unavailable')}" aria-label="${escape(percent===null?'Current context usage unavailable':`Current context usage ${Math.round(percent)} percent`)}"></progress>${usageMetric('Provider / model',routeLabel(thread),thread.providerExecutionNodeId||thread.nodeId||'node unavailable')}${usageMetric('Operational state',current,thread.governor?.reason||'No activity reason')}${usageMetric('Context',contextLabel,contextDetail)}${usageMetric('Input',number(cumulative.inputTokens),`${number(cumulative.freshInputTokens)} fresh · ${number(cumulative.cachedInputTokens)} cache read · ${number(cumulative.cacheWriteTokens)} cache write`)}${usageMetric('Output / total',`${number(cumulative.outputTokens)} / ${number(cumulative.totalTokens)}`,'cumulative provider usage')}${usageMetric('Cost',money(point.cost),point.cost?.source||'provider did not report')}${usageMetric('Governor',thread.governor?.state||'CONTINUE',`${thread.governor?.currentThreshold??'no current'}% → ${next}`)}${usageMetric('Elapsed',duration(elapsed(thread)),thread.active?'running':'final') }<span class="persistent-usage-chain"><small>Work Parcel model chain</small><b>${escape(modelChain(parcel))}</b><em>Aggregate snapshot replaces prior snapshot; handoffs do not reset or double-count totals.</em></span>`;
  }

  function indicatorButton(indicator) {
    const count=indicator.count===null||indicator.count===undefined?'—':indicator.count;
    return `<button type="button" class="matrix-indicator" data-matrix-indicator="${escape(indicator.id)}" data-state="${escape(indicator.state)}" aria-pressed="${runtime.indicator===indicator.id?'true':'false'}" aria-label="${escape(`${indicator.label}: ${indicator.state}. ${indicator.explanation}`)}"><i class="matrix-lamp shape-${escape(indicator.shape)}" aria-hidden="true"></i><span><b>${escape(indicator.label)}</b><small>${escape(indicator.state)} · ${escape(count)}</small></span></button>`;
  }

  function selectedIndicator(panel) { return panel?.groups?.flatMap(group=>group.indicators||[]).find(item=>item.id===runtime.indicator); }
  function renderInspector(panel) {
    const node=document.querySelector('#activity-matrix-inspector'),indicator=selectedIndicator(panel);if(!node)return;
    if(!indicator){node.innerHTML='<strong>Select an indicator</strong><span>Use mouse or keyboard to inspect its source, event time, lane, model and stale behaviour.</span>';return;}
    node.innerHTML=`<div><span class="eyebrow">Recorded indicator evidence</span><h3>${escape(indicator.label)} · ${escape(indicator.state)}</h3><p>${escape(indicator.explanation)}</p></div><dl><div><dt>Source</dt><dd>${escape(indicator.source)}</dd></div><div><dt>Event</dt><dd>${escape(indicator.eventType)}${indicator.eventId?` #${escape(indicator.eventId)}`:''}</dd></div><div><dt>Recorded</dt><dd>${escape(indicator.at?`${new Date(indicator.at).toLocaleString()} · ${age(indicator.at)}`:'No event timestamp')}</dd></div><div><dt>Lane</dt><dd>${escape(indicator.laneId||'Not associated')}</dd></div><div><dt>Provider / model</dt><dd>${escape([indicator.provider,indicator.model].filter(Boolean).join(' / ')||'Not associated')}</dd></div><div><dt>Meaning</dt><dd>${escape(indicator.meaning)}</dd></div><div><dt>Persistence</dt><dd>${escape(indicator.persistence)}</dd></div><div><dt>Stale / disconnected</dt><dd>${escape(indicator.staleBehavior)}</dd></div></dl>`;
  }

  function renderPanel() {
    const panel=typeof state==='object'?state.snapshot?.characterCrew?.activityPanel:null,groups=document.querySelector('#activity-matrix-groups');if(!groups)return;
    if(!panel?.groups?.length){groups.innerHTML='<div class="compact-empty">No authoritative activity-panel projection is available.</div>';renderInspector(panel);return;}
    groups.innerHTML=panel.groups.map(group=>`<section class="matrix-bank" aria-label="${escape(group.label)} activity"><h3>${escape(group.label)}</h3><div>${(group.indicators||[]).map(indicatorButton).join('')}</div></section>`).join('');
    renderInspector(panel);
  }

  function renderAll(){renderUsage();renderPanel();}

  document.addEventListener('DOMContentLoaded',()=>{
    document.querySelector('#persistent-usage-select')?.addEventListener('change',event=>{writeSelection(event.target.value);renderUsage();});
    document.addEventListener('click',event=>{const target=event.target instanceof Element?event.target.closest('[data-matrix-indicator]'):null;if(!target)return;runtime.indicator=target.dataset.matrixIndicator;renderPanel();document.querySelector('#activity-matrix-inspector')?.focus?.();});
    document.addEventListener('agent-control:crew-rendered',renderAll);
    runtime.timer=setInterval(renderUsage,1000);
    renderAll();
  });
})(typeof window==='undefined'?globalThis:window);
