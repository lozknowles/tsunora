import type {ResourceLoad, WorkClass, WorkStatus} from './work-queue.js';
import {batchReady, WorkQueue} from './work-queue.js';

export interface WorkQueueMetrics {
  total: number;
  byClass: Record<WorkClass, number>;
  byStatus: Record<WorkStatus, number>;
  oldestQueuedAgeMs: number;
  ready: number;
  humanReview: number;
  retrying: number;
  batches: Array<{key: string; items: number}>;
  resources: Array<{id: string; busy: number; capacity: number; utilisation: number}>;
  throughputPerHour?: number;
  estimatedDrainMs?: number;
}

const classes: WorkClass[] = ['interactive', 'priority', 'background', 'batch'];
const statuses: WorkStatus[] = ['queued', 'blocked', 'claimed', 'running', 'checkpointed', 'verification-pending', 'completed', 'failed', 'human-review'];

export function workQueueMetrics(
  queue: WorkQueue,
  loads: ResourceLoad[] = [],
  now = new Date(),
  completedInWindow?: {count: number; windowMs: number},
): WorkQueueMetrics {
  const items = queue.all();
  const queued = items.filter(item => item.status === 'queued');
  const oldestQueuedAgeMs = queued.length
    ? Math.max(...queued.map(item => Math.max(0, now.getTime() - Date.parse(item.createdAt))))
    : 0;
  const byClass = Object.fromEntries(classes.map(value => [value, items.filter(item => item.class === value).length])) as Record<WorkClass, number>;
  const byStatus = Object.fromEntries(statuses.map(value => [value, items.filter(item => item.status === value).length])) as Record<WorkStatus, number>;
  const throughputPerHour = completedInWindow && completedInWindow.windowMs > 0
    ? completedInWindow.count / (completedInWindow.windowMs / 3_600_000)
    : undefined;
  const remaining = items.filter(item => !['completed', 'human-review'].includes(item.status)).length;
  return {
    total: items.length,
    byClass,
    byStatus,
    oldestQueuedAgeMs,
    ready: queue.ready(now).length,
    humanReview: byStatus['human-review'],
    retrying: items.filter(item => item.attempts > 1 && !['completed', 'human-review'].includes(item.status)).length,
    batches: [...batchReady(queue.ready(now))].map(([key, values]) => ({key, items: values.length})),
    resources: loads.map(load => ({id: load.resourceId, busy: load.busy, capacity: load.capacity, utilisation: load.capacity > 0 ? load.busy / load.capacity : 0})),
    throughputPerHour,
    estimatedDrainMs: throughputPerHour && throughputPerHour > 0 ? remaining / throughputPerHour * 3_600_000 : undefined,
  };
}
