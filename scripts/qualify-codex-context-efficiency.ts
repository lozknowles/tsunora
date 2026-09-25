import {spawnSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {LocalCodexNodeExecutionPort, type CodexNodeExecutionPort, type CodexStructuredExecutionResult} from '../src/control/codex-node-execution.js';
import {DirectRepositoryReviewExecutor} from '../src/control/direct-repository-review-executor.js';
import {ModelRegistry} from '../src/control/model-registry.js';
import {repositoryCodeReviewDefinition, REPOSITORY_REVIEW_INSTRUCTION} from '../src/control/repository-review-definition.js';
import {validateRepositoryReview} from '../src/control/repository-review-runtime.js';
import {TokenAwareBatonRuntime} from '../src/control/token-aware-baton-routing.js';
import {WorkParcelStore} from '../src/control/work-parcels.js';

interface Arguments {label: string; output: string; repository: string; reviewedSha: string; files: string[]; repetitions: number; accountEnvironment: string; model: string;}

async function main() {
  const args = argumentsFrom(process.argv.slice(2));
  const accountHome = process.env[args.accountEnvironment];
  if (!accountHome || !fs.existsSync(accountHome)) throw new Error('qualification_account_reference_unavailable');
  if (!path.isAbsolute(args.repository) || !fs.statSync(args.repository).isDirectory()) throw new Error('qualification_repository_invalid');
  const context = args.files.map(file => {
    const normalized = path.posix.normalize(file);
    if (normalized.startsWith('../') || path.isAbsolute(normalized)) throw new Error('qualification_file_invalid');
    const absolute = path.resolve(args.repository, normalized);
    if (!absolute.startsWith(`${path.resolve(args.repository)}${path.sep}`) || !fs.statSync(absolute).isFile()) throw new Error('qualification_file_invalid');
    return `\n===== ${normalized} =====\n${fs.readFileSync(absolute, 'utf8')}\n`;
  }).join('');
  const contextSha256 = sha256(context), at = new Date().toISOString();
  const account = {id:'controller-account-a',label:'Controller Account A',providerExecutionNodeId:'controller',credentialResidency:{nodeId:'controller',store:{type:'codex-home-env' as const,env:args.accountEnvironment}},capabilities:['codex-chatgpt'],qualification:{state:'QUALIFIED' as const,version:'physical-context-efficiency',checkedAt:at,qualifiedAt:at,capabilities:['codex-chatgpt','codex-chatgpt-authenticated'],evidence:['production-login-status']}};
  const provider = {id:'codex-chatgpt',name:'Codex ChatGPT',kind:'cli' as const,enabled:true,capabilities:['repository-review'],accountProfiles:[account]};
  const model = {id:'context-efficiency-review',provider:provider.id,providerModel:args.model,accountProfile:account.id,enabled:true,capabilities:['repository-review'],nodes:['controller'],limits:{contextTokens:32768,outputTokens:2048},qualification:{state:'QUALIFIED' as const,version:'physical-context-efficiency',qualifiedAt:at,capabilities:['repository-review'],nodes:['controller'],evidence:['production-account-qualification']}};
  const registry = new ModelRegistry([provider],[model],{defaultRole:'review.default',roles:{'review.default':{primary:model.id,requires:['repository-review']}}},undefined,undefined,process.env);
  const route = registry.route({model:model.id,nodeId:'controller',workloadNodeId:'controller',requiredCapabilities:['repository-review'],allowFallback:false});
  const delegate = new LocalCodexNodeExecutionPort(process.env, process.env.CODEX_COMMAND ?? 'codex'), executions: CodexStructuredExecutionResult[] = [], requestMetadata: Array<{promptSha256:string;promptBytes:number;schemaSha256:string}> = [];
  const observedPort: CodexNodeExecutionPort = {
    accountStatus: request => delegate.accountStatus(request),
    async execReadOnlyStructured(request) {
      requestMetadata.push({promptSha256:sha256(request.instruction),promptBytes:Buffer.byteLength(request.instruction),schemaSha256:sha256(stableJson(request.outputSchema))});
      const result = await delegate.execReadOnlyStructured(request); executions.push(result); return result;
    },
  };
  const accountStatus = await observedPort.accountStatus({provider,account,nodeId:'controller',timeoutMs:30_000});
  const root = path.dirname(args.output), parcels = new WorkParcelStore(path.join(root,'work-parcels.json')), routing = new TokenAwareBatonRuntime(path.join(root,'token-routing.json'));
  const executor = new DirectRepositoryReviewExecutor(registry,parcels,routing,undefined,undefined,observedPort);
  const records=[];
  for (let index=0;index<args.repetitions;index++) {
    const runId=randomUUID(), executionId=`repository-review:${runId}:${index+1}`, chunk={id:`matched-context-${contextSha256.slice(0,12)}`,content:context,files:[...args.files],sha256:contextSha256};
    const repository={identity:`matched:${args.reviewedSha}`,name:'immutable-matched-context',nodeId:'controller',requestedRef:args.reviewedSha,reviewedSha:args.reviewedSha,dirty:false,dirtyPaths:[],snapshotPath:args.repository,snapshotKind:'local-shared-clone' as const};
    const run={schema:'agent-control.job-run/v1' as const,id:runId,occurrenceId:randomUUID(),savedJobId:`context-efficiency-${args.label}`,definition:{...repositoryCodeReviewDefinition,budgets:{...repositoryCodeReviewDefinition.budgets,timeoutMinutes:10,maximumRetries:0,maximumInputTokens:12000,maximumOutputTokens:2048}},resolvedParameters:{node:'controller',repository:'immutable-matched-context',ref:args.reviewedSha,scope:'full'},trigger:{type:'manual' as const,actor:'physical-context-efficiency-qualification'},status:'RUNNING' as const,transitions:[{status:'RUNNING' as const,at:new Date().toISOString()}],requestedAt:new Date().toISOString(),startedAt:new Date().toISOString(),repository,modelRoute:route,context:{profile:'THIN' as const,files:[...args.files],changedFiles:[],omittedFiles:[],chunks:[{id:chunk.id,files:chunk.files,sha256:chunk.sha256}],truncated:false},workParcelIds:[],evidence:[],providerResponseIds:[],usage:{source:'unavailable' as const},errors:[],fallbackHistory:[],retryHistory:[],executionSequence:index+1,immutable:false};
    const response=await executor.execute({run,executionAttempt:index+1,executionId,route,instruction:REPOSITORY_REVIEW_INSTRUCTION,contextChunks:[chunk],maximumOutputTokens:2048,signal:new AbortController().signal});
    const validated=validateRepositoryReview(response.result,repository); executor.recordVerification(response.workParcelIds,validated.verdict);
    const parcel=parcels.get(response.workParcelIds[0])!, invocation=parcel.audit.invocations[0], native=executions[index];
    const thread=routing.thread(`${executionId}:${chunk.id}`);
    records.push({ordinal:index+1,runId,executionId,workParcelIds:response.workParcelIds,verdict:validated.verdict,findings:validated.findings.length,elapsedMs:invocation.elapsedMs,inputTokens:invocation.inputTokens??null,freshInputTokens:invocation.freshInputTokens,cachedInputTokens:invocation.cachedInputTokens,cacheWriteTokens:invocation.cacheWriteTokens??null,outputTokens:invocation.outputTokens,totalTokens:invocation.totalTokens,routingUsage:thread.latest.cumulative,context:{tokens:thread.latest.context.tokens,limitTokens:thread.latest.context.limitTokens,authority:thread.latest.context.authority,source:thread.latest.context.source,percent:thread.latest.contextPercent},governor:thread.governor,observedItemTypes:native.observedItemTypes,threadIdSha256:native.threadId?sha256(native.threadId):null,prompt:requestMetadata[index]});
  }
  const commandVersion=spawnSync(process.env.CODEX_COMMAND??'codex',['--version'],{encoding:'utf8'}), executable=spawnSync('which',[process.env.CODEX_COMMAND??'codex'],{encoding:'utf8'}).stdout.trim();
  const report={schema:'agent-control.codex-context-efficiency-qualification/v1',label:args.label,startedAt:at,completedAt:new Date().toISOString(),implementationCommit:gitHead(),providerId:provider.id,accountProfileId:account.id,nodeId:'controller',codexVersion:commandVersion.status===0?commandVersion.stdout.trim():'unavailable',executableSha256:executable&&fs.existsSync(executable)?sha256(fs.readFileSync(fs.realpathSync(executable))):'unavailable',accountQualified:accountStatus.authenticated,modelId:model.id,providerModel:model.providerModel,repository:{reviewedSha:args.reviewedSha,contextSha256,files:[...args.files]},conditions:{sessionPersistence:false,repetitions:args.repetitions,promptIdentical:requestMetadata.every(item=>item.promptSha256===requestMetadata[0].promptSha256&&item.schemaSha256===requestMetadata[0].schemaSha256)},records,summary:summarize(records),limitations:['Provider-reported cached input is observational; this run does not prove a cause for cache hits or misses.','Configured model pricing is intentionally absent, so monetary cost remains unknown rather than zero.']};
  const serialized=`${JSON.stringify(report,null,2)}\n`;
  if (/(?:auth\.json|access[_-]?token|refresh[_-]?token|bearer\s+|\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}|CODEX_HOME(?:_|\b)|[A-Za-z]:\\\\Users\\\\)/i.test(serialized)) throw new Error('qualification_evidence_secret_or_path_leak');
  fs.mkdirSync(root,{recursive:true,mode:0o700}); fs.writeFileSync(args.output,serialized,{mode:0o600});
  process.stdout.write(`${JSON.stringify({output:args.output,label:args.label,codexVersion:report.codexVersion,promptIdentical:report.conditions.promptIdentical,summary:report.summary},null,2)}\n`);
}

function argumentsFrom(values:string[]):Arguments { const map=new Map(values.map(value=>{const [key,...rest]=value.replace(/^--/,'').split('=');return[key,rest.join('=')];})); const required=(name:string)=>{const value=map.get(name);if(!value)throw new Error(`qualification_${name}_required`);return value;}; const repetitions=Number(map.get('repetitions')??3);if(!Number.isSafeInteger(repetitions)||repetitions<2||repetitions>10)throw new Error('qualification_repetitions_invalid');const files=required('files').split(',').filter(Boolean);if(!files.length)throw new Error('qualification_files_required');return{label:required('label'),output:path.resolve(required('output')),repository:path.resolve(required('repository')),reviewedSha:required('reviewed-sha'),files,repetitions,accountEnvironment:map.get('account-environment')??'CODEX_HOME_CONTROLLER_ACCOUNT_A',model:map.get('model')??'gpt-5.6-luna'}; }
function summarize(records:Array<{elapsedMs:number|null;inputTokens:number|null;freshInputTokens:number|null;cachedInputTokens:number|null;cacheWriteTokens:number|null;outputTokens:number|null;totalTokens:number|null}>) { const sum=(field:keyof (typeof records)[number])=>records.every(value=>typeof value[field]==='number')?records.reduce((total,value)=>total+(value[field] as number),0):null;return{runs:records.length,successful:records.length,totalElapsedMs:sum('elapsedMs'),totalInputTokens:sum('inputTokens'),totalFreshInputTokens:sum('freshInputTokens'),totalCachedInputTokens:sum('cachedInputTokens'),totalCacheWriteTokens:sum('cacheWriteTokens'),totalOutputTokens:sum('outputTokens'),totalTokens:sum('totalTokens'),warmFreshInputReduction:typeof records[0].freshInputTokens==='number'&&typeof records.at(-1)?.freshInputTokens==='number'?records[0].freshInputTokens!-records.at(-1)!.freshInputTokens!:null}; }
function sha256(value:string|Buffer){return createHash('sha256').update(value).digest('hex');}
function stableJson(value:unknown):string {if(Array.isArray(value))return`[${value.map(stableJson).join(',')}]`;if(value&&typeof value==='object')return`{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;return JSON.stringify(value);}
function gitHead(){const result=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'});return result.status===0?result.stdout.trim():'unavailable';}

main().catch(error=>{process.stderr.write(`${error instanceof Error?error.message:'qualification_failed'}\n`);process.exitCode=1;});
