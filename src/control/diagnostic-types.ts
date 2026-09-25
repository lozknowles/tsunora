import type {DiagnosticClassification} from './diagnostic-classification.js';
import type {DiscoveryItem} from './environment-discovery.js';
import type {OwnedExecution} from './owned-process.js';

export type DiagnosticScope='NONE'|'ERRORS_ONLY'|'RECENT_SAMPLE'|'FULL_DIAGNOSTIC_SCAN';
export type DiagnosticCategory='SYSTEM'|'KERNEL'|'SECURITY'|'SERVICE'|'CONTAINER'|'PROXY'|'MODEL_RUNTIME'|'AGENT_CONTROL';
export type IdentifierPolicy='PSEUDONYMIZE'|'REDACT'|'KEEP';
export interface DiagnosticPrivacy {usernames:IdentifierPolicy;hostnames:IdentifierPolicy;ipAddresses:IdentifierPolicy;macAddresses:IdentifierPolicy;paths:IdentifierPolicy;emails:IdentifierPolicy;identifiers:IdentifierPolicy;}
export const DEFAULT_DIAGNOSTIC_PRIVACY:DiagnosticPrivacy={usernames:'PSEUDONYMIZE',hostnames:'PSEUDONYMIZE',ipAddresses:'PSEUDONYMIZE',macAddresses:'PSEUDONYMIZE',paths:'PSEUDONYMIZE',emails:'PSEUDONYMIZE',identifiers:'PSEUDONYMIZE'};
export interface DiagnosticBounds {since:string;until:string;maxSources:number;maxBytesPerSource:number;maxTotalBytes:number;maxLinesPerSource:number;maxEvents:number;timeoutMs:number;}
export interface DiagnosticSource {
 id:string;adapterId:string;category:DiagnosticCategory;label:string;target:string;componentIds:string[];
 access:'AVAILABLE'|'DENIED'|'UNAVAILABLE';format:'JOURNAL_JSONL'|'JSONL'|'TEXT';identity:string;
 sizeBytes:number|null;metadataOnly:true;sensitivity:'OPERATIONAL'|'SECURITY';
}
/** The locator is private adapter state, never accepted from a browser or a log. */
export interface DiagnosticSourceRecord extends DiagnosticSource {locator:Record<string,string|number>;}
export interface DiagnosticArchitecture {
 discoveryScanId:string|null;observedAt:string;components:Array<{id:string;label:string;kind:string;nodeId:string;attributes:Record<string,string|number|boolean|null>;provenance:unknown[]}>;
 edges:Array<{from:string;to:string;kind:'DEPENDS_ON'|'RELATED'|'HOSTED_ON';authority:'OBSERVED'|'CONFIGURED'|'DERIVED';evidence:string}>;
}
export interface DiagnosticInventory {id:string;at:string;sha256:string;sources:DiagnosticSource[];architecture:DiagnosticArchitecture;failures:Array<{adapterId:string;reason:string}>;contentsRead:false;}
export interface DiagnosticPermission {
 id:string;inventoryId:string;inventorySha256:string;actor:string;requestedByJob:string;grantedAt:string;expiresAt:string;revokedAt:string|null;
 scope:DiagnosticScope;sourceIds:string[];excludedSourceIds:string[];sourceIdentities:Record<string,string>;bounds:DiagnosticBounds;privacy:DiagnosticPrivacy;
 externalModelProcessing:boolean;model:{modelId:string;nodeId:string}|null;reason:string;
}
export interface DiagnosticCollection {sourceId:string;status:'COLLECTED'|'DENIED'|'UNAVAILABLE'|'IDENTITY_CHANGED';text:string;bytesRead:number;truncated:boolean;sampling:string;locator:Record<string,string|number>;}
export interface DiagnosticSourceAdapter {
 readonly id:string;
 enumerate(context:{items:DiscoveryItem[];signal:AbortSignal}):Promise<{sources:DiagnosticSourceRecord[];components?:DiagnosticArchitecture['components'];edges?:DiagnosticArchitecture['edges']}>;
 collect(source:DiagnosticSourceRecord,permission:DiagnosticPermission,signal:AbortSignal,owned?:OwnedExecution):Promise<DiagnosticCollection>;
}
export type DiagnosticEventType='UNKNOWN'|'GPU_PRESSURE'|'MEMORY_PRESSURE'|'DISK_PRESSURE'|'ALLOCATION_FAILURE'|'SERVICE_EXIT'|'RESTART'|'BOOT'|'SHUTDOWN'|'PROXY_FAILURE'|'HTTP_CLIENT_ERROR'|'CONNECTION_FAILURE'|'TIMEOUT'|'DEPENDENCY_FAILURE'|'MODEL_CHANGE'|'JOB_START'|'JOB_FAILURE'|'JOB_SUCCESS'|'ERROR'|'INFO';
export interface DiagnosticEvent {
 id:string;timestamp:string|null;timeAuthority:'SOURCE'|'YEAR_FROM_WINDOW'|'UNKNOWN';firstSeen:string|null;lastSeen:string|null;count:number;
 sourceId:string;componentId:string|null;host:string|null;service:string|null;process:string|null;pid:number|null;container:string|null;
 severity:'ERROR'|'WARNING'|'INFO'|'UNKNOWN';type:DiagnosticEventType;resource:string|null;job:string|null;worker:string|null;lane:string|null;relatedService:string|null;
 classification?:DiagnosticClassification;
 message:string;fingerprint:string;evidenceRef:string;sanitization:{version:string;redactions:number;untrusted:true};
}
export interface DiagnosticEvidence {id:string;sourceId:string;sanitizedText:string;sha256:string;sourceIdentity:string;collectedAt:string;location:Record<string,string|number>;untrusted:true;rawRetained:false;}
export interface DiagnosticFinding {
 temporal?:'HISTORICAL'|'UNKNOWN';incidentStatus?:'UNKNOWN'|'RESOLVED';classificationReasons?:string[];recoveryEvidenceRefs?:string[];
 id:string;key:string;title:string;status:'OBSERVED'|'CORRELATED'|'INFERRED'|'UNKNOWN';confidence:'HIGH'|'MEDIUM'|'LOW'|'INSUFFICIENT_EVIDENCE';
 componentIds:string[];eventIds:string[];evidenceRefs:string[];window:{start:string|null;end:string|null};
 observations:string[];correlation:string|null;inference:string|null;causation:'NOT_PROVEN';competingExplanations:string[];
 factors:{occurrences:number;independentSources:number;temporalRelationship:boolean;knownDependency:boolean;directErrorEvidence:boolean;coverageIncomplete:boolean};
 analysisPath:string[];producer:{kind:'RULE'|'MODEL';id:string;version:string;invocationId?:string};
 investigations:string[];remediation:{authority:'PROPOSAL_ONLY';summary:string;requiresSeparateApproval:true;autoExecutable:false};
}
export interface DiagnosticAssessment {
 schema:'agent-control.architecture-diagnostics/v1';id:string;createdAt:string;permissionId:string;runId:string;jobId:string;inventoryId:string;
 permission:DiagnosticPermission;architecture:DiagnosticArchitecture;events:DiagnosticEvent[];evidence:DiagnosticEvidence[];findings:DiagnosticFinding[];
 collectionStatus?:'COMPLETE'|'PARTIAL';classifierVersion?:string;
 health:Array<{historicalState?:string;componentId:string;state:'HEALTHY'|'WARNING'|'DEGRADED'|'RECURRING_FAILURE'|'UNKNOWN';eventIds:string[];findingIds:string[];basis:string}>;
 coverage:Array<{sourceId:string;status:string;bytesRead:number;linesExamined:number;events:number;malformed:number;outsideWindow:number;unknownTime:number;truncated:boolean;sampling:string}>;
 sanitization:{version:string;status:'PASS';rawRetained:false;redactions:number;policy:DiagnosticPrivacy};
 modelAnalysis:{status:'NOT_REQUESTED'|'COMPLETED'|'UNAVAILABLE'|'POLICY_DENIED';modelId:string|null;providerId:string|null;invocationId:string|null;reason:string};
 limitations:string[];previousAssessmentId:string|null;comparison:{state:'COMPARABLE'|'NOT_COMPARABLE';reason:string;previousFindings:number|null;currentFindings:number};sha256:string;
}
