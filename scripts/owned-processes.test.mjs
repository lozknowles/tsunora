import assert from 'node:assert/strict';
import test from 'node:test';
import {reconcileOwnedEntries} from './owned-processes.mjs';

test('owned-process reconciliation drops dead and duplicate configured services', () => {
  const terminated = [];
  const entries = [{id: 'service-a', pid: 10}, {id: 'service-a', pid: 11}, {id: 'service-b', pid: 12}, {id: 'stale', pid: 13}];
  const result = reconcileOwnedEntries(entries, {isAlive: pid => pid !== 13, terminate: pid => terminated.push(pid)});
  assert.deepEqual(result, [entries[0], entries[2]]);
  assert.deepEqual(terminated, [11]);
});

test('singleton key is independent of service display identity', () => {
  const stopped = [];
  const entries = [{id: 'worker-foo', singletonKey: 'forward-a', pid: 20}, {id: 'remote-bar', singletonKey: 'forward-a', pid: 21}];
  assert.deepEqual(reconcileOwnedEntries(entries, {isAlive: () => true, terminate: pid => stopped.push(pid)}), [entries[0]]);
  assert.deepEqual(stopped, [21]);
});
