import assert from 'node:assert/strict';
import {once} from 'node:events';
import http from 'node:http';
import test from 'node:test';
import {BrowserDestinationPolicy,PlaywrightBrowserEngine} from './browser-worker.js';

test('destination policy rejects internal IPv4 IPv6 names and DNS answers by default',async()=>{
  const policy=new BrowserDestinationPolicy([],async host=>host==='mixed.example'?['203.0.113.8','127.0.0.1']:['93.184.216.34']);
  for(const url of ['http://127.0.0.1','http://10.0.0.1','http://169.254.169.254','http://[::1]','http://[fe80::1]','http://service.local','http://mixed.example'])await assert.rejects(()=>policy.assert(url),/private_destination_not_authorised/);
  await assert.doesNotReject(()=>policy.assert('https://public.example'));
});

test('exact operator private-host permission preserves authorised local access and does not cover redirects',async t=>{
  const server=http.createServer((request,response)=>{if(request.url==='/redirect'){response.writeHead(302,{Location:`http://127.0.0.1:${(server.address() as any).port}/target`});response.end();return;}if(request.url==='/subresource'){response.end(`<title>fixture</title><img src="http://127.0.0.1:${(server.address() as any).port}/asset">`);return;}response.end('<title>fixture</title><p>AUTHORISED_LOCAL_FIXTURE</p>');});
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());const port=(server.address() as any).port;
  const denied=new PlaywrightBrowserEngine({headless:true});await assert.rejects(()=>denied.run({steps:[{action:'navigate',url:`http://127.0.0.1:${port}`}]}),/private_destination_not_authorised/);
  const allowed=new PlaywrightBrowserEngine({headless:true,allowedPrivateHosts:['127.0.0.1']});const result=await allowed.run({steps:[{action:'navigate',url:`http://127.0.0.1:${port}`},{action:'extractText',name:'body'}]});assert.match(String(result.values.body),/AUTHORISED_LOCAL_FIXTURE/);
  const redirectGuard=new PlaywrightBrowserEngine({headless:true,allowedPrivateHosts:['localhost']});await assert.rejects(()=>redirectGuard.run({steps:[{action:'navigate',url:`http://localhost:${port}/redirect`,waitUntil:'load'}]}),/private_destination_not_authorised/);
  await assert.rejects(()=>redirectGuard.run({steps:[{action:'navigate',url:`http://localhost:${port}/subresource`,waitUntil:'load'}]}),/private_destination_not_authorised/);
  await assert.rejects(()=>redirectGuard.run({allowJavascript:true,steps:[{action:'navigate',url:`http://localhost:${port}`},{action:'javascript',name:'socket',expression:`new Promise(resolve=>{new WebSocket('ws://127.0.0.1:${port}/socket');setTimeout(()=>resolve('done'),100)})`}]}),/private_destination_not_authorised/);
});
