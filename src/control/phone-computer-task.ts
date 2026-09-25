import {createHash, randomUUID, timingSafeEqual} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {redactSensitiveValue} from './security-redaction.js';
import type {BrowserSessionResult, BrowserStep} from './browser-worker.js';

export type ComputerTaskState =
  | 'QUEUED_FOR_PHONE' | 'INFERENCE_RUNNING' | 'WAITING_FOR_APPROVAL'
  | 'COMPUTER_RUNNING' | 'SUCCEEDED' | 'REJECTED' | 'CANCELLING'
  | 'CANCELLED' | 'FAILED' | 'PHONE_DISCONNECTED';

export interface PhoneModelIdentity {
  deviceId: string; workerId: string; modelId: string; modelSha256?: string;
  runtime: string; runtimeVersion?: string; bootId: string; sessionId: string;
  endpoint: string; observedAt: string;
}

export interface PhoneWorkerRegistration extends PhoneModelIdentity {
  authReference: string; authDigest: string; capabilities: string[]; health: 'healthy' | 'degraded';
  thermalState?: 'nominal' | 'fair' | 'serious' | 'critical' | 'unavailable';
  memoryAvailableBytes?: number | null; batteryPercent?: number | null; charging?: boolean | null;
}

export interface PhonePlan {
  summary: string;
  steps: BrowserStep[];
  usage: {
    inputTokens: number | null; cachedInputTokens: number | null;
    freshInputTokens: number | null; outputTokens: number | null;
    reasoningTokens: number | null;
  };
  latencyMs: number;
}

export interface ComputerTaskRecord {
  schema: 'agent-control.phone-computer-task/v1'; id: string; actorId: string;
  request: string; targetWorkerId: string; createdAt: string; updatedAt: string;
  state: ComputerTaskState; phoneWorkerId: string | null; model: PhoneModelIdentity | null;
  plan: PhonePlan | null; pendingApproval: {id: string; reason: string; createdAt: string} | null;
  computerRunId: string | null; result: BrowserSessionResult | null; error: string | null;
  latestScreenshot: {name: string; mediaType: 'image/png'; base64: string; sha256: string} | null;
  events: Array<{id: string; at: string; type: string; detail: string; evidence?: string[]}>;
  evidence: string[];
}

export interface ComputerUseDispatch {
  runId: string;
  completion: Promise<BrowserSessionResult>;
  cancel(reason: string): Promise<{descendantsTerminated: boolean; evidence: string[]}>;
}

export interface ComputerUsePort {
  dispatch(input: {taskId: string; targetWorkerId: string; steps: BrowserStep[]; maximumDurationMs: number}): Promise<ComputerUseDispatch>;
}

export interface PhoneComputerTaskOptions {
  allowedTargetWorkers: string[]; allowedHosts: string[];
  maximumSteps?: number; maximumDurationMs?: number; maximumRequestBytes?: number;
  now?: () => string;
}

interface Snapshot {schema: 'agent-control.phone-computer-tasks/v1'; workers: PhoneWorkerRegistration[]; tasks: ComputerTaskRecord[];}

/**
 * Durable controller-side state for a phone-hosted inference worker. The phone
 * polls outward for leases; its loopback model endpoint is recorded but is
 * never contacted or exposed by this controller.
 */
export class PhoneComputerTaskRuntime {
  private readonly workers = new Map<string, PhoneWorkerRegistration>();
  private readonly tasks = new Map<string, ComputerTaskRecord>();
  private readonly live = new Map<string, ComputerUseDispatch>();
  private readonly now: () => string;
  constructor(readonly file: string, readonly computer: ComputerUsePort, readonly options: PhoneComputerTaskOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.load();
  }

  registerPhoneWorker(value: PhoneWorkerRegistration) {
    assertPhoneWorker(value);
    this.workers.set(value.workerId, structuredClone(value)); this.save();
    return publicWorker(value);
  }

  create(input: {actorId: string; request: string; targetWorkerId: string}) {
    if (!input.actorId.trim()) throw new Error('computer_task_actor_required');
    const bytes = Buffer.byteLength(input.request);
    if (!input.request.trim() || bytes > (this.options.maximumRequestBytes ?? 32_768)) throw new Error('computer_task_request_invalid');
    if (!this.options.allowedTargetWorkers.includes(input.targetWorkerId)) throw new Error('computer_task_target_not_authorised');
    const at = this.now(), id = `computer-task-${randomUUID()}`;
    const task: ComputerTaskRecord = {schema:'agent-control.phone-computer-task/v1', id, actorId:input.actorId, request:input.request, targetWorkerId:input.targetWorkerId, createdAt:at, updatedAt:at, state:'QUEUED_FOR_PHONE', phoneWorkerId:null, model:null, plan:null, pendingApproval:null, computerRunId:null, result:null, error:null, latestScreenshot:null, events:[], evidence:[`request_sha256:${sha(input.request)}`]};
    this.event(task, 'task.created', 'Authenticated request sealed for governed phone inference'); this.tasks.set(id, task); this.save(); return project(task);
  }

  claim(workerId: string, token: string) {
    const worker = this.authenticateWorker(workerId, token);
    if (worker.health !== 'healthy') throw new Error('phone_worker_not_healthy');
    if (['serious','critical'].includes(worker.thermalState ?? 'unavailable')) throw new Error('phone_worker_thermal_admission_rejected');
    const task = [...this.tasks.values()].find(item => item.state === 'QUEUED_FOR_PHONE');
    if (!task) return null;
    task.state='INFERENCE_RUNNING'; task.phoneWorkerId=worker.workerId; task.model=identity(worker); task.updatedAt=this.now();
    this.event(task,'phone.inference_claimed',`Phone worker ${worker.workerId} claimed bounded inference`); this.save();
    return {taskId:task.id, request:task.request, modelId:worker.modelId, limits:{maximumSteps:this.options.maximumSteps ?? 20, outputSchema:'agent-control.phone-plan/v1'}};
  }

  async submitPlan(workerId: string, token: string, taskId: string, plan: PhonePlan) {
    const worker=this.authenticateWorker(workerId,token), task=this.mustTask(taskId);
    if(task.state!=='INFERENCE_RUNNING'||task.phoneWorkerId!==worker.workerId)throw new Error('phone_plan_lease_invalid');
    validatePlan(plan,this.options.maximumSteps??20,this.options.allowedHosts);
    task.plan=structuredClone(plan); task.updatedAt=this.now();
    this.event(task,'phone.plan_recorded',`Bounded proposal received from ${worker.modelId}`,[`plan_sha256:${sha(JSON.stringify(plan.steps))}`]);
    const consequential=plan.steps.find(isConsequential);
    if(consequential){task.state='WAITING_FOR_APPROVAL';task.pendingApproval={id:`approval-${randomUUID()}`,reason:`Consequential browser action requires approval: ${consequential.action}`,createdAt:this.now()};this.event(task,'approval.required',task.pendingApproval.reason);this.save();return project(task);}
    this.save(); await this.dispatch(task); return project(task);
  }

  async approve(taskId:string,approvalId:string,actorId:string){const task=this.mustTask(taskId);if(task.state!=='WAITING_FOR_APPROVAL'||task.pendingApproval?.id!==approvalId)throw new Error('computer_task_approval_not_waiting');if(!actorId.trim())throw new Error('computer_task_actor_required');this.event(task,'approval.granted',`Approval granted by ${actorId}`);task.pendingApproval=null;this.save();await this.dispatch(task);return project(task);}
  reject(taskId:string,approvalId:string,actorId:string){const task=this.mustTask(taskId);if(task.state!=='WAITING_FOR_APPROVAL'||task.pendingApproval?.id!==approvalId)throw new Error('computer_task_approval_not_waiting');task.state='REJECTED';task.pendingApproval=null;task.updatedAt=this.now();this.event(task,'approval.rejected',`Approval rejected by ${actorId}`);this.save();return project(task);}

  async cancel(taskId:string,actorId:string){const task=this.mustTask(taskId);if(terminal(task.state))return project(task);task.state='CANCELLING';task.updatedAt=this.now();this.event(task,'task.cancel_requested',`Cancellation persisted before abort by ${actorId}`);this.save();const active=this.live.get(task.id);if(active){const cleanup=await active.cancel(`cancelled_by:${actorId}`);task.evidence.push(...cleanup.evidence);if(!cleanup.descendantsTerminated){task.state='FAILED';task.error='computer_task_cleanup_unconfirmed';this.event(task,'task.cleanup_unconfirmed','Task-owned descendant cleanup was not confirmed');this.save();return project(task);}}task.state='CANCELLED';task.pendingApproval=null;task.updatedAt=this.now();this.event(task,'task.cancelled','Cancellation and task-owned cleanup confirmed');this.save();return project(task);}

  phoneDisconnected(workerId:string){const worker=this.workers.get(workerId);if(worker){worker.health='degraded';worker.observedAt=this.now();}for(const task of this.tasks.values())if(task.phoneWorkerId===workerId&&task.state==='INFERENCE_RUNNING'){task.state='PHONE_DISCONNECTED';task.updatedAt=this.now();this.event(task,'phone.disconnected','Phone worker disconnected during inference');}this.save();}
  status(taskId:string){return project(this.mustTask(taskId));}
  latestScreenshot(taskId:string){const task=this.mustTask(taskId);return task.latestScreenshot ? structuredClone(task.latestScreenshot) : null;}
  evidence(taskId:string){return structuredClone(this.mustTask(taskId));}

  private async dispatch(task:ComputerTaskRecord){if(!task.plan)throw new Error('computer_task_plan_missing');task.state='COMPUTER_RUNNING';task.updatedAt=this.now();this.event(task,'computer.dispatching',`Dispatching approved bounded actions to ${task.targetWorkerId}`);this.save();const execution=await this.computer.dispatch({taskId:task.id,targetWorkerId:task.targetWorkerId,steps:task.plan.steps,maximumDurationMs:this.options.maximumDurationMs??120_000});task.computerRunId=execution.runId;this.live.set(task.id,execution);this.save();void execution.completion.then(result=>{const live=this.mustTask(task.id);if(live.state==='CANCELLING'||live.state==='CANCELLED')return;live.result=redactSensitiveValue(result) as BrowserSessionResult;live.latestScreenshot=result.screenshots.at(-1)??null;live.state='SUCCEEDED';live.updatedAt=this.now();live.evidence.push(...result.screenshots.map(item=>`screenshot_sha256:${item.sha256}`));this.event(live,'computer.completed',`Observed ${result.interactions} bounded interactions`);this.live.delete(live.id);this.save();}).catch(error=>{const live=this.mustTask(task.id);if(live.state==='CANCELLING'||live.state==='CANCELLED')return;live.state='FAILED';live.error=safeError(error);live.updatedAt=this.now();this.event(live,'computer.failed',live.error);this.live.delete(live.id);this.save();});}
  private authenticateWorker(id:string,token:string){const worker=this.workers.get(id),digest=sha(token);if(!worker||!same(digest,worker.authDigest))throw new Error('phone_worker_authentication_failed');return worker;}
  private mustTask(id:string){const task=this.tasks.get(id);if(!task)throw new Error('computer_task_not_found');return task;}
  private event(task:ComputerTaskRecord,type:string,detail:string,evidence?:string[]){const at=this.now();task.updatedAt=at;task.events.push({id:`event-${randomUUID()}`,at,type,detail,...(evidence?{evidence}: {})});}
  private save(){fs.mkdirSync(path.dirname(this.file),{recursive:true});const value:Snapshot={schema:'agent-control.phone-computer-tasks/v1',workers:[...this.workers.values()],tasks:[...this.tasks.values()]};const temp=`${this.file}.tmp`;fs.writeFileSync(temp,`${JSON.stringify(redactSensitiveValue(value),null,2)}\n`,{mode:0o600,flush:true});fs.renameSync(temp,this.file);}
  private load(){if(!fs.existsSync(this.file))return;const value=JSON.parse(fs.readFileSync(this.file,'utf8')) as Snapshot;if(value.schema!=='agent-control.phone-computer-tasks/v1')throw new Error('phone_computer_task_store_invalid');for(const worker of value.workers)this.workers.set(worker.workerId,worker);for(const task of value.tasks){if(['INFERENCE_RUNNING','COMPUTER_RUNNING','CANCELLING'].includes(task.state)){task.state=task.state==='INFERENCE_RUNNING'?'PHONE_DISCONNECTED':'FAILED';task.error='controller_restart_requires_reconciliation';task.events.push({id:`event-${randomUUID()}`,at:this.now(),type:'task.reconstructed',detail:'Durable task reconstructed; live execution was not assumed'});}this.tasks.set(task.id,task);}}
}

function assertPhoneWorker(value:PhoneWorkerRegistration){let endpoint:URL;try{endpoint=new URL(value.endpoint);}catch{throw new Error('phone_worker_endpoint_invalid');}if(endpoint.protocol!=='http:'||!['127.0.0.1','localhost','::1'].includes(endpoint.hostname))throw new Error('phone_worker_endpoint_must_be_loopback');if(!value.workerId||!value.deviceId||!value.modelId||!value.bootId||!value.sessionId)throw new Error('phone_worker_identity_incomplete');if(value.modelSha256&&!/^[a-f0-9]{64}$/i.test(value.modelSha256))throw new Error('phone_worker_model_hash_invalid');if(!value.authReference.trim()||/^(?:sk-|Bearer\s|[A-Za-z0-9+/]{32,}={0,2}$)/.test(value.authReference))throw new Error('phone_worker_requires_auth_reference');if(!/^[a-f0-9]{64}$/i.test(value.authDigest))throw new Error('phone_worker_auth_digest_invalid');}
function validatePlan(plan:PhonePlan,maximum:number,allowedHosts:string[]){if(!plan.summary.trim()||!Array.isArray(plan.steps)||!plan.steps.length||plan.steps.length>maximum)throw new Error('phone_plan_invalid');for(const step of plan.steps){if(!['navigate','wait','extractText','query','click','enterText','submit','screenshot'].includes(step.action))throw new Error('phone_plan_action_not_allowed');if(step.action==='navigate'){const url=new URL(step.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||!allowedHosts.includes(url.hostname.toLowerCase()))throw new Error('phone_plan_destination_not_allowed');}if(step.action==='enterText'&&/(password|secret|api.?key|token)/i.test(step.selector))throw new Error('phone_plan_sensitive_input_forbidden');}for(const value of Object.values(plan.usage))if(value!==null&&(!Number.isFinite(value)||value<0))throw new Error('phone_plan_usage_invalid');}
function isConsequential(step:BrowserStep){return ['click','submit','download'].includes(step.action);}
function identity(value:PhoneWorkerRegistration):PhoneModelIdentity{const {deviceId,workerId,modelId,modelSha256,runtime,runtimeVersion,bootId,sessionId,endpoint,observedAt}=value;return{deviceId,workerId,modelId,...(modelSha256?{modelSha256}:{}),runtime,...(runtimeVersion?{runtimeVersion}:{}),bootId,sessionId,endpoint,observedAt};}
function publicWorker(value:PhoneWorkerRegistration){return{...identity(value),capabilities:[...value.capabilities],health:value.health,thermalState:value.thermalState??'unavailable',memoryAvailableBytes:value.memoryAvailableBytes??null,batteryPercent:value.batteryPercent??null,charging:value.charging??null};}
function project(task:ComputerTaskRecord){const copy=structuredClone(task);copy.request='[protected request retained in authorised evidence]';if(copy.result)copy.result={...copy.result,values:{protected:'authorised evidence only'},screenshots:copy.result.screenshots.map(item=>({...item,base64:'[protected]'})),downloads:[]};if(copy.latestScreenshot)copy.latestScreenshot={...copy.latestScreenshot,base64:'[protected]'};return copy;}
function terminal(state:ComputerTaskState){return['SUCCEEDED','REJECTED','CANCELLED','FAILED'].includes(state);}
function same(a:string,b:string){const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb);}
function sha(value:string){return createHash('sha256').update(value).digest('hex');}
function safeError(error:unknown){return String(error instanceof Error?error.message:error).replace(/(?:Bearer\s+|sk-)[A-Za-z0-9._-]+/gi,'[redacted]').slice(0,500);}
