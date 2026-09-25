import type {WorkQueueMetrics} from '../control/work-observability.js';
import type {AndroidRecoveryState} from '../control/android-recovery.js';
import {colorMeter, semanticMeter, tag} from './theme.js';

export interface ControlRoomView {queue: string; resources: string;}
const age = (ms: number) => ms < 60000 ? `${Math.round(ms / 1000)}s` : ms < 3600000 ? `${Math.round(ms / 60000)}m` : `${(ms / 3600000).toFixed(1)}h`;
const row = (label: string, count: number, max: number, color: string) => `${label.padEnd(5)} {${color}-fg}${String(count).padStart(2)}{/${color}-fg} ${semanticMeter(max ? count / max : 0, color, 8)}`;

export function controlRoomView(metrics: WorkQueueMetrics, android?: AndroidRecoveryState): ControlRoomView {
  const max = Math.max(1, metrics.byClass.interactive, metrics.byClass.priority, metrics.byClass.background, metrics.byClass.batch);
  const batches = metrics.batches.slice(0, 2).map(batch => ` ${batch.key.slice(0, 10).padEnd(10)} ${String(batch.items).padStart(2)} ${semanticMeter(batch.items / Math.max(1, metrics.batches[0]?.items ?? batch.items), 'green', 6)}`);
  const drain = metrics.estimatedDrainMs === undefined ? '--' : age(metrics.estimatedDrainMs);
  const androidStatus = android?.state.toUpperCase() ?? 'UNCONFIGURED';
  return {
    queue: [
      `${tag('ready', `R ${metrics.ready}`)} ${tag(metrics.humanReview ? 'review' : 'ready', `REV ${metrics.humanReview}`)} ${tag(metrics.retrying ? 'retry' : 'ready', `RTY ${metrics.retrying}`)}`,
      row('INT', metrics.byClass.interactive, max, 'cyan'), row('PRI', metrics.byClass.priority, max, 'magenta'), row('BG', metrics.byClass.background, max, 'yellow'), row('BATCH', metrics.byClass.batch, max, 'green'),
      `{gray-fg}AGE{/gray-fg} ${age(metrics.oldestQueuedAgeMs)}  {gray-fg}ETA{/gray-fg} ${drain}`,
      metrics.throughputPerHour === undefined ? '{gray-fg}RATE --{/gray-fg}' : `{gray-fg}RATE{/gray-fg} ${metrics.throughputPerHour.toFixed(1)}/h`,
      ...(batches.length ? ['{cyan-fg}GROUPS{/cyan-fg}', ...batches] : []),
    ].join('\n'),
    resources: [
      android ? `Android ${android.resourceId} ${tag(androidStatus, androidStatus)}${android.recovered ? ' {green-fg}REC{/green-fg}' : ''}` : 'Android {gray-fg}UNCONFIGURED{/gray-fg}',
      android ? ` {gray-fg}${android.detail.slice(0, 28)}${android.detail.length > 28 ? '...' : ''}{/gray-fg}` : '',
      ...metrics.resources.map(resource => `${resource.id.slice(0, 10).padEnd(10)} ${String(Math.round(resource.utilisation * 100)).padStart(3)}% ${colorMeter(resource.utilisation, 7)}`),
    ].filter(Boolean).join('\n'),
  };
}
