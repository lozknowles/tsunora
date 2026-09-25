import path from 'node:path';
import {createHash} from 'node:crypto';
import type {JobRuntime} from './job-runtime.js';
import {TargetReset} from './target-reset.js';
import {androidRecoveryPort} from './android-target-recovery.js';
import type {TargetLlamaRuntime,RuntimeTarget} from './target-llama-runtime.js';
/** Installation composition; reusable independently of any benchmark. */
export function registerTargetRecovery(runtime:JobRuntime,target:RuntimeTarget,executionAdapter?:TargetLlamaRuntime){
 if(target.telemetry!=='android-termux'||!target.originalService)return;
 const reset=new TargetReset(path.join(runtime.artifacts.root,'..','target-recovery'),target.resource.id,target.environment,createHash('sha256').update(JSON.stringify(target)).digest('hex'),androidRecoveryPort(target));
 runtime.registerTargetReset(target.resource.id,reset);if(executionAdapter)executionAdapter.recoveryFence=reset;return reset;
}
