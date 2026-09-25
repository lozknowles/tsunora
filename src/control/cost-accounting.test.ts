import assert from 'node:assert/strict';
import test from 'node:test';
import {calculateVersionedApiCost, measureLocalEnergy, quotaPercentage} from './cost-accounting.js';

const pricing = {tableId: 'operator-pricing', version: '2026-08-31', effectiveAt: '2026-08-31T00:00:00.000Z', source: 'operator-approved fixture', provider: 'cloud', model: 'luna', currency: 'GBP', inputPerMillionTokens: 2, cachedInputPerMillionTokens: .5, outputPerMillionTokens: 8, reasoningPerMillionUnits: 1};
const usage = {inputTokens: 1_000, freshInputTokens: 800, cachedInputTokens: 200, cacheWriteTokens: null, outputTokens: 100, reasoningTokens: 40};

test('versioned pricing snapshots calculate fresh cached output and reasoning charges', () => {
  assert.equal(calculateVersionedApiCost(usage, pricing), .00254);
  assert.equal(calculateVersionedApiCost({...usage, cachedInputTokens: 200}, {...pricing, cachedInputPerMillionTokens: undefined}), null);
});

test('local energy remains unknown when power or tariff is not measured and derives cost when both exist', () => {
  const unknown = measureLocalEnergy({device: 'Pixel', model: 'E2B', executionDurationMs: 1_000, averagePowerWatts: null, electricityPricePerKwh: null, currency: null, batteryPercentBefore: null, batteryPercentAfter: null, thermalState: null, throttled: null, tokensPerSecond: null, estimate: true, measurementSource: 'unavailable'});
  assert.equal(unknown.energyWh, null); assert.equal(unknown.estimatedElectricityCost, null);
  const measured = measureLocalEnergy({device: 'Pixel', model: 'E2B', executionDurationMs: 3_600_000, averagePowerWatts: 2, electricityPricePerKwh: .25, currency: 'GBP', batteryPercentBefore: 80, batteryPercentAfter: 75, thermalState: 'nominal', throttled: false, tokensPerSecond: 10, estimate: true, measurementSource: 'power estimate'});
  assert.equal(measured.energyWh, 2); assert.equal(measured.estimatedElectricityCost, .0005);
});

test('quota consumption is represented as consumption, never as a fabricated price', () => {
  assert.equal(quotaPercentage(10, 100), 10); assert.equal(quotaPercentage(null, 100), null);
});
