export function strategyQualified(evidence) {
  return Boolean(evidence && evidence.productionQualified && evidence.verifiedRuns >= 20 && evidence.successRate >= 0.95 && evidence.sameModelRuns >= 20);
}
