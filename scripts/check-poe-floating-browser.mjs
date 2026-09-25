import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {chromium} from 'playwright-core';
const base=process.env.POE_BROWSER_TEST_URL,tokenFile=process.env.POE_BROWSER_TEST_TOKEN_FILE,root=process.env.POE_BROWSER_TEST_OUTPUT;
if(!base||!tokenFile||!root)throw new Error('Explicit isolated runtime, token file and evidence directory required');
fs.mkdirSync(root,{recursive:true});const result={classification:'AUTOMATED_RESPONSIVE_BROWSER_CHECK_NOT_PHYSICAL',checks:[]};
const browser=await chromium.launch({headless:true,executablePath:process.env.AGENT_CONTROL_CHROMIUM||'/snap/bin/chromium',args:['--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
try{
 await page.goto(base);await page.locator('#operator-button').click();await page.locator('#operator-token').fill(fs.readFileSync(tokenFile,'utf8').trim());await page.locator('#operator-form button[type="submit"]').click();await page.locator('#operator-dialog').waitFor({state:'hidden'});await page.waitForFunction(()=>document.querySelector('#operator-button')?.textContent==='Operator authenticated');await page.locator('#poe-pet-state').waitFor();
 assert.equal(await page.locator('#poe-workspace').isVisible(),false);await page.screenshot({path:path.join(root,'collapsed-desktop.png')});
 const pet=page.locator('#poe-launcher');await pet.focus();const before=await pet.boundingBox();await page.keyboard.press('ArrowLeft');await page.waitForFunction(x=>document.querySelector('#poe-launcher').getBoundingClientRect().x<x,before.x,{timeout:3000});const after=await pet.boundingBox();result.keyboardMovement={before,after};assert.ok(after.x<before.x);await page.keyboard.press('Enter');
 const panel=await page.locator('#poe-workspace').boundingBox();assert.ok(panel.width>=380&&panel.width<=480);assert.ok(panel.height<=700.5);assert.ok(panel.x>=0&&panel.x+panel.width<=1440);await page.screenshot({path:path.join(root,'expanded-desktop.png')});
 result.checks.push('Collapsed by default','Keyboard reposition and opening','Desktop normal panel 380–480px and at most 70vh');
 await page.locator('button[data-view="systems"]').click();assert.equal(await page.locator('#systems-workspace').isVisible(),true);result.checks.push('Underlying navigation remains operable');
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});if(!await page.locator('#poe-workspace').isVisible())await pet.click();const mobile=await page.locator('#poe-workspace').boundingBox();assert.ok(mobile.x>=0&&mobile.x+mobile.width<=390.5);assert.ok(mobile.height<=844*.7+.5);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const motion=await page.locator('#poe-character .poe-head-group').evaluate(el=>({animation:getComputedStyle(el).animationName,transition:getComputedStyle(el).transitionDuration}));assert.equal(motion.transition,'0s');await page.screenshot({path:path.join(root,'expanded-mobile-reduced-motion.png')});result.checks.push('Mobile fits 390px viewport and 70vh','Reduced motion removes transitions');
 await page.locator('#poe-close').click();assert.equal(await page.locator('#poe-workspace').isVisible(),false);result.checks.push('Close returns to compact companion');
}finally{await browser.close();fs.writeFileSync(path.join(root,'checks.json'),JSON.stringify(result,null,2));}
console.log(JSON.stringify(result));
