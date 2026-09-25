import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {ActionRegistry,createJobRuntime,WorkerRegistry} from '../src/control/job-runtime.js';
import {JobCatalog} from '../src/control/job-catalog.js';
import {registerSecurityAudit} from '../src/control/security-audit-job.js';
import {SecurityAuditRuntime,SecurityAuditStore} from '../src/control/security-audit.js';

const repository=path.resolve(process.argv[2]??'.'),stateRoot=path.resolve(process.argv[3]??'.agent-control-security-audit-qualification'),evidenceRoot=path.resolve(process.argv[4]??'docs/evidence/security-audit-v4.9');
const revision=execFileSync('git',['-C',repository,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
const actions=new ActionRegistry(),catalog=new JobCatalog(actions.ids()),workers=new WorkerRegistry(),jobRuntime=createJobRuntime(stateRoot,catalog,actions,workers),securityAudits=new SecurityAuditRuntime(new SecurityAuditStore(path.join(stateRoot,'security-audits')),[repository]);
registerSecurityAudit(jobRuntime,securityAudits);
const audit=securityAudits.start({repositoryRoot:repository,scope:['src','scripts','assets','android'],sourceRevision:revision,actor:'qualification-operator'}),run=jobRuntime.createRun('security-audit@1.0.0',{auditId:audit.id},{type:'manual',actor:'qualification-operator'});
securityAudits.linkRun(audit.id,run.id);
for(let index=0;index<16&&!['SUCCEEDED','FAILED','DEGRADED','CANCELLED'].includes(jobRuntime.ledger.get(run.id)?.status??'');index++)await jobRuntime.tick();
const result=jobRuntime.ledger.get(run.id),record=securityAudits.get(audit.id);if(result?.status!=='SUCCEEDED'||record.status!=='COMPLETE'||!record.jobRunIds.includes(run.id))throw Error(`security_audit_qualification_failed:${result?.status}:${record.status}:${record.jobRunIds.includes(run.id)}`);
fs.mkdirSync(evidenceRoot,{recursive:true});for(const entry of Object.values(record.artifacts)){const destination=path.join(evidenceRoot,path.basename(entry.path));fs.copyFileSync(entry.path,destination);}
const historicalFile=path.join(repository,'docs/evidence/agent-control-3.8.1-final-glm-review.json'),historical=JSON.parse(fs.readFileSync(historicalFile,'utf8'));
const receipt={schema:'agent-control.security-audit-qualification/v1',sourceRevision:revision,auditId:audit.id,runId:run.id,runStatus:result.status,phases:result.steps.map(step=>({id:step.id,status:step.status,action:step.action,attempts:step.attempts.length})),provenance:record.provenance,sandbox:record.sandbox,coverage:{units:record.coverage.length,files:record.coverage.reduce((sum,unit)=>sum+unit.sourceFiles.length,0),statuses:Object.fromEntries(['covered','partial','blocked','unreviewed'].map(status=>[status,record.coverage.filter(unit=>unit.status===status).length]))},findings:{confirmed:record.findings.filter(item=>item.verdict==='confirmed').length,needsValidation:record.findings.filter(item=>item.verdict==='needs_validation').length,rejected:record.findings.filter(item=>item.verdict==='rejected').length},independence:{selfVerified:record.findings.filter(item=>item.finder.invocationId===item.verification.verifier.invocationId).length,grades:[...new Set(record.findings.map(item=>item.verification.independence))]},historicalComparison:{source:'docs/evidence/agent-control-3.8.1-final-glm-review.json',provenance:'HISTORICAL_INDEPENDENT_SOURCE_REVIEW_UNCHANGED',schema:historical.schema,status:historical.status,reviewedCommit:historical.reviewedCommit,invocations:Array.isArray(historical.invocations)?historical.invocations.length:null,note:'The historical record is compared but is not relabelled as a native security-audit run.'},artifacts:Object.fromEntries(Object.entries(record.artifacts).map(([key,value])=>[key,{sha256:value.sha256,file:path.basename(value.path)}]))};
fs.writeFileSync(path.join(evidenceRoot,'qualification-receipt.json'),`${JSON.stringify(receipt,null,2)}\n`,{mode:0o600});process.stdout.write(`${JSON.stringify(receipt,null,2)}\n`);
