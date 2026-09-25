import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {LocalRepositoryResolver} from './repository-review-runtime.js';

function git(cwd:string,...args:string[]){return execFileSync('git',['-C',cwd,...args],{encoding:'utf8'}).trim();}
function repository(){const parent=fs.mkdtempSync(path.join(os.tmpdir(),'ac-review-root-')),source=path.join(parent,'source'),snapshots=path.join(parent,'snapshots');fs.mkdirSync(source);git(source,'init','-q');git(source,'config','user.email','test@example.invalid');git(source,'config','user.name','Test');fs.writeFileSync(path.join(source,'tracked.txt'),'tracked\n');git(source,'add','.');git(source,'commit','-qm','base');return {parent,source,snapshots};}

test('snapshot preparation rejects an outside-root symlink without changing its target',t=>{
  const f=repository(),outside=path.join(f.parent,'outside-marker.txt');t.after(()=>{fs.chmodSync(f.source,0o700);fs.rmSync(f.parent,{recursive:true,force:true});});
  fs.writeFileSync(outside,'OUTSIDE_MARKER\n',{mode:0o600});const before=fs.statSync(outside).mode&0o777;fs.symlinkSync(outside,path.join(f.source,'escape'));git(f.source,'add','escape');git(f.source,'commit','-qm','add outside link');
  const resolver=new LocalRepositoryResolver();assert.throws(()=>resolver.resolve({nodeId:'local',repository:f.source,requestedRef:'HEAD',allowedRoots:[f.parent],snapshotsRoot:f.snapshots}),/repository_snapshot_symlink_unsafe/);
  assert.equal(fs.readFileSync(outside,'utf8'),'OUTSIDE_MARKER\n');assert.equal(fs.statSync(outside).mode&0o777,before);
});

test('local non-ancestor comparisons use the governed error code',t=>{
  const f=repository();t.after(()=>fs.rmSync(f.parent,{recursive:true,force:true}));const unrelated=git(f.source,'rev-parse','HEAD');git(f.source,'checkout','-qb','other');fs.writeFileSync(path.join(f.source,'other.txt'),'other\n');git(f.source,'add','.');git(f.source,'commit','-qm','other');const reviewed=git(f.source,'rev-parse','HEAD');
  git(f.source,'checkout','-q','--orphan','unrelated');git(f.source,'rm','-q','-rf','.');fs.writeFileSync(path.join(f.source,'new.txt'),'new\n');git(f.source,'add','.');git(f.source,'commit','-qm','unrelated');const nonAncestor=git(f.source,'rev-parse','HEAD');
  const resolver=new LocalRepositoryResolver();assert.throws(()=>resolver.resolve({nodeId:'local',repository:f.source,requestedRef:reviewed,comparisonSha:nonAncestor,allowedRoots:[f.parent],snapshotsRoot:f.snapshots}),/repository_comparison_not_ancestor/);assert.notEqual(unrelated,nonAncestor);
});
