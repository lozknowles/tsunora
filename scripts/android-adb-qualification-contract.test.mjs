import assert from 'node:assert/strict';
import test from 'node:test';
import {
  androidAdbObservationArtifact,
  androidAdbQualificationDefinition,
} from './android-adb-qualification-contract.mjs';

test('Android ADB physical qualification declares its sanitized artifact contract', () => {
  const definition = androidAdbQualificationDefinition(
    'android-adb-governed-status',
    'qualification.android-adb-status@1.0.0',
    ['android.adb.local'],
  );

  assert.deepEqual(definition.spec.steps[0].outputs, [androidAdbObservationArtifact]);
  assert.deepEqual(androidAdbObservationArtifact, {
    name: 'sanitized-adb-observation',
    type: 'qualification-evidence',
    schema: 'agent-control.android-adb-sanitized/v1',
    version: '1.0.0',
  });
});

test('Android ADB reconnect qualification has one bounded production retry', () => {
  const retry = {attempts: 1, backoffSeconds: 1, overallDeadlineSeconds: 90};
  const definition = androidAdbQualificationDefinition(
    'android-adb-governed-reconnect',
    'qualification.android-adb-reconnect@1.0.0',
    ['android.adb.ensure-connected'],
    retry,
  );

  assert.deepEqual(definition.spec.steps[0].retry, retry);
});
