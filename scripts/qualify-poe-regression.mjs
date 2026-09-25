import {ingestRegressionLine} from './poe-regression-progress.mjs';
import fs from 'node:fs';import path from 'node:path';import {spawn,execFileSync} from 'node:child_process';import {randomUUID} from 'node:crypto';
const output=process.env.POE_REGRESSION_OUTPUT;if(!output)throw new Error('POE_REGRESSION_OUTPUT must name an owner-selected evidence file');
if(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim())throw new Error('Commit the complete tested implementation before qualification');
const started=Date.now(),record={schema:'agent-control.poe-regression/v1',runId:randomUUID(),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),command:'npm run check',state:'RUNNING',phase:'Starting complete regression',passed:0,failed:0,skipped:0,total:null,remaining:null,startedAt:new Date(started).toISOString(),updatedAt:new Date(started).toISOString(),elapsedMs:0,phases:[]};
fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});let buffer='';const cursor={summary:false};
function publish(){record.updatedAt=new Date().toISOString();record.elapsedMs=Date.now()-started;record.remaining=record.total===null?null:Math.max(0,record.total-record.passed-record.failed-record.skipped);const temp=output+'.tmp';fs.writeFileSync(temp,JSON.stringify(record,null,2));fs.renameSync(temp,output);}
function line(raw){ingestRegressionLine(record,raw,cursor);publish();}
publish();const heartbeat=setInterval(publish,5000);
const child=spawn(process.platform==='win32'?'npm.cmd':'npm',['run','check'],{stdio:['ignore','pipe','pipe'],shell:process.platform==='win32',env:{...process.env,FORCE_COLOR:'0'}});
const log=fs.createWriteStream(output+'.log');for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{log.write(data);process.stdout.write(data);buffer+=data.toString();let index;while((index=buffer.indexOf('\n'))>=0){line(buffer.slice(0,index).trimEnd());buffer=buffer.slice(index+1);}});
child.on('error',()=>{record.state='FAILED';record.exitCode=-1;});
child.on('close',code=>{clearInterval(heartbeat);if(buffer)line(buffer);record.exitCode=code;record.state=code===0&&record.total!==null&&record.failed===0?'PASSED':'FAILED';record.endedAt=new Date().toISOString();publish();log.end();process.exitCode=code??1;});
