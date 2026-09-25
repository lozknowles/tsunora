'use strict';
const el=id=>document.getElementById(id);
let token=sessionStorage.getItem('agent-control-operator-token')||'', current;
async function api(action='',body){
  const response=await fetch(`/api/integrations/openwa${action}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const value=await response.json();if(!response.ok)throw new Error(response.status===401?'Authenticate with this pilot’s dashboard operator token.':'This action is unavailable. Check the connection, challenge expiry and selected permissions.');return value;
}
function notice(error){el('notice').textContent=error.message||String(error);}
function button(parent,label,fn){const node=document.createElement('button');node.className='button secondary';node.textContent=label;node.onclick=()=>Promise.resolve(fn()).then(refresh).catch(notice);parent.append(node);}
function text(parent,value,tag='p'){const node=document.createElement(tag);node.textContent=value;parent.append(node);return node;}
const label=value=>String(value||'unavailable').replaceAll('_',' ');
function runLink(parent,id,number){if(!id)return text(parent,'—','span');const a=document.createElement('a');a.href=`/?messagingRun=${encodeURIComponent(id)}`;a.textContent=number?`Job ${number}`:id;a.title=id;parent.append(a);}
function table(parent,headings,rows,render){parent.replaceChildren();if(!rows.length){text(parent,'None recorded yet.');return;}const wrap=document.createElement('div');wrap.className='table-scroll';const t=document.createElement('table'),header=document.createElement('tr');headings.forEach(h=>text(header,h,'th'));const thead=document.createElement('thead');thead.append(header);t.append(thead);const body=document.createElement('tbody');rows.forEach(row=>{const tr=document.createElement('tr');render(tr,row);body.append(tr);});t.append(body);wrap.append(t);parent.append(wrap);}
async function refresh(){
  current=await api();el('controls').hidden=false;el('notice').textContent=current.state==='not_configured'?'Adapter not configured on this controller.':'Authenticated. Account, pairing and delivery details are private.';
  const health=current.health||{};
  el('connection').textContent=`${current.enabled?'Enabled':'Disabled'} · ${label(health.state)}${current.accountLabel?` · ${current.accountLabel}`:''}. Linked number: ${health.phone||'not linked'}. Last checked: ${health.checkedAt?new Date(health.checkedAt).toLocaleString():'not yet checked'}.`;
  el('enabled').textContent=current.enabled?'Disable integration':'Enable integration';
  for(const id of ['enabled','health','qr','reconnect'])el(id).disabled=current.state==='not_configured';
  el('pair').disabled=!current.enabled||health.state!=='connected_verified';
  el('templates').replaceChildren();
  for(const t of current.templates||[]){const card=document.createElement('div');card.className='template-card';text(card,t.name,'strong');text(card,`Up to ${t.maxActive} active job(s), ${t.maxRunsPerHour} starts per hour.`);for(const [name,values] of Object.entries(t.arguments))text(card,`${name}: ${values.join(', ')}`);el('templates').append(card);}
  if(!current.templates?.length)text(el('templates'),'No templates approved. Configure a bounded job before granting access.');
  el('operators').replaceChildren();
  for(const op of current.operators||[]){text(el('operators'),`${op.sender} · ${op.active?'enrolled':'revoked'} · allowed templates: ${JSON.parse(op.grants).join(', ')||'none'}`);if(op.active){button(el('operators'),'Revoke operator',()=>api('/revoke',{sender:op.sender}));button(el('operators'),op.progress?'Disable routine milestones':'Enable routine milestones',()=>api('/preferences',{sender:op.sender,progress:!op.progress}));}}
  if(!current.operators?.some(op=>op.active))text(el('operators'),'No human operator enrolled.');
  el('pairings').replaceChildren();
  for(const p of current.pairing||[]){text(el('pairings'),p.sender?`Observed sender: ${p.sender}. Confirm this is your separate human account.`:'Waiting for the challenge from WhatsApp.');if(p.sender){const choices=document.createElement('div');for(const t of current.templates||[]){const item=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=t.name;item.append(input,document.createTextNode(t.name));choices.append(item);}el('pairings').append(choices);button(el('pairings'),'Confirm sender and selected permissions',()=>api('/confirm',{hash:p.hash,grants:[...choices.querySelectorAll('input:checked')].map(input=>input.value)}));}}
  table(el('commands'),['When','Sender','Command','Outcome','Job'],current.commands||[],(tr,c)=>{text(tr,new Date(c.at).toLocaleString(),'td');text(tr,c.sender,'td');text(tr,c.verb,'td');text(tr,`${label(c.state)}${c.code?` · ${label(c.code)}`:''}`,'td');runLink(text(tr,'','td'),c.runId,c.jobNumber);});
  table(el('deliveries'),['Message','Job','State','Attempts','Recovery'],current.deliveries||[],(tr,d)=>{text(tr,`#${d.id} ${d.kind}`,'td');runLink(text(tr,'','td'),d.runId,d.jobNumber);text(tr,`${label(d.state)}${d.state==='submitted'?' (delivery unconfirmed)':''}`,'td');text(tr,String(d.attempts),'td');const cell=text(tr,'','td');if(['uncertain','failed'].includes(d.state))button(cell,'Retry message',()=>{if(d.state==='uncertain'&&!confirm('This message may already have arrived. Retry and accept possible duplicate delivery?'))return;return api('/retry',{id:d.id,acknowledgeUncertain:d.state==='uncertain'});});else text(cell,label(d.code),'span');});
}
el('auth').onsubmit=event=>{event.preventDefault();token=el('token').value;el('token').value='';refresh().then(()=>sessionStorage.setItem('agent-control-operator-token',token)).catch(notice);};
el('enabled').onclick=()=>api('/enabled',{enabled:!current.enabled}).then(refresh).catch(notice);
el('health').onclick=()=>api('/health',{}).then(refresh).catch(notice);
el('reconnect').onclick=()=>{notice('Connecting the private session…');api('/reconnect',{}).then(refresh).catch(notice);};
el('pair').onclick=()=>api('/pair',{}).then(p=>{el('challenge').textContent=p.command;setTimeout(()=>el('challenge').textContent='',Math.max(0,p.expires-Date.now()));return refresh();}).catch(notice);
el('qr').onclick=()=>api('/qr',{}).then(q=>{el('qr-output').replaceChildren();const value=q.qrCode||q.qr;if(typeof value==='string'&&/^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(value)){const img=document.createElement('img');img.src=value;img.alt='Private WhatsApp linking QR';el('qr-output').append(img);setTimeout(()=>el('qr-output').replaceChildren(),30000);}else notice('QR not ready. Start or reconnect the session, then try again.');}).catch(notice);
document.addEventListener('visibilitychange',()=>{if(document.hidden){el('qr-output').replaceChildren();el('challenge').textContent='';}});
if(token)refresh().catch(notice);setInterval(()=>{if(current)refresh().catch(notice);},10000);
