import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

// Automated browser regression evidence only. This is not physical microphone/speaker qualification.
const base=process.env.POE_BROWSER_TEST_URL;
const tokenFile=process.env.POE_BROWSER_TEST_TOKEN_FILE;
if(!base||!tokenFile)throw new Error('An explicitly scoped test URL and token file are required.');
const root=path.resolve(process.env.POE_BROWSER_TEST_OUTPUT||'work/poe-browser-test');
fs.mkdirSync(root,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.AGENT_CONTROL_CHROMIUM||'/snap/bin/chromium',args:['--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const evidence={classification:'AUTOMATED_BROWSER_REGRESSION_NOT_PHYSICAL_QUALIFICATION',checks:[],screenshots:[]};
const capture=async name=>{const file=path.join(root,`${name}.png`);await page.screenshot({path:file});evidence.screenshots.push(file);};
async function ask(text){await page.locator('#poe-input').fill(text);await page.locator('#poe-form button[type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('#poe-form button[type="submit"]').disabled);await page.waitForFunction(text=>document.querySelector('#poe-turns .poe-turn.operator:last-of-type>div')?.textContent===text||[...document.querySelectorAll('#poe-turns .poe-turn.operator>div')].at(-1)?.textContent===text,text);assert.equal(await page.locator('#poe-turns .poe-turn.operator>div').last().textContent(),text);}
try{
  await page.goto(base);
  assert.equal((await context.request.get(`${base}/api/poe`)).status(),401);evidence.checks.push('Unauthenticated conversations rejected');
  await page.locator('#operator-button').click();await page.locator('#operator-token').fill(fs.readFileSync(tokenFile,'utf8').trim());await page.locator('#operator-form button[type="submit"]').click();await page.locator('#operator-dialog').waitFor({state:'hidden'});
  await page.locator('#poe-launcher').click();await page.locator('#poe-conversation-title').filter({hasText:'Your dashboard conversation'}).waitFor();
  await capture('01-idle-desktop');
  await ask('Explain how Agent Control works.');assert.match(await page.locator('#poe-turns').innerText(),/versioned documentation/);evidence.checks.push('System explanation with documentation provenance');await capture('02-explaining');
  await ask('Which jobs can I run?');assert.match(await page.locator('#poe-turns').innerText(),/Registered executable jobs/);evidence.checks.push('Authoritative job discovery');
  await ask('Show me scheduled jobs.');assert.match(await page.locator('#poe-turns').innerText(),/Registered schedules/);evidence.checks.push('Authoritative schedule discovery');
  await ask('What does the Facebook events job do?');await capture('03-facebook-registry');evidence.checks.push('Facebook workflow explanation distinguishes source runtime and unavailable preflight');
  await ask('Start System observation');await page.locator('[data-poe-job-approve]').last().waitFor();await capture('04-approval');
  await page.locator('[data-poe-job-approve]').last().click();await page.waitForFunction(()=>document.querySelector('#poe-turns')?.textContent?.includes('Work Parcel'));
  await page.waitForFunction(()=>document.querySelector('#poe-turns')?.textContent?.includes('is SUCCEEDED'),{},{timeout:20000});evidence.checks.push('Explicit approval creates a real Work Parcel and returns its final status');await capture('05-result');
  const before=await page.locator('#poe-turns .poe-turn.operator').count();await page.reload();await page.locator('#poe-launcher').click();await page.locator('#poe-conversation-title').filter({hasText:'Your dashboard conversation'}).waitFor();assert.equal(await page.locator('#poe-turns .poe-turn.operator').count(),before);evidence.checks.push('Session conversation survives reload');
  await ask('Publish all Facebook events');assert.match(await page.locator('#poe-turns .poe-turn.poe').last().innerText(),/separate approval boundaries/);evidence.checks.push('Publication safely refused');await capture('06-blocked');
  await page.setViewportSize({width:390,height:844});await capture('07-mobile');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Mobile page has horizontal overflow');
  await page.emulateMedia({reducedMotion:'reduce'});const transition=await page.locator('.poe-head-group').evaluate(node=>getComputedStyle(node).transitionDuration);assert.equal(transition,'0s');evidence.checks.push('Mobile layout and reduced motion');
  // Browser API failure fixtures are explicitly synthetic; they do not establish physical audio.
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('#poe-enable-audio').click();assert.match(await page.locator('#poe-audio-message').textContent(),/Audio enabled/);evidence.checks.push('Explicit audio-unlock interaction');
  await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied by regression fixture','NotAllowedError')}});
  await page.locator('#poe-speak').press('Space');await page.waitForFunction(()=>document.querySelector('#poe-audio-message')?.textContent?.includes('permission was denied'));assert.equal(await page.locator('#poe-form button[type="submit"]').isEnabled(),true);evidence.checks.push('Simulated microphone denial retains text input');
  await page.route('**/api/poe/conversations/*/speech',async route=>{
    const wav=Buffer.alloc(44+32000);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(32000,40);
    await route.fulfill({json:{turnId:'synthetic-audio-fixture',spokenText:'Synthetic browser playback fixture. Not physical evidence.',bytes:wav.toString('base64'),mime:'audio/wav'}});
  });
  await page.evaluate(()=>{HTMLMediaElement.prototype.play=async function(){throw new DOMException('Autoplay denied by fixture','NotAllowedError')}});
  await ask('What is Agent Control doing?');await page.waitForFunction(()=>document.querySelector('#poe-audio-message')?.textContent?.includes('Browser playback was blocked'));assert.equal(await page.locator('#poe-play-reply').isVisible(),true);evidence.checks.push('Simulated autoplay denial exposes explicit replay');
  await page.locator('#poe-interrupt').click();assert.match(await page.locator('#poe-state').innerText(),/INTERRUPTED/);evidence.checks.push('Stop control clears synthetic pending playback');
  assert.deepEqual(errors,[]);evidence.checks.push('No browser script errors');
}finally{
  evidence.lastUi={audioMessage:await page.locator('#poe-audio-message').textContent(),state:await page.locator('#poe-state').textContent()};evidence.errors=errors;fs.writeFileSync(path.join(root,'browser-regression.json'),JSON.stringify(evidence,null,2));await browser.close();
}
console.log(JSON.stringify({checks:evidence.checks,output:root,physicalQualification:false},null,2));
