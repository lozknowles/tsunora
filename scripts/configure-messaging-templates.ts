import fs from 'node:fs';
import path from 'node:path';
import {JobCatalog} from '../src/control/job-catalog.js';
import {definitionHash} from '../src/control/messaging-commands.js';
import {openwaConfigSchema} from '../src/control/openwa.js';
import {loadConfig} from '../src/control/config.js';
import {savedMessagingTemplateHash} from '../src/control/messaging-saved-jobs.js';
import type {AgentControlService} from '../src/control/application-service.js';
const file=process.env.AGENT_CONTROL_OPENWA_CONFIG;
if(!file)throw new Error('AGENT_CONTROL_OPENWA_CONFIG_required');
const config=openwaConfigSchema.parse(JSON.parse(fs.readFileSync(file,'utf8'))), controller=loadConfig();
const savedId=process.argv.find(value=>value.startsWith('--saved-review='))?.slice('--saved-review='.length);
if(savedId){
  if(config.templates.some(template=>template.name==='repository-review'))throw new Error('review_template_already_configured_review_manually');
  const base=new URL(config.dashboardUrl),token=process.env.AGENT_CONTROL_WEB_OPERATOR_TOKEN;
  if(!['127.0.0.1','localhost','[::1]'].includes(base.hostname)||!token)throw new Error('authenticated_loopback_dashboard_required');
  const get=async(route:string)=>{const response=await fetch(new URL(route,base),{headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(5000)});if(!response.ok)throw new Error('dashboard_read_failed');return response.json();};
  const job=await get(`/api/saved-jobs/${encodeURIComponent(savedId)}/export`);
  if(job.definition.id!=='repository-code-review'||!job.enabled)throw new Error('enabled_repository_review_required');
  const definition=await get(`/api/job-definitions/${encodeURIComponent(job.definition.id)}/${job.definition.version}`);
  const service={exportSavedJob:()=>job,jobDefinition:()=>definition} as Pick<AgentControlService,'exportSavedJob'|'jobDefinition'>;
  config.templates.push({kind:'saved',name:'repository-review',jobId:savedId,definitionHash:savedMessagingTemplateHash(service,savedId),parameters:{},arguments:{},maxActive:1,maxRunsPerHour:6});
  fs.writeFileSync(file,JSON.stringify(config,null,2)+'\n',{mode:0o600,flush:true});
  process.stdout.write('Approved the pinned saved review configuration. Restart the adapter and grant it separately in the dashboard. Provider readiness remains governed by the runtime.\n');
  process.exit(0);
}
const root=fs.realpathSync(process.cwd());
if(!(controller.jobs?.repositoryRoots??[]).some(p=>fs.realpathSync(p)===root))throw new Error('current_repository_must_be_explicitly_approved');
const catalog=new JobCatalog().loadDirectory(path.resolve('config/jobs')).loadDirectory(path.resolve('docs/openwa/jobs'));
const liveness=catalog.job('dashboard-running-state-qualification@1.0.0')!,tests=catalog.job('repository-tests@1.0.0')!;
if(config.templates.length)throw new Error('templates_already_configured_review_manually');
config.templates=[
  {name:'liveness',jobId:liveness.metadata.id,definitionHash:definitionHash(liveness),parameters:{durationSeconds:20},arguments:{durationSeconds:[5,20,60]},maxActive:1,maxRunsPerHour:6},
  {name:'test-execution',jobId:tests.metadata.id,definitionHash:definitionHash(tests),parameters:{repositoryPath:root,suite:'typecheck'},arguments:{suite:['typecheck','messaging']},maxActive:1,maxRunsPerHour:6},
];
fs.writeFileSync(file,JSON.stringify(config,null,2)+'\n',{mode:0o600});
process.stdout.write('Configured bounded liveness and repository test templates. Human grants remain empty.\n');
