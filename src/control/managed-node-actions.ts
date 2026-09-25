import {ActionFailure, ActionRegistry} from './job-runtime.js';
import {ManagedNodeManager, type ManagedNodeOperation, type ManagedNodeRequest} from './managed-node.js';

const INSPECTION_OPERATIONS = new Set<ManagedNodeOperation>(['system.identity', 'process.list', 'logs.read', 'package.query', 'service.status', 'housekeeping.preview']);
const MAINTENANCE_OPERATIONS = new Set<ManagedNodeOperation>(['package.install', 'package.remove', 'package.update', 'service.start', 'service.stop', 'service.restart', 'housekeeping.journal-vacuum', 'runtime.update', 'system.reboot', 'system.shutdown']);

function request(parameters: Record<string, unknown>, allowed: Set<ManagedNodeOperation>): ManagedNodeRequest {
  const operation = parameters.operation;
  if (typeof operation !== 'string' || !allowed.has(operation as ManagedNodeOperation)) throw new ActionFailure('managed_node_operation_not_allowed', 'configuration');
  const target = parameters.target === undefined ? undefined : String(parameters.target), value = parameters.value === undefined ? undefined : typeof parameters.value === 'number' ? parameters.value : String(parameters.value);
  return {operation: operation as ManagedNodeOperation, target, value};
}

function failure(error: unknown): never {
  const detail = error instanceof Error ? error.message : String(error);
  const failureClass = /approval|protected_workload|not_approved|offline|unavailable_while_degraded/.test(detail)
    ? 'policy_rejection'
    : /invalid|unconfigured|not_allowed|managed_node_missing/.test(detail)
      ? 'configuration'
      : /authentication|sudo/.test(detail)
        ? 'authentication'
        : 'execution';
  throw new ActionFailure(detail, failureClass, failureClass === 'execution');
}

export function registerManagedNodeActions(manager: ManagedNodeManager, registry = new ActionRegistry()) {
  registry.registerConsequentialControl('managed-node.inspect@1.0.0', async context => {
    try {
      const operation = request(context.parameters, INSPECTION_OPERATIONS), result = await manager.execute(context.worker.id, operation, context.run.approvals, context.signal);
      if (result.exitCode !== 0) throw new ActionFailure(`managed_node_operation_failed:${result.operation}:${result.exitCode}:${result.stderr.trim().slice(0, 160)}`, 'execution', true);
      return {artifacts: [{name: 'result', value: result}], evidence: [`Typed read-only operation ${result.operation} completed on worker ${context.worker.id}`], verification: ['managed-node-result-v1'], detail: `${result.operation} completed`};
    } catch (error) { if (error instanceof ActionFailure) throw error; return failure(error); }
  }, ['REMOTE_NODE']);
  registry.registerConsequentialControl('managed-node.maintain@1.0.0', async context => {
    try {
      const operation = request(context.parameters, MAINTENANCE_OPERATIONS), result = await manager.execute(context.worker.id, operation, context.run.approvals, context.signal);
      if (result.exitCode !== 0) throw new ActionFailure(`managed_node_operation_failed:${result.operation}:${result.exitCode}:${result.stderr.trim().slice(0, 160)}`, result.exitCode === 77 ? 'authentication' : 'execution');
      return {artifacts: [{name: 'result', value: result}], evidence: [`Approved typed maintenance operation ${result.operation} completed on worker ${context.worker.id}`], verification: ['managed-node-maintenance-result-v1'], detail: `${result.operation} completed`};
    } catch (error) { if (error instanceof ActionFailure) throw error; return failure(error); }
  }, ['REMOTE_NODE', 'FILESYSTEM_WRITE', 'DESTRUCTIVE']);
  return registry;
}
