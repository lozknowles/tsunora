import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import type {LabourBackend,WorkOrder,DigitalWorker,LabourExecutionResult} from './labour-types.js';
import type {OwnedExecution} from './owned-process.js';
/** Trusted fixed-program adapter: requests never choose executables, argv, paths or environment. */
export class LabourProcessBackend implements LabourBackend {
  readonly revision:string;
  readonly requiredAction;
  constructor(readonly id:string,private command:string,private program:string){
    this.revision=createHash('sha256').update(command+'\0').update(fs.readFileSync(program)).digest('hex');
    this.requiredAction={runtime:id,subprocess:command,tool:id};
  }
  async execute(order:WorkOrder,_worker:DigitalWorker,owned:OwnedExecution,signal:AbortSignal):Promise<LabourExecutionResult>{
    const hash=createHash('sha256').update(this.command+'\0').update(fs.readFileSync(this.program)).digest('hex');
    if(hash!==this.revision)throw Error('labour_program_changed');
    const result=await owned.runProcess({command:this.command,args:[this.program],cwd:path.dirname(this.program),env:{PATH:path.dirname(this.command),LANG:'C.UTF-8'},input:JSON.stringify({jobType:order.jobType,input:order.input})+'\n',maxOutputBytes:65536},signal);
    let output:unknown=null;try{output=JSON.parse(result.stdout);}catch{}
    return {output,succeeded:result.exitCode===0&&output!==null,evidence:{pid:result.pid,exitCode:result.exitCode,signal:result.signal,programHash:this.revision,stdoutHash:createHash('sha256').update(result.stdout).digest('hex'),stderrHash:createHash('sha256').update(result.stderr).digest('hex')},externalCost:null,tokens:null,energyJoules:null};
  }
}
