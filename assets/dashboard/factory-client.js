export class FactoryConnection {
  constructor({token,onFrame,onStatus,onCoverage,url='/api/factory/events'}){Object.assign(this,{token,onFrame,onStatus,onCoverage,url});this.controller=null;this.lastId='';this.running=false;this.retry=null;this.generation=0;}
  start(){if(this.running)return;this.running=true;this.connect();}
  stop(){this.running=false;this.generation++;this.controller?.abort();clearTimeout(this.retry);this.retry=null;}
  async connect(){
    const own=++this.generation;this.controller?.abort();this.controller=new AbortController();
    try{this.onStatus('CONNECTING');const response=await fetch(this.url,{headers:{Authorization:`Bearer ${this.token()}`,...(this.lastId?{'Last-Event-ID':this.lastId}:{})},signal:this.controller.signal});
      if(own!==this.generation||!this.running)return;
      if(!response.ok){if([401,403,404].includes(response.status)){this.running=false;this.onStatus(response.status===404?'DISABLED':'AUTHENTICATION REQUIRED');return;}throw Error(`HTTP ${response.status}`);}
      const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
      while(this.running&&own===this.generation){const {value,done}=await reader.read();if(done||!this.running||own!==this.generation)break;buffer+=decoder.decode(value,{stream:true});buffer=buffer.replaceAll('\r\n','\n');if(buffer.length>9*1024*1024)throw Error('Factory stream frame limit');let i;
        while(this.running&&own===this.generation&&(i=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,i);buffer=buffer.slice(i+2);const lines=block.split('\n'),type=lines.find(l=>l.startsWith('event:'))?.slice(6).trim(),data=lines.filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(!data)continue;
          if(type==='factory.frame'){const frame=JSON.parse(data);if(frame.schema!=='agent-control.factory-frame/v1'||frame.projection?.schema!=='agent-control.factory/v1')throw Error('Unsupported factory frame');this.lastId=frame.id;this.onStatus('CONNECTED');this.onFrame(frame);}
          else if(type==='factory.coverage')this.onCoverage(JSON.parse(data));else if(type==='factory.error')throw Error('Factory projection unavailable');
        }
      }
      if(this.running)throw Error('Stream ended');
    }catch(error){if(!this.running||own!==this.generation)return;this.onStatus('STALE · RECONNECTING');}
    if(this.running&&own===this.generation)this.retry=setTimeout(()=>this.connect(),1500);
  }
}
export class FactoryHistory {
  constructor(maxFrames=240,maxBytes=8*1024*1024){this.maxFrames=maxFrames;this.maxBytes=maxBytes;this.frames=[];this.bytes=0;this.dropped=0;this.gaps=0;}
  add(frame){const previous=this.frames.at(-1);if(previous?.id===frame.id)return;if(previous&&(previous.epoch!==frame.epoch||frame.sequence!==previous.sequence+1))this.gaps++;const bytes=new TextEncoder().encode(JSON.stringify(frame)).length;if(bytes>this.maxBytes){this.dropped++;return;}this.frames.push(frame);this.bytes+=bytes;while(this.frames.length>this.maxFrames||this.bytes>this.maxBytes){this.bytes-=new TextEncoder().encode(JSON.stringify(this.frames.shift())).length;this.dropped++;}}
  export(){return{schema:'agent-control.factory-replay/v1',capturedAt:new Date().toISOString(),coverage:{droppedFrames:this.dropped,sequenceGaps:this.gaps,first:this.frames[0]?.id??null,last:this.frames.at(-1)?.id??null},frames:this.frames};}
  import(value){if(value?.schema!=='agent-control.factory-replay/v1'||!Array.isArray(value.frames)||value.frames.length>240)throw Error('Unsupported or oversized Factory replay');for(const f of value.frames){if(f.schema!=='agent-control.factory-frame/v1'||typeof f.id!=='string'||typeof f.at!=='string'||!Number.isSafeInteger(f.sequence)||f.projection?.schema!=='agent-control.factory/v1'||!Array.isArray(f.projection.entities)||f.projection.entities.length>600||!Array.isArray(f.projection.relations)||f.projection.relations.length>1000||!Array.isArray(f.projection.events)||!f.projection.coverage)throw Error('Invalid Factory replay frame');for(const e of f.projection.entities){if(typeof e.id!=='string'||typeof e.label!=='string'||typeof e.state!=='string'||typeof e.kind!=='string'||!e.metrics||!e.detail||!Array.isArray(e.links))throw Error('Invalid Factory replay entity');}}
    this.frames=[];this.bytes=0;this.dropped=0;this.gaps=0;for(const f of value.frames)this.add(f);}
}
