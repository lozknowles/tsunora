import assert from 'node:assert/strict';
import test from 'node:test';
import {DASHBOARD_CHARACTER_STATES, classifyDashboardTool, projectDashboardCharacterCrew, type DashboardCharacterSource} from './dashboard-characters.js';

const observedAt = '2026-09-06T12:00:00.000Z';
const current = '2026-09-06T11:59:30.000Z';
const stale = '2026-09-06T11:55:00.000Z';

function project(patch: Partial<DashboardCharacterSource> = {}) {
  return projectDashboardCharacterCrew({observedAt, ...patch});
}

function member(source: Partial<DashboardCharacterSource>, id: string) {
  return project(source).members.find(item => item.id === id)!;
}

test('dashboard character roster has stable, non-colour identities for each real dashboard area', () => {
  const crew = project();
  assert.equal(crew.schema, 'agent-control.dashboard-character-crew/v2');
  assert.deepEqual(crew.members.map(item => item.id), ['lane-master', 'prompt-reviewer', 'parcel-coordinator', 'model-scout', 'resource-guardian', 'quality-inspector']);
  assert.equal(new Set(crew.members.map(item => item.identityColor)).size, crew.members.length);
  assert.equal(new Set(crew.members.map(item => item.accessory)).size, crew.members.length);
  assert.ok(crew.members.every(item => item.accessory.length > 8 && item.navigation.target.startsWith('#')));
  assert.ok(crew.members.every(item => item.idlePersonality && item.workingPersonality));
  assert.ok(crew.members.every(item => item.animationCue.authority === 'presentation-only'));
});

test('operational state, activity and animation expression remain three explicit layers', () => {
  const crew = project({runs: [{id: 'run:one', status: 'RUNNING', requestedAt: current, updatedAt: current, steps: [{id: 'edit', action: 'repository.code-edit@1.0.0', status: 'RUNNING', startedAt: current, capabilityRequest: {requires: [{id: 'repository.write'}]}}]}]});
  const cadence = crew.members.find(item => item.id === 'lane-master')!, relay = crew.members.find(item => item.id === 'parcel-coordinator')!;
  assert.equal(cadence.operationalState, 'ROUTING');
  assert.equal(cadence.activity.kind, 'ROUTING');
  assert.equal(cadence.animationCue.authority, 'presentation-only');
  assert.equal(relay.activity.kind, 'NONE', 'a bare Run is not falsely presented as Parcel-owned work');
});

test('governed action metadata maps to subtle provider-neutral tool activity', () => {
  const cases = [
    ['repository.search@1', 'SEARCH'], ['repository.code-edit@1', 'CODE_EDIT'], ['artifact.file-read@1', 'FILE'], ['browser.navigate@1', 'WEB_BROWSER'], ['managed-node.ssh-exec@1', 'REMOTE_MACHINE'], ['qualification.test@1', 'BENCHMARK'], ['voice.transcribe@1', 'VOICE'], ['social.message@1', 'SOCIAL'], ['provider.model-discovery@1', 'MODEL_DISCOVERY'], ['bounded.action@1', 'GENERIC_TOOL'],
  ] as const;
  for (const [action, kind] of cases) assert.equal(classifyDashboardTool({action})?.kind, kind, action);
  assert.equal(classifyDashboardTool({}), null);
});

test('a real concurrent Parcel graph projects stages and parallel count without simulated progress', () => {
  const crew = project({
    parcels: [{id: 'parcel:parallel', objective: 'Inspect two independent surfaces', status: 'RUNNING', createdAt: current, updatedAt: current, stages: [
      {id: 'search', name: 'Search repository', status: 'RUNNING', startedAt: current, runId: 'run:search', dependsOn: []},
      {id: 'read', name: 'Read architecture', status: 'RUNNING', startedAt: current, runId: 'run:read', dependsOn: []},
      {id: 'verify', name: 'Verify result', status: 'QUEUED', dependsOn: ['search', 'read']},
    ]}],
    runs: [
      {id: 'run:search', status: 'RUNNING', requestedAt: current, updatedAt: current, selectedWorkers: ['worker:a'], steps: [{id: 'search-step', action: 'repository.search@1', status: 'RUNNING', startedAt: current}]},
      {id: 'run:read', status: 'RUNNING', requestedAt: current, updatedAt: current, selectedWorkers: ['worker:b'], steps: [{id: 'read-step', action: 'file.read@1', status: 'RUNNING', startedAt: current}]},
    ],
  });
  assert.equal(crew.parcels[0].parallelActive, 2);
  assert.deepEqual(crew.parcels[0].progress, {completed: 0, active: 2, waiting: 1, failed: 0, total: 3});
  assert.equal(crew.parcels[0].stages[0].tool?.kind, 'SEARCH');
  assert.equal(crew.parcels[0].stages[1].tool?.kind, 'FILE');
  assert.match(crew.headline, /2 stages executing in parallel/);
});

test('a future waiting stage cannot hide the tool used by a currently running stage', () => {
  const relay = member({
    parcels: [{id: 'parcel:active-before-input', objective: 'Read now and compose after input', status: 'RUNNING', createdAt: current, updatedAt: observedAt, stages: [
      {id: 'read', name: 'Read architecture', status: 'RUNNING', startedAt: current, runId: 'run:read'},
      {id: 'compose', name: 'Compose after answer', status: 'WAITING', waitingReason: 'Waiting for operator answer'},
    ]}],
    runs: [{id: 'run:read', status: 'RUNNING', requestedAt: current, updatedAt: current, selectedWorkers: ['reader'], steps: [{id: 'read-step', action: 'file.read@1', status: 'RUNNING', startedAt: current}]}],
  }, 'parcel-coordinator');
  assert.equal(relay.operationalState, 'EXECUTING');
  assert.equal(relay.activity.kind, 'READING');
  assert.equal(relay.activity.tool?.kind, 'FILE');
  assert.equal(relay.activity.source.id, 'read-step');
});

test('no animation-shaped input can create operational work or fake progress', () => {
  const crew = project({animationCue: {expression: 'WORKING'}, progress: 99} as Partial<DashboardCharacterSource>);
  assert.equal(crew.parcels.length, 0);
  assert.equal(crew.headline, 'Crew is watching canonical state; no Work Parcel is executing.');
  assert.ok(crew.members.every(item => item.operationalState === 'IDLE' || item.operationalState === 'UNKNOWN'));
  assert.ok(crew.members.every(item => item.activity.kind === 'NONE'));
});

test('active work wins the Lane Master pose while mixed blocked and queued activity stays visible', () => {
  const lane = member({lanes: [
    {status: 'working', elapsedMs: 12_000, lastMeaningfulActivity: current},
    {status: 'paused', lastMeaningfulActivity: current},
    {status: 'waiting', lastMeaningfulActivity: current},
  ]}, 'lane-master');
  assert.equal(lane.state, 'working');
  assert.equal(lane.counts.active, 1);
  assert.equal(lane.counts.blocked, 1);
  assert.equal(lane.counts.queued, 1);
  assert.deepEqual(lane.signals.map(item => [item.state, item.count]), [['working', 1], ['queued', 1], ['blocked', 1]]);
});

test('stale active telemetry never becomes a fabricated failure', () => {
  for (const id of ['lane-master', 'parcel-coordinator', 'quality-inspector']) {
    const source: Partial<DashboardCharacterSource> = id === 'lane-master'
      ? {lanes: [{status: 'working', lastMeaningfulActivity: stale}]}
      : id === 'parcel-coordinator'
        ? {parcels: [{status: 'RUNNING', createdAt: stale, updatedAt: stale, stages: [{status: 'RUNNING', startedAt: stale}]}]}
        : {runs: [{status: 'VERIFYING', requestedAt: stale, startedAt: stale, updatedAt: stale, steps: [{status: 'VERIFYING', startedAt: stale}]}]};
    const value = member(source, id);
    assert.equal(value.state, 'stale');
    assert.equal(value.freshness, 'stale');
    assert.notEqual(value.state, 'failed');
  }
});

test('Prompt Reviewer reports its partial instrumentation and only raises operator attention for a durable question', () => {
  const idle = member({}, 'prompt-reviewer');
  assert.equal(idle.state, 'idle');
  assert.equal(idle.instrumentation.coverage, 'partial');
  assert.match(idle.instrumentation.limitation!, /no separately instrumented prompt-review worker/i);
  const reviewing = member({parcels: [{status: 'PLANNING', createdAt: current, updatedAt: current, stages: []}]}, 'prompt-reviewer');
  assert.equal(reviewing.state, 'reviewing');
  const waiting = member({parcels: [{status: 'WAITING', createdAt: current, updatedAt: current, stages: [], context: {questions: [{status: 'OPEN', text: 'Choose the intended repository.'}]}}]}, 'prompt-reviewer');
  assert.equal(waiting.state, 'awaiting_operator');
  assert.equal(waiting.reason, 'Choose the intended repository.');
});

test('a recorded live token handoff selects the handover pose and preserves destination evidence', () => {
  const coordinator = member({
    parcels: [{status: 'RUNNING', createdAt: current, updatedAt: current, stages: [{status: 'RUNNING', startedAt: current}]}],
    tokenRouting: {
      threads: [{id: 'thread:a', parcelId: 'parcel:a', active: true, updatedAt: current}],
      decisions: [{threadId: 'thread:a', parcelId: 'parcel:a', at: current, action: 'BATON_AND_HANDOFF', outcome: 'RECORDED', reason: 'sealed baton ready', target: {providerId: 'local', modelId: 'bounded'}}],
    },
  }, 'parcel-coordinator');
  assert.equal(coordinator.state, 'handing_over');
  assert.equal(coordinator.reason, 'sealed baton ready');
  const transfer = project({
    tokenRouting: {
      threads: [{id: 'thread:a', parcelId: 'parcel:a', active: true, updatedAt: current, providerId: 'openai', accountProfileId: 'account-a', modelId: 'sol', nodeId: 'source'}],
      decisions: [{id: 'decision:a', threadId: 'thread:a', parcelId: 'parcel:a', at: current, action: 'BATON_AND_HANDOFF', outcome: 'RECORDED', batonId: 'baton:a', contextPercent: 91, reason: 'difficult reasoning complete; bounded verification remains', trigger: {kind: 'QUALITY_GATE', code: 'acceptance-review', reason: 'Predeclared acceptance failed', evidence: ['test:one']}, target: {providerId: 'local', modelId: 'qwen', nodeId: 'edge'}}],
    },
  }).batonTransfers[0];
  assert.equal(transfer.sourceType, 'token-routing');
  assert.equal(transfer.sourceEventId, 'decision:a');
  assert.equal(transfer.batonId, 'baton:a');
  assert.equal(transfer.from?.label, 'openai / account-a / sol / @ source');
  assert.equal(transfer.to?.label, 'local / qwen / @ edge');
  assert.equal(transfer.reason, 'difficult reasoning complete; bounded verification remains');
  assert.equal(transfer.triggerKind, 'QUALITY_GATE');
  assert.equal(transfer.triggerCode, 'acceptance-review');
  assert.match(transfer.explanation,/Independent quality gate acceptance-review/);
});

test('Work Parcel baton animation can originate only from a durable baton view/event', () => {
  const absent = project({parcels: [{id: 'parcel:a', status: 'RUNNING', objective: 'Continue work', createdAt: current, updatedAt: current, stages: [{id: 'one', status: 'RUNNING'}]}]});
  assert.equal(absent.batonTransfers.length, 0);
  const present = project({parcels: [{id: 'parcel:a', status: 'RUNNING', objective: 'Continue work', createdAt: current, updatedAt: current, stages: [{id: 'one', name: 'Source', status: 'SUCCEEDED', actualRoute: {workers: ['source-worker']}}, {id: 'two', name: 'Destination', status: 'RUNNING', dependsOn: ['one'], actualRoute: {workers: ['destination-worker']}}], context: {events: [{id: 'event:baton', at: current, type: 'baton.created', stageId: 'two', summary: 'Source stage sealed for destination', detail: {batonId: 'baton:parcel'}}], batonViews: [{id: 'baton:parcel', createdAt: current, sourceStageIds: ['one'], targetStageId: 'two', nextAction: 'Run destination verification', sha256: 'abc'}]}}]});
  assert.equal(present.batonTransfers.length, 1);
  assert.equal(present.batonTransfers[0].sourceEventId, 'event:baton');
  assert.equal(present.batonTransfers[0].reason, 'Run destination verification');
  assert.equal(present.batonTransfers[0].active, true);
  assert.equal(present.batonTransfers[0].from?.label, 'Worker source-worker');
  assert.equal(present.batonTransfers[0].to?.label, 'Worker destination-worker');
});

test('a lane baton is projected only from the typed authoritative lane handoff event', () => {
  const absent = project({lanes: [{id: 2, status: 'working', lastMeaningfulActivity: current, baton: {status: 'continuing', nextAction: 'work'}}]});
  assert.equal(absent.batonTransfers.length, 0);
  const present = project({events: [{id: 7, at: current, type: 'lane.handoff', payload: {fromId: 1, toId: 2, holder: 'agent:reviewer'}}]});
  assert.equal(present.batonTransfers.length, 1);
  assert.equal(present.batonTransfers[0].sourceType, 'lane');
  assert.equal(present.batonTransfers[0].sourceEventId, '7');
  assert.equal(present.batonTransfers[0].from?.label, 'Lane 1');
  assert.equal(present.batonTransfers[0].to?.label, 'Lane 2');
  assert.match(present.batonTransfers[0].reason, /agent:reviewer/);
});

test('a terminal handoff result clears the pending handover pose', () => {
  const coordinator = member({
    parcels: [{status: 'RUNNING', createdAt: current, updatedAt: current, stages: [{status: 'RUNNING', startedAt: current}]}],
    tokenRouting: {
      threads: [{id: 'thread:a', parcelId: 'parcel:a', active: true, updatedAt: current}],
      decisions: [
        {threadId: 'thread:a', parcelId: 'parcel:a', at: '2026-09-06T11:59:20.000Z', action: 'BATON_AND_HANDOFF', outcome: 'RECORDED', reason: 'sealed baton ready'},
        {threadId: 'thread:a', parcelId: 'parcel:a', at: current, action: 'BATON_AND_HANDOFF', outcome: 'SUCCEEDED', reason: 'destination continued'},
      ],
    },
  }, 'parcel-coordinator');
  assert.equal(coordinator.state, 'working');
  assert.notEqual(coordinator.reason, 'sealed baton ready');
});

test('activity matrix coalesces only canonical state and typed events into inspectable indicators', () => {
  const crew=project({
    lanes:[{id:7,name:'Review lane',status:'working',lastMeaningfulActivity:current,model:'small-reviewer'}],
    runs:[{id:'run:matrix',status:'RUNNING',requestedAt:current,updatedAt:current,steps:[{id:'step:tool',action:'repository.search@1',status:'RUNNING',startedAt:current}]}],
    systems:[{id:'controller',name:'Controller',execution:'AVAILABLE',active:1,capacity:2,lastCheckAt:current}],
    tokenRouting:{threads:[{id:'thread:matrix',parcelId:'parcel:matrix',active:true,updatedAt:current,providerId:'local-small',modelId:'small-reviewer',latest:{at:current,elapsedMs:30000}}],decisions:[{id:'route:quality',threadId:'thread:matrix',parcelId:'parcel:matrix',at:current,action:'BATON_AND_HANDOFF',outcome:'RECORDED',reason:'quality_gate_failed_governed_fallback_selected:acceptance',trigger:{kind:'QUALITY_GATE',code:'acceptance',reason:'Acceptance gate failed',evidence:['test:one']},target:{providerId:'local-strong',modelId:'strong-reviewer'}}]},
    events:[{id:31,at:current,type:'token.telemetry',payload:{providerId:'local-small',modelId:'small-reviewer'}},{id:32,at:current,type:'token.governor_transition',payload:{providerId:'local-small',modelId:'small-reviewer'}},{id:33,at:current,type:'job.run_changed'}],
  });
  const panel=crew.activityPanel,indicators=panel.groups.flatMap(group=>group.indicators),byId=Object.fromEntries(indicators.map(item=>[item.id,item]));
  assert.equal(panel.schema,'agent-control.dashboard-activity-panel/v1');
  assert.deepEqual(panel.groups.map(group=>group.id),['control','execution','providers','handoff','assurance','infrastructure']);
  assert.equal(byId.controller.state,'ACTIVE');assert.equal(byId.lanes.count,1);assert.equal(byId.tools.state,'ACTIVE');assert.equal(byId['provider-request'].state,'ACTIVE');assert.equal(byId.baton.state,'ACTIVE');
  assert.equal(byId.baton.model,'strong-reviewer');assert.match(byId.baton.explanation,/Acceptance gate failed/);assert.equal(byId.baton.eventId,'32');
  const transfer=crew.batonTransfers.find(item=>item.sourceType==='token-routing')!;assert.equal(transfer.triggerReason,'Acceptance gate failed');assert.match(transfer.explanation,/Acceptance gate failed/);
  assert.equal(byId.nodes.state,'ACTIVE');assert.ok(indicators.every(item=>item.source&&item.meaning&&item.persistence&&item.staleBehavior));
  assert.equal(panel.decorativeHeartbeat.authority,'presentation-only');assert.match(panel.decorativeHeartbeat.explanation,/not work/i);
});

test('quality handoff stays active while its destination thread executes after the source response completed',()=>{
  const crew=project({
    tokenRouting:{threads:[
      {id:'source',parcelId:'parcel:one',active:false,updatedAt:current,providerId:'local',modelId:'small',providerExecutionNodeId:'controller'},
      {id:'destination',parcelId:'parcel:one',active:true,updatedAt:current,providerId:'codex',accountProfileId:'account-a',modelId:'luna',providerExecutionNodeId:'controller'},
    ],decisions:[{id:'decision:one',threadId:'source',parcelId:'parcel:one',at:current,action:'BATON_AND_HANDOFF',outcome:'RECORDED',reason:'quality fallback selected',trigger:{kind:'QUALITY_GATE',code:'acceptance',reason:'Root cause missing',evidence:['test']},target:{providerId:'codex',accountProfileId:'account-a',modelId:'luna',providerExecutionNodeId:'controller'}}]},
    runs:[{id:'run:one',status:'RUNNING',requestedAt:current,updatedAt:current}],
  });
  const transfer=crew.batonTransfers[0],indicators=Object.fromEntries(crew.activityPanel.groups.flatMap(group=>group.indicators).map(item=>[item.id,item]));
  assert.equal(transfer.active,true);assert.equal(transfer.triggerReason,'Root cause missing');assert.equal(indicators.baton.state,'ACTIVE');assert.equal(indicators.lanes.state,'ACTIVE');assert.match(indicators.lanes.explanation,/Job execution lane/);
});

test('activity matrix labels stale, disconnected and unknown sources without inventing activity', () => {
  const crew=project({lanes:[{id:1,status:'working',lastMeaningfulActivity:stale}],systems:[{id:'offline',execution:'OFFLINE',lastCheckAt:current},{id:'unknown',execution:'UNKNOWN'}]});
  const indicators=Object.fromEntries(crew.activityPanel.groups.flatMap(group=>group.indicators).map(item=>[item.id,item]));
  assert.equal(indicators.lanes.state,'STALE');
  assert.equal(indicators.nodes.state,'DISCONNECTED');
  assert.equal(indicators['provider-request'].state,'IDLE');
  assert.equal(indicators['provider-request'].count,0);
  assert.doesNotMatch(JSON.stringify(crew.activityPanel),/Math\.random|simulated pulse/i);
});

test('cancellation requested remains cancelling until canonical cleanup is confirmed', () => {
  const requested = member({lanes: [{status: 'cancelled', lastMeaningfulActivity: current, baton: {status: 'Cancellation requested', nextAction: 'Execution provider confirms cancellation; retain evidence'}}]}, 'lane-master');
  assert.equal(requested.state, 'cancelling');
  const settled = member({lanes: [{status: 'cancelled', lastMeaningfulActivity: current, baton: {status: 'Cancellation complete', nextAction: 'Retain evidence'}}]}, 'lane-master');
  assert.equal(settled.state, 'cancelled');
  const qualityRequested = member({runs: [{status: 'CANCELLING', requestedAt: current, updatedAt: current}]}, 'quality-inspector');
  const qualitySettled = member({runs: [{status: 'CANCELLED', requestedAt: current, updatedAt: current, endedAt: current}]}, 'quality-inspector');
  assert.equal(qualityRequested.state, 'cancelling');
  assert.equal(qualitySettled.state, 'cancelled');
});

test('dependency wait, recovery and explicit blocked state remain distinguishable', () => {
  const dependency = member({parcels: [{status: 'WAITING', createdAt: current, updatedAt: current, stages: [{status: 'WAITING', waitingReason: 'Awaiting predecessor baton'}]}]}, 'parcel-coordinator');
  assert.equal(dependency.state, 'waiting');
  assert.match(dependency.reason, /predecessor baton/);
  const recovery = member({runs: [{status: 'RECONNECTING', requestedAt: current, updatedAt: current, recovery: {state: 'RECONNECTING', reason: 'transport continuity check', observedAt: current}}]}, 'lane-master');
  assert.equal(recovery.state, 'recovering');
  const blocked = member({parcels: [{status: 'WAITING', createdAt: current, updatedAt: current, stages: [{status: 'BLOCKED', error: 'dependency failed'}]}]}, 'parcel-coordinator');
  assert.equal(blocked.state, 'blocked');
  assert.equal(blocked.reason, 'dependency failed');
  assert.equal(blocked.narration.detail, 'dependency failed');
});

test('Resource Guardian distinguishes pressure, offline, unknown and stale readiness', () => {
  const pressure = member({systems: [{execution: 'BUSY', active: 1, capacity: 1, lastCheckAt: current, blockingReason: 'Execution capacity is exhausted'}]}, 'resource-guardian');
  assert.equal(pressure.state, 'resource_pressure');
  const offline = member({systems: [{execution: 'OFFLINE', active: 0, capacity: 1, lastCheckAt: current, blockingReason: 'Probe failed'}]}, 'resource-guardian');
  assert.equal(offline.state, 'offline');
  const unknown = member({systems: [{execution: 'UNKNOWN', active: null, capacity: null, blockingReason: 'Not probed'}]}, 'resource-guardian');
  assert.equal(unknown.state, 'unknown');
  const staleAvailable = member({systems: [{execution: 'AVAILABLE', active: 0, capacity: 1, lastCheckAt: stale}]}, 'resource-guardian');
  assert.equal(staleAvailable.state, 'stale');
});

test('Model Scout and Quality Inspector use only registry, evaluation and verification evidence', () => {
  const scouting = member({models: [{qualificationState: 'QUALIFIED', accountAvailability: 'AVAILABLE', checkedAt: current}], modelBatches: [{status: 'RUNNING', startedAt: current}]}, 'model-scout');
  assert.equal(scouting.state, 'working');
  assert.equal(scouting.counts.completed, 1);
  const blocked = member({models: [{qualificationState: 'UNTESTED', accountAvailability: 'UNAVAILABLE', checkedAt: current}]}, 'model-scout');
  assert.equal(blocked.state, 'blocked');
  const reviewing = member({runs: [{status: 'VERIFYING', requestedAt: current, updatedAt: current, steps: [{status: 'VERIFYING', startedAt: current}]}]}, 'quality-inspector');
  assert.equal(reviewing.state, 'reviewing');
  const completed = member({runs: [{status: 'SUCCEEDED', requestedAt: current, updatedAt: current, endedAt: current}]}, 'quality-inspector');
  assert.equal(completed.state, 'completed');
});

test('provider catalogue events truthfully distinguish discovery, limited callability, failure and routing disablement', () => {
  const events = [
    {id: 1, at: current, type: 'provider.catalog_changed', payload: {providerId: 'nvidia', action: 'discovering'}},
    {id: 2, at: current, type: 'provider.catalog_changed', payload: {providerId: 'nvidia', canonicalModelId: 'model:a', action: 'callability-tested', status: 'LIMITED', inferenceEndpointStatus: 429, failureClass: 'rate-limited'}},
    {id: 3, at: current, type: 'provider.catalog_changed', payload: {providerId: 'nvidia', canonicalModelId: 'model:a', action: 'routing-disabled'}},
  ];
  const crew = project({events});
  assert.equal(crew.modelActivity.length, 3);
  const disabled = crew.modelActivity.find(item => item.action === 'routing-disabled')!, limited = crew.modelActivity.find(item => item.action === 'callability-tested')!;
  assert.equal(disabled.routingEligible, false);
  assert.equal(limited.status, 'LIMITED');
  assert.equal(limited.failure, 'rate-limited');
  assert.equal(limited.httpStatus, 429);
  const lumen = crew.members.find(item => item.id === 'model-scout')!;
  assert.equal(lumen.activity.kind, 'ROUTING');
  assert.match(lumen.narration.text, /routing disabled/);
});

test('Model Scout narrates model evaluation phases instead of exposing the event type', () => {
  const lumen = member({events: [{id: 1, at: current, type: 'model.intelligence_changed', payload: {phase: 'STARTED', providerId: 'local', modelId: 'qwen'}}]}, 'model-scout');
  assert.equal(lumen.activity.kind, 'BENCHMARKING');
  assert.equal(lumen.activity.label, 'evaluation STARTED · local · qwen');
  assert.match(lumen.narration.text, /evaluation STARTED/);
  assert.doesNotMatch(lumen.narration.text, /model\.intelligence_changed/);
});

test('human narration is deterministic and cites the authoritative source', () => {
  const source: Partial<DashboardCharacterSource> = {parcels: [{id: 'parcel:a', objective: 'Search safely', status: 'RUNNING', createdAt: current, updatedAt: current, stages: [{id: 'search', name: 'Search source', status: 'RUNNING', runId: 'run:a', startedAt: current}]}], runs: [{id: 'run:a', status: 'RUNNING', requestedAt: current, updatedAt: current, steps: [{id: 'step:a', action: 'repository.search@1', status: 'RUNNING', startedAt: current}]}]};
  const first = project(source), second = project(source), relay = first.members.find(item => item.id === 'parcel-coordinator')!;
  assert.deepEqual(first.narration, second.narration);
  assert.equal(relay.activity.kind, 'SEARCHING');
  assert.equal(relay.activity.source.type, 'job-step');
  assert.equal(relay.activity.source.id, 'step:a');
  assert.match(relay.narration.text, /Relay is search/);
});

test('the preview vocabulary covers every declared production character state', () => {
  assert.deepEqual(DASHBOARD_CHARACTER_STATES, ['idle', 'queued', 'working', 'reviewing', 'waiting', 'awaiting_operator', 'blocked', 'resource_pressure', 'recovering', 'handing_over', 'completed', 'failed', 'cancelling', 'cancelled', 'offline', 'stale', 'unknown']);
});
