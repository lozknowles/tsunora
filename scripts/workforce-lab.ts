import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {randomBytes} from 'node:crypto';import {WorkforceLab,employee,reviewer,questions} from '../src/workforce_ops/lab.js';
const root=path.resolve(process.argv[2]??'work/workforce-lab');const lab=new WorkforceLab(root);const sessions=new Map([[randomBytes(24).toString('hex'),reviewer],[randomBytes(24).toString('hex'),employee]]);const tokens=[...sessions.keys()];
let stopping=false;let running=false;const timer=setInterval(async()=>{if(running||stopping)return;running=true;try{await lab.tick();}catch{}finally{running=false;}},650);
const files:Record<string,string>={'/':'workforce-lab.html','/workforce-lab.js':'workforce-lab.js','/workforce-lab.css':'workforce-lab.css','/dashboard-theme.css':'dashboard-theme.css'};
const server=http.createServer(async(req,res)=>{const send=(status:number,value:unknown)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};try{
 const url=new URL(req.url??'/',`http://${req.headers.host}`);if(!['127.0.0.1','localhost'].includes(url.hostname)){send(403,{error:'host_denied'});return;}
 if(url.pathname.startsWith('/api/')){
 const actor=sessions.get(String(req.headers['x-workforce-session']??''));if(!actor){send(401,{error:'session_required'});return;}
 if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`){send(403,{error:'origin_denied'});return;}
 if(req.method==='GET'&&url.pathname==='/api/state'){const p=lab.projection();if(actor.role!=='hr'){const ids=new Set(p.requests.filter(r=>r.actor.id===actor.id&&r.tenant===actor.tenant).map(r=>r.runId));p.runs=p.runs.filter(r=>ids.has(r.id));p.events=p.events.filter(e=>ids.has(e.runId));p.artifacts=p.artifacts.filter(a=>ids.has(a.runId));p.requests=p.requests.filter(r=>ids.has(r.runId));p.records=Object.fromEntries(Object.entries(p.records).filter(([k])=>k===actor.tenant+'/'+actor.employee));p.approvals={};p.containment={schema:'agent-control.containment-timeline/v1',authority:'DERIVED_FROM_DURABLE_CONTAINMENT_RECORDS',events:[],quarantined:[]};}send(200,{...p,role:actor.role,questions});return;}
 if(req.method==='GET'&&url.pathname==='/api/rd'){const file=path.join(root,'rd-results.json');send(200,fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{status:'NOT_RUN'});return;}
 if(req.method!=='POST'){send(405,{error:'method_denied'});return;}
 let body='';for await(const chunk of req){body+=chunk;if(body.length>6000){send(413,{error:'request_too_large'});return;}}const x=JSON.parse(body);
 if(url.pathname==='/api/request'){const fault=actor.role==='hr'?x.fault??'none':'none';if(!['none','scope','worker','model','tool','timeout','incorrect','verification','ambiguity'].includes(fault))throw Error('invalid_fault');const origin=x.asManager&&actor.role==='hr'?{...employee,role:'manager' as const}:employee;send(201,{run:lab.submit(String(x.text??''),origin,{confirmed:x.confirmed===true,fault})});return;}
 if(url.pathname==='/api/approval'){lab.approve(String(x.runId),actor,x.allow===true);send(200,{accepted:true});return;}
 send(404,{error:'not_found'});return;}
 const file=files[url.pathname];if(!file){send(404,{error:'not_found'});return;}
 res.writeHead(200,{'content-type':file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html','cache-control':'no-store','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'",'x-content-type-options':'nosniff'});res.end(fs.readFileSync(path.resolve('assets/dashboard',file)));
 }catch(e){send(400,{error:e instanceof Error?e.message:'request_failed'});}});
server.listen(0,'127.0.0.1',()=>{const port=(server.address() as any).port;fs.writeFileSync(path.join(root,'private-session.json'),JSON.stringify({port,operator:tokens[0],employee:tokens[1]}),{mode:0o600});console.log(JSON.stringify({port,sessionFile:'private-session.json',classification:'LOCAL_SYNTHETIC_ONLY'}));});
// A STOP marker is a one-shot request, not a persistent prohibition on restart.
// Drain the current tick before closing so approval/state writes can settle.
process.once('SIGINT',()=>{stopping=true;});
process.once('SIGTERM',()=>{stopping=true;});
const stop=setInterval(()=>{
 if(fs.existsSync(path.join(root,'STOP')))stopping=true;
 if(stopping&&!running){
  clearInterval(timer);clearInterval(stop);
  fs.rmSync(path.join(root,'STOP'),{force:true});
  fs.rmSync(path.join(root,'private-session.json'),{force:true});
  server.closeAllConnections();server.close();
 }
},100);
