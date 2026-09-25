import fs from 'node:fs';
import path from 'node:path';
import type {AgentControlConfig} from './config.js';
import {ActionFailure, type ActionRegistry} from './job-runtime.js';

/** Fixed test runner on an explicitly approved repository. No shell interpolation or chat argv. */
export function registerRepositoryTestActions(actions: ActionRegistry, config: AgentControlConfig) {
  return actions.registerConsequentialControl('repository.tests@1.0.0',async context=>{
    const supplied=context.parameters.repositoryPath;
    if(typeof supplied!=='string')throw new ActionFailure('repository_path_required','policy_rejection');
    const root=fs.realpathSync(supplied), approved=(config.jobs?.repositoryRoots??[]).map(p=>fs.realpathSync(p));
    if(!approved.includes(root) || !fs.existsSync(path.join(root,'package.json')))throw new ActionFailure('repository_not_approved','policy_rejection');
    const suite=context.parameters.suite;
    if(suite!=='messaging' && suite!=='typecheck')throw new ActionFailure('test_suite_not_approved','policy_rejection');
    const args=suite==='messaging'?['--import','tsx','--test','src/control/openwa.test.ts']:['node_modules/typescript/bin/tsc','--noEmit'];
    const result=await context.ownedExecution.runProcess({command:process.execPath,args,cwd:root,env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,LANG:'C.UTF-8'},maxOutputBytes:262144},context.signal);
    const artifacts=[{name:'test-result',value:{suite,exitCode:result.exitCode,stdout:result.stdout,stderr:result.stderr}}];
    if(result.exitCode!==0)throw Object.assign(new ActionFailure('repository_tests_failed_see_dashboard','verification'),{partialActionOutput:{artifacts,verification:[]}});
    return {artifacts,verification:['tests-passed'],detail:'Fixed repository test suite completed successfully'};
  },['FILESYSTEM_WRITE']);
}
