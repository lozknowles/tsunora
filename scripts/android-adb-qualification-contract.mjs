export const androidAdbObservationArtifact = Object.freeze({
  name: 'sanitized-adb-observation',
  type: 'qualification-evidence',
  schema: 'agent-control.android-adb-sanitized/v1',
  version: '1.0.0',
});

export function androidAdbQualificationDefinition(id, action, requires, retry) {
  return {
    apiVersion: 'agent-control/v1',
    kind: 'Job',
    metadata: {
      id,
      name: id.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join(' '),
      version: '1.0.0',
      description: 'Bounded physical Android wireless-ADB qualification',
    },
    spec: {
      priority: 'high',
      concurrency: 'queue',
      steps: [{
        id: 'observe',
        action,
        requires,
        resources: ['qualification/android-adb'],
        outputs: [androidAdbObservationArtifact],
        timeoutSeconds: 45,
        ...(retry ? {retry} : {}),
        verification: ['adb-target-qualified'],
      }],
    },
  };
}
