/**
 * Immutable cost accounting primitives.  Price tables are supplied by the
 * operator/integration and copied into each invocation; benchmark code never
 * contains model prices.
 */
export type BillingMode = 'API_METERED' | 'SUBSCRIPTION_QUOTA' | 'EFFECTIVELY_UNMETERED' | 'LOCAL_ENERGY' | 'UNKNOWN';

export interface VersionedModelPricing {
  tableId: string;
  version: string;
  effectiveAt: string;
  source: string;
  provider: string;
  model: string;
  currency: string;
  inputPerMillionTokens: number;
  cachedInputPerMillionTokens?: number;
  cacheWritePerMillionTokens?: number;
  outputPerMillionTokens: number;
  reasoningPerMillionUnits?: number;
  fixedPerRequest?: number;
}

export interface TokenUsageForCost {
  inputTokens: number | null;
  freshInputTokens: number | null;
  cachedInputTokens: number | null;
  cacheWriteTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
}

export interface SubscriptionQuotaConsumption {
  kind: 'SUBSCRIPTION_QUOTA';
  model: string;
  unitsConsumed: number | null;
  unitLabel: string;
  availableUnits: number | null;
  percentageConsumed: number | null;
  resetAt: string | null;
  resetPeriod: string | null;
  source: string;
}

export interface LocalEnergyMeasurement {
  kind: 'LOCAL_ENERGY';
  device: string;
  model: string;
  executionDurationMs: number;
  averagePowerWatts: number | null;
  energyWh: number | null;
  electricityPricePerKwh: number | null;
  currency: string | null;
  estimatedElectricityCost: number | null;
  batteryPercentBefore: number | null;
  batteryPercentAfter: number | null;
  thermalState: string | null;
  throttled: boolean | null;
  tokensPerSecond: number | null;
  estimate: boolean;
  measurementSource: string;
}

export interface InvocationCostAccounting {
  billingMode: BillingMode;
  cloud?: {
    usage: TokenUsageForCost;
    pricingBasis: VersionedModelPricing;
    calculatedApiCost: number | null;
  };
  subscription?: SubscriptionQuotaConsumption;
  localEnergy?: LocalEnergyMeasurement;
  infrastructureCost?: {amount: number | null; currency: string | null; estimate: boolean; source: string; detail: string};
}

const nonNegative = (value: number | null | undefined) => value === null || value === undefined || (Number.isFinite(value) && value >= 0);
const requireNonNegative = (value: number | null | undefined, label: string) => { if (!nonNegative(value)) throw new Error(`cost_${label}_invalid`); };

export function calculateVersionedApiCost(usage: TokenUsageForCost, pricing: VersionedModelPricing): number | null {
  for (const [name, value] of Object.entries(usage)) requireNonNegative(value, name);
  for (const [name, value] of Object.entries(pricing)) if (name.endsWith('Tokens') || name.endsWith('Units') || name.endsWith('Request')) requireNonNegative(value as number | undefined, name);
  if (!pricing.tableId || !pricing.version || !pricing.source || !pricing.currency || !pricing.provider || !pricing.model || !Number.isFinite(Date.parse(pricing.effectiveAt))) throw new Error('cost_pricing_basis_invalid');
  if (usage.freshInputTokens === null || usage.outputTokens === null) return null;
  if ((usage.cachedInputTokens ?? 0) > 0 && pricing.cachedInputPerMillionTokens === undefined) return null;
  if ((usage.cacheWriteTokens ?? 0) > 0 && pricing.cacheWritePerMillionTokens === undefined) return null;
  if ((usage.reasoningTokens ?? 0) > 0 && pricing.reasoningPerMillionUnits === undefined) return null;
  return (pricing.fixedPerRequest ?? 0)
    + usage.freshInputTokens * pricing.inputPerMillionTokens / 1_000_000
    + (usage.cachedInputTokens ?? 0) * (pricing.cachedInputPerMillionTokens ?? 0) / 1_000_000
    + (usage.cacheWriteTokens ?? 0) * (pricing.cacheWritePerMillionTokens ?? 0) / 1_000_000
    + usage.outputTokens * pricing.outputPerMillionTokens / 1_000_000
    + (usage.reasoningTokens ?? 0) * (pricing.reasoningPerMillionUnits ?? 0) / 1_000_000;
}

export function measureLocalEnergy(input: Omit<LocalEnergyMeasurement, 'kind' | 'energyWh' | 'estimatedElectricityCost'> & {energyWh?: number | null}): LocalEnergyMeasurement {
  requireNonNegative(input.executionDurationMs, 'duration'); requireNonNegative(input.averagePowerWatts, 'power'); requireNonNegative(input.electricityPricePerKwh, 'tariff');
  const derivedWh = input.energyWh ?? (input.averagePowerWatts === null ? null : input.averagePowerWatts * input.executionDurationMs / 3_600_000);
  requireNonNegative(derivedWh, 'energy');
  return {...input, kind: 'LOCAL_ENERGY', energyWh: derivedWh, estimatedElectricityCost: derivedWh === null || input.electricityPricePerKwh === null ? null : derivedWh / 1000 * input.electricityPricePerKwh};
}

export function quotaPercentage(unitsConsumed: number | null, availableUnits: number | null): number | null {
  requireNonNegative(unitsConsumed, 'quota_consumed'); requireNonNegative(availableUnits, 'quota_available');
  return unitsConsumed === null || availableUnits === null || availableUnits === 0 ? null : unitsConsumed / availableUnits * 100;
}
