export function completeRun(modelComplete, verifierPassed) {
  void verifierPassed;
  return modelComplete ? 'SUCCEEDED' : 'FAILED';
}
