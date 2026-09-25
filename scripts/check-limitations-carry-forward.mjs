import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const STATUS=new Set(['OPEN','RESOLVED','PARTIALLY_RESOLVED','SUPERSEDED','ACCEPTED_LIMITATION','NEEDS_REQUALIFICATION','NOT_REPRODUCIBLE','EXTERNAL_BLOCKER']);
const closed=new Set(['RESOLVED','SUPERSEDED']);
export async function checkLimitationsCarryForward(previousPath,currentPath){
  const [previous,current]=await Promise.all([previousPath,currentPath].map(async value=>JSON.parse(await readFile(value,'utf8'))));
  const errors=[],fail=(condition,message)=>{if(!condition)errors.push(message)};
  fail(previous.schema===current.schema,'ledger schema changed without migration');
  const prior=new Map(previous.records.map(record=>[record.id,record])),now=new Map(current.records.map(record=>[record.id,record]));
  for(const [id,before] of prior){const after=now.get(id);fail(Boolean(after),`${id}: silently disappeared`);if(!after)continue;fail(after.originalWording===before.originalWording,`${id}: original wording changed`);fail(after.firstReleaseObserved===before.firstReleaseObserved,`${id}: first release changed`);fail(after.firstEvidenceReference===before.firstEvidenceReference,`${id}: first evidence changed`);fail(STATUS.has(after.currentStatus),`${id}: uncontrolled status`);if(closed.has(after.currentStatus)){fail(Boolean(after.resolutionRelease),`${id}: closed without resolution release`);fail(after.resolutionEvidence?.length>0,`${id}: closed without resolution evidence`);fail(!['NOT_QUALIFIED','PARTIAL'].includes(after.qualification?.physical)||before.qualification?.physical==='NOT_APPLICABLE',`${id}: physical limitation closed without physical evidence`);}}
  const priorMax=Math.max(...prior.keys().map(id=>Number(id.slice(-4)))),newRecords=current.records.filter(record=>!prior.has(record.id));newRecords.forEach((record,index)=>{fail(record.id===`AC-LIM-${String(priorMax+index+1).padStart(4,'0')}`,`${record.id}: new IDs are not append-only`);fail(STATUS.has(record.currentStatus),`${record.id}: uncontrolled new status`);fail(record.evidenceReferences?.length>0,`${record.id}: new limitation lacks evidence`);});
  return{errors,previous,current,newRecords};
}

if(import.meta.url===pathToFileURL(process.argv[1]??'').href){const previous=process.argv[2],current=process.argv[3];if(!previous||!current)throw Error('usage: node scripts/check-limitations-carry-forward.mjs <previous.json> <current.json>');const result=await checkLimitationsCarryForward(previous,current);if(result.errors.length){console.error(result.errors.map(item=>`- ${item}`).join('\n'));process.exitCode=1}else console.log(`limitations carry-forward valid: ${result.previous.records.length} inherited, ${result.newRecords.length} new, ${result.current.records.length} accounted`);}
