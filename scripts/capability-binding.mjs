import { createHash } from 'node:crypto';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const name = value => typeof value === 'string' && /^[a-z][a-z0-9._-]{0,127}$/.test(value);
const states = ['READY','BLOCKED','UNSUPPORTED','CONNECTOR_REQUIRED','CREDENTIAL_REQUIRED','CONFIGURATION_REQUIRED'];

// Trusted controller rules, never loaded from a downloaded job or adapter definition.
// Match an exact probe contract, not a resource label or arbitrary declared capability.
export const DEFAULT_RULES = Object.freeze([
  { id:'host-inspection-v1', capability:'host.inspect', kind:'MACHINE', adapter:'local-machine', method:'node:os', ttlSeconds:3600, attributes:['cpuLogical','totalMemoryBytes','diskAvailableBytes'] },
  { id:'gpu-inspection-v1', capability:'gpu.inspect', kind:'TOOL', adapter:'readiness-probes', method:'gpu-usage-and-processes/v1', ttlSeconds:300, attributes:['probePassed'] },
  { id:'report-v1', capability:'evidence.report', kind:'TOOL', adapter:'readiness-probes', method:'evidence-report-roundtrip/v1', ttlSeconds:86400, attributes:['probePassed'] },
]);

export function validateRules(rules) {
  if (!Array.isArray(rules) || rules.length > 256) throw Error('invalid_capability_rules');
  const ids = new Set();
  for (const r of rules) {
    if (!r || Object.keys(r).some(k => !['id','capability','kind','adapter','method','ttlSeconds','attributes'].includes(k)) ||
      !name(r.id) || ids.has(r.id) || !name(r.capability) || !['MACHINE','GPU','RUNTIME','MODEL','TOOL','ENDPOINT','MCP','CREDENTIAL','PROVIDER'].includes(r.kind) ||
      typeof r.adapter !== 'string' || !r.adapter || typeof r.method !== 'string' || !r.method ||
      !Number.isInteger(r.ttlSeconds) || r.ttlSeconds < 1 || r.ttlSeconds > 86400 ||
      !Array.isArray(r.attributes) || r.attributes.some(a => typeof a !== 'string' || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(a))) throw Error('invalid_capability_rule');
    ids.add(r.id);
  }
  return rules;
}

function checkScan(scan) {
  if (scan?.schema !== 'agent-control.environment-discovery/v1' || !Array.isArray(scan.items) ||
    !['COMPLETED','PARTIAL'].includes(scan.status) || !Number.isFinite(Date.parse(scan.completedAt)) ||
    new Set(scan.items.map(i => i.id)).size !== scan.items.length || scan.items.some(i => !i.id || !i.nodeId || !i.fingerprint || !Array.isArray(i.provenance))) throw Error('invalid_discovery_scan');
}

export function deriveCapabilities(scan, {now = new Date(), rules = DEFAULT_RULES} = {}) {
  checkScan(scan); validateRules(rules);
  if (!Number.isFinite(+now)) throw Error('invalid_assessment_time');
  const bindings = [];
  for (const item of scan.items) {
    for (const rule of rules.filter(r => r.kind === item.kind)) {
      const provenance = item.provenance.filter(p => p.adapter === rule.adapter && p.method === rule.method)
        .sort((a,b) => Date.parse(b.observedAt)-Date.parse(a.observedAt))[0];
      if (!provenance) continue;
      const age = (+now-Date.parse(provenance.observedAt))/1000;
      const failed = ['UNAVAILABLE','OFFLINE'].includes(item.health) || item.operationalState === 'UNAVAILABLE' || item.attributes.probePassed === false;
      const verified = item.health === 'HEALTHY' && provenance.authority === 'AUTHORITATIVE' &&
        rule.attributes.every(a => item.attributes[a] !== undefined && item.attributes[a] !== null && item.attributes[a] !== false);
      const confidence = failed ? 'FAILED' : !Number.isFinite(age) || age < 0 || age > rule.ttlSeconds ? 'STALE' : verified ? 'VERIFIED' : 'OBSERVED';
      bindings.push({id:digest([scan.id,item.id,rule.id,item.fingerprint]),capability:rule.capability,
        resourceId:item.id,relatedResourceIds:item.relatedIds ?? [],nodeId:item.nodeId,confidence,ruleId:rule.id,ruleDigest:digest(rule),
        evidence:{scanId:scan.id,observationId:item.id,fingerprint:item.fingerprint,probe:provenance.method,
          adapter:provenance.adapter,authority:provenance.authority,observedAt:provenance.observedAt,
          expiresAt:Number.isFinite(age) ? new Date(Date.parse(provenance.observedAt)+rule.ttlSeconds*1000).toISOString() : null,
          ttlSeconds:rule.ttlSeconds,result:failed?'FAILED':verified?'PASSED':'NOT_VERIFIED'},
        qualification:'NOT_ASSESSED'});
    }
    // Native registry assertions retain their declared status even after --version passes.
    for (const capability of String(item.attributes.capabilities ?? '').split(',').filter(name)) {
      if (bindings.some(b => b.resourceId === item.id && b.capability === capability)) continue;
      bindings.push({id:digest([scan.id,item.id,capability]),capability,resourceId:item.id,nodeId:item.nodeId,
        confidence:item.provenance.some(p=>p.authority==='AUTHORITATIVE')?'OBSERVED':'DECLARED',
        ruleId:null,evidence:{scanId:scan.id,observationId:item.id,fingerprint:item.fingerprint,result:'NOT_VERIFIED'},qualification:'NOT_ASSESSED'});
    }
  }
  return {schema:'agent-control.capability-evidence/v1',scanId:scan.id,assessedAt:now.toISOString(),bindings,authorityGranted:false};
}

// The optional contract is controller-reviewed, digest-bound metadata. It cannot come
// from untrusted input, grant permissions, install adapters or select a worker/provider.
function placement(job, contract) {
  if (!contract) return {mode:'COLOCATED',source:'spec-1.0-conservative-default'};
  if (contract.schema !== 'agent-control.readiness-contract/v1' || contract.jobDigest !== job.sha256 || !/^[a-f0-9]{64}$/.test(job.sha256 ?? '') ||
    contract.reviewed !== true || !['COLOCATED','DISTRIBUTED'].includes(contract.placement) || Object.keys(contract).some(k=>!['schema','jobDigest','reviewed','placement','configuration'].includes(k)) ||
    (contract.configuration !== undefined && (!Array.isArray(contract.configuration) || contract.configuration.some(v=>!name(v))))) throw Error('invalid_readiness_contract');
  return {mode:contract.placement,source:'reviewed-digest-bound-contract'};
}

export function assessReadiness(job, scan, {now = new Date(), rules = DEFAULT_RULES, contract, inputs = {}, configuration = {}} = {}) {
  if (!job || job.spec_version !== '1.0.0' || typeof job.approval?.required !== 'boolean' || !Array.isArray(job.inputs?.required) || !Array.isArray(job.permissions)) throw Error('invalid_readiness_job');
  const derived = deriveCapabilities(scan,{now,rules}), topology = placement(job,contract);
  const reasons = [], requirements = [], add = (state,code,requirement) => reasons.push({state,code,requirement});
  if (scan.status !== 'COMPLETED') add('BLOCKED','partial_discovery',scan.id);
  if (Date.parse(scan.completedAt)>+now) add('BLOCKED','future_discovery',scan.id);
  const requested = [...new Set([...job.capabilities,...job.models.required])];
  for (const capability of requested) {
    const evidence = derived.bindings.filter(b=>b.capability===capability);
    const candidates = evidence.filter(b=>b.confidence==='VERIFIED');
    requirements.push({type:'capability',requirement:capability,satisfied:candidates.length>0,candidates,evidence});
    if (!candidates.length) add(evidence.some(b=>['STALE','FAILED'].includes(b.confidence))?'BLOCKED':'UNSUPPORTED',
      evidence.length?'capability_not_verified':'capability_missing',capability);
  }
  const capRequirements = [...requirements];
  const nodes = [...new Set(derived.bindings.filter(b=>b.confidence==='VERIFIED').map(b=>b.nodeId))];
  const allowedNodes = nodes.filter(node => job.platforms.includes('any') || scan.items.some(i=>i.nodeId===node && i.kind==='MACHINE' && i.health==='HEALTHY' && job.platforms.includes(i.attributes.platform)));
  let compatibleNodes = topology.mode==='COLOCATED' ? allowedNodes.filter(node=>capRequirements.every(r=>r.candidates.some(c=>c.nodeId===node))) : allowedNodes;
  if (capRequirements.every(r=>r.satisfied) && !compatibleNodes.length) add('UNSUPPORTED','placement_or_platform_unsatisfied',topology.mode);
  if (topology.mode==='DISTRIBUTED' && capRequirements.some(r=>!r.candidates.some(c=>allowedNodes.includes(c.nodeId)))) add('UNSUPPORTED','distributed_platform_unsatisfied',topology.mode);

  // Connector/credential evidence uses explicit rule namespaces and native attributes.
  // A credential reference alone is never enough. Values are never returned here.
  for (const [type,names] of [['connector',job.connectors],['credential',job.credentials]]) {
    for (const requirement of names) {
      const evidence = derived.bindings.filter(b=>b.capability===`${type}.${requirement}`);
      const candidates = evidence.filter(b => b.confidence==='VERIFIED' && allowedNodes.includes(b.nodeId) &&
        (topology.mode==='DISTRIBUTED' || compatibleNodes.includes(b.nodeId)) && scan.items.some(i=>i.id===b.resourceId &&
          (type==='connector' ? i.attributes.installed===true && i.attributes.configured===true && i.attributes.authenticationState==='AUTHENTICATED' :
            i.attributes.present===true && i.attributes.authorizationState==='VERIFIED' &&
            job.permissions.filter(p=>p.kind==='credential-use').every(p=>String(i.attributes.authorizedScopes??'').split(',').includes(p.scope)))));
      requirements.push({type,requirement,satisfied:candidates.length>0,candidates,evidence});
      if (!candidates.length) add(type==='connector'?'CONNECTOR_REQUIRED':'CREDENTIAL_REQUIRED',`${type}_not_verified`,requirement);
    }
  }
  if (topology.mode === 'COLOCATED' && requirements.every(r=>r.satisfied)) {
    compatibleNodes = compatibleNodes.filter(node=>requirements.every(r=>r.candidates.some(c=>c.nodeId===node)));
    if (!compatibleNodes.length && !reasons.some(r=>r.code==='placement_or_platform_unsatisfied')) add('UNSUPPORTED','connector_credential_colocation_unsatisfied',topology.mode);
  }
  const runtimeInputs = (job.inputs.required ?? []).map(id=>({id,kind:'INPUT',required:true,state:Object.hasOwn(inputs,id)?'SUPPLIED_UNVALIDATED':'REQUIRED'}));
  for (const r of job.resources.filter(r=>r.required)) {
    runtimeInputs.push({id:r.id,kind:'RESOURCE_SELECTION',required:true,state:'REQUIRED',count:r.count,candidateNodeIds:compatibleNodes});
    if (compatibleNodes.length<r.count) add('UNSUPPORTED','insufficient_compatible_resources',r.id);
  }
  for (const key of contract?.configuration ?? []) if (!Object.hasOwn(configuration,key) || configuration[key]===null || configuration[key]==='') add('CONFIGURATION_REQUIRED','operator_configuration_missing',key);
  const consequential = job.permissions.filter(p=>p.kind!=='read-only' && !(p.kind==='local-mutation' && p.scope==='run-output'));
  const approvalRequired = job.approval.required || consequential.length>0 || ['high','critical'].includes(job.risk);
  const primaryState = states.slice(1).find(s=>reasons.some(r=>r.state===s)) ?? 'READY';
  return {schema:'agent-control.job-readiness/v2',id:job.id,version:job.version,jobDigest:job.sha256 ?? null,pattern:job.pattern,
    objective:job.description,assessmentScope:'PUBLISHED_DECLARED_CAPABILITIES',primaryState,technicalReadiness:primaryState,reasons,requirements,
    missingCapabilities:requirements.filter(r=>r.type==='capability'&&!r.satisfied).map(r=>r.requirement),
    runtimeInputs,placement:topology,compatibleResources:compatibleNodes.map(nodeId=>({nodeId,resourceIds:[...new Set(derived.bindings.filter(b=>b.nodeId===nodeId&&b.confidence==='VERIFIED').map(b=>b.resourceId))]})),
    authority:{state:approvalRequired?'APPROVAL_REQUIRED':'NO_APPROVAL_REQUIRED',manifestApproval:job.approval.required,
      consequentialPermissions:consequential,permissions:job.permissions,executionGrant:'NOT_EVALUATED',authorityGranted:false},
    evidenceFreshness:{assessedAt:now.toISOString(),scanId:scan.id,jobResultMaxAgeSeconds:job.evidence.max_age_seconds},
    launchChecks:['validate-inputs','bind-target','admit-execution-adapter','check-scoped-permissions','check-budget','recheck-freshness'],
    authorityGranted:false,execution:'NOT_STARTED',qualification:job.qualification.status};
}
