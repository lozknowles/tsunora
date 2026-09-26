import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {executeCase,readCases} from '../workforce_ops/qualification.js';
for(const c of readCases().cases)test('workforce frozen boundary '+c.id+' '+c.family,async t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'workforce-case-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const result=await executeCase(c,root);assert.equal(result.pass,true,JSON.stringify(result));});
