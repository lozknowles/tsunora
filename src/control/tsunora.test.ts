import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {once} from 'node:events';
import {AgentControlService} from './application-service.js';
import {PtyRegistry} from './pty.js';
import {startWebDashboard} from './web-server.js';
test('Tsunora entry and assets are served without opening governed APIs',async t=>{
 const service=new AgentControlService({version:1,paused:false,lastRestorePoint:null,lanes:[]},new PtyRegistry(),undefined,'test',()=>{});
 const server=startWebDashboard(service,{host:'127.0.0.1',port:0,operatorToken:'tsunora-test-only',assetsDir:path.resolve('assets/dashboard')});await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});const base='http://127.0.0.1:'+(server.address() as any).port;
 for(const file of ['tsunora.html','tsunora.css','tsunora.js','tsunora-mark.svg'])assert.equal((await fetch(base+'/'+file)).status,200,file);
 assert.equal((await fetch(base+'/api/labour-exchange')).status,401);
 assert.equal((await fetch(base+'/api/labour-exchange/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
 assert.equal((await fetch(base+'/api/labour-exchange',{headers:{Authorization:'Bearer tsunora-test-only'}})).status,503);
 assert.equal((await fetch(base+'/tsunora-product.json')).status,404);
 assert.match(await (await fetch(base+'/')).text(),/dashboard-poe.js/);
});
test('product identity separates runtime and research lineage; hero contains no operational feed',()=>{
 const p=JSON.parse(fs.readFileSync('tsunora-product.json','utf8'));assert.equal(p.version,'0.1.0');assert.equal(p.runtime.version,'4.15.0');
 const html=fs.readFileSync('assets/dashboard/tsunora.html','utf8');const hero=html.split('<section id="hero">')[1]!.split('</section>')[0]!;
 assert.match(hero,/CONNECT WORK/);assert.doesNotMatch(hero,/id="view"|counter|ledger|activity|gauge/i);
 const js=fs.readFileSync('assets/dashboard/tsunora.js','utf8');assert.doesNotMatch(js,/localStorage|sessionStorage|innerHTML|eval\(/);
});
