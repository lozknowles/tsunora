export interface QualificationOutputBudgetBounds {
  defaultTokens: number;
  minimumTokens: number;
  maximumTokens: number;
}

export function parseQualificationOutputBudget(value: string | undefined, bounds: QualificationOutputBudgetBounds): number {
  const tokens = Number(value ?? String(bounds.defaultTokens));
  if (!Number.isSafeInteger(tokens) || tokens < bounds.minimumTokens || tokens > bounds.maximumTokens) {
    throw new Error(`qualification_output_budget_invalid:${value ?? 'default'}`);
  }
  return tokens;
}
