import path from 'node:path';
import {createAcpRuntime} from './acp-runtime.js';
import {configPath, loadConfig} from './config.js';
import {IdentityControlPlane} from './identity-control-plane.js';
import {buildJobRuntime, startJobScheduler} from './job-bootstrap.js';
import {ModelQualificationStore, ModelRegistry} from './model-registry.js';
import {CapabilityIntelligenceStore, registerAgentControlCoreCapabilities} from './capability-intelligence.js';
import {ResourceCodexNodeExecutionPort} from './codex-node-execution.js';

export function bootstrapAcpRuntime(environment: NodeJS.ProcessEnv = process.env) {
  const config = loadConfig(configPath(environment));
  const stateRoot = path.resolve(environment.AGENT_CONTROL_STATE_DIR || '.agent-control');
  const identities = new IdentityControlPlane(path.join(stateRoot, 'identity', 'control-plane.json'));
  const principalActorId = environment.AGENT_CONTROL_ACP_ACTOR_ID?.trim() || 'web-operator';
  try { identities.actor(principalActorId); }
  catch { throw new Error(`ACP identity admission failed: actor ${principalActorId} is not registered in ${stateRoot}`); }

  const capabilities = new CapabilityIntelligenceStore(path.join(stateRoot, 'capabilities', 'intelligence.json')); registerAgentControlCoreCapabilities(capabilities);
  const models = new ModelRegistry(config.providers, config.models, config.modelRouting, new ModelQualificationStore(path.join(stateRoot, 'model-qualification.json')), undefined, environment, capabilities);
  const codexNodeExecution = new ResourceCodexNodeExecutionPort(config.resources);
  const jobs = buildJobRuntime(config, stateRoot, undefined, undefined, models, codexNodeExecution);
  const runtime = createAcpRuntime({
    identities,
    principalActorId,
    sessionFile: path.join(stateRoot, 'acp', `${principalActorId}.sessions.json`),
    execution: {
      submit: async input => {
        let parcel = jobs.workParcels.accept(input.prompt, input.actorId, [], input.attribution);
        if (parcel.attribution) { parcel.attribution.parcelId = parcel.id; parcel = jobs.workParcels.store.update(parcel); }
        return {parcelId: parcel.id, status: parcel.status};
      },
      cancel: input => { jobs.workParcels.cancel(input.parcelId, input.actorId); },
    },
  });
  const stopScheduler = startJobScheduler(jobs, undefined, 250, error => process.stderr.write(`Agent Control ACP scheduler: ${error.message}\n`));
  return {runtime, jobs, identities, principalActorId, stateRoot, stopScheduler};
}
