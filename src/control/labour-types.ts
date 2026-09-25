import type {ModelQualificationState} from './config.js';
import type {ExecutionScopeEnvelope, ScopeAction} from './containment.js';
import type {OwnedExecution} from './owned-process.js';

/** All amounts are integer millionths of a currency unit: internal accounting, not payments. */
export interface LabourOrganisation {id:string; currency:string; maximumCharges:number;}
export interface LabourRateCard {currency:string; executionCharge:number; verificationCharge:number; riskCharge:number; basis:string; metering?:'cpu-ms';}
export interface DigitalWorker {
  id:string; organisationId:string; name:string; workerType:string; capabilities:string[];
  tools:string[]; permissions:string[]; backendId:string; backendRevision:string;
  modelConfiguration:Record<string,string>; rateCard:LabourRateCard; concurrency:number;
  status:'registered'|'available'|'busy'|'degraded'|'quarantined'|'offline';
  qualifications:Array<{capability:string; state:ModelQualificationState; backendRevision:string; evidence:string[]; checkedAt:string}>;
}
export interface WorkOrder {
  id:string; organisationId:string; jobType:string; description:string; input:unknown;
  comparison?:{benchmarkHash:string;caseId:string;strategy:'fixed'|'cheapest'|'broker'};
  requiredCapabilities:string[]; requiredPermissions:string[]; minimumQualification:'QUALIFIED';
  deadline:string; maximumCost:number; priority:'low'|'normal'|'high'; maximumAttempts:number;
  verification:{id:string; revision:string}; scope:ExecutionScopeEnvelope;
}
export interface LabourExecutionResult {
  output:unknown; succeeded:boolean; evidence:Record<string,unknown>;
  resources?:{workerId:string;backendId:string;modelId:string;tools:Array<Record<string,unknown>>;cpuMs:number|null;wallMs:number;peakRssKiB:number|null;accountingBasis:string};
  externalCost:number|null; tokens:{input:number;output:number}|null; energyJoules:number|null;
}
export interface LabourBackend {
  id:string; revision:string; requiredAction:ScopeAction;
  /** Trusted adapter code only. Its owned execution must be killable and bounded. */
  execute(order:WorkOrder, worker:DigitalWorker, owned:OwnedExecution, signal:AbortSignal):Promise<LabourExecutionResult>;
}
export interface LabourVerifier {id:string; revision:string; accepts(order:WorkOrder):boolean; verify(order:WorkOrder,result:LabourExecutionResult):{passed:boolean; detail:string};}
export interface LabourBid {
  workerId:string; backendRevision:string; maximumExecutionCost?:number; maximumVerificationCost?:number; executionCost:number; verificationCost:number; riskCost:number;
  expectedRetryCost:number; expectedCompletionCost:number; expectedLatencyMs:number|null;
  observedSuccessRate:number|null; samples:number; confidence:'INSUFFICIENT_EVIDENCE'|'EMPIRICAL_SMALL_SAMPLE'|'EMPIRICAL';
  resourceRequirement:{backendId:string;slots:number}; availability:'available'; expiresAt:string;
}
export interface LabourAttempt {
  id:string; workOrderId:string; organisationId:string; workerId:string; backendId:string; backendRevision:string;
  contractHash:string; bid:LabourBid; awardReason:string; startedAt:string; endedAt:string; latencyMs:number;
  execution:LabourExecutionResult; verification:{passed:boolean; detail:string; verifierId:string; revision:string; resultHash:string};
  rawExecutionCost:number; verificationCost:number; escalationCost:number; totalCost:number;
  outcome:'SUCCEEDED'|'FAILED'|'CANCELLED'; calibration:boolean;
}
export interface LabourOutcome {workOrderId:string; contractHash:string; organisationId:string; state:'COMPLETED'|'FAILED'|'BLOCKED'|'INTERRUPTED'; attempts:string[]; totalCost:number; retryCost:number; verificationCost:number; reason:string;}
export interface LabourEvent {sequence:number; at:string; kind:string; data:unknown; previousHash:string; hash:string;}
