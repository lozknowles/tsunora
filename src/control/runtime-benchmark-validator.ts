import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import type {LabExecutionAdapter} from './model-hardware-qualification.js';
/** Same frozen validator as the historical suite, now launched by the governed worker. */
export const validateRuntimeBenchmarkCode:LabExecutionAdapter['validate']=async(task,result,context)=>{
 const validator=fileURLToPath(new URL('../../assets/runtime/python-repair-validator.py',import.meta.url));
 const sha256=createHash('sha256').update(fs.readFileSync(validator)).digest('hex');
 if(process.platform!=='linux')return {passed:null,reason:'Network-isolated Python validator unavailable on this controller platform.',evidence:{sha256}};
 try{
  const checked=await context.ownedExecution.runProcess({command:'/usr/bin/bwrap',args:['--unshare-all','--die-with-parent','--new-session','--ro-bind','/usr','/usr','--ro-bind','/lib','/lib','--ro-bind','/lib64','/lib64','--proc','/proc','--dev','/dev','--tmpfs','/tmp','--ro-bind',validator,'/validator.py','/usr/bin/prlimit','--as=536870912','--cpu=5','--nproc=32','--','/usr/bin/python3','-I','/validator.py'],input:JSON.stringify({source:result.output,inputs:task.input,expected:task.expected}),env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},maxOutputBytes:65536,session:{adapterId:'benchmark-python-validator-v1',commandLabel:'Validate frozen benchmark function'}},AbortSignal.any([context.signal,AbortSignal.timeout(10000)]));
  const evidence={sha256,exitCode:checked.exitCode,stdout:checked.stdout,stderr:checked.stderr};
  context.recordEvidence?.('runtime-benchmark-code-validation',evidence);
  if(checked.exitCode!==0)return {passed:null,reason:'Independent sandbox did not complete; quality unavailable.',evidence};
  const verdict=JSON.parse(checked.stdout);if(typeof verdict.passed!=='boolean')throw Error('invalid verdict');
  return {passed:verdict.passed,reason:'Frozen restricted-python-functions/v1 validator in network-isolated sandbox.',evidence};
 }catch{return {passed:null,reason:'Independent sandbox unavailable or interrupted; quality not inferred.',evidence:{sha256}};}
};
