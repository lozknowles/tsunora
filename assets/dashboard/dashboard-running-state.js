(function attachAgentControlRunningState(root) {
  const terminal = new Set(['SUCCEEDED', 'FAILED', 'DEGRADED', 'BLOCKED', 'CANCELLED', 'PAUSED', 'MISSED']);
  const age = (milliseconds) => {
    const seconds = Math.max(0, Math.floor(milliseconds / 1000));
    return seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };
  const liveness = (status, updatedAt, currentTime = Date.now(), staleAfterMs = 120000) => {
    if (status !== 'RUNNING') {
      const labels = {WAITING: 'Waiting; not actively executing', RECONNECTING: 'Reconciling authoritative execution state', AUTHENTICATION_BLOCKED: 'Waiting for human authentication', CANCELLING: 'Termination requested; cleanup verification pending', CLEANUP_UNCERTAIN: 'Cleanup could not be proven', DISCONNECTED: 'Execution continuity is not proven'};
      return {active: false, stale: false, ageMs: null, label: labels[status] || 'Not actively executing'};
    }
    const timestamp = Date.parse(updatedAt || '');
    if (!Number.isFinite(timestamp)) return {active: true, stale: true, ageMs: null, label: 'No update timestamp reported'};
    const ageMs = Math.max(0, currentTime - timestamp), stale = ageMs >= staleAfterMs;
    return {active: true, stale, ageMs, label: stale ? `no update for ${age(ageMs)}` : `updated ${age(ageMs)} ago`};
  };
  const metric = (value, fallback = 'Not reported') => value === null || value === undefined || value === '' ? fallback : String(value);
  const usage = telemetry => {
    const fields = [telemetry?.freshInputTokens, telemetry?.cachedInputTokens, telemetry?.cacheWriteTokens, telemetry?.outputTokens, telemetry?.reasoningTokens, telemetry?.totalTokens, telemetry?.cost];
    if (fields.every(value => value === null || value === undefined)) return {available: false, label: 'Usage reported on completion'};
    return {available: true, label: `fresh ${metric(telemetry?.freshInputTokens)} · cache read ${metric(telemetry?.cachedInputTokens)} · cache write ${metric(telemetry?.cacheWriteTokens)} · output ${metric(telemetry?.outputTokens)} · reasoning ${metric(telemetry?.reasoningTokens)} · total ${metric(telemetry?.totalTokens)} · cost ${metric(telemetry?.cost)}`};
  };
  const rollup = stages => {
    const activeIndex = stages.findIndex(stage => stage.status === 'RUNNING');
    return {position: activeIndex < 0 ? null : activeIndex + 1, total: stages.length, stages: stages.map(stage => ({name: stage.name, status: stage.status, active: stage.status === 'RUNNING', waiting: stage.status === 'WAITING' || stage.status === 'QUEUED', blocked: stage.status === 'BLOCKED'}))};
  };
  const shouldPulse = status => status === 'RUNNING';
  const terminalShouldPulse = status => terminal.has(status) ? false : shouldPulse(status);
  root.AgentControlRunningState = {age, liveness, metric, usage, rollup, shouldPulse, terminalShouldPulse};
})(typeof window === 'undefined' ? globalThis : window);
