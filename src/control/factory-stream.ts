import type {IncomingMessage,ServerResponse} from 'node:http';
import {FactoryJournal,projectFactory,type FactorySource,type FactoryFrame,type FactoryProjection} from './factory-view.js';

/** Optional observer. No runtime subscribes to or waits for graphics. */
export class FactoryStream {
  readonly journal=new FactoryJournal();
  private clients=new Set<ServerResponse>();private timer:ReturnType<typeof setInterval>|null=null;
  private pending=false;private closed=false;
  private blocked=new WeakSet<ServerResponse>();
  constructor(private readonly source:()=>FactorySource|FactoryProjection,readonly intervalMs=750){}
  sample(){const value=this.source();return this.journal.append('schema' in value?value:projectFactory(value));}
  publish(){if(this.closed||this.pending||!this.clients.size)return;this.pending=true;setImmediate(()=>{try{if(this.closed||!this.clients.size)return;const frame=this.sample();for(const client of this.clients)this.send(client,frame);}catch{/* Optional projection must not fail discovery. */}finally{this.pending=false;}});}
  connect(request:IncomingMessage,response:ServerResponse){
    if(this.closed){response.writeHead(503);response.end();return;}
    response.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});
    response.write('retry: 1500\n\n');
    const after=typeof request.headers['last-event-id']==='string'?request.headers['last-event-id']:undefined;
    const replay=this.journal.replay(after);
    // Explicit reset on expired cursor or process restart. Each frame replaces state.
    response.write(`event: factory.coverage\ndata: ${JSON.stringify(replay.coverage)}\n\n`);
    // Reconnect gets the latest complete frame, never an unbounded history burst.
    const latest=replay.frames.at(-1);if(latest)this.send(response,latest);
    if(response.destroyed||response.writableEnded)return;
    this.clients.add(response);
    response.on('drain',()=>this.blocked.delete(response));
    const cleanup=()=>{this.clients.delete(response);if(!this.clients.size&&this.timer){clearInterval(this.timer);this.timer=null;}};
    response.on('close',cleanup);request.on('close',cleanup);
    if(!this.timer){this.timer=setInterval(()=>this.schedule(),this.intervalMs);this.timer.unref();}
    this.schedule();
  }
  private schedule(){if(this.pending||this.closed||!this.clients.size)return;this.pending=true;setImmediate(()=>{try{if(!this.clients.size||this.closed)return;const frame=this.sample();for(const client of this.clients)this.send(client,frame);}catch{for(const client of this.clients){client.write('event: factory.error\ndata: {"error":"factory_projection_unavailable"}\n\n');client.end();}}finally{this.pending=false;}});}
  private send(response:ServerResponse,frame:FactoryFrame){
    if(response.destroyed||response.writableEnded){this.clients.delete(response);return;}
    // Close slow readers rather than accumulate writes or block execution. Reconnect replaces state.
    if(response.writableLength>1024*1024){response.destroy();this.clients.delete(response);return;}
    if(this.blocked.has(response))return;
    if(!response.write(`id: ${frame.id}\nevent: factory.frame\ndata: ${JSON.stringify(frame)}\n\n`))this.blocked.add(response);
  }
  close(){this.closed=true;if(this.timer)clearInterval(this.timer);this.timer=null;for(const client of this.clients)client.end();this.clients.clear();}
}
