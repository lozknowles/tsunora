import {ActionFailure, ActionRegistry} from './job-runtime.js';
import {registerGovernedGitActions} from './governed-git-actions.js';

interface CandidateEvent {id: string; title: string; startsAt: string; source: string;}
function candidates(value: unknown): CandidateEvent[] {
  if (!Array.isArray(value)) throw new ActionFailure('events_schema_invalid:not_array', 'verification');
  for (const item of value) if (!item || typeof item !== 'object' || typeof (item as CandidateEvent).id !== 'string' || typeof (item as CandidateEvent).title !== 'string' || Number.isNaN(Date.parse((item as CandidateEvent).startsAt)) || typeof (item as CandidateEvent).source !== 'string') throw new ActionFailure('events_schema_invalid:item', 'verification');
  return value as CandidateEvent[];
}

export function registerReferenceActions(registry = new ActionRegistry()) {
  registry.registerReadOnly('qualification.dashboard.running-state@1.0.0', async context => {
    const seconds = Number(context.parameters.durationSeconds ?? 20);
    const result = await context.ownedExecution.runProcess({
      command: process.execPath,
      args: ['-e', 'const delay=Number(process.argv[1]);if(!Number.isFinite(delay)||delay<0)process.exit(2);setTimeout(()=>process.exit(0),delay)', String(seconds * 1000)],
      maxOutputBytes: 4096,
    }, context.signal);
    if (result.exitCode !== 0) throw new ActionFailure('dashboard_running_state_qualification_process_failed', 'execution');
    return {artifacts: [{name: 'liveness-report', value: {durationSeconds: seconds, completed: true, externalSideEffects: false}}], evidence: [`Observed governed RUNNING state for ${seconds} seconds without external work`], verification: ['dashboard-running-state-observed'], detail: `dashboard RUNNING-state qualification completed after ${seconds}s`};
  });
  registry.registerReadOnly('qualification.events.discover@1.0.0', async context => {
    if (context.signal.aborted) throw new ActionFailure('cancelled', 'execution');
    const at = new Date(context.run.requestedAt), values: CandidateEvent[] = [
      {id: 'fixture-event-1', title: 'Community walk', startsAt: new Date(at.getTime() + 86400000).toISOString(), source: 'qualification-fixture'},
      {id: 'fixture-event-2', title: 'Village meeting', startsAt: new Date(at.getTime() + 172800000).toISOString(), source: 'qualification-fixture'},
    ];
    return {artifacts: [{name: 'candidates', value: values}], evidence: ['Fixture discovery executed without external publication'], verification: ['events-schema-v3'], detail: `discovered ${values.length} fixture events`};
  });
  registry.registerReadOnly('qualification.events.reconcile@1.0.0', async context => {
    const input = context.inputArtifacts.find(artifact => artifact.name === 'candidates'); if (!input) throw new ActionFailure('candidate_artifact_required', 'configuration');
    const values = candidates(context.readArtifact(input.id)), reconciled = {events: values, preservedExisting: Number(context.parameters.existingRecords ?? 3), additions: values.length, removals: 0};
    return {artifacts: [{name: 'reconciled', value: reconciled}], evidence: [`Reconciled ${values.length} fixture events; preserved ${reconciled.preservedExisting} existing records`], verification: ['reconciliation-preserves-existing'], detail: `reconciled ${values.length} events`};
  });
  registry.registerReadOnly('qualification.events.build@1.0.0', async context => {
    const input = context.inputArtifacts.find(artifact => artifact.name === 'reconciled'); if (!input) throw new ActionFailure('reconciled_artifact_required', 'configuration');
    const value = context.readArtifact(input.id) as {events?: unknown[]; removals?: number}; if (!Array.isArray(value.events) || value.removals !== 0) throw new ActionFailure('build_validation_failed', 'verification');
    return {artifacts: [{name: 'build-report', value: {ok: true, eventCount: value.events.length, target: 'non-production-fixture'}}], evidence: ['Non-production fixture build validation passed'], verification: ['build-passed'], detail: 'fixture build passed'};
  });
  registry.registerReadOnly('qualification.events.publish@1.0.0', async context => {
    if (context.parameters.publish !== false) throw new ActionFailure('production_publish_not_authorised', 'policy_rejection');
    const input = context.inputArtifacts.find(artifact => artifact.name === 'build-report'); if (!input || !(context.readArtifact(input.id) as {ok?: boolean}).ok) throw new ActionFailure('verified_build_required', 'verification');
    return {artifacts: [{name: 'release', value: {published: false, target: 'qualification-fixture', immutable: true}}], evidence: ['Publish step exercised in non-production no-op mode'], verification: ['publication-policy-respected'], detail: 'safe no-op publication'};
  });
  registry.registerReadOnly('qualification.events.verify@1.0.0', async context => {
    const release = context.inputArtifacts.find(artifact => artifact.name === 'release'); if (!release) throw new ActionFailure('release_artifact_required', 'configuration'); const value = context.readArtifact(release.id) as {target?: string; immutable?: boolean};
    if (value.target !== 'qualification-fixture' || value.immutable !== true) throw new ActionFailure('target_verification_failed', 'verification');
    return {artifacts: [{name: 'verification-report', value: {ok: true, target: value.target}}], evidence: ['Fixture target independently verified'], verification: ['target-verified'], detail: 'fixture target verified'};
  });
  return registerGovernedGitActions(registry);
}
