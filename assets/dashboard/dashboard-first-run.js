(() => {
  const byId=id=>document.getElementById(id);
  const preference='agent-control-introduction-dismissed-v1';
  let loading=false;
  const go=view=>document.querySelector(`[data-view="${view}"]`)?.click();
  function dismissed(){try{return localStorage.getItem(preference)==='yes';}catch{return false;}}
  function setDismissed(value){try{localStorage.setItem(preference,value?'yes':'no');}catch{}renderIntro();}
  function renderIntro(){byId('home-welcome').hidden=dismissed();}
  async function get(url){const response=await fetch(url,{headers:{Authorization:`Bearer ${state.token}`}});if(!response.ok)throw Error('Current observations unavailable');return response.json();}
  function card(label,value,detail){const node=document.createElement('article');const title=document.createElement('span'),count=document.createElement('strong'),description=document.createElement('small');title.textContent=label;count.textContent=value;description.textContent=detail;node.append(title,count,description);return node;}
  async function activate(){
    if(loading)return;loading=true;renderIntro();
    try{
      const authenticated=state.operatorAuth==='authenticated';
      byId('home-discover').textContent=authenticated?'Discover my environment':'Authenticate to start discovery';
      byId('home-status').textContent=state.snapshot?`Agent Control is ${state.snapshot.health}. ${authenticated?'Your operator session is authenticated.':'Authenticate with your installation token to discover this computer.'}`:'Connecting to Agent Control…';
      if(!authenticated){byId('home-next').textContent='Start here: authenticate, then discover this computer.';return;}
      const [discovery,heartbeat,watches,parcels]=await Promise.all([get('/api/environment-discovery'),get('/api/estate-heartbeat'),get('/api/model-watches'),get('/api/parcels')]);
      const scan=discovery.latest,counts=heartbeat.counts??{},host=byId('home-metrics');host.replaceChildren();
      for(const [label,key]of [['Machines','devices'],['Agents','agents'],['Runtimes','runtimes'],['Models','models']]){const c=counts[key];host.append(card(label,scan?`${c?.alive??0} / ${c?.total??0}`:'—',scan?'alive / discovered':'Run discovery to establish availability'));}
      byId('home-next').textContent=discovery.progress?.state==='RUNNING'?'Discovery is running. Follow each check in Environment Discovery.':scan?`Discovery ${scan.status.toLowerCase()}. Open Estate to inspect current availability and qualification gaps.`:'No discovery has run yet. Start with this computer; remote machines are optional.';
      byId('home-estate-status').textContent=scan?`Last scan: ${new Date(scan.completedAt).toLocaleString()}. Discovered does not mean ready to run every job.`:'No discovered estate yet.';
      const list=Array.isArray(parcels)?parcels:parcels.parcels??[];const active=list.filter(p=>!p.endedAt&&!['SUCCEEDED','FAILED','CANCELLED'].includes(p.status));byId('home-work').textContent=active.length?`${active.length} active Work Parcels. Open Jobs or Process Map to follow execution.`:'No active Work Parcels are recorded.';
      const brief=watches.briefs.at(-1);byId('home-brief').textContent=brief?`${brief.changesDetected} changes · ${brief.relevantCandidates} relevant · ${brief.benchmarked} benchmarked. ${brief.recommendation}`:'No recorded model watch yet. Choose a workload and sources to prepare your first watch.';
      byId('home-warnings').textContent=scan?`${counts.warnings??0} estate warnings. Check authentication, stale observations and qualification in Estate.`:'Availability is not established until discovery runs.';
      byId('home-benchmark').textContent=watches.results.length?`${watches.results.length} recorded results. Compare evidence in Personal League.`:'No target-model benchmark results recorded. A proposed benchmark requires its own approval.';
    }catch(error){byId('home-status').textContent=error.message;}finally{loading=false;}
  }
  document.addEventListener('DOMContentLoaded',()=>{
    const publicMode=new URL(location.href).searchParams.get('presentation')==='public';byId('presentation-toggle').setAttribute('aria-pressed',String(publicMode));byId('presentation-toggle').textContent=publicMode?'Public Estate view on':'Public Estate view';byId('presentation-toggle').onclick=()=>{const url=new URL(location.href);if(publicMode)url.searchParams.delete('presentation');else url.searchParams.set('presentation','public');location.href=url.toString();};
    const nav=document.querySelector('.primary-nav'),advanced=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Advanced';advanced.className='navigation-advanced';advanced.append(summary);
    const primary=new Set(['estate','factory','work-board','usage','home','runtime-map','jobs','models','model-watches','crew','poe','environment']);
    for(const button of [...nav.querySelectorAll('[data-view]')])if(!primary.has(button.dataset.view))advanced.append(button);nav.append(advanced);
    byId('home-discover').onclick=()=>{if(state.operatorAuth!=='authenticated'){openOperator();return;}go('environment');byId('environment-scan-form').scrollIntoView({block:'start'});};
    byId('home-estate').onclick=()=>window.AgentControlRuntimeMap.openEstate();
    byId('home-help').onclick=()=>document.dispatchEvent(new Event('poe:open'));
    byId('home-dismiss').onclick=()=>setDismissed(true);byId('home-restart-guide').onclick=()=>setDismissed(false);
    document.querySelectorAll('[data-home-view]').forEach(button=>button.onclick=()=>go(button.dataset.homeView));
    byId('home-refresh').onclick=activate;
    if(!new URL(location.href).search)go('home');
    setInterval(()=>{if(!document.hidden&&!byId('home-workspace').hidden)activate();},5000);
  });
  window.AgentControlFirstRun={activate};
})();
