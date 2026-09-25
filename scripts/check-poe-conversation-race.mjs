import fs from 'node:fs';import assert from 'node:assert/strict';import {chromium} from 'playwright-core';
const base=process.env.POE_BROWSER_TEST_URL,tokenFile=process.env.POE_BROWSER_TEST_TOKEN_FILE;
if(!base||!tokenFile)throw new Error('Explicit isolated runtime and token file required');
const browser=await chromium.launch({headless:true,executablePath:process.env.AGENT_CONTROL_CHROMIUM||'/snap/bin/chromium',args:['--disable-dev-shm-usage']});
const page=await browser.newPage();const record={classification:'DETERMINISTIC_BROWSER_REFRESH_RACE_NOT_PHYSICAL',checks:[]};
try{
 await page.goto(base);await page.locator('#operator-button').click();await page.locator('#operator-token').fill(fs.readFileSync(tokenFile,'utf8').trim());await page.locator('#operator-form button[type="submit"]').click();await page.locator('#operator-dialog').waitFor({state:'hidden'});await page.locator('#poe-launcher').click();await page.locator('#poe-turns .poe-turn').waitFor();
 const old=await page.evaluate(()=>sessionStorage.getItem('agent-control-poe-dashboard-conversation'));let entered,release;const seen=new Promise(r=>entered=r),gate=new Promise(r=>release=r);let intercepted=false;
 await page.route('**/api/poe',async route=>{if(intercepted)return route.continue();intercepted=true;const response=await route.fetch();entered();await gate;await route.fulfill({response});});
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('agent-control:event-received',{detail:{type:'poe.changed'}})));await seen;
 await page.locator('#poe-new-conversation').click();release();await page.waitForFunction(old=>{const current=sessionStorage.getItem('agent-control-poe-dashboard-conversation');return current&&current!==old},old);
 await page.waitForFunction(()=>document.querySelectorAll('#poe-turns .poe-turn').length===1&&document.querySelector('#poe-turns')?.textContent.includes('Good day.'));
 const current=await page.evaluate(()=>sessionStorage.getItem('agent-control-poe-dashboard-conversation'));await page.reload();await page.locator('#poe-launcher').click();await page.locator('#poe-turns .poe-turn').waitFor();assert.equal(await page.evaluate(()=>sessionStorage.getItem('agent-control-poe-dashboard-conversation')),current);assert.notEqual(current,old);
 record.checks.push('In-flight old projection cannot replace explicit new conversation','New conversation contains one greeting','Reload preserves new conversation identity');
}finally{await browser.close();fs.writeFileSync(process.env.POE_BROWSER_TEST_OUTPUT||'/tmp/poe-conversation-race.json',JSON.stringify(record,null,2));}
console.log(JSON.stringify(record));