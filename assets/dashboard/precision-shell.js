import {hostStatus,estateSummary} from './precision-model.js';
const q=s=>document.querySelector(s),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const token=()=>typeof state!=='undefined'?state.token:'';
const authorised=()=>typeof state!=='undefined'&&state.operatorAuth==='authenticated';
const recordingOwners=new Set();
let labels={},recording=false,lastEstate=null,lastMode='LIVE',voice='Voice not checked',chat=false,loading=false,authGeneration=0;
const publicMode=()=>new URL(location.href).searchParams.get('presentation')==='public'||recording;
function label(e){return !publicMode()&&authorised()?(labels[e.id]||e.label):e.label;}
function change(){document.dispatchEvent(new CustomEvent('precision:presentation'));if(lastEstate)updateEstate(lastEstate,lastMode);}
async function load(){if(loading||!authorised())return;loading=true;const generation=authGeneration,currentToken=token(),headers={Authorization:`Bearer ${currentToken}`};
 try{const [names,chief,audio]=await Promise.allSettled([publicMode()?Promise.resolve(null):fetch('/api/estate/labels',{headers}).then(async r=>r.ok?r.json():null),fetch('/api/poe',{headers}).then(r=>r.ok),fetch('/api/voice/availability',{headers}).then(async r=>r.ok?r.json():null)]);
  if(!authorised()||generation!==authGeneration||currentToken!==token())return;labels=names.status==='fulfilled'?names.value?.labels??{}:{};chat=chief.status==='fulfilled'&&chief.value;
  const v=audio.status==='fulfilled'?audio.value:null;voice=v?.state==='AVAILABLE'?'Voice available':v?.state==='CONFIGURED_NOT_QUALIFIED'?'Voice configured · not qualified':'Voice unavailable';
  document.querySelectorAll('.precision-chat').forEach(b=>{b.disabled=!chat;b.textContent=chat?'Open text chat':'Text chat unavailable';});change();
 }finally{loading=false;}}
function openDialog(id){const d=q('#'+id);if(d&&!d.open)d.showModal();}
function badge(text,limited=false){return el('span',text,limited?'precision-badge limited':'precision-badge');}
function updateEstate(p,mode){lastEstate=p;lastMode=mode;const s=estateSummary(p,mode),summary=q('#precision-estate-summary');if(!summary)return;
 summary.replaceChildren(el('strong',`${s.responded} hosts found${mode==='REPLAY'?' at capture':''}`),el('span',`${s.matched} matched OS / firmware identities`),el('span',`${s.limited} installation ${s.limited===1?'identity':'identities'}`));if(s.unavailable)summary.append(el('span',`${s.unavailable} unavailable / retained`));
 const stamp=p.observedAt?new Date(p.observedAt).toLocaleString('en-GB',{timeZone:'UTC',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false})+' UTC':'No observation';
 q('#precision-estate-mode').textContent=`${mode}${s.stale?' · STALE':''} · ${stamp}`;
 q('#precision-estate-mode').dataset.mode=mode;
 q('#precision-estate-discovery').textContent=`Discovery: ${s.status==='COMPLETED'?'Complete':s.status.toLowerCase().replaceAll('_',' ')}`;
 q('#precision-estate-discovery').classList.toggle('limited',s.status==='PARTIAL'||s.stale>0);
 q('#precision-estate-time-note').textContent=mode==='REPLAY'?'Reachability at capture · no probes rerun':mode==='PAUSED'?'Display frozen · execution continues':s.stale?'Retained observations · current reachability unknown':'Current observations · unknown is not zero';
 q('#precision-privacy').textContent=publicMode()?'Privacy-safe aliases':'Operator names';
 const host=p.entities.find(e=>e.kind==='host'&&hostStatus(e,mode).limited),brief=q('#estate-chief-copy');
 brief.textContent=s.hosts===0?'No host observations in this frame. Choose a scope or open recorded evidence.':`${s.responded} hosts found in this observation. ${s.unavailable?`${s.unavailable} unavailable or retained in evidence. `:''}${host?`${label(host)} has installation identity only; physical identity is unverified.`:'Inspect a host to review its status.'}`;
 q('#estate-chief-basis').textContent=mode==='LIVE'?'Deterministic summary · observed data':'Deterministic summary · recorded data';
 q('#estate-chief-voice').textContent=voice;q('#precision-activity-note').textContent=`${p.entities.length} entities · ${p.relations.length} relationships · source-linked evidence`;
 const names=q('#estate-host');if(names)for(const option of names.options){const e=p.entities.find(e=>e.id===option.value);if(e)option.textContent=label(e);}
 const selected=window.AgentControlEstate?.state().selected;if(selected)window.AgentControlEstate.select(selected);
}
function inspectEstate(entity,relationship,p,hardware,mode,onSelect){const box=q('#estate-inspector'),v=entity?.detail??relationship;
 if(!v){box.replaceChildren(el('h2','Select a host'),el('p','Choose a machine on the map, or open Inventory for every evidenced object.'));return;}
 box.replaceChildren(el('span',entity?.kind.toUpperCase()??'RELATIONSHIP','precision-eyebrow'),el('h2',entity?label(entity):relationship.kind));
 if(entity?.kind==='host'){
  const s=hostStatus(entity,mode),a=v.attributes??{};box.append(el('p',`${s.platform}${a.osVersion?' · '+a.osVersion:''}`,'precision-subtitle'));
  const states=el('dl',undefined,'precision-status-rows');for(const[k,value]of [['Reachability',s.reach+(mode==='REPLAY'?' at capture':'')],['Identity',s.identity]])states.append(el('dt',k),el('dd',value));box.append(states);
  if(s.limited)box.append(el('p','! Physical hardware identity unverified','precision-warning'));
  if(s.stale)box.append(el('p','! Retained observation. Current reachability is unknown.','precision-warning'));
  const section=el('section',undefined,'precision-hardware');section.append(el('h3','Hardware details'));
  for(const row of hardware(p,entity.id)){const line=el(row.entityId?'button':'div',undefined,'precision-hardware-row');line.append(el('span',row.label),el('strong',row.value));if(row.entityId){line.type='button';line.onclick=()=>onSelect(row.entityId);}if(row.state==='STALE')line.append(el('small','Stale observation'));section.append(line);}box.append(section);
  const time=el('p',undefined,'precision-observed');time.append(el('span','Observed '),el('time',v.lastSeen?new Date(v.lastSeen).toLocaleString('en-GB',{timeZone:'UTC',hour12:false})+' UTC':'Unavailable'));box.append(time);
 }
 const actions=el('div',undefined,'precision-inspector-actions'),proof=el('button','View evidence'),identity=el('button','Identity details');proof.type=identity.type='button';proof.onclick=()=>{openDialog('estate-evidence-dialog');q('#precision-selected-evidence').focus();};identity.onclick=()=>{openDialog('estate-evidence-dialog');q('#precision-selected-evidence').focus();};actions.append(proof,identity);box.append(actions);
 box.append(el('p',`Canonical state: ${entity?.state??relationship.state}`,'precision-canonical'));
 const target=q('#precision-selected-evidence');target.replaceChildren(el('h3',entity?label(entity):relationship.kind),el('p',`${entity?.state??relationship.state} · ${entity?.id??relationship.id}`));
 const attrs=el('details'),as=el('summary','Identity, timestamps and attributes');attrs.append(as,el('pre',JSON.stringify({firstSeen:v.firstSeen,lastSeen:v.lastSeen,lastSuccessfulDiscovery:v.lastSuccessfulDiscovery,attributes:v.attributes,capabilities:v.capabilities,basis:v.basis},null,2)));target.append(attrs);
 for(const evidence of v.howDoWeKnow??v.evidence??[]){const d=el('details');d.append(el('summary',`${evidence.type} · ${evidence.result}`),el('pre',JSON.stringify(evidence,null,2)));target.append(d);}
 const b=el('button','Open native Job evidence');b.type='button';b.onclick=()=>{q('#estate-evidence-dialog').close();window.AgentControlObservability?.openRun(entity?.runId??p.estate?.runId??p.entities[0]?.runId);};target.append(b);
}
function updateFactory(p,mode){const n=q('#factory-chief-copy');if(n){const jobs=p.entities.filter(e=>e.kind==='job');n.textContent=`${jobs.length} recorded ${jobs.length===1?'job':'jobs'} in this frame. Select a job to inspect execution, verification and evidence.`;q('#factory-chief-basis').textContent=`Deterministic summary · ${mode==='REPLAY'?'recorded':'observed'} data`;q('#factory-chief-voice').textContent=voice;}const metrics=q('#factory-inspector > .factory-metrics');if(metrics){const details=el('details');details.append(el('summary','Accounting observations'));metrics.replaceWith(details);details.append(metrics);}}
function chief(domain){const card=el('section',undefined,'precision-chief');card.setAttribute('aria-label','Mallow, Chief briefing');const portrait=el('div',undefined,'precision-chief-portrait'),source=q('#poe-character svg');if(source){const svg=source.cloneNode(true);const prefix=`${domain}-chief-`;for(const n of svg.querySelectorAll('[id]'))n.id=prefix+n.id;for(const n of svg.querySelectorAll('*'))for(const a of [...n.attributes])if(a.value.includes('url(#'))n.setAttribute(a.name,a.value.replaceAll('url(#',`url(#${prefix}`));portrait.append(svg);}const content=el('div');content.append(el('h2','Mallow · Chief'),Object.assign(el('small','Deterministic summary'),{id:`${domain}-chief-basis`}),Object.assign(el('p','Select a host or job to review its evidence.'),{id:`${domain}-chief-copy`}));const actions=el('div',undefined,'precision-chief-actions');const explain=el('button','Explain'),chatButton=el('button','Text chat unavailable','precision-chat');chatButton.disabled=true;explain.type=chatButton.type='button';explain.onclick=()=>openDialog(domain==='estate'?'estate-evidence-dialog':'factory-evidence-dialog');chatButton.onclick=()=>q('#poe-launcher').click();actions.append(Object.assign(el('span',voice,'precision-voice'),{id:`${domain}-chief-voice`}),explain,chatButton);content.append(actions);card.append(portrait,content);return card;}
function init(){
 for(const domain of ['estate','factory'])q(`#${domain}-chief-slot`)?.append(chief(domain));
 document.querySelectorAll('[data-precision-open]').forEach(b=>b.onclick=()=>openDialog(b.dataset.precisionOpen));document.querySelectorAll('[data-precision-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
 for(const domain of ['estate','factory']){q(`#${domain}-fit`)?.addEventListener('click',()=>{const c=q(`#${domain}-camera`);c.value=domain==='estate'?'ESTATE OVERVIEW':'OVERVIEW';c.dispatchEvent(new Event('change'));});q(`#${domain}-focus`)?.addEventListener('click',()=>{const c=q(`#${domain}-camera`);c.value='FOCUS SELECTED';c.dispatchEvent(new Event('change'));});}
 q('#precision-relationships').onchange=e=>{window.AgentControlPrecision.relationships=e.target.checked;change();};q('#precision-retained').onchange=e=>{window.AgentControlPrecision.includeRetained=e.target.checked;change();};
 document.addEventListener('agent-control:authentication-changed',()=>{authGeneration++;loading=false;labels={};if(!authorised()){lastEstate=null;chat=false;voice='Voice unavailable';q('#precision-selected-evidence').replaceChildren();q('#precision-estate-summary').textContent='Authentication required';q('#estate-chief-copy').textContent='Authenticate to view estate observations.';q('#estate-host').replaceChildren(new Option('All hosts',''));document.querySelectorAll('.precision-chat').forEach(b=>{b.disabled=true;b.textContent='Text chat unavailable';});document.dispatchEvent(new CustomEvent('precision:presentation'));}else load();});load();
 document.querySelectorAll('[data-view="estate"],[data-view="factory"]').forEach(b=>b.addEventListener('click',()=>{if(!Object.keys(labels).length)load();}));
}
async function waitForPrivatePaint(canvas){const deadline=performance.now()+2000;while(canvas.isConnected&&canvas.dataset.privacySafe!=='true'){if(performance.now()>deadline)throw Error('Privacy-safe frame not available');await new Promise(requestAnimationFrame);}if(!canvas.isConnected)throw Error('Renderer changed before capture');}
window.AgentControlPrecision={waitForPrivatePaint,label,relationships:true,includeRetained:false,updateEstate,inspectEstate,updateFactory,setRecording(value,owner='default'){if(value)recordingOwners.add(owner);else recordingOwners.delete(owner);recording=recordingOwners.size>0;change();},get publicMode(){return publicMode();}};
document.addEventListener('DOMContentLoaded',init);
