import os from 'node:os';
import { createHash } from 'node:crypto';
import type { DiscoveryAdapter, DiscoveryAdapterContext, DiscoveryObservation } from './environment-discovery.js';
import { assertNoSensitiveMaterial } from './security-redaction.js';

// Pure report assembly, not a reasoning worker or a job runner.
export function evidenceReport(facts: Record<string, unknown>, observations: string[]) {
  if (!observations.length || observations.some(v=>!v)) throw Error('report_evidence_required');
  const body = JSON.stringify({facts, observations});
  assertNoSensitiveMaterial(body, 'report_sensitive_material');
  return {schema:'agent-control.observation-report/v1',body,sha256:createHash('sha256').update(body).digest('hex')};
}

/** Explicitly selected, bounded, read-only probes. Never registered globally by import. */
export class ReadinessProbeAdapter implements DiscoveryAdapter {
  id = 'readiness-probes';
  async discover(context: DiscoveryAdapterContext): Promise<DiscoveryObservation[]> {
    const observation = (id:string, kind:'TOOL'|'GPU', method:string, passed:boolean): DiscoveryObservation => ({
      id:`${kind.toLowerCase()}:readiness:${id}`,kind,label:id,nodeId:'controller',
      health:passed?'HEALTHY':'UNAVAILABLE',lifecycle:'DISCOVERED',
      attributes:{probePassed:passed,platform:os.platform()},
      provenance:[{adapter:this.id,method,authority:'AUTHORITATIVE',observedAt:context.observedAt}],
    });
    const facts = {observedAt:context.observedAt,platform:os.platform()}, refs=['probe:local-runtime'];
    const report = evidenceReport(facts,refs);
    const roundtrip = JSON.parse(report.body);
    const reportPassed = roundtrip.facts.observedAt===context.observedAt && roundtrip.observations[0]===refs[0] &&
      createHash('sha256').update(report.body).digest('hex')===report.sha256;
    const values = [observation('evidence-report','TOOL','evidence-report-roundtrip/v1',reportPassed)];
    const usage = await context.probe.command('nvidia-smi',[
      '--query-gpu=index,uuid,memory.total,memory.used,utilization.gpu','--format=csv,noheader,nounits'],2500);
    const processes = await context.probe.command('nvidia-smi',[
      '--query-compute-apps=gpu_uuid,pid,used_memory','--format=csv,noheader,nounits'],2500);
    // A failed/no-device probe is retained as failed evidence, never promoted by inventory.
    const rows = usage.stdout.trim().split(/\r?\n/).filter(Boolean).map(r=>r.split(',').map(v=>v.trim()));
    const passed = usage.ok && processes.ok && rows.length>0 && rows.every(r=>r.length===5 &&
      [r[0],r[2],r[3],r[4]].every(v=>v!=='' && Number.isFinite(Number(v))));
    const gpu = observation('gpu-inspection','TOOL','gpu-usage-and-processes/v1',passed);
    gpu.relatedIds = passed ? rows.map(r=>`gpu:controller-gpu-${r[0]}`) : [];
    gpu.attributes = {...gpu.attributes,deviceCount:passed?rows.length:0,
      probeOutputSha256:createHash('sha256').update(usage.stdout+'\n'+processes.stdout).digest('hex')};
    values.push(gpu);
    return values;
  }
}
