// Native benchmark qualification client. It only configures the controller,
// submits one registered Job, waits, and exports durable state.
import fs from 'node:fs';
import path from 'node:path';
import {JobCatalog} from '../src/control/job-catalog.js';
import {ActionRegistry,createJobRuntime,WorkerRegistry} from '../src/control/job-runtime.js';
import {MemoryHarnessEfficiencyLedger} from '../src/control/harness-efficiency.js';
import {registerNonOpenAiCacheQualificationActions} from '../src/control/non-openai-cache-qualification.js';

function required(name:string){const value=process.env[name]?.trim();if(!value)throw new Error(`missing_${name}`);return value;}
const state=path.resolve(required('AC_NATIVE_BENCHMARK_STATE'));
if(fs.existsSync(state))throw new Error('native_benchmark_state_must_be_fresh');
fs.mkdirSync(state,{recursive:true,mode:0o700});
const taskId=required('AC_NATIVE_BENCHMARK_TASK'),profile=required('AC_NATIVE_BENCHMARK_PROFILE');
const providerId=process.env.AC_NATIVE_BENCHMARK_PROVIDER?.trim()||'local-model-native';
const nodeId=required('AC_NATIVE_BENCHMARK_NODE_ID');
const modelId=required('AGENT_CONTROL_NON_OPENAI_CACHE_MODEL');
const efficiency=new MemoryHarnessEfficiencyLedger();
const actions=registerNonOpenAiCacheQualificationActions(new ActionRegistry(),efficiency,process.env);
const catalog=new JobCatalog(actions.ids()).loadDirectory(path.resolve('config/cache-qualification-jobs'));
const workers=new WorkerRegistry().register({id:'native-benchmark-worker',capabilities:['model.execute','structured-output','tool-request','repository.mutation.typed','repository.verify.public'],health:'healthy',capacity:1,active:0,observedAt:new Date().toISOString()});
const runtime=createJobRuntime(state,catalog,actions,workers,{efficiency});
const trigger={type:'manual' as const,actor:'human:authorised-native-benchmark',modelRoute:{requestedModel:modelId,requestedRole:'coding-benchmark',modelId,providerId,providerModel:`${providerId}/${modelId}`,nodeId,credentialNodeId:null,qualificationVersion:'native-benchmark-v1',fallback:false,fallbackReason:null}};
const observationTimeoutMs=process.env.AC_NATIVE_BENCHMARK_OBSERVATION_TIMEOUT_MS===undefined?undefined:Number(process.env.AC_NATIVE_BENCHMARK_OBSERVATION_TIMEOUT_MS);
const budgetNumber=(name:string)=>process.env[name]===undefined?undefined:Number(process.env[name]);
const parameters={taskId,profile,prefixVariant:process.env.AC_NATIVE_BENCHMARK_PREFIX||'stable',runtimeBudgetMode:process.env.AC_NATIVE_BENCHMARK_RUNTIME_BUDGET_MODE||'governed',...(observationTimeoutMs===undefined?{}:{observationTimeoutMs}),...Object.fromEntries([['absoluteJobDeadlineMs',budgetNumber('AC_NATIVE_BENCHMARK_ABSOLUTE_JOB_MS')],['modelCallDeadlineMs',budgetNumber('AC_NATIVE_BENCHMARK_MODEL_CALL_MS')],['toolCallDeadlineMs',budgetNumber('AC_NATIVE_BENCHMARK_TOOL_CALL_MS')],['noProgressDeadlineMs',budgetNumber('AC_NATIVE_BENCHMARK_NO_PROGRESS_MS')]].filter((entry):entry is [string,number]=>entry[1]!==undefined))};
const run=runtime.createRun('native-mutation-benchmark@1.0.0',parameters,trigger);
fs.writeFileSync(path.join(state,'submission.json'),JSON.stringify({taskId,profile,observationTimeoutMs:observationTimeoutMs??null,runtimeBudgetMode:parameters.runtimeBudgetMode,runtimeBudgetOverrides:{absoluteJobDeadlineMs:parameters.absoluteJobDeadlineMs??null,modelCallDeadlineMs:parameters.modelCallDeadlineMs??null,toolCallDeadlineMs:parameters.toolCallDeadlineMs??null,noProgressDeadlineMs:parameters.noProgressDeadlineMs??null},job:`${run.jobId}@${run.jobVersion}`,runId:run.id,trigger},null,2),{mode:0o600,flag:'wx'});
const terminal=new Set(['SUCCEEDED','FAILED','DEGRADED','CANCELLED','CLEANUP_UNCERTAIN','BLOCKED']);
for(let steps=0;steps<8&&!terminal.has(runtime.ledger.get(run.id)?.status??'');steps++)await runtime.tick();
const record=runtime.ledger.get(run.id),artifacts=runtime.artifacts.list(run.id),result={schema:'agent-control.native-mutation-benchmark/v1',sourceCommit:process.env.AC_NATIVE_BENCHMARK_SOURCE||'unavailable',run:record,invocations:efficiency.list().filter(item=>item.runId===run.id),artifacts:artifacts.map(item=>({record:item,value:runtime.artifacts.read(item.id)}))};
fs.writeFileSync(path.join(state,'result.json'),JSON.stringify(result,null,2),{mode:0o600,flag:'wx'});
console.log(JSON.stringify({runId:run.id,status:record?.status,taskId,profile,invocations:result.invocations.length,artifacts:artifacts.length}));
if(record?.status!=='SUCCEEDED')process.exitCode=1;
