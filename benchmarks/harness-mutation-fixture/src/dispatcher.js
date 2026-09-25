import {authorizeTool} from './policy.js';
import {createAttemptTelemetry} from './telemetry.js';

export function dispatchAttempt(input) {
  const authorization = authorizeTool(input.authorization);
  if (!authorization.allowed) return {accepted: false, authorization, telemetry: null};
  const telemetry = createAttemptTelemetry({
    taskId: input.taskId,
    profile: input.profile,
    usage: input.usage,
    verifierResult: input.verifierResult,
  });
  return {accepted: true, authorization, telemetry};
}
