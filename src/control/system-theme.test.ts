import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const assets=path.join(root,'assets');
const theme=fs.readFileSync(path.join(assets,'dashboard/dashboard-theme.css'),'utf8');
const parts=theme.split('@media (prefers-color-scheme: dark)');
const values=(source:string)=>Object.fromEntries([...source.matchAll(/--ac-([a-z-]+):\s*(#[a-f0-9]{6});/g)].map(m=>[m[1]!,m[2]!]));
function luminance(hex:string){const channels=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return channels[0]!*.2126+channels[1]!*.7152+channels[2]!*.0722;}
function contrast(a:string,b:string){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}

test('system palette has a light default and one dark media override, without session scripting',()=>{
 assert.equal(parts.length,2);assert.match(parts[0]!,/color-scheme: light/);assert.match(parts[1]!,/color-scheme: dark/);
 assert.doesNotMatch(theme,/localStorage|sessionStorage|location\.reload|data-theme|filter:\s*invert/);
 assert.deepEqual(Object.keys(values(parts[0]!)).sort(),Object.keys(values(parts[1]!)).sort());
});
for(const [mode,part] of [['light',parts[0]!],['dark',parts[1]!]] as const){
 const p=values(part);
 test(`${mode}: primary and secondary text meet AA across main surfaces`,()=>{
  for(const foreground of ['text','text-secondary'])for(const background of ['background','surface','surface-elevated','surface-inset'])assert.ok(contrast(p[foreground]!,p[background]!)>=4.5,`${foreground}/${background}`);
 });
 test(`${mode}: state and accent text meet AA on their own surfaces and primary cards`,()=>{
  for(const role of ['accent','success','warning','error','info','violet'])for(const bg of [role+'-surface','surface','surface-elevated'])assert.ok(contrast(p[role]!,p[bg]!)>=4.5,`${role}/${bg}: ${contrast(p[role]!,p[bg]!)}`);
 });
 test(`${mode}: graph edges, focus and selected outlines remain distinguishable`,()=>{
  for(const role of ['graph-edge','focus','border'])for(const bg of ['background','surface','surface-elevated'])assert.ok(contrast(p[role]!,p[bg]!)>=3,`${role}/${bg}: ${contrast(p[role]!,p[bg]!)}`);
 });
 test(`${mode}: text on a filled accent retains AA contrast`,()=>assert.ok(contrast(p['on-accent']!,p.accent!)>=4.5));
}
test('every browser entry includes the shared palette and native light/dark control scheme',()=>{
 for(const dir of ['dashboard','session-player'])for(const name of fs.readdirSync(path.join(assets,dir)).filter(n=>n.endsWith('.html'))){
  const content=fs.readFileSync(path.join(assets,dir,name),'utf8');assert.match(content,/href="\/dashboard-theme.css"/,name);assert.match(content,/name="color-scheme" content="light dark"/,name);
 }
});
test('component styles contain no literal interface colours outside the shared palette',()=>{
 for(const dir of ['dashboard','session-player'])for(const name of fs.readdirSync(path.join(assets,dir)).filter(n=>n.endsWith('.css')&&n!=='dashboard-theme.css')){
  const css=fs.readFileSync(path.join(assets,dir,name),'utf8');
  for(const declaration of css.matchAll(/(?:^|[;{])\s*(?:--[\w-]+|[\w-]+)\s*:\s*([^;{}]+)/g))assert.doesNotMatch(declaration[1]!,/#[a-f0-9]{3,8}\b|rgba?\(/i,name);
 }
});
test('offline fallback retains the same palette without caching operational data',()=>{
 const sw=fs.readFileSync(path.join(assets,'dashboard/service-worker.js'),'utf8');assert.match(sw,/cache.addAll\(\['\/offline.html','\/dashboard-theme.css'\]\)/);assert.doesNotMatch(sw,/cache\.put\(/);assert.match(sw,/Never cache API responses/);
});
