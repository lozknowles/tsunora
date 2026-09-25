(()=>{
  const q=selector=>document.querySelector(selector), safe=value=>esc(value??'');
  const poeView={projection:null,conversation:null,reference:null,operator:null,recorder:null,playback:null,audio:null,audioContext:null,voiceEnabled:false,holding:false,busy:false,epoch:0,loading:null,localState:null};
  const key='agent-control-poe-dashboard-conversation';
  const announced=new Set(),speechQueue=[];let operatorSeen=false,initialLoad=true;
  async function announceNext(){if(tourIndex>=0||poeView.busy||poeView.playback||!poeView.voiceEnabled||poeView.holding)return;const turn=speechQueue.shift();if(turn)await speak(turn);}
  function queueAnnouncement(turn){if(!turn||announced.has(turn.id))return;announced.add(turn.id);speechQueue.push(turn);announceNext().catch(fail);}
  function objectLink(ref){const id=encodeURIComponent(ref.id);return ref.kind==='parcel'?`/?poeView=jobs&parcel=${id}`:ref.kind==='run'?`/?poeView=jobs&messagingRun=${id}`:ref.kind==='job'?`/?poeView=jobs&job=${id}`:ref.kind==='system'?`/?poeView=systems&system=${id}`:ref.kind==='model'?`/?poeView=models&model=${id}`:ref.kind==='lane'?`/?poeView=lanes&lane=${id}`:ref.kind==='crew-member'?'/?poeView=crew':null;}
  async function request(url,options={}) {
    if(state.operatorAuth!=='authenticated'){openOperator();throw new Error('Authenticate the dashboard to talk to Mallow.')}
    const response=await fetch(url,{...options,headers:{Authorization:`Bearer ${state.token}`,...options.headers}});
    if(response.status===401){liveVoice?.localClose();stopLocal();poeView.conversation=null;sessionStorage.removeItem(key);authenticationExpired();throw new Error('Operator authentication required.')}
    const value=await response.json();if(!response.ok)throw new Error(value.error||`HTTP ${response.status}`);return value;
  }
  const post=(url,body)=>request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  let liveVoice,voiceAvailability;
  function paintLiveVoice(){
    if(!liveVoice)return;const active=liveVoice.active;
    q('#mallow-talk').textContent=active?'Voice active':poeView.holding?'Send recording':'Talk to Mallow';q('#mallow-talk').disabled=active;
    for(const id of ['mallow-end-voice','mallow-mute','mallow-silence','mallow-resume-speaker'])q('#'+id).hidden=!active;
    q('#mallow-mute').textContent=liveVoice.muted?'Unmute microphone':'Mute microphone';
    q('#poe-speak').disabled=active||!poeView.projection?.voice?.recognition;
    const r=liveVoice.lastRecord;q('#mallow-voice-history').hidden=!r;
    q('#mallow-voice-cost').textContent=r?`${r.transport} / ${r.model} · ${r.seconds??'Unknown'} seconds · voice cost ${r.estimatedVoiceCostUsd===null?'unknown':'~$'+r.estimatedVoiceCostUsd.toFixed(4)+' USD (calculated)'} · ${r.finalUsage?'final duration':'duration not final'}. Worker tokens and cost are shown separately in job Usage.`:voiceAvailability?.state==='CONFIGURED_NOT_QUALIFIED'?'Live voice configured. Duration charges apply while connected; End voice stops the session.':'Live voice unavailable. Configured recorded speech or text remains available.';
  }
  const endpoint=suffix=>`/api/poe/conversations/${encodeURIComponent(poeView.conversation.id)}/${suffix}`;
  let micMonitor=null;
  function paintMicrophoneFeedback(){
    const panel=q('#mallow-microphone-feedback');if(!panel)return;
    const listening=poeView.recorder?.state==='recording',processing=poeView.localState==='TRANSCRIBING';
    panel.hidden=!listening&&!processing;panel.dataset.mode=processing?'processing':'listening';
    q('#mallow-mic-label').textContent=processing?'Processing your speech':'Listening';
    q('#mallow-mic-hint').textContent=processing?'Microphone off · preparing your reply':micMonitor?'Live microphone level · tap Send recording when finished':'Microphone active';
    if(!listening){panel.classList.remove('is-hearing');q('#mallow-mic-level').value=0;}
  }
  function stopMicrophoneFeedback(){
    if(micMonitor){cancelAnimationFrame(micMonitor.frame);micMonitor.source.disconnect();micMonitor.analyser.disconnect();micMonitor=null;}
    const panel=q('#mallow-microphone-feedback');panel?.classList.remove('is-hearing');panel?.querySelectorAll('i').forEach(bar=>bar.style.setProperty('--mic-height','0.12'));
  }
  function startMicrophoneFeedback(stream){
    stopMicrophoneFeedback();
    try{
      const context=poeView.audioContext;if(!context)return;
      const source=context.createMediaStreamSource(stream),analyser=context.createAnalyser();analyser.fftSize=256;analyser.smoothingTimeConstant=.65;source.connect(analyser);
      const monitor={source,analyser,frame:0};micMonitor=monitor;const bins=new Uint8Array(analyser.frequencyBinCount),samples=new Uint8Array(analyser.fftSize),panel=q('#mallow-microphone-feedback'),bars=[...panel.querySelectorAll('i')];
      const sample=()=>{if(micMonitor!==monitor)return;if(poeView.recorder?.state!=='recording'){stopMicrophoneFeedback();paintMicrophoneFeedback();return;}
        analyser.getByteFrequencyData(bins);analyser.getByteTimeDomainData(samples);const rms=Math.sqrt(samples.reduce((n,v)=>n+((v-128)/128)**2,0)/samples.length),level=Math.min(100,Math.round(rms*400));
        q('#mallow-mic-level').value=level;panel.classList.toggle('is-hearing',rms>.012);
        bars.forEach((bar,i)=>{const begin=1+i*4,value=bins.slice(begin,begin+4).reduce((a,b)=>a+b,0)/(4*255);bar.style.setProperty('--mic-height',String(Math.max(.12,value)));});
        monitor.frame=requestAnimationFrame(sample);
      };monitor.frame=requestAnimationFrame(sample);
    }catch{stopMicrophoneFeedback();}
  }
  function setLocal(value,message){poeView.localState=value;if(message)q('#poe-audio-message').textContent=message;paintState()}
  function displayState(){if(liveVoice?.active)return liveVoice.ready?(liveVoice.muted?'MICROPHONE MUTED':'LISTENING'):'CONNECTING';const value=poeView.localState||poeView.conversation?.state||'IDLE';return value==='LISTENING'&&!poeView.holding?'READY':value;}
  function paintState(){paintMicrophoneFeedback();const name=displayState();q('#poe-character').dataset.state=name;q('#poe-character').dataset.focus=tourIndex>=0?'tour-left':poeView.reference?.kind||poeView.conversation?.lastReference?.kind||'conversation';q('#poe-state').textContent=name.replaceAll('_',' ');q('#poe-interrupt').disabled=!poeView.playback&&!poeView.busy;q('#poe-speak').disabled=!poeView.projection?.voice?.recognition;q('#poe-form button[type="submit"]').disabled=poeView.busy;paintTour();paintPet();paintLiveVoice();}
  async function load(){
    if(poeView.switching)return;
    if(poeView.loading)return poeView.loading;
    poeView.loading=(async()=>{
      if(state.operatorAuth!=='authenticated'){q('#poe-turns').textContent='Authenticate this dashboard tab before starting a conversation.';paintState();return}
      poeView.projection=await request('/api/poe');
      try{voiceAvailability=await liveVoice?.availability();}catch{voiceAvailability=null;}paintLiveVoice();
      let id=poeView.conversation?.id||sessionStorage.getItem(key);
      if(id){const own=poeView.projection.conversations.find(item=>item.id===id&&item.channel==='dashboard'&&item.actorId==='web-operator');if(!own)id=null;}
      poeView.conversation=id?await request(`/api/poe/conversations/${encodeURIComponent(id)}`):await post('/api/poe/conversations',{channel:'dashboard'});
      if(!poeView.conversation.turns.some(turn=>turn.purpose==='GREETING')){const greeting=await post(endpoint('greeting'),{});poeView.conversation=greeting.conversation;}
      sessionStorage.setItem(key,poeView.conversation.id);if(liveVoice&&!liveVoice.active){try{const sessions=await request('/api/voice/sessions?conversationId='+encodeURIComponent(poeView.conversation.id));liveVoice.lastRecord=sessions.at(-1)??null;}catch{}}render();
      poeView.operator=await request(endpoint('operator'));
      poeView.conversation=await request(`/api/poe/conversations/${encodeURIComponent(poeView.conversation.id)}`);
      render();
      for(const turn of poeView.conversation.turns.filter(turn=>['RESULT','HANDOVER'].includes(turn.purpose))){if(initialLoad)announced.add(turn.id);else queueAnnouncement(turn);}
      initialLoad=false;
    })();try{return await poeView.loading}finally{poeView.loading=null}
  }
  function render(){
    const p=poeView.projection,c=poeView.conversation;if(!p||!c)return;
    paintState();q('#poe-conversation-title').textContent='Your dashboard conversation';
    const conversationTag=document.createElement('span');conversationTag.className='job-identity-badge';conversationTag.textContent=`Conversation ${c.id}`;conversationTag.title='Conversation identity; governed background Jobs have separate Run identities';window.AgentControlIdentity.apply(conversationTag,window.AgentControlIdentity.conversation(c.id));q('#poe-conversation-title').append(' ',conversationTag);
    const route=p.reasoning?.route;q('#poe-reasoning-route').textContent=route?`Reasoning: ${route.providerId} / ${route.accountProfileId||'default'} / ${route.providerModel||route.modelId} (${route.modelId}) @ ${route.nodeId}`:`Reasoning: ${p.reasoning?.state||'unavailable'}`;
    q('#poe-turns').innerHTML=c.turns.length?c.turns.map(turn=>{
      const route=turn.route?`${turn.route.providerId} / ${turn.route.providerModel||turn.route.modelId} (${turn.route.modelId}) @ ${turn.route.nodeId}`:turn.responseMode==='DETERMINISTIC'?'Grounded registry renderer; no model invocation':'';
      const refs=(turn.references||[]).map(ref=>`${objectLink(ref)?`<a class="text-button" href="${safe(objectLink(ref))}">Open ${safe(ref.kind)}</a>`:''}<button type="button" class="text-button" data-poe-focus-kind="${safe(ref.kind)}" data-poe-focus-id="${safe(ref.id)}">${safe(ref.label||`${ref.kind}: ${ref.id}`)}</button>`).join(' ');
      const facts=(turn.evidence||[]).map(fact=>`<li><strong>${safe(fact.label)}</strong><p>${safe(fact.value??'Unavailable')}</p><small>${safe(fact.informationKind||fact.authority)} · ${safe(fact.observedAt||'observation time unavailable')} · ${fact.evidence.map(source=>source.startsWith('/api/poe/knowledge/sources/')?`<button type="button" class="text-button" data-poe-source="${safe(source)}">View source</button>`:safe(source)).join(', ')}</small></li>`).join('');
      return `<li class="poe-turn ${safe(turn.actor)}"><header><b>${turn.actor==='poe'?'Mallow':'You'}${turn.modality==='voice'?' · voice transcription':''}</b><time>${safe(new Date(turn.at).toLocaleTimeString())}</time></header><div>${safe(turn.text)}</div>${refs?`<nav aria-label="Related evidence">${refs}</nav>`:''}${facts?`<details><summary>Sources and observations (${turn.evidence.length})</summary><ul>${facts}</ul></details>`:''}<footer>${safe(route)}${turn.usage?` · Tokens: ${safe(turn.usage.inputTokens??'unavailable')} in / ${safe(turn.usage.outputTokens??'unavailable')} out / ${safe(turn.usage.totalTokens??'unavailable')} total · Cost: ${safe(turn.usage.cost??'unavailable')} ${safe(turn.usage.currency??'')}`:''} · ${safe(turn.channel)} · ${safe(turn.contentTrust)}${turn.recognitionMetrics?` · Transcription: ${safe(turn.recognitionMetrics.provider)} / ${safe(turn.recognitionMetrics.model)} · ${safe(turn.recognitionMetrics.audioSeconds)}s audio · cost unknown`:''}${turn.synthesisMetrics?` · Speech: ${safe(turn.synthesisMetrics.provider)} / ${safe(turn.synthesisMetrics.model)} · ${safe(turn.synthesisMetrics.audioSeconds)}s audio · cost unknown`:''}</footer></li>`;
    }).join(''):'<li class="poe-turn poe">Welcome. Ask about jobs, schedules, system readiness or how Agent Control works. I’ll check the records with you.</li>';
    q('#poe-turns').scrollTop=q('#poe-turns').scrollHeight;
    q('#poe-reference').hidden=!poeView.reference;
    if(poeView.reference)q('#poe-reference').innerHTML=`In context: ${safe(poeView.reference.kind)} · ${safe(poeView.reference.id)} <button id="poe-clear-reference" type="button">Clear</button>`;
    const proposals=p.proposals.filter(item=>item.conversationId===c.id);
    q('#poe-proposal-count').textContent=proposals.length;q('#poe-proposals').innerHTML=proposals.map(renderProposal).join('');bindProposalButtons();
    renderOperator();
  }
  function renderOperator(){
    const operator=poeView.operator;if(!operator){q('#poe-job-proposals').textContent='Operator catalogue unavailable.';return}
    q('#poe-batch-summary').textContent=operator.batch?.requested?operator.batch.text:'No job requested in this conversation.';
    q('#poe-handover-list').innerHTML=(operator.handovers||[]).map(h=>`<article class="poe-handover"><span class="sealed-baton">◇ Sealed baton</span><p>${safe(h.text)}</p><small>${safe(h.batonId)} · ${safe(h.sha256)}<br>${safe(h.source)} → ${safe(h.destination)} · ${safe(h.verification)}</small></article>`).join('');
    q('#poe-job-proposals').innerHTML=operator.proposals.map(item=>`<article class="poe-proposal"><h3>${safe(item.job)}</h3><p>${safe(item.state.replaceAll('_',' '))}</p><p>Initiating request: ${safe(item.prompt)}</p><p>Inputs: ${safe(JSON.stringify(item.parameters))}</p><p>Expires: ${safe(item.expiresAt)}</p><small>Sealed SHA-256 ${safe(item.hash)}</small>${item.state==='WAITING_FOR_APPROVAL'?`<button class="button warning" data-poe-job-approve="${safe(item.id)}" data-hash="${safe(item.hash)}">${item.operation==='CANCEL'?'Approve cancellation':'Approve this job'}</button>`:`<button class="text-button" data-poe-focus-kind="parcel" data-poe-focus-id="${safe(item.parcelId)}">Inspect Work Parcel</button>`}</article>`).join('');
    const pending=operator.proposals.filter(p=>p.state==='WAITING_FOR_APPROVAL');q('#mallow-review-request').hidden=!pending.length;q('#mallow-review-request').textContent=pending.length===1?'Review pending job':`Review ${pending.length} pending jobs`;
    const jobs=operator.jobs;
    q('#poe-catalogue').innerHTML=`<summary>${jobs.length} registered executable jobs</summary>`+jobs.map(job=>`<article class="poe-catalogue-row"><strong>${safe(job.name)}</strong><p>${safe(job.purpose||'Purpose unavailable')}</p><small>${safe(job.id)} · ${job.readiness.ready?'Eligible workers observed':'Blocked or readiness unavailable'}</small><p>${safe(job.registration?.changes||'Conversational execution effects are not registered.')}</p><button class="button secondary" data-poe-question="${safe(`Explain job ${job.id}`)}">Ask about this job</button>${job.registration?.permitted?`<button class="button secondary" data-poe-question="${safe(`Start ${job.id}`)}">Review a start request</button>`:''}</article>`).join('');
    const remote=(operator.registries||[]);q('#poe-catalogue').innerHTML+=remote.map(source=>`<article class="poe-catalogue-row"><strong>${safe(source.name)}</strong><p>${source.state==='OBSERVED'?`${source.jobs.length} registered remote jobs`:'Registry unavailable'}</p><p>${safe(source.limitation)}</p>${source.jobs.map(job=>`<p>${safe(job.metadata.name)} <button type="button" class="text-button" data-poe-question="${safe(`Explain job ${job.metadata.id}`)}">Explain</button></p>`).join('')}</article>`).join('');
    const count=operator.schedules.length+operator.savedSchedules.records.length+remote.reduce((n,source)=>n+source.schedules.length,0);
    q('#poe-schedules').innerHTML=`<summary>${count} registered schedules${operator.savedSchedules.available?'':' · saved schedules unavailable'}</summary><button class="button secondary" data-poe-question="Show me scheduled jobs">Explain schedules</button>`;
    q('#poe-job-proposals').querySelectorAll('[data-poe-job-approve]').forEach(button=>button.addEventListener('click',async()=>{
      button.disabled=true;try{const result=await post(endpoint('approve-job'),{proposalId:button.dataset.poeJobApprove,hash:button.dataset.hash});poeView.conversation=result.conversation;setLocal(null);await load();}catch(error){fail(error)}
    }));
  }
  function openPanel(){q('#poe-workspace').hidden=false;q('#poe-workspace').classList.add('poe-overlay');q('#poe-launcher').setAttribute('aria-expanded','true');positionCompanion();load().catch(fail)}
  function focus(kind,id,label){poeView.reference={kind,id,label};openPanel();q('#poe-input').focus()}
  window.AgentControlMallow=window.AgentControlMorrow=window.AgentControlPoe={askAbout:focus};
  function decorate(){for(const [selector,kind,key] of [['[data-parcel-id]','parcel','parcelId'],['[data-job]','job','job'],['[data-run]','run','run'],['[data-lane]','lane','lane'],['[data-model-id]','model','modelId'],['[data-bot-character-focus]','crew-member','botCharacterFocus']])for(const node of document.querySelectorAll(selector)){if(node.closest('#poe-workspace'))continue;const host=node.matches('button,a')?node.parentElement:node;if(!host||host.querySelector(`:scope > [data-poe-decoration="${kind}"]`))continue;const id=node.dataset[key];if(!id)continue;const button=document.createElement('button');button.type='button';button.className='button secondary poe-context-button';button.dataset.poeDecoration=kind;button.textContent='Ask Mallow about this';button.addEventListener('click',event=>{event.stopPropagation();focus(kind,id)});host.append(button)}}
  function fail(error){poeView.busy=false;if(tourIndex>=0&&tourSpeech!=='complete')tourSpeech='paused';setLocal('FAILED',`Mallow could not complete that step: ${error.message}. Typed conversation remains available.`);showError(error)}
  function stopLocal(){sharedStreamController?.abort();if(tourIndex>=0){tourSpeech='paused';tourEpoch++;}q('#poe-play-reply').hidden=true;speechQueue.length=0;poeView.epoch++;if(poeView.audio){poeView.audio.pause();poeView.audio.currentTime=0}if(poeView.playback?.url)URL.revokeObjectURL(poeView.playback.url);poeView.playback=null;poeView.busy=false;setLocal('INTERRUPTED','Speech stopped. Executing jobs are unaffected.')}
  async function interrupt(){const turnId=poeView.playback?.turnId||poeView.conversation?.speaking?.turnId;stopLocal();if(poeView.conversation)await post(endpoint('interrupt'),{playbackTurnId:turnId});}
  async function unlock(){
    const AudioContext=window.AudioContext||window.webkitAudioContext;
    if(AudioContext){poeView.audioContext??=new AudioContext();await poeView.audioContext.resume();const source=poeView.audioContext.createBufferSource();source.buffer=poeView.audioContext.createBuffer(1,1,poeView.audioContext.sampleRate);source.connect(poeView.audioContext.destination);source.start();}
    poeView.voiceEnabled=true;q('#poe-enable-audio').textContent='Audio enabled';q('#poe-audio-message').textContent='Audio enabled by your interaction. If playback is blocked, use Play reply.';
  }
  function animateMouth(){
    const mouth=q('#poe-character .poe-mouth'),samples=new Uint8Array(256);
    const frame=()=>{let opening=2.3;if(poeView.analyser&&poeView.audio&&!poeView.audio.paused&&!matchMedia('(prefers-reduced-motion: reduce)').matches){poeView.analyser.getByteTimeDomainData(samples);const energy=Math.sqrt(samples.reduce((sum,x)=>sum+((x-128)/128)**2,0)/samples.length);opening=Math.min(9,2.3+energy*35)}mouth?.setAttribute('ry',String(opening));q('#poe-pet-art .poe-mouth')?.setAttribute('ry',String(opening));if(poeView.playback)requestAnimationFrame(frame)};requestAnimationFrame(frame);
  }
  async function playReply(){if(!poeView.audio||!poeView.playback)return;try{await poeView.audio.play();if(tourTurn?.id===poeView.playback?.turnId)tourSpeech='playing';setLocal('SPEAKING','Speaking the captioned reply. Hold to speak or Stop speaking to interrupt.')}catch{if(tourIndex>=0)tourSpeech='paused';setLocal('BLOCKED','Browser playback was blocked. Select Play reply to hear the saved audio.')}}
  let sharedStreamController;
  function sharedSpeechAudioBlob(bytes,mime){
    if(mime==='audio/wav'||mime==='audio/x-wav')return new Blob([bytes],{type:'audio/wav'});
    const pcm=/^audio\/pcm;rate=(\d+);channels=(\d+);format=s16le$/.exec(mime||'');
    if(!pcm)throw Error('Unsupported Shared Speech audio format');
    const rate=Number(pcm[1]),channels=Number(pcm[2]);
    if(![16000,24000,44100,48000].includes(rate)||![1,2].includes(channels)||!bytes.length||bytes.length%(channels*2)||bytes.length>8*1024*1024)throw Error('Invalid Shared Speech PCM block');
    const header=new ArrayBuffer(44),view=new DataView(header);const text=(at,value)=>{for(let i=0;i<value.length;i++)view.setUint8(at+i,value.charCodeAt(i));};
    text(0,'RIFF');view.setUint32(4,36+bytes.length,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);view.setUint32(24,rate,true);view.setUint32(28,rate*channels*2,true);view.setUint16(32,channels*2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,bytes.length,true);
    return new Blob([header,bytes],{type:'audio/wav'});
  }
  // One Web Audio clock for the whole reply; never wait for a block to play before reading the stream.
  function createSharedPlayback(context,signal,onState,bufferSeconds=8){
    let pending=[],seconds=0,next=0,started=false,finished=false,cancelled=false,total=0;
    const sources=new Set();let resolveDone;const done=new Promise(resolve=>{resolveDone=resolve;});
    function settle(){if(finished&&!pending.length&&!sources.size){signal.removeEventListener('abort',cancel);resolveDone();}}
    function cancel(){cancelled=true;pending=[];seconds=0;for(const source of sources){source.onended=null;try{source.stop();}catch{}source.disconnect();}sources.clear();signal.removeEventListener('abort',cancel);resolveDone();}
    function flush(){
      if(cancelled)return;
      if(started&&next<context.currentTime+.015){started=false;onState('buffering');}
      if(!started){if(!pending.length||(!finished&&seconds<bufferSeconds))return;next=context.currentTime+.08;started=true;onState('speaking');}
      for(const buffer of pending){const source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);sources.add(source);source.onended=()=>{sources.delete(source);source.disconnect();if(!sources.size&&!finished){started=false;onState('buffering');}settle();};source.start(next);next+=buffer.duration;}
      pending=[];seconds=0;settle();
    }
    signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
    return {async add(bytes,mime){
      if(cancelled)return;
      // Validate the transport and preserve all samples; decode independently of playback.
      const blob=sharedSpeechAudioBlob(bytes,mime);total+=bytes.length;if(total>32*1024*1024)throw Error('Speech audio exceeds reply limit');
      const buffer=await context.decodeAudioData(await blob.arrayBuffer());if(cancelled)return;
      if(!Number.isFinite(buffer.duration)||buffer.duration<=0)throw Error('Invalid speech duration');
      pending.push(buffer);seconds+=buffer.duration;flush();
    },finish(){finished=true;flush();settle();return done;},cancel};
  }
  function watchSharedSpeechEpoch(read,onLost,delay=1000){
    let stopped=false,timer;
    async function begin(){const first=await read();if(!first?.incarnation)throw Error('Speech session identity unavailable');
      async function poll(){if(stopped)return;try{const next=await read();if(next.incarnation!==first.incarnation)throw Error('Speech session restarted');}catch(error){if(!stopped){stopped=true;onLost(error);}return;}if(!stopped)timer=setTimeout(poll,delay);}
      if(!stopped)timer=setTimeout(poll,delay);
    }
    return {begin,stop(){stopped=true;clearTimeout(timer);}};
  }
  async function speakShared(turn){
    const epoch=++poeView.epoch,controller=new AbortController();sharedStreamController=controller;poeView.busy=true;setLocal('THINKING','Buffering speech for smooth playback; text remains available.');
    q('#poe-audio-caption').textContent=turn.text;let player,fence;
    try{
      fence=watchSharedSpeechEpoch(()=>request('/api/poe/voice-epoch',{signal:AbortSignal.timeout(1500)}),()=>{if(epoch===poeView.epoch){stopLocal();setLocal('INTERRUPTED','Speech stopped: the server restarted or its session could not be verified.');}});await fence.begin();
      const context=poeView.audioContext;if(!context)throw Error('Enable audio to hear this reply');await context.resume();if(context.state!=='running')throw Error('Browser audio is suspended; enable audio and retry');
      if(epoch!==poeView.epoch||controller.signal.aborted)return;
      poeView.playback={turnId:turn.id};
      player=createSharedPlayback(context,controller.signal,status=>{if(epoch!==poeView.epoch)return;setLocal(status==='speaking'?'SPEAKING':'THINKING',status==='speaking'?'Speaking the captioned reply. Stop speaking to interrupt.':'Buffering speech for smooth playback; text remains available.');});
      const response=await fetch(endpoint('speech-stream'),{method:'POST',headers:{Authorization:`Bearer ${state.token}`,'Content-Type':'application/json'},body:JSON.stringify({turnId:turn.id}),signal:controller.signal});
      if(!response.ok||!response.body)throw Error('Shared Speech unavailable. Text remains available.');
      const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
      for(;;){const {done,value}=await reader.read();if(done)break;if(epoch!==poeView.epoch)return;buffer+=decoder.decode(value,{stream:true});if(buffer.length>5*1024*1024)throw Error('Speech response exceeds limit');let end;
        while((end=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);if(!frame.startsWith('data: '))continue;const event=JSON.parse(frame.slice(6));if(event.turnId!==turn.id||epoch!==poeView.epoch)continue;
          if(event.type==='speech.failed')throw Error('Shared Speech failed. Text remains available.');
          if(event.type==='provider.unavailable')setLocal('THINKING',`Mallow unavailable; using configured fallback ${event.fallback||'unavailable'}.`);
          if(event.type==='speech.block')await player.add(Uint8Array.from(atob(event.audio),c=>c.charCodeAt(0)),event.mime);
        }
      }
      await player.finish();
      if(epoch===poeView.epoch&&!controller.signal.aborted)setLocal(null,'Shared Speech finished.');
    }catch(error){if(epoch===poeView.epoch&&!controller.signal.aborted)setLocal('BLOCKED',`${error.message} You can continue by typing.`);}
    finally{fence?.stop();player?.cancel();controller.abort();if(sharedStreamController===controller)sharedStreamController=null;if(epoch===poeView.epoch){poeView.busy=false;poeView.playback=null;paintState();}}
  }
  async function speak(turn){
    if(!poeView.voiceEnabled||liveVoice?.active)return;
    if(poeView.projection?.voice?.sharedSpeech)return speakShared(turn);
    const epoch=++poeView.epoch;poeView.busy=true;setLocal('THINKING','Preparing and checking the configured voice audio.');
    let audio;try{audio=await post(endpoint('speech'),{turnId:turn.id})}catch(error){if(epoch!==poeView.epoch)return;throw error}if(epoch!==poeView.epoch)return;poeView.busy=false;
    const bytes=Uint8Array.from(atob(audio.bytes),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:audio.mime}));
    poeView.audio??=new Audio();poeView.audio.src=url;
    if(poeView.audioContext&&!poeView.analyser){const source=poeView.audioContext.createMediaElementSource(poeView.audio);poeView.analyser=poeView.audioContext.createAnalyser();poeView.analyser.fftSize=256;source.connect(poeView.analyser);poeView.analyser.connect(poeView.audioContext.destination);}
    animateMouth();poeView.playback={url,turnId:turn.id};q('#poe-audio-caption').textContent=audio.spokenText;q('#poe-play-reply').hidden=false;
    poeView.audio.onended=()=>{if(epoch===poeView.epoch&&poeView.playback?.turnId===turn.id){URL.revokeObjectURL(url);poeView.playback=null;q('#poe-play-reply').hidden=true;if(turn.purpose==='GREETING')sessionStorage.setItem('poe-greeting-spoken:'+turn.id,'yes');if(tourTurn?.id===turn.id&&tourSpeech==='playing')tourSpeech='complete';setLocal(null,'Speech finished.');announceNext().catch(fail)}};
    poeView.audio.onerror=()=>{if(epoch!==poeView.epoch||poeView.playback?.turnId!==turn.id)return;if(tourIndex>=0)tourSpeech='paused';if(poeView.playback?.url)URL.revokeObjectURL(poeView.playback.url);poeView.playback=null;q('#poe-play-reply').hidden=true;setLocal('FAILED','Browser audio decoding failed. The text and caption remain available.');};
    await playReply();
  }
  async function sendText(text,guidedEpoch=null){
    if(poeView.busy)return;
    if(poeView.playback)await interrupt();poeView.busy=true;setLocal('LISTENING');
    try{const result=await post(endpoint('turns'),{text,reference:poeView.reference});poeView.conversation=result.conversation;await load();poeView.busy=false;setLocal(null);if(guidedEpoch!==null){if(guidedEpoch!==tourEpoch||tourIndex<0)return;tourTurn=result.turn;}await speak(result.turn)}catch(error){fail(error)}
  }
  async function beginVoice(){
    if(poeView.holding||poeView.recorder)return;const audioWasEnabled=poeView.voiceEnabled;poeView.holding=true;
    if(poeView.playback||poeView.busy)await interrupt();
    try{
      await unlock();if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw new Error('Microphone capture is unavailable in this browser or insecure context');
      const selected=sessionStorage.getItem('mallow-microphone-id');const stream=await navigator.mediaDevices.getUserMedia({audio:selected?{deviceId:{exact:selected}}:true});const inputs=await navigator.mediaDevices.enumerateDevices();const usb=inputs.find(x=>x.kind==='audioinput'&&/usb/i.test(x.label));if(!selected&&usb){stream.getTracks().forEach(t=>t.stop());sessionStorage.setItem('mallow-microphone-id',usb.deviceId);poeView.holding=false;return beginVoice();}if(!poeView.holding){stream.getTracks().forEach(track=>track.stop());return}
      const recorder=new MediaRecorder(stream),chunks=[];poeView.recorder=recorder;
      recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data)};
      recorder.onstop=async()=>{stopMicrophoneFeedback();clearTimeout(recorder.limit);stream.getTracks().forEach(track=>track.stop());poeView.recorder=null;poeView.busy=true;setLocal('TRANSCRIBING','Transcribing your recording with the configured speech provider.');
        try{const blob=new Blob(chunks,{type:recorder.mimeType||'audio/webm'});if(!blob.size)throw new Error('The recording was empty');const result=await request(endpoint('transcribe'),{method:'POST',headers:{'Content-Type':blob.type},body:blob});poeView.conversation=result.conversation;await load();poeView.busy=false;setLocal(null);await speak(result.turn)}catch(error){fail(error)}
      };
      recorder.start();startMicrophoneFeedback(stream);recorder.limit=setTimeout(endVoice,60000);setLocal('LISTENING','Microphone is recording. Release to send.');q('#poe-speak').textContent='Release to send';paintLiveVoice();
    }catch(error){poeView.holding=false;poeView.voiceEnabled=audioWasEnabled;q('#poe-enable-audio').textContent=audioWasEnabled?'Audio enabled':'Enable audio';setLocal('BLOCKED',error.name==='NotAllowedError'?'Microphone permission was denied. You can still type to Mallow.':error.message)}
  }
  function endVoice(){stopMicrophoneFeedback();poeView.holding=false;if(poeView.recorder?.state==='recording')poeView.recorder.stop();q('#poe-speak').textContent='Hold to speak'}
  function renderProposal(item){const fair=item.fairness.comparable,findings=item.fairness.findings.map(f=>`<li><b>${safe(f.severity)}</b> ${safe(f.message)}</li>`).join('');return`<article class="poe-proposal" data-poe-proposal="${safe(item.id)}"><header><h3>${safe(item.decision)}</h3><span class="status-pill ${item.state==='FROZEN'?'waiting':''}">${safe(item.state)}</span></header><p>${safe(item.objective)}</p><p class="${fair?'poe-fair':'poe-unfair'}">${fair?'Comparable conditions recorded.':'Blocked fairness defects detected.'}</p>${findings?`<ul>${findings}</ul>`:''}<p>${safe(item.conditions.map(condition=>`${condition.route.providerId}/${condition.route.accountProfileId||'default'}/${condition.route.modelId}@${condition.route.nodeId}`).join(' ↔ '))}</p>${item.frozenSha256?`<small>Sealed SHA-256 ${safe(item.frozenSha256)}</small>`:''}${item.execution?`<p>Submitted as <button class="text-button" data-poe-focus-kind="parcel" data-poe-focus-id="${safe(item.execution.parcelId)}">${safe(item.execution.parcelId)}</button></p>`:''}<div class="control-strip">${item.state==='DRAFT'?`<button class="button secondary" data-poe-edit="${safe(item.id)}">Edit draft</button><button class="button secondary" data-poe-freeze="${safe(item.id)}" data-revision="${safe(item.revision)}" ${fair?'':'disabled'}>Freeze proposal</button>`:''}${item.state==='FROZEN'?`<button class="button warning" data-poe-approve="${safe(item.id)}" data-revision="${safe(item.revision)}" data-sha="${safe(item.frozenSha256)}">Approve &amp; submit Work Parcel</button>`:''}<button class="button secondary" data-poe-focus-kind="benchmark" data-poe-focus-id="${safe(item.id)}">Ask Mallow</button></div></article>`}
  function bindProposalButtons(){q('#poe-proposals').querySelectorAll('[data-poe-edit]').forEach(button=>button.addEventListener('click',()=>{const item=poeView.projection.proposals.find(proposal=>proposal.id===button.dataset.poeEdit);if(!item)return;const form=q('#poe-benchmark-form'),details=form.closest('details');form.dataset.proposalId=item.id;form.dataset.revision=String(item.revision);q('#poe-benchmark-decision').value=item.decision;q('#poe-benchmark-objective').value=item.objective;q('#poe-benchmark-reason').value=item.whyNewEvidenceIsNeeded;q('#poe-benchmark-json').value=JSON.stringify({conditions:item.conditions,stages:item.stages,metrics:item.metrics,repetitions:item.repetitions,constraints:item.constraints||[]},null,2);form.querySelector('button[type="submit"]').textContent='Save draft revision';details.open=true;details.scrollIntoView({behavior:'smooth',block:'start'})}));q('#poe-proposals').querySelectorAll('[data-poe-freeze]').forEach(button=>button.addEventListener('click',()=>request(`/api/poe/proposals/${encodeURIComponent(button.dataset.poeFreeze)}/freeze`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:Number(button.dataset.revision)})}).then(load).catch(showError)));q('#poe-proposals').querySelectorAll('[data-poe-approve]').forEach(button=>button.addEventListener('click',()=>{if(!confirm('Submit this sealed benchmark as a real governed Work Parcel?'))return;request(`/api/poe/proposals/${encodeURIComponent(button.dataset.poeApprove)}/approve`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:Number(button.dataset.revision),frozenSha256:button.dataset.sha})}).then(load).catch(showError)}))}

  let petPosition=null,petDragged=false,tourIndex=-1,narrateTests=false,lastRegression=null,tourSpeech='idle',tourTurn=null,tourEpoch=0;
  const tourSteps=[['Jobs','jobs','#job-platform-definitions','What jobs can I run?'],['Work Parcels','jobs','.parcel-panel','Explain Work Parcels and parent child relationships.'],['Lanes','lanes','#lane-list','Explain lanes and current lane state.'],['Sessions','sessions','#sessions-list','Explain governed sessions.'],['Systems','systems','#systems-list','Which systems and machines are currently available?'],['Models','models','#models-list','Which models and providers can Agent Control use?'],['Routing and quality','routing','#routing-workspace','How does routing respond when a model answer is not good enough?'],['Crew','crew','#crew-live-grid','Who are the Crew, and what does each member do?'],['Approvals','jobs','.parcel-panel','What requires my approval?'],['Schedules','jobs','#job-platform-schedules','What jobs are scheduled?'],['Sealed batons','jobs','.parcel-panel','What is a sealed baton?'],['Verification','jobs','#run-history','How does independent verification work?'],['Social and voice','crew','#crew-live-grid','Explain social and voice channels, WhatsApp and OmniVoice availability.'],['Pixel workflows','systems','#systems-list','How does the Pixel Facebook-events job work?'],['Evidence','jobs','.parcel-panel','Explain evidence and natural transcripts.']];
  function positionCompanion(){const pet=q('#poe-launcher');if(!pet)return;const w=pet.offsetWidth||96,h=pet.offsetHeight||116,header=document.querySelector('body>header')?.getBoundingClientRect(),usage=q('#persistent-usage')?.getBoundingClientRect();const start=Math.max(70,header?.bottom||0)+10;
    const obstacles=[...document.querySelectorAll('body>header,#estate-dashboard-heartbeat,.home-heading,.home-actions,#poe-regression-progress,button[data-run-command="approve"],button[data-parcel-command="approve"]')].filter(el=>!el.hidden&&el.getClientRects().length).map(el=>el.getBoundingClientRect());
    if(!petPosition){const candidates=[];for(let y=innerHeight-h-18;y>=start;y-=h+8)candidates.push({x:innerWidth-w-18,y});candidates.push({x:18,y:start});petPosition=candidates.find(c=>!obstacles.some(r=>c.x<r.right&&c.x+w>r.left&&c.y<r.bottom&&c.y+h>r.top))||candidates[0]||{x:innerWidth-w-18,y:80};}
    petPosition.x=Math.max(8,Math.min(innerWidth-w-8,petPosition.x));petPosition.y=Math.max(70,Math.min(innerHeight-h-8,petPosition.y));const style=document.documentElement.style;style.setProperty('--poe-header-bottom',Math.max(70,header?.bottom||0)+'px');style.setProperty('--poe-pet-top',petPosition.y+'px');style.setProperty('--poe-pet-right',Math.max(8,innerWidth-petPosition.x-w)+'px');style.setProperty('--poe-panel-top',Math.max(8,Math.min(petPosition.y,innerHeight*.3-10))+'px');style.setProperty('--poe-panel-right',Math.max(12,Math.min(innerWidth-452,innerWidth-petPosition.x+8))+'px');}
  function paintPet(){const pet=q('#poe-pet-art .poe-character'),name=displayState();if(pet){pet.dataset.state=name;pet.dataset.focus=tourIndex>=0?'tour-left':'conversation';}q('#poe-pet-state').textContent=name.replaceAll('_',' ');const latest=[...(poeView.conversation?.turns||[])].reverse().find(t=>t.actor==='poe'),bubble=q('#poe-pet-bubble');bubble.textContent=latest?.text||'';bubble.title=latest?.text||'';bubble.hidden=!q('#poe-workspace').hidden||!latest||(!poeView.playback&&latest.purpose!=='GREETING');positionCompanion();}
  function collapseCompanion(){if(liveVoice?.active)void liveVoice.stop();finishTour();interrupt().catch(fail);endVoice();q('#poe-workspace').hidden=true;q('#poe-launcher').setAttribute('aria-expanded','false');paintPet();}
  function finishTour(){tourIndex=-1;tourEpoch++;tourSpeech='idle';tourTurn=null;q('#poe-tour-retry').hidden=true;document.querySelectorAll('.poe-tour-target').forEach(el=>el.classList.remove('poe-tour-target'));q('#poe-tour-next').hidden=q('#poe-tour-stop').hidden=true;q('#poe-tour-position').textContent='';paintTour();}
  function paintTour(){
    const active=tourIndex>=0,blocked=poeView.busy||!!poeView.playback||poeView.holding;
    q('#poe-tour-start').disabled=blocked||active;
    q('#poe-tour-next').disabled=blocked||tourSpeech!=='complete';
    q('#poe-tour-retry').hidden=!active||tourSpeech!=='paused';
    q('#poe-tour-retry').disabled=poeView.busy||poeView.holding;
    if(active)q('#poe-tour-position').textContent=`${tourIndex+1}/${tourSteps.length} · ${tourSteps[tourIndex][0]} · ${tourSpeech==='complete'?'Ready for the next feature':tourSpeech==='paused'?'Tour paused — retry narration':tourSpeech==='playing'?'Mallow is explaining this feature':'Preparing spoken explanation'}`;
  }
  async function tourStep(){
    if(poeView.busy||poeView.playback||poeView.holding)return;
    if(tourIndex>=tourSteps.length){finishTour();return}
    const epoch=++tourEpoch;tourTurn=null;tourSpeech='pending';paintTour();
    const [title,view,selector,question]=tourSteps[tourIndex];
    document.querySelector(`[data-view="${view}"]`)?.click();
    if(title==='Schedules')document.querySelector('[data-job-platform-tab="schedules"]')?.click();
    if(title==='Jobs')document.querySelector('[data-job-platform-tab="definitions"]')?.click();
    openPanel();document.querySelectorAll('.poe-tour-target').forEach(el=>el.classList.remove('poe-tour-target'));
    const target=q(selector)||q('#'+view+'-workspace');
    if(!target||!target.getClientRects().length){tourSpeech='paused';setLocal('BLOCKED','The requested dashboard feature is not visible. The tour has paused.');return}
    target.classList.add('poe-tour-target');target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});
    q('#poe-tour-next').hidden=q('#poe-tour-stop').hidden=false;
    await load();if(epoch!==tourEpoch)return;
    await sendText(`[Operator-selected guided tour: ${title}] As Agent Control's part-time tour guide, briefly explain the highlighted ${title} area and what the operator can see or do there. ${question} ${tourIndex===0?'Begin with a brief self-introduction as Mallow, the part-time Agent Control tour guide. ':''}Use authoritative evidence only, distinguish unavailable features, and keep the spoken explanation to two concise sentences.`,epoch);
  }
  async function retryTour(){
    if(tourIndex<0||poeView.busy||poeView.holding)return;
    await unlock();
    if(poeView.playback&&poeView.playback.turnId===tourTurn?.id){await playReply();return}
    if(poeView.playback)await interrupt();
    if(tourTurn){tourSpeech='pending';paintTour();await speak(tourTurn)}else await tourStep();
  }
  async function refreshRegression(){if(state.operatorAuth!=='authenticated')return;try{const progress=await request('/api/poe/regression'),panel=q('#poe-regression-progress');if(progress.state==='UNAVAILABLE'){panel.hidden=true;return}panel.hidden=false;const value=n=>n===null||n===undefined?'Unavailable':safe(n);panel.innerHTML=`<strong>Full regression · ${safe(progress.state)}${progress.stale?' · STALE':''}</strong><span>Phase: ${safe(progress.phase)}</span><span>Passed ${value(progress.passed)}</span><span>Failed ${value(progress.failed)}</span><span>Skipped ${value(progress.skipped)}</span><span>Remaining ${value(progress.remaining)}</span><span>Elapsed ${progress.elapsedMs===null?'unavailable':Math.floor(progress.elapsedMs/1000)+'s'}</span><small>Commit ${safe(progress.commit)} · External test runner; not a Work Parcel</small>`;
    const milestone=`${progress.runId}:${progress.phase}:${progress.state}`;if(narrateTests&&tourIndex<0&&!progress.stale&&milestone!==lastRegression&&!poeView.busy&&!poeView.playback&&!poeView.holding){lastRegression=milestone;await load();await sendText('[Operator-enabled regression narration] Explain the supplied full regression snapshot in at most two short sentences. Phrase progress as a past observation at the time of that snapshot, because the runner can advance while speech is prepared. Give elapsed time in rounded seconds. State unavailable remaining totals honestly.');}}catch{const panel=q('#poe-regression-progress');if(!panel.hidden)panel.innerHTML='<strong>Regression evidence unavailable</strong>';}}
  function initializeCompanion(){const clone=q('#poe-character').cloneNode(true);clone.removeAttribute('id');clone.querySelectorAll('[id]').forEach(el=>{const old=el.id;el.id=old+'-pet';clone.querySelectorAll('[fill]').forEach(node=>{if(node.getAttribute('fill')===`url(#${old})`)node.setAttribute('fill',`url(#${old}-pet)`)});});q('#poe-pet-art').append(clone);positionCompanion();let drag=null;
    q('#poe-launcher').addEventListener('pointerdown',event=>{drag={x:event.clientX,y:event.clientY,origin:{...petPosition}};petDragged=false;event.currentTarget.setPointerCapture(event.pointerId)});
    q('#poe-launcher').addEventListener('pointermove',event=>{if(!drag)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>5)petDragged=true;if(petDragged){petPosition={x:drag.origin.x+dx,y:drag.origin.y+dy};positionCompanion();}});
    q('#poe-launcher').addEventListener('pointerup',()=>{drag=null});q('#poe-launcher').addEventListener('pointercancel',()=>{drag=null});q('#poe-launcher').addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();petPosition.x+=event.key==='ArrowLeft'?-24:event.key==='ArrowRight'?24:0;petPosition.y+=event.key==='ArrowUp'?-24:event.key==='ArrowDown'?24:0;positionCompanion();}if(event.key==='Escape')collapseCompanion()});window.addEventListener('resize',()=>{petPosition=null;positionCompanion()});
    document.addEventListener('morrow:open',openPanel);document.addEventListener('poe:open',openPanel);q('#poe-expand').addEventListener('click',()=>{const expanded=q('#poe-workspace').classList.toggle('poe-expanded-detail');q('#poe-expand').setAttribute('aria-pressed',String(expanded));q('#poe-expand').textContent=expanded?'Compact':'Expand'});
    q('#poe-tour-start').addEventListener('click',async()=>{try{if(poeView.busy||poeView.playback||poeView.holding||tourIndex>=0)return;await unlock();tourIndex=0;await tourStep()}catch(error){fail(error)}});
    q('#poe-tour-next').addEventListener('click',()=>{if(!poeView.busy&&!poeView.playback&&!poeView.holding&&tourSpeech==='complete'){tourIndex++;tourStep().catch(fail)}});
    q('#poe-tour-retry').addEventListener('click',()=>retryTour().catch(fail));
    q('#poe-tour-stop').addEventListener('click',()=>{finishTour();interrupt().catch(fail)});
    q('#poe-narrate-tests').addEventListener('click',async()=>{try{if(!narrateTests)await unlock();narrateTests=!narrateTests;q('#poe-narrate-tests').setAttribute('aria-pressed',String(narrateTests));q('#poe-narrate-tests').textContent=narrateTests?'Stop test narration':'Narrate test progress';if(narrateTests)await refreshRegression()}catch(error){fail(error)}});
    document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{if(button.dataset.view!=='poe'&&tourIndex<0){q('#poe-launcher').setAttribute('aria-expanded','false');paintPet();}petPosition=null;positionCompanion();}));setInterval(refreshRegression,3000);
  }

  const initialPlan={conditions:[{route:{providerId:'provider-a',accountProfileId:'profile-a',modelId:'model-a',nodeId:'controller'},tools:['repository.read'],contextPolicy:'same-frozen-context',fixtureSha256:'0'.repeat(64),softwareVersion:'record-exact-version',hardwareClass:'record-exact-hardware',quantization:null,cacheState:'COLD',providerEndpoint:'provider-a',authority:'QUALIFICATION',timeLimitMs:120000},{route:{providerId:'provider-b',accountProfileId:'profile-b',modelId:'model-b',nodeId:'controller'},tools:['repository.read'],contextPolicy:'same-frozen-context',fixtureSha256:'0'.repeat(64),softwareVersion:'record-exact-version',hardwareClass:'record-exact-hardware',quantization:null,cacheState:'COLD',providerEndpoint:'provider-b',authority:'QUALIFICATION',timeLimitMs:120000}],stages:[{id:'candidate-a',name:'Candidate A',job:'replace-with-registered-job@1.0.0',parameters:{},requestedRoute:{provider:'provider-a',accountProfile:'profile-a',model:'model-a',allowFallback:false,purpose:'QUALIFICATION',profile:'STANDARD',reason:'Frozen candidate A'}},{id:'candidate-b',name:'Candidate B',job:'replace-with-registered-job@1.0.0',parameters:{},requestedRoute:{provider:'provider-b',accountProfile:'profile-b',model:'model-b',allowFallback:false,purpose:'QUALIFICATION',profile:'STANDARD',reason:'Frozen candidate B'}}],metrics:[{id:'verified-a',label:'Verified outcome A',kind:'OBJECTIVE',successCriterion:'Independent verifier passes candidate A',stageId:'candidate-a'},{id:'verified-b',label:'Verified outcome B',kind:'OBJECTIVE',successCriterion:'Independent verifier passes candidate B',stageId:'candidate-b'},{id:'operator-preference',label:'Blind operator preference',kind:'HUMAN_EVALUATION',successCriterion:'Record preference as HUMAN_EVALUATION, never objective truth'}],repetitions:1,constraints:['Same immutable fixture and declared tools','No automatic production preference change']};

  document.addEventListener('DOMContentLoaded',()=>{
    q('#mallow-review-request').addEventListener('click',()=>{q('#poe-extra').open=true;q('#poe-job-proposals').scrollIntoView({block:'start'});});
    liveVoice=new window.MallowVoiceTransport({request,conversation:()=>poeView.conversation.id,changed:paintLiveVoice,status:message=>{q('#poe-audio-message').textContent=message;}});
    q('#mallow-talk').addEventListener('click',async()=>{try{await load();if(voiceAvailability?.state==='CONFIGURED_NOT_QUALIFIED'){await interrupt();await liveVoice.start();}else if(poeView.holding)endVoice();else if(poeView.projection?.voice?.recognition)await beginVoice();else q('#poe-audio-message').textContent='Voice is not configured. You can type to Mallow below.';paintLiveVoice();}catch(error){fail(error)}});
    q('#mallow-end-voice').addEventListener('click',()=>liveVoice.stop());q('#mallow-mute').addEventListener('click',()=>liveVoice.mute());
    q('#mallow-silence').addEventListener('click',()=>liveVoice.silence().catch(fail));q('#mallow-resume-speaker').addEventListener('click',()=>liveVoice.resumeSpeaker().catch(fail));
    q('#mallow-voice-history').addEventListener('click',async()=>{try{const r=liveVoice.lastRecord,result=await request('/api/voice/sessions/'+encodeURIComponent(r.id)+'/history');const url=URL.createObjectURL(new Blob([result.history],{type:'text/markdown'})),link=document.createElement('a');link.href=url;link.download=r.id+'.md';link.click();URL.revokeObjectURL(url);}catch(error){fail(error)}});

    const requestedView=new URL(location.href).searchParams.get('poeView');if(['jobs','systems','models','lanes','crew'].includes(requestedView))document.querySelector(`[data-view="${requestedView}"]`)?.click();
    q('#poe-benchmark-json').value=JSON.stringify(initialPlan,null,2);
    initializeCompanion();q('#poe-launcher').addEventListener('click',()=>{if(petDragged){petDragged=false;return}if(q('#poe-workspace').hidden)openPanel();else collapseCompanion()});
    document.querySelector('[data-view="poe"]')?.addEventListener('click',openPanel);
    q('#poe-close').addEventListener('click',collapseCompanion);
    q('#poe-enable-audio').addEventListener('click',async()=>{try{await unlock();const greeting=poeView.conversation?.turns.find(turn=>turn.purpose==='GREETING');if(greeting&&!sessionStorage.getItem('poe-greeting-spoken:'+greeting.id)){if(!poeView.busy&&!poeView.playback)await speak(greeting);else queueAnnouncement(greeting);}else await announceNext();}catch(error){fail(error)}});q('#poe-play-reply').addEventListener('click',()=>playReply().catch(fail));
    q('#poe-interrupt').addEventListener('click',()=>interrupt().catch(fail));
    q('#poe-new-conversation').addEventListener('click',async()=>{if(poeView.switching)return;poeView.switching=true;if(liveVoice?.active)await liveVoice.stop();finishTour();try{await poeView.loading;await interrupt();poeView.conversation=await post('/api/poe/conversations',{channel:'dashboard'});sessionStorage.setItem(key,poeView.conversation.id);poeView.reference=null;poeView.operator=null;setLocal(null);}catch(error){fail(error)}finally{poeView.switching=false;}await load();if(poeView.voiceEnabled)queueAnnouncement(poeView.conversation.turns.find(turn=>turn.purpose==='GREETING'))});
    q('#poe-form').addEventListener('submit',event=>{event.preventDefault();const input=q('#poe-input'),text=input.value;if(!text.trim()||poeView.busy)return;input.value='';sendText(text)});
    q('#poe-reference').addEventListener('click',event=>{if(event.target.id==='poe-clear-reference'){poeView.reference=null;render()}});
    q('#poe-download-transcript').addEventListener('click',()=>request(endpoint('transcript')).then(({transcript})=>{const url=URL.createObjectURL(new Blob([transcript],{type:'text/markdown'})),link=document.createElement('a');link.href=url;link.download='mallow-conversation.md';link.click();URL.revokeObjectURL(url)}).catch(fail));
    q('#poe-speak').addEventListener('pointerdown',event=>{event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);beginVoice()});
    q('#poe-speak').addEventListener('pointerup',endVoice);q('#poe-speak').addEventListener('pointercancel',endVoice);
    q('#poe-speak').addEventListener('keydown',event=>{if([' ','Enter'].includes(event.key)&&!event.repeat){event.preventDefault();beginVoice()}});q('#poe-speak').addEventListener('keyup',event=>{if([' ','Enter'].includes(event.key)){event.preventDefault();endVoice()}});
    document.addEventListener('click',event=>{const source=event.target.closest?.('[data-poe-source]');if(source){request(source.dataset.poeSource).then(value=>{q('#poe-source-text').textContent=`${value.path}\nCommit: ${value.commit}\nSHA-256: ${value.hash}\n\n${value.text}`;q('#poe-source-details').open=true;}).catch(fail);return;}const question=event.target.closest?.('[data-poe-question]');if(question)sendText(question.dataset.poeQuestion);const button=event.target.closest?.('[data-poe-focus-kind]');if(button){focus(button.dataset.poeFocusKind,button.dataset.poeFocusId);sendText(`Explain ${button.dataset.poeFocusKind} ${button.dataset.poeFocusId}`)}});
    document.addEventListener('agent-control:event-received',event=>{if(q('#poe-workspace').hidden||poeView.busy)return;const type=String(event.detail?.type||'');if(/^(poe\.|job\.|parcel\.|work\.parcel_|work_parcel\.)/.test(type))load().catch(fail)});
    new MutationObserver(()=>{decorate();if(state.operatorAuth==='authenticated'&&!operatorSeen){operatorSeen=true;load().catch(fail);}else if(state.operatorAuth!=='authenticated')operatorSeen=false;}).observe(document.body,{childList:true,subtree:true});decorate();
q('#poe-benchmark-form').addEventListener('submit',event=>{event.preventDefault();try{const form=event.currentTarget,plan=JSON.parse(q('#poe-benchmark-json').value),input={decision:q('#poe-benchmark-decision').value,objective:q('#poe-benchmark-objective').value,whyNewEvidenceIsNeeded:q('#poe-benchmark-reason').value,...plan},editing=form.dataset.proposalId,url=editing?`/api/poe/proposals/${encodeURIComponent(editing)}`:`/api/poe/conversations/${encodeURIComponent(poeView.conversation.id)}/proposals`,body=editing?{revision:Number(form.dataset.revision),changes:input}:input;request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(()=>{delete form.dataset.proposalId;delete form.dataset.revision;form.querySelector('button[type="submit"]').textContent='Create draft';return load()}).catch(showError)}catch(error){showError(new Error(`Benchmark JSON: ${error.message}`))}});
  });
})();
