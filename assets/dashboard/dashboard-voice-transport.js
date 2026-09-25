/* Browser audio edge. The authenticated server owns all delegated work and history. */
window.MallowVoiceTransport=class {
  constructor({request,conversation,changed,status}){Object.assign(this,{request,conversation,changed,status});this.generation=0;this.active=false;this.ready=false;this.muted=false;this.audio=new Audio();this.audio.autoplay=true;this.audio.playsInline=true;this.lastRecord=null;
    window.addEventListener('offline',()=>{if(this.active)this.stop('Network disconnected. Reconnect explicitly to continue; running jobs remain available.');});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&this.active)this.stop('Voice ended when the page went into the background. Jobs continue.');});
    window.addEventListener('pagehide',()=>{this.localClose();});
  }
  async availability(){return this.request('/api/voice/availability');}
  async start(){
    if(this.active)return;const epoch=++this.generation;this.active=true;this.ready=false;this.changed();
    try{
      if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw Error('A secure HTTPS connection or localhost is required for microphone access.');
      if(!window.RTCPeerConnection)throw Error('This browser does not provide WebRTC. Use recorded speech or text.');
      this.status('Requesting microphone permission…');
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});if(epoch!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}this.stream=stream;
      const pc=this.pc=new RTCPeerConnection();pc.ontrack=event=>{if(epoch!==this.generation)return;this.audio.srcObject=event.streams[0]||new MediaStream([event.track]);this.audio.play().catch(()=>this.status('Playback blocked. Tap Resume speaker to hear Mallow.'));};
      stream.getTracks().forEach(track=>pc.addTrack(track,stream));
      const channel=this.channel=pc.createDataChannel('oai-events');
      channel.onmessage=event=>{if(epoch!==this.generation)return;let message;try{message=JSON.parse(event.data);}catch{return;}
        if(message.type==='session.started'){this.ready=true;this.status('Listening · live conversation. Speak naturally; Stop speaking silences Mallow.');this.changed();}
        if(message.type==='session.output_transcript.delta'&&typeof message.delta==='string'){this.caption=(this.caption||'')+message.delta;document.querySelector('#poe-audio-caption').textContent=this.caption.slice(-2000);}
        if(message.type==='session.closed'){this.status('Voice session ended. Jobs and history remain available.');this.finish();}
        if(message.type==='error')this.status('The voice provider rejected a command. Check voice history for its failure category.');
      };
      pc.onconnectionstatechange=()=>{if(epoch!==this.generation)return;if(['failed','disconnected'].includes(pc.connectionState))this.stop('Voice connection interrupted. Jobs continue. Tap Talk to reconnect.');};
      await pc.setLocalDescription(await pc.createOffer());
      await new Promise((resolve,reject)=>{if(pc.iceGatheringState==='complete')return resolve();const timer=setTimeout(()=>reject(Error('Network negotiation timed out. Retry or use text.')),10000);pc.addEventListener('icegatheringstatechange',()=>{if(pc.iceGatheringState==='complete'){clearTimeout(timer);resolve();}});});
      if(epoch!==this.generation)return;
      this.status('Connecting voice…');
      const result=await this.request('/api/voice/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({conversationId:this.conversation(),sdp:pc.localDescription.sdp}),signal:AbortSignal.timeout(35000)});
      if(epoch!==this.generation){await this.request('/api/voice/sessions/'+encodeURIComponent(result.id)+'/close',{method:'POST'});return;}
      this.id=result.id;this.lastRecord=result.record;
      await pc.setRemoteDescription({type:'answer',sdp:result.sdp});
      this.poll=setInterval(()=>this.refresh().catch(()=>this.stop('Controller connection lost. Jobs continue; voice has stopped.')),5000);
      this.startTimer=setTimeout(()=>{if(!this.ready)this.stop('The voice session did not become ready. Use text or try again.');},15000);
      this.changed();
    }catch(error){await this.stop(error.name==='NotAllowedError'?'Microphone permission denied. Enable it in browser site settings and tap Talk again, or keep typing.':error.message);}
  }
  async refresh(){if(!this.id)return;this.lastRecord=await this.request('/api/voice/sessions/'+encodeURIComponent(this.id)+'/heartbeat',{method:'POST',signal:AbortSignal.timeout(8000)});this.changed();if(['FAILED','INTERRUPTED','CLOSED'].includes(this.lastRecord.state)){this.status(this.lastRecord.failure?`${this.lastRecord.failure.domain}: ${this.lastRecord.failure.code}. Text remains available.`:'Voice ended; job history remains available.');this.localClose();}}
  mute(){this.muted=!this.muted;this.stream?.getAudioTracks().forEach(t=>t.enabled=!this.muted);this.status(this.muted?'Microphone muted. The live session still accrues duration charges.':'Microphone on.');this.changed();}
  async silence(){this.audio.muted=true;if(this.id)await this.request('/api/voice/sessions/'+encodeURIComponent(this.id)+'/stop-speaking',{method:'POST'});this.status('Speaker muted. Running jobs are unaffected. Tap Resume speaker to hear Mallow.');}
  resumeSpeaker(){this.audio.muted=false;return this.audio.play();}
  localClose(){this.generation++;this.active=false;this.ready=false;clearInterval(this.poll);clearTimeout(this.startTimer);this.stream?.getTracks().forEach(t=>t.stop());this.pc?.close();this.audio.pause();this.audio.srcObject=null;this.muted=false;this.changed();}
  async finish(){const id=this.id;this.localClose();if(id){try{this.lastRecord=await this.request('/api/voice/sessions/'+encodeURIComponent(id));}catch{}this.changed();}}
  async stop(reason='Voice ended. Running jobs are unaffected.'){
    const id=this.id;this.id=null;
    // Stop microphone immediately; keep the primary connection open while final usage drains.
    this.stream?.getTracks().forEach(t=>t.enabled=false);clearInterval(this.poll);this.status(reason);
    try{if(id)this.lastRecord=await this.request('/api/voice/sessions/'+encodeURIComponent(id)+'/close',{method:'POST',signal:AbortSignal.timeout(8000)});}catch{this.status(reason+' Final voice usage is unconfirmed.');}finally{this.localClose();}
  }
};
