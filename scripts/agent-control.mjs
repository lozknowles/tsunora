#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {formatAuthoritativeStatus, readAuthoritativeStatus, statusExitCode, StatusClientError} from './status-client.mjs';
import {doctorCommand} from './doctor.mjs';

const packageVersion = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const usage = `Agent Control command line

Usage:
  agent-control --version
  agent-control doctor [--json]
  agent-control status [--json]
  agent-control acp
  agent-control acp-remote
  agent-control providers credential set|status|revoke PROVIDER_ID [--account PROFILE_ID]
  agent-control jobs definitions [definition-id]
  agent-control jobs saved [saved-job-id]
  agent-control jobs schedules
  agent-control jobs runs [run-id] [--saved-job ID]
  agent-control jobs create --definition ID --name NAME --node NODE --repository PATH [options]
  agent-control jobs import --file FILE
  agent-control jobs export SAVED-JOB-ID
  agent-control jobs run SAVED-JOB-ID
  agent-control jobs enable|disable SAVED-JOB-ID --revision N
  agent-control jobs update SAVED-JOB-ID --revision N --file FILE
  agent-control jobs cancel RUN-ID
  agent-control benchmark definition|run [--spec SHA256]
  agent-control benchmark status|cancel|resume-plan RUN-ID
  agent-control benchmark resume RUN-ID --request-key KEY --expires-at ISO-TIMESTAMP
  agent-control security-audit start --repository PATH --revision SHA [--scope PATH]
  agent-control security-audit resume AUDIT-ID --source-root PATH
  agent-control security-audit coverage|findings|rejected|unresolved|export AUDIT-ID [options]
  agent-control security-audit compare LEFT-ID RIGHT-ID
  agent-control security-audit revalidate AUDIT-ID --revision SHA [--changed FILE,FILE]
  agent-control workspace list [--json]
  agent-control workspace open WORKSPACE-ID [--json]
  agent-control open job RUN-ID [--json]
  agent-control routing explain --policy economy|balanced|fast-capped --provider PROVIDER_ID [--model MODEL_ID] --input-tokens N --output-tokens N [--job-spent USD]

The status command reads the same authoritative projection as the web dashboard.
It uses the controller-local endpoint by default or the configured SSH transport
from the node's status-client configuration.

Job reads use AGENT_CONTROL_WEB_URL (default http://127.0.0.1:4310). Mutations
use AGENT_CONTROL_WEB_OPERATOR_TOKEN only as an Authorization header.

The acp command serves stable ACP v1 as newline-delimited JSON-RPC over stdio.
It admits the pre-registered AGENT_CONTROL_ACP_ACTOR_ID (default web-operator).`;

export async function main(argv = process.argv.slice(2), io = {out: console.log, error: console.error}) {
  const command = argv[0];
  if (command === 'doctor') return doctorCommand(argv.slice(1), io);
  if (command === '--help' || command === '-h') { io.out(usage); return 0; }
  if (command === '--version' || command === '-v') { io.out(`agent-control ${packageVersion}`); return 0; }
  if (command === 'acp' || command === 'acp-remote') return argv.length === 1 ? runTypeScriptCommand(command === 'acp' ? 'acp.ts' : 'acp-remote.ts') : (io.error(usage), 2);
  if (command === 'providers' && argv[1] === 'credential') return runTypeScriptCommand('provider-credential.ts', argv.slice(2));
  if (command === 'jobs') return jobsCommand(argv.slice(1), io);
  if (command === 'benchmark') return benchmarkCommand(argv.slice(1),io);
  if (command === 'security-audit') return securityAuditCommand(argv.slice(1),io);
  if (command === 'workspace') return workspaceCommand(argv.slice(1),io);
  if (command === 'routing') return routingCommand(argv.slice(1),io);
  if (command === 'open' && argv[1] === 'job') {
    if (!argv[2]) { io.error(usage); return 2; }
    return workspaceCommand(['open',workspaceReference('RUN',[argv[2]]),...argv.slice(3)],io);
  }
  if (command !== 'status') { io.error(usage); return 2; }
  const flags = new Set(argv.slice(1));
  if ([...flags].some(flag => !['--json'].includes(flag))) { io.error(usage); return 2; }
  try {
    const result = await readAuthoritativeStatus();
    io.out(flags.has('--json') ? JSON.stringify(result.snapshot, null, 2) : formatAuthoritativeStatus(result.snapshot, result.source).trimEnd());
    return statusExitCode(result.snapshot);
  } catch (error) {
    const item = error instanceof StatusClientError ? error : new StatusClientError('STATUS_FAILED', error instanceof Error ? error.message : String(error));
    if (flags.has('--json')) io.out(JSON.stringify({schema: 'agent-control.status-error/v1', result: 'UNREACHABLE', error: item.code, detail: item.message}, null, 2));
    else io.error(`AGENT CONTROL UNREACHABLE\n${item.code}: ${item.message}`);
    return 2;
  }
}

export async function securityAuditCommand(argv,io={out:console.log,error:console.error},environment=process.env,fetcher=fetch){
 try{
  const [operation,id,second]=argv,options=parseOptions(argv.slice(operation==='start'?1:operation==='compare'?3:2));let pathname='/api/security-audits',body;
  if(operation==='start'){const repository=required(options.repository,'--repository'),revision=required(options.revision,'--revision');body={repositoryRoot:repository,sourceRevision:revision,...(options.scope?{scope:String(options.scope).split(',').map(value=>value.trim()).filter(Boolean)}:{})};}
  else if(operation==='compare'&&id&&second){pathname=`/api/security-audit-comparison?left=${encodeURIComponent(id)}&right=${encodeURIComponent(second)}`;}
  else if(operation==='resume'&&id){pathname+=`/${encodeURIComponent(id)}/resume`;body={sourceRoot:required(options['source-root'],'--source-root')};}
  else if(operation==='coverage'&&id)pathname+=`/${encodeURIComponent(id)}/coverage`;
  else if(['findings','rejected','unresolved'].includes(operation)&&id){const verdict=operation==='rejected'?'rejected':operation==='unresolved'?'needs_validation':options.verdict;pathname+=`/${encodeURIComponent(id)}/findings${verdict?`?verdict=${encodeURIComponent(verdict)}`:''}`;}
  else if(operation==='export'&&id){pathname+=`/${encodeURIComponent(id)}/export?report=${encodeURIComponent(String(options.report??'report'))}`;}
  else if(operation==='revalidate'&&id){pathname+=`/${encodeURIComponent(id)}/revalidate`;body={sourceRevision:required(options.revision,'--revision'),changedFiles:String(options.changed??'').split(',').map(value=>value.trim()).filter(Boolean)};}
  else throw Error('Invalid security-audit command');
  const value=await securityAuditRequest(pathname,body,environment,fetcher);io.out(JSON.stringify(value,null,2));return 0;
 }catch(error){io.error(error instanceof Error?error.message:String(error));return 2;}
}
async function securityAuditRequest(pathname,body,environment=process.env,fetcher=fetch){const url=jobsBaseUrl(environment),query=pathname.indexOf('?');url.pathname=query<0?pathname:pathname.slice(0,query);url.search=query<0?'':pathname.slice(query);const token=environment.AGENT_CONTROL_WEB_OPERATOR_TOKEN?.trim();if(!token)throw Error('AGENT_CONTROL_WEB_OPERATOR_TOKEN is required for Security Audit access');const response=await fetcher(url,{method:body===undefined?'GET':'POST',headers:{Accept:'application/json',Authorization:`Bearer ${token}`,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});const result=await response.json().catch(()=>({error:`HTTP ${response.status}`}));if(!response.ok)throw Error(result.detail||result.error||`HTTP ${response.status}`);return result;}

export async function workspaceCommand(argv,io={out:console.log,error:console.error},environment=process.env,fetcher=fetch){
  const [operation,id,...rest]=argv,flags=new Set(id?.startsWith('--')?[id,...rest]:rest);if([...flags].some(flag=>flag!=='--json')){io.error(usage);return 2;}
  try{let value;if(operation==='list'&&(!id||id==='--json'))value=await workspaceRequest('/api/workspaces',environment,fetcher);else if(operation==='open'&&id&&!id.startsWith('--'))value=await workspaceRequest(`/api/workspaces/${encodeURIComponent(id)}`,environment,fetcher);else{io.error(usage);return 2;}io.out(flags.has('--json')||id==='--json'?JSON.stringify(value,null,2):formatWorkspace(value));return 0;}catch(error){io.error(error instanceof Error?error.message:String(error));return 2;}
}
export async function routingCommand(argv,io={out:console.log,error:console.error},environment=process.env,fetcher=fetch){
  try{const [operation,...rest]=argv;if(operation!=='explain')throw Error('Use routing explain');const options=parseOptions(rest),strategy=required(options.policy,'--policy');if(!['economy','balanced','fast-capped'].includes(strategy))throw Error('--policy must be economy, balanced or fast-capped');const body={strategy,providerId:required(options.provider,'--provider'),...(options.model?{modelId:String(options.model)}:{}),inputTokensEstimated:requiredInteger(options['input-tokens'],'--input-tokens'),outputTokensRequested:requiredInteger(options['output-tokens'],'--output-tokens'),...(options['job-spent']===undefined?{}:{jobSpentUsd:optionalNumber(options['job-spent'],'--job-spent')})};const value=await jobsRequest('/api/routing/cost-performance/explain',body,environment,fetcher);io.out(JSON.stringify(value,null,2));return 0;}catch(error){io.error(error instanceof Error?error.message:String(error));return 2;}
}
function workspaceReference(kind,parts){return`acw1.${kind}.${Buffer.from(JSON.stringify(parts)).toString('base64url')}`;}
function formatWorkspace(value){const path=(value.breadcrumbs??[]).map(item=>item.label).join(' > '),children=(value.children??[]).map(item=>`  ${item.kind.padEnd(11)} ${item.label} [${item.status}]`).join('\n'),caps=(value.capabilities??[]).map(item=>`${item.id}:${item.state}`).join(' · ');return`${value.label} [${value.mode} / ${value.status}]\n${path}\n${children||'  No child workspaces'}\nCapabilities: ${caps}\nDashboard: ${value.targets?.dashboard??'unavailable'}\nEvidence: ${value.targets?.history??'unavailable'}`;}
async function workspaceRequest(pathname,environment=process.env,fetcher=fetch){const url=jobsBaseUrl(environment);url.pathname=pathname;const token=environment.AGENT_CONTROL_WEB_OPERATOR_TOKEN?.trim();if(!token)throw Error('AGENT_CONTROL_WEB_OPERATOR_TOKEN is required for Workspace reads');const response=await fetcher(url,{headers:{Accept:'application/json',Authorization:`Bearer ${token}`}}),result=await response.json().catch(()=>({error:`HTTP ${response.status}`}));if(!response.ok)throw Error(result.detail||result.error||`HTTP ${response.status}`);return result;}

/** Thin authenticated client; all target operations remain in the product JobRuntime. */
export async function benchmarkCommand(argv,io={out:console.log,error:console.error},environment=process.env,fetcher=fetch){
 try{
  const [operation,id,hash]=argv;let pathname,body;
  if(operation==='definition'&&argv.length===1)pathname='/api/jobs/model-hardware-qualification';
  else if(operation==='run'&&(argv.length===1||(argv.length===3&&id==='--spec'&&/^[a-f0-9]{64}$/.test(hash)))){pathname='/api/jobs/model-hardware-qualification/run';body={parameters:hash?{specSha256:hash}:{},actor:'cli-operator'};}
  else if(operation==='resume'&&argv.length===6&&argv[2]==='--request-key'&&argv[4]==='--expires-at'&&/^run-[a-zA-Z0-9-]+$/.test(id)){pathname='/api/runs/'+encodeURIComponent(id)+'/resume';body={requestKey:argv[3],expiresAt:argv[5]};}
  else if(operation==='resume-plan'&&argv.length===2&&/^run-[a-zA-Z0-9-]+$/.test(id)){pathname='/api/runs/'+encodeURIComponent(id)+'/resume';}
  else if(['status','cancel'].includes(operation)&&argv.length===2&&/^run-[a-zA-Z0-9-]+$/.test(id)){pathname='/api/runs/'+encodeURIComponent(id)+(operation==='cancel'?'/cancel':'');if(operation==='cancel')body={actor:'cli-operator'};}
  else throw Error('Use benchmark definition|run [--spec SHA256] or status|cancel|resume-plan RUN-ID or resume RUN-ID --request-key KEY --expires-at ISO-TIMESTAMP');
  const url=jobsBaseUrl(environment);url.pathname=pathname;url.search='';url.hash='';
  const token=environment.AGENT_CONTROL_WEB_OPERATOR_TOKEN?.trim();if(!token)throw Error('AGENT_CONTROL_WEB_OPERATOR_TOKEN is required');
  const response=await fetcher(url,{method:body?'POST':'GET',redirect:'error',headers:{Accept:'application/json',Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const value=await response.json();if(!response.ok)throw Error('Benchmark API returned HTTP '+response.status);io.out(JSON.stringify(value,null,2));return 0;
 }catch(error){io.error(error instanceof Error?error.message:'Benchmark request failed');return 2;}
}

async function runTypeScriptCommand(filename, args = []) {
  const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src', filename);
  const tsx = createRequire(import.meta.url).resolve('tsx');
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', tsx, script, ...args], {stdio: 'inherit', env: process.env});
    child.once('error', reject); child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

async function jobsCommand(argv, io) {
  const [operation, id] = argv, options = parseOptions(argv.slice(id && !id.startsWith('--') ? 2 : 1));
  try {
    let result;
    if (operation === 'definitions') result = await jobsRequest(id ? `/api/job-definitions/${encodeURIComponent(id)}` : '/api/job-definitions');
    else if (operation === 'saved') result = await jobsRequest(id ? `/api/saved-jobs/${encodeURIComponent(id)}` : '/api/saved-jobs');
    else if (operation === 'schedules') result = await jobsRequest('/api/job-schedules');
    else if (operation === 'runs') result = await jobsRequest(id ? `/api/job-runs/${encodeURIComponent(id)}` : `/api/job-runs${options['saved-job'] ? `?savedJobId=${encodeURIComponent(options['saved-job'])}` : ''}`);
    else if (operation === 'export' && id) result = await jobsRequest(`/api/saved-jobs/${encodeURIComponent(id)}/export`);
    else if (operation === 'run' && id) result = await jobsRequest(`/api/saved-jobs/${encodeURIComponent(id)}/run`, {});
    else if (operation === 'cancel' && id) result = await jobsRequest(`/api/job-runs/${encodeURIComponent(id)}/cancel`, {});
    else if ((operation === 'enable' || operation === 'disable') && id) result = await jobsRequest(`/api/saved-jobs/${encodeURIComponent(id)}/${operation}`, {revision: requiredInteger(options.revision, '--revision')});
    else if (operation === 'import') result = await jobsRequest('/api/saved-jobs', readJsonFile(required(options.file, '--file')));
    else if (operation === 'update' && id) result = await jobsRequest(`/api/saved-jobs/${encodeURIComponent(id)}`, {revision: requiredInteger(options.revision, '--revision'), changes: readJsonFile(required(options.file, '--file'))});
    else if (operation === 'create') result = await jobsRequest('/api/saved-jobs', createSavedJobPayload(options));
    else { io.error(usage); return 2; }
    io.out(JSON.stringify(result, null, 2)); return 0;
  } catch (error) { io.error(error instanceof Error ? error.message : String(error)); return 2; }
}

function parseOptions(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index++) { const key = argv[index]; if (!key.startsWith('--')) throw new Error(`unexpected argument: ${key}`); const next = argv[index + 1]; if (!next || next.startsWith('--')) values[key.slice(2)] = true; else { values[key.slice(2)] = next; index++; } }
  return values;
}
function required(value, label) { if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`); return value.trim(); }
function requiredInteger(value, label) { const number = Number(value); if (!Number.isSafeInteger(number) || number < 1) throw new Error(`${label} must be a positive integer`); return number; }
function optionalNumber(value, label) { if (value === undefined) return undefined; const number = Number(value); if (!Number.isFinite(number) || number < 0) throw new Error(`${label} must be a non-negative number`); return number; }
function readJsonFile(file) { const value = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Saved Job file must contain one JSON object'); return value; }
function createSavedJobPayload(options) {
  const name = required(options.name, '--name'), definition = required(options.definition, '--definition'), node = required(options.node, '--node'), repository = required(options.repository, '--repository');
  const id = typeof options.id === 'string' ? options.id : name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64), explicitModel = typeof options.model === 'string' ? options.model : undefined, cron = typeof options.schedule === 'string' ? options.schedule : undefined, maxCost = optionalNumber(options['max-cost'], '--max-cost');
  return {id, name, definition: {id: definition, version: Number(options['definition-version'] ?? 1), follow: options.pinned ? 'pinned' : 'latest-compatible'}, parameters: {node, repository, ref: options.ref ?? 'main', scope: options.scope ?? 'changes', ...(options['compare-against'] ? {compareAgainst: options['compare-against']} : {})}, routing: explicitModel ? {model: explicitModel, allowFallback: false} : {modelRole: options['model-role'] ?? 'review.default', allowFallback: options['no-fallback'] !== true}, contextProfile: options.context ?? 'STANDARD', budgets: {timeoutMinutes: Number(options.timeout ?? 90), maximumRetries: Number(options.retries ?? 1), maximumInputTokens: Number(options['max-input-tokens'] ?? 120000), maximumOutputTokens: Number(options['max-output-tokens'] ?? 65536), ...(maxCost === undefined ? {} : {maxCost})}, ...(cron ? {schedule: {kind: 'cron', cron, timezone: options.timezone ?? 'Europe/London', enabled: true, missedRunPolicy: options['missed-run-policy'] ?? 'run-once-immediately'}} : {}), concurrency: options.concurrency ?? 'forbid-overlap', enabled: true};
}
function jobsBaseUrl(environment = process.env) {
  const value = environment.AGENT_CONTROL_WEB_URL || `http://127.0.0.1:${environment.AGENT_CONTROL_WEB_PORT || 4310}`; let url;
  try { url = new URL(value); } catch { throw new Error('AGENT_CONTROL_WEB_URL is invalid'); }
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error('AGENT_CONTROL_WEB_URL must be HTTP(S) without embedded credentials');
  if (url.protocol === 'http:' && !['127.0.0.1','localhost','[::1]'].includes(url.hostname.toLowerCase())) throw new Error('cleartext AGENT_CONTROL_WEB_URL must remain loopback-local');
  return url;
}
async function jobsRequest(pathname, body, environment = process.env, fetcher = fetch) {
  const url = jobsBaseUrl(environment); url.pathname = pathname.split('?')[0]; url.search = pathname.includes('?') ? pathname.slice(pathname.indexOf('?')) : '';
  const mutation = body !== undefined, token = environment.AGENT_CONTROL_WEB_OPERATOR_TOKEN?.trim(); if (mutation && !token) throw new Error('AGENT_CONTROL_WEB_OPERATOR_TOKEN is required for Job mutations');
  const response = await fetcher(url, {method: mutation ? 'POST' : 'GET', headers: {Accept:'application/json', ...(mutation ? {'Content-Type':'application/json',Authorization:`Bearer ${token}`} : {})}, ...(mutation ? {body:JSON.stringify({...body,actor:'cli-operator'})} : {})});
  const result = await response.json().catch(()=>({error:`HTTP ${response.status}`})); if (!response.ok) throw new Error(result.detail||result.error||`HTTP ${response.status}`); return result;
}

function isEntrypoint() {
  if (!process.argv[1]) return false;
  try { return fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1]); }
  catch { return fileURLToPath(import.meta.url) === path.resolve(process.argv[1]); }
}

if (isEntrypoint()) process.exitCode = await main();
