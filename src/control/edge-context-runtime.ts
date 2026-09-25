import {createHash} from 'node:crypto';

export type EdgeContextTier = 'E2B' | 'E4B';
export interface EdgeRuntimeMeasurement {
  tier: EdgeContextTier;
  model: string;
  quantisation: string;
  contextLimitTokens: number;
  runtime: string;
  runtimeVersion: string;
  prefillTokensPerSecond: number;
  decodeTokensPerSecond: number;
  peakRamBytes: number;
  batteryPercentBefore: number;
  batteryPercentAfter: number;
  thermalCelsiusBefore: number;
  thermalCelsiusPeak: number;
  connectionMethod: string;
  maximumPracticalContextTokens: number;
  durationMs: number;
  completed: boolean;
  errors: string[];
  observedAt: string;
}
export interface EdgeRuntimeQualification {
  schema: 'agent-control.edge-context-runtime-qualification/v1';
  tier: EdgeContextTier;
  state: 'QUALIFIED' | 'NOT_AVAILABLE' | 'FAILED' | 'IMPRactical';
  measurement?: EdgeRuntimeMeasurement;
  reasons: string[];
  evidenceSha256: string;
}
export interface EdgeRuntimePolicy {minimumDecodeTokensPerSecond: number; maximumThermalRiseCelsius: number; maximumBatteryDropPercent: number; minimumPracticalContextTokens: number;}
export const DEFAULT_EDGE_RUNTIME_POLICY: Record<EdgeContextTier, EdgeRuntimePolicy> = {
  E2B: {minimumDecodeTokensPerSecond: 6, maximumThermalRiseCelsius: 12, maximumBatteryDropPercent: 8, minimumPracticalContextTokens: 2_048},
  E4B: {minimumDecodeTokensPerSecond: 4, maximumThermalRiseCelsius: 10, maximumBatteryDropPercent: 8, minimumPracticalContextTokens: 2_048},
};

export function qualifyEdgeRuntime(tier: EdgeContextTier, measurement?: EdgeRuntimeMeasurement, policy = DEFAULT_EDGE_RUNTIME_POLICY[tier]): EdgeRuntimeQualification {
  if (!measurement) return {schema: 'agent-control.edge-context-runtime-qualification/v1', tier, state: 'NOT_AVAILABLE', reasons: ['runtime_or_model_not_observed'], evidenceSha256: createHash('sha256').update(`${tier}:not-available`).digest('hex')};
  if (measurement.tier !== tier) throw new Error(`edge_runtime_tier_mismatch:${tier}:${measurement.tier}`);
  const numeric = [measurement.contextLimitTokens, measurement.prefillTokensPerSecond, measurement.decodeTokensPerSecond, measurement.peakRamBytes, measurement.batteryPercentBefore, measurement.batteryPercentAfter, measurement.thermalCelsiusBefore, measurement.thermalCelsiusPeak, measurement.maximumPracticalContextTokens, measurement.durationMs];
  if (numeric.some(value => !Number.isFinite(value) || value < 0)) throw new Error('edge_runtime_measurement_invalid');
  const reasons: string[] = [];
  if (!measurement.completed || measurement.errors.length) reasons.push(...(measurement.errors.length ? measurement.errors.map(error => `runtime_error:${error}`) : ['runtime_incomplete']));
  if (measurement.decodeTokensPerSecond < policy.minimumDecodeTokensPerSecond) reasons.push(`decode_throughput_below_${policy.minimumDecodeTokensPerSecond}`);
  const thermalRise = measurement.thermalCelsiusPeak - measurement.thermalCelsiusBefore;
  if (thermalRise > policy.maximumThermalRiseCelsius) reasons.push(`thermal_rise_above_${policy.maximumThermalRiseCelsius}`);
  const batteryDrop = measurement.batteryPercentBefore - measurement.batteryPercentAfter;
  if (batteryDrop > policy.maximumBatteryDropPercent) reasons.push(`battery_drop_above_${policy.maximumBatteryDropPercent}`);
  if (measurement.maximumPracticalContextTokens < policy.minimumPracticalContextTokens || measurement.maximumPracticalContextTokens > measurement.contextLimitTokens) reasons.push('practical_context_outside_policy');
  const failed = reasons.some(reason => reason.startsWith('runtime_'));
  return {schema: 'agent-control.edge-context-runtime-qualification/v1', tier, state: failed ? 'FAILED' : reasons.length ? 'IMPRactical' : 'QUALIFIED', measurement: structuredClone(measurement), reasons, evidenceSha256: createHash('sha256').update(JSON.stringify(measurement)).digest('hex')};
}

export function usableEdgeTiers(qualifications: EdgeRuntimeQualification[]): EdgeContextTier[] {
  const e2b = qualifications.find(item => item.tier === 'E2B'), e4b = qualifications.find(item => item.tier === 'E4B');
  if (e2b?.state !== 'QUALIFIED') return [];
  return e4b?.state === 'QUALIFIED' ? ['E2B', 'E4B'] : ['E2B'];
}
