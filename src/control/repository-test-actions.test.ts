import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import test from 'node:test';
import {ActionRegistry} from './job-runtime.js';import {registerRepositoryTestActions} from './repository-test-actions.js';import type {AgentControlConfig} from './config.js';
test('failed repository checks retain bounded diagnostics as partial runtime artifacts',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'repository-failure-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.writeFileSync(path.join(root,'package.json'),'{}');
 const action=registerRepositoryTestActions(new ActionRegistry(),{jobs:{repositoryRoots:[root]}} as AgentControlConfig).handler('repository.tests@1.0.0');
 const context={parameters:{repositoryPath:root,suite:'typecheck'},signal:AbortSignal.timeout(1000),ownedExecution:{runProcess:async()=>({exitCode:2,stdout:'example.ts: type error',stderr:''})}} as unknown as Parameters<typeof action>[0];
 await assert.rejects(()=>action(context),error=>{const failure=error as Error&{partialActionOutput:{artifacts:Array<{value:{exitCode:number;stdout:string}}>;verification:string[]}};assert.equal(failure.partialActionOutput.artifacts[0]!.value.exitCode,2);assert.match(failure.partialActionOutput.artifacts[0]!.value.stdout,/type error/);assert.deepEqual(failure.partialActionOutput.verification,[]);return true;});
});
