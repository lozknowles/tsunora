import assert from 'node:assert/strict';
import test from 'node:test';
import {controlRoomView} from './control-room.js';
import type {WorkQueueMetrics} from '../control/work-observability.js';

const metrics: WorkQueueMetrics = {total: 12, ready: 7, humanReview: 2, retrying: 1, oldestQueuedAgeMs: 7200000, byClass: {interactive: 1, priority: 2, background: 3, batch: 6}, byStatus: {queued: 7, blocked: 0, claimed: 1, running: 1, checkpointed: 0, 'verification-pending': 0, completed: 1, failed: 0, 'human-review': 2}, batches: [{key: 'photos', items: 6}], resources: [{id: 'worker-foo', busy: .25, capacity: 1, utilisation: .25}], throughputPerHour: 20, estimatedDrainMs: 1800000};
const plain = (value: string) => value.replace(/\{\/?[a-z]+(?:-[a-z]+)?\}/gi, '');
const android = {resourceId: 'android-test', state: 'node-degraded' as const, detail: 'SSH ready; Android node unavailable', recovered: false};

test('control room view exposes compact queue and configured Android state', () => {
  const view = controlRoomView(metrics, android), queue = plain(view.queue), resources = plain(view.resources);
  assert.match(queue, /R 7/); assert.match(queue, /REV 2/); assert.match(queue, /photos/); assert.match(queue, /ETA 30m/); assert.match(resources, /android-test NODE-DEGRADED/); assert.match(resources, /worker-foo\s+25%/);
});
test('control room emits semantic colour and meters', () => {
  const view = controlRoomView(metrics, android);
  assert.match(view.queue, /\{green-fg\}R 7/); assert.match(view.queue, /█/); assert.match(view.resources, /\{red-fg\}NODE-DEGRADED/);
});
test('control room marks recovered Android resource compactly', () => {
  const resources = plain(controlRoomView(metrics, {...android, state: 'capability-ready', detail: 'recovered', recovered: true}).resources);
  assert.match(resources, /CAPABILITY-READY REC/); assert.match(resources, /recovered/);
});
test('control room starts safely with no Android resource', () => {
  assert.match(plain(controlRoomView(metrics).resources), /Android UNCONFIGURED/);
});
