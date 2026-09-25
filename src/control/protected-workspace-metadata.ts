import path from 'node:path';

export type MetadataAccess='READ'|'WRITE'|'CREATE';
export type MetadataVerdict='ALLOW'|'READ_ONLY'|'UNAVAILABLE';
export interface ProtectedMetadataDecision{schema:'agent-control.protected-workspace-metadata/v1';path:string;access:MetadataAccess;verdict:MetadataVerdict;reason:string;authority:'POLICY';}

const UNAVAILABLE_SEGMENTS=new Set(['.git','.agents','.codex','.agent-control','.agent-control-evidence']);
const READ_ONLY_NAMES=new Set(['agents.md','agent-control.policy.json','work-parcel.json','baton.json','evidence-manifest.json','integrity.json']);

/** Generic workspace policy. Platform adapters must enforce the returned verdict or fail closed. */
export function protectedMetadataDecision(candidate:string,access:MetadataAccess):ProtectedMetadataDecision{
  const normalized=candidate.replaceAll('\\','/').replace(/^\.\//,'');
  if(!normalized||path.posix.isAbsolute(normalized)||normalized.split('/').includes('..'))return{schema:'agent-control.protected-workspace-metadata/v1',path:normalized,access,verdict:'UNAVAILABLE',reason:'path-boundary-invalid',authority:'POLICY'};
  const parts=normalized.toLowerCase().split('/');
  if(parts.some(part=>UNAVAILABLE_SEGMENTS.has(part)))return{schema:'agent-control.protected-workspace-metadata/v1',path:normalized,access,verdict:'UNAVAILABLE',reason:'governance-directory-protected',authority:'POLICY'};
  if(parts.some(part=>READ_ONLY_NAMES.has(part)))return{schema:'agent-control.protected-workspace-metadata/v1',path:normalized,access,verdict:access==='READ'?'READ_ONLY':'UNAVAILABLE',reason:'governance-record-read-only',authority:'POLICY'};
  return{schema:'agent-control.protected-workspace-metadata/v1',path:normalized,access,verdict:'ALLOW',reason:'ordinary-workspace-content',authority:'POLICY'};
}

export function assertWorkspaceMetadataAccess(candidate:string,access:MetadataAccess){const decision=protectedMetadataDecision(candidate,access);if(access==='READ'&&decision.verdict==='READ_ONLY')return decision;if(decision.verdict!=='ALLOW')throw Object.assign(new Error('workspace_governance_metadata_denied'),{decision});return decision;}
