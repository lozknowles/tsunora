/** Read-only local operator interface; uses the same registered production target port as the API. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {TargetReset} from '../src/control/target-reset.js';
import {androidRecoveryPort} from '../src/control/android-target-recovery.js';
import {validateRuntimeTarget} from '../src/control/target-llama-runtime.js';
const [configFile,targetId,evidenceDirectory,actor]=process.argv.slice(2);
if(!configFile||!targetId||!evidenceDirectory||!actor)throw Error('usage: diagnose-target-environment <private-target-config> <target-id> <evidence-directory> <operator>');
const config=JSON.parse(fs.readFileSync(configFile,'utf8'));
const target=validateRuntimeTarget(config.target??config);
if(target.resource.id!==targetId)throw Error('configured_target_binding_mismatch');
const recovery=new TargetReset(path.resolve(evidenceDirectory),target.resource.id,target.environment,createHash('sha256').update(JSON.stringify(target)).digest('hex'),androidRecoveryPort(target));
console.log(JSON.stringify(await recovery.diagnose(actor),null,2));
