/** Preparation only: no target observation or disruptive operation is invoked. */
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {TargetReset,type ContinuationAuthority} from '../src/control/target-reset.js';
import {androidRecoveryPort} from '../src/control/android-target-recovery.js';
import {validateRuntimeTarget} from '../src/control/target-llama-runtime.js';
const [configFile,recoveryDirectory,authorityFile]=process.argv.slice(2);
if(!configFile||!recoveryDirectory||!authorityFile)throw Error('usage: prepare-target-recovery-continuation <target-config> <existing-recovery-directory> <preparation-authority-file>');
const config=JSON.parse(fs.readFileSync(configFile,'utf8')),target=validateRuntimeTarget(config.target??config),authority:ContinuationAuthority=JSON.parse(fs.readFileSync(authorityFile,'utf8'));
const recovery=new TargetReset(path.resolve(recoveryDirectory),target.resource.id,target.environment,createHash('sha256').update(JSON.stringify(target)).digest('hex'),androidRecoveryPort(target));
console.log(JSON.stringify(await recovery.prepareContinuation(authority),null,2));
