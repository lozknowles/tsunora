import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {once} from 'node:events';
import {ExperimentalModelServer} from './experimental-model-server.js';
import {OwnedProcessManager} from './owned-process.js';

async function freePort(){const server=net.createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address(),port=typeof address==='object'&&address?address.port:0;server.close();await once(server,'close');return port;}

test('experimental model server admits one bounded file, proves protected health and confirms cleanup',{skip:process.platform!=='linux'},async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'experimental-model-host-')),runtime=path.join(root,'fake-runtime'),model=path.join(root,'model.gguf'),port=await freePort();
  let protectedPort=await freePort();
  while(protectedPort===port)protectedPort=await freePort();
  fs.writeFileSync(model,'bounded-model-fixture');
  fs.writeFileSync(runtime,`#!/usr/bin/env node
const http=require('node:http'),args=process.argv.slice(2);
if(args.includes('--version')){console.log('fixture-build-1');process.exit(0)}
const port=Number(args[args.indexOf('--port')+1]),server=http.createServer((_,res)=>{res.writeHead(200);res.end('{"status":"ok"}')});
server.listen(port,'127.0.0.1');process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
`);fs.chmodSync(runtime,0o700);
  const protectedServer=http.createServer((_,response)=>{response.writeHead(200);response.end('protected-ok');});protectedServer.listen(protectedPort,'127.0.0.1');await once(protectedServer,'listening');
  const owned=new OwnedProcessManager(),server=new ExperimentalModelServer({runtimePath:runtime,modelPath:model,allowedRuntimeRoot:root,allowedModelRoot:root,host:'127.0.0.1',port,contextTokens:1024,gpuLayers:0,threads:1,minimumAvailableRamBytes:0,protectedHealthUrls:[`http://127.0.0.1:${protectedPort}/health`],startupTimeoutMs:10000},owned);
  try{const admission=await server.start();assert.equal(admission.settings.port,port);assert.equal(admission.protectedBefore[0]?.status,200);assert.ok(admission.processPid>0);assert.match(admission.runtime.build,/fixture-build-1/);const cleanup=await server.stop();assert.equal(cleanup.cleanup.outcome,'confirmed');assert.equal(cleanup.protectedAfter[0]?.status,200);assert.equal(await new Promise(resolve=>{const socket=net.createConnection({port,host:'127.0.0.1'});socket.once('connect',()=>{socket.destroy();resolve(true)});socket.once('error',()=>resolve(false));}),false);}finally{protectedServer.close();await once(protectedServer,'close');fs.rmSync(root,{recursive:true,force:true});}
});

test('experimental model server rejects protected ports before launch',{skip:process.platform!=='linux'},async()=>{
  const server=new ExperimentalModelServer({runtimePath:'/srv/agent-control-runtimes/llama/bin/server',modelPath:'/srv/agent-control-models/model.gguf',allowedRuntimeRoot:'/srv/agent-control-runtimes/llama',allowedModelRoot:'/srv/agent-control-models',host:'127.0.0.1',port:8080,contextTokens:1024,gpuLayers:0,threads:1,minimumAvailableRamBytes:0,protectedHealthUrls:[],startupTimeoutMs:1},new OwnedProcessManager());
  await assert.rejects(()=>server.start(),/endpoint_not_admitted/);
});
