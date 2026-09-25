import assert from 'node:assert/strict';
import test from 'node:test';
import {registerReferenceActions} from './reference-actions.js';
import type {OwnedProcessRequest} from './owned-process.js';

test('dashboard liveness qualification uses the owned-process boundary', async () => {
  let observed = false;
  const output = await registerReferenceActions().handler('qualification.dashboard.running-state@1.0.0')({
    parameters: {durationSeconds: 5},
    signal: new AbortController().signal,
    ownedExecution: {
      activePids: () => [],
      terminateAll: async () => ({outcome: 'confirmed', reason: 'fixture', requestedAt: new Date().toISOString(), completedAt: new Date().toISOString(), processes: []}),
      runProcess: async (request: OwnedProcessRequest, signal?: AbortSignal) => {
        observed = true;
        assert.equal(request.command, process.execPath);
        assert.equal(request.args?.at(-1), '5000');
        assert.equal(signal?.aborted, false);
        return {pid: 1, exitCode: 0, signal: null, stdout: '', stderr: ''};
      },
    },
  } as never);
  assert.equal(observed, true);
  assert.equal(output.artifacts?.[0].name, 'liveness-report');
  assert.deepEqual(output.verification, ['dashboard-running-state-observed']);
});
