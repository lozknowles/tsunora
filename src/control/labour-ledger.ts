import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import type {LabourEvent} from './labour-types.js';

export const labourHash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Single writer, append-only interface, fsync-before-dispatch. External anchoring is not claimed. */
export class LabourLedger {
  private rows:LabourEvent[]=[];
  private fd:number;
  private lockFd:number;
  constructor(readonly file:string){
    fs.mkdirSync(path.dirname(file),{recursive:true});
    this.lockFd=fs.openSync(file+'.lock','wx',0o600);
    try {
      fs.writeSync(this.lockFd,JSON.stringify({pid:process.pid,createdAt:new Date().toISOString()}));
      if(fs.existsSync(file)){
        const raw=fs.readFileSync(file,'utf8');
        if(raw&&!raw.endsWith('\n'))throw Error('labour_ledger_incomplete_tail');
        for(const line of raw.split('\n').filter(Boolean)){
          const event=JSON.parse(line) as LabourEvent,{hash,...body}=event;
          if(event.sequence!==this.rows.length+1||event.previousHash!==(this.rows.at(-1)?.hash??'GENESIS')||hash!==labourHash(body))throw Error('labour_ledger_integrity_failed');
          this.rows.push(event);
        }
      }
      this.fd=fs.openSync(file,'a',0o600);
    }catch(error){fs.closeSync(this.lockFd);fs.unlinkSync(file+'.lock');throw error;}
  }
  events(){return structuredClone(this.rows);}
  append(kind:string,data:unknown){
    const body={sequence:this.rows.length+1,at:new Date().toISOString(),kind,data:structuredClone(data),previousHash:this.rows.at(-1)?.hash??'GENESIS'};
    const event={...body,hash:labourHash(body)};
    fs.writeSync(this.fd,JSON.stringify(event)+'\n');fs.fsyncSync(this.fd);this.rows.push(event);return structuredClone(event);
  }
  close(){fs.closeSync(this.fd);fs.closeSync(this.lockFd);fs.unlinkSync(this.file+'.lock');}
}
