import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Controlled audio lifecycle fixture, not physical microphone or playback evidence.
function fixture(){
 const elements=new Map();
 const node=selector=>{if(!elements.has(selector))elements.set(selector,{dataset:{},hidden:false,style:{setProperty(){}},classList:{add(){},remove(){}},textContent:'',setAttribute(){},getBoundingClientRect(){return {bottom:60}},getClientRects(){return [{}]},offsetWidth:96,offsetHeight:116});return elements.get(selector)};
 let rejectPlay=false,requests=0;
 class Audio{async play(){if(rejectPlay)throw new Error('autoplay blocked');this.paused=false;}pause(){this.paused=true;}}
 const context={document:{querySelector:node,querySelectorAll:()=>[],addEventListener(){},documentElement:{style:{setProperty(){}}}},window:{},state:{operatorAuth:'authenticated',token:'fixture-only'},esc:x=>x,showError(){},innerWidth:1440,innerHeight:900,Audio,Uint8Array,Blob,URL:{createObjectURL:()=> 'blob:fixture',revokeObjectURL(){}},atob:()=>'',requestAnimationFrame(){},matchMedia:()=>({matches:false}),fetch:async()=>{requests++;return {ok:true,status:200,json:async()=>({bytes:'',mime:'audio/ogg',spokenText:'Fixture explanation of the highlighted feature.'})}}};
 const source=fs.readFileSync(new URL('../assets/dashboard/dashboard-poe.js',import.meta.url),'utf8');
 vm.runInNewContext(source.replace(/\}\)\(\);\s*$/,`window.test={speak,playReply,stopLocal,paintTour,finishTour,setup(){poeView.conversation={id:'fixture',turns:[]};poeView.voiceEnabled=true;tourIndex=0;tourSpeech='pending';tourTurn={id:'tour-1'};},state(){return tourSpeech},view:poeView};})();`),context);
 context.window.test.setup();return {api:context.window.test,node,block:value=>rejectPlay=value,requests:()=>requests};
}
test('tour Next waits for actual audio end, not generation or playback start',async()=>{
 const f=fixture();f.api.paintTour();assert.equal(f.node('#poe-tour-next').disabled,true);
 await f.api.speak({id:'tour-1'});assert.equal(f.api.state(),'playing');assert.equal(f.node('#poe-tour-next').disabled,true);
 f.api.view.audio.onended();assert.equal(f.api.state(),'complete');assert.equal(f.node('#poe-tour-next').disabled,false);assert.equal(f.node('#poe-play-reply').hidden,true);
});
test('blocked playback pauses the tour and retries saved audio without another synthesis',async()=>{
 const f=fixture();f.block(true);await f.api.speak({id:'tour-1'});assert.equal(f.api.state(),'paused');assert.equal(f.node('#poe-tour-next').disabled,true);assert.equal(f.node('#poe-tour-retry').hidden,false);
 f.block(false);await f.api.playReply();assert.equal(f.requests(),1);assert.equal(f.api.state(),'playing');f.api.view.audio.onended();assert.equal(f.api.state(),'complete');
});
test('barge-in cannot let an old audio completion advance a paused tour',async()=>{
 const f=fixture();await f.api.speak({id:'tour-1'});const ended=f.api.view.audio.onended;f.api.stopLocal();ended();assert.equal(f.api.state(),'paused');assert.equal(f.node('#poe-tour-next').disabled,true);assert.equal(f.node('#poe-tour-retry').hidden,false);
});
test('decode failure leaves the feature paused with captions retained',async()=>{
 const f=fixture();await f.api.speak({id:'tour-1'});f.api.view.audio.onerror();assert.equal(f.api.state(),'paused');assert.equal(f.node('#poe-tour-next').disabled,true);assert.match(f.node('#poe-audio-caption').textContent,/highlighted feature/);
});

 test('retired audio errors cannot overwrite interruption or a retried reply',async()=>{
 const f=fixture();await f.api.speak({id:'tour-1'});const staleError=f.api.view.audio.onerror;
 f.api.stopLocal();staleError();assert.equal(f.api.view.localState,'INTERRUPTED');
 await f.api.speak({id:'tour-1'});const active=f.api.view.playback;staleError();
 assert.equal(f.api.view.localState,'SPEAKING');assert.equal(f.api.view.playback,active);
});
test('retired completion cannot finish a newer attempt of the same reply',async()=>{
 const f=fixture();await f.api.speak({id:'tour-1'});const staleEnd=f.api.view.audio.onended;
 f.api.stopLocal();await f.api.speak({id:'tour-1'});staleEnd();
 assert.equal(f.api.state(),'playing');assert.equal(f.node('#poe-tour-next').disabled,true);
 f.api.view.audio.onended();assert.equal(f.api.state(),'complete');
});
