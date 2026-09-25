import {mkdtempSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  ConsensusJudge,
  ContextRouter,
  ContextStore,
  LaneContextService,
  loadSelectedContext,
} from '../src/control/context.ts'
import {buildOperatorProvenanceView} from '../src/control/context-operator.ts'
import {
  chatGptWorkThreadAdapter,
  ContextReaderRegistry,
  openAiSharedThreadAdapter,
} from '../src/control/context-readers.ts'

const taskId = 'demo-shared-thread-consensus'
const temporaryState = mkdtempSync(path.join(os.tmpdir(), 'agent-control-context-demo-'))
const outputArgument = process.argv.find(argument => argument.startsWith('--output='))
const output = path.resolve(outputArgument?.slice('--output='.length) || 'docs/evidence/context-consensus-demo-20260823.json')
const workspaceFile = path.join(temporaryState, 'workspace.json')
const contextFile = path.join(temporaryState, 'context.json')
const state = workspace()
const store = new ContextStore(contextFile)
const lanes = new LaneContextService(state, store, value => writeFileSync(workspaceFile, `${JSON.stringify(value, null, 2)}\n`))

// Independent lanes attach metadata only. Agent Control does not create or publish any share.
const threadA = lanes.attach(1, source({
  type: 'openai_shared_thread',
  provider: 'openai',
  url: 'https://chatgpt.com/share/mock-independent-a',
  description: 'Agent A visible experiment log and test output',
  classification: 'agent_observation',
  originatingAgent: 'agent-a',
  originatingProvider: 'codex',
  originatingModel: 'model-a',
})).source
const threadB = lanes.attach(2, source({
  type: 'chatgpt_work_thread',
  provider: 'openai',
  url: 'https://chatgpt.com/share/mock-independent-b',
  description: 'Agent B visible architecture alternatives',
  classification: 'agent_interpretation',
  originatingAgent: 'agent-b',
  originatingProvider: 'chatgpt-work',
  originatingModel: 'model-b',
})).source
const threadC = lanes.attach(3, source({
  type: 'codex_thread',
  provider: 'codex',
  url: 'https://example.invalid/shared/mock-independent-c',
  description: 'Agent C thread share is unavailable',
  classification: 'agent_observation',
  accessibility: 'expired',
  originatingAgent: 'agent-c',
  originatingProvider: 'codex',
  originatingModel: 'model-c',
})).source

const testEvidence = store.addEvidence({
  taskId,
  classification: 'verified_executable',
  description: 'Focused shared-context tests passed',
  sourceId: threadA.id,
  repository: '/srv/agent-control',
  commitSha: 'demo-commit-123',
  testName: 'node --import tsx --test src/control/context.test.ts',
  result: 'passed',
})
const repositoryEvidence = store.addEvidence({
  taskId,
  classification: 'repository_evidence',
  description: 'Context graph implementation diff',
  sourceId: threadB.id,
  repository: '/srv/agent-control',
  commitSha: 'demo-commit-123',
  result: 'observed',
})
const interpretation = store.addEvidence({
  taskId,
  classification: 'agent_interpretation',
  description: 'Concern that external threads may expire',
  sourceId: threadC.id,
})

const conclusions = [
  store.addConclusion({taskId, laneId: 1, agentId: 'agent-a', provider: 'codex', model: 'model-a', claim: 'Adopt the context subsystem with Git as authority', confidence: .92, evidenceIds: [testEvidence.id], contextSourceIds: [threadA.id], independent: true}),
  store.addConclusion({taskId, laneId: 2, agentId: 'agent-b', provider: 'chatgpt-work', model: 'model-b', claim: 'Adopt the context subsystem with Git as authority', confidence: .84, evidenceIds: [repositoryEvidence.id], contextSourceIds: [threadB.id], independent: true}),
  store.addConclusion({taskId, laneId: 3, agentId: 'agent-c', provider: 'codex', model: 'model-c', claim: 'Do not adopt because thread links can expire', confidence: .76, evidenceIds: [interpretation.id], contextSourceIds: [threadC.id], independent: true}),
]

// Only the synthesis lane receives the independent conclusions and can request thread context.
state.lanes[3].baton.contextSourceIds = [threadA.id, threadB.id, threadC.id]
const router = new ContextRouter(store)
const selection = router.select({
  taskId,
  laneId: 4,
  baton: state.lanes[3].baton,
  currentCommit: 'demo-commit-123',
  complexity: 'high',
  urgency: 'normal',
  confidence: .55,
  disputed: true,
  modelContextCapacity: 32000,
  reservedPromptTokens: 8000,
  maxContextTokens: 5000,
  tokenCostPerThousand: .001,
  maxMonetaryCost: .02,
  maxAddedLatencyMs: 3000,
})
const visibleTransport = async source => ({
  sourceId: source.id,
  title: `Visible thread for ${source.originatingAgent}`,
  retrievedAt: new Date().toISOString(),
  sections: [
    {id: 'summary', title: 'Summary', kind: 'summary', text: 'Visible shareable conversation summary. No private chain-of-thought.'},
    {id: 'decision', title: 'Architecture decision', kind: 'decision', text: 'Agent Control must remain authoritative; shared context is read-only supporting material.'},
    {id: 'evidence', title: 'Visible tool evidence', kind: 'evidence', text: 'The implementation diff and test gate support the conclusion. api_key=fixture-secret'},
    {id: 'failure', title: 'Failed approach', kind: 'failure', text: 'Loading every historical thread exceeded the context budget.'},
  ],
})
const readerRegistry = new ContextReaderRegistry({
  approvedCapabilityIds: ['openai_shared_thread_public_v1', 'chatgpt_work_thread_approved_v1'],
  allowAuthenticatedRead: true,
  redactSensitiveText: true,
})
  .register(openAiSharedThreadAdapter(visibleTransport))
  .register(chatGptWorkThreadAdapter(visibleTransport))
const loaded = await loadSelectedContext(store, selection, readerRegistry, {
  query: 'Agent Control authority implementation evidence context budget',
  sectionHints: ['decision', 'evidence', 'failure'],
})
const decision = new ConsensusJudge(store).synthesize(taskId, 4, conclusions.map(conclusion => conclusion.id), selection.tier)
const provenance = store.traceDecision(decision.id)
const operatorView = buildOperatorProvenanceView(store, decision.id)

// Reopen the persisted graph to prove restart survival before emitting evidence.
const restarted = ContextStore.load(contextFile)
const restartProof = {
  sources: [threadA, threadB, threadC].every(item => restarted.getSource(item.id) != null),
  conclusions: conclusions.every(item => restarted.getConclusion(item.id) != null),
  decision: restarted.getDecision(decision.id)?.id === decision.id,
  batonReferences: JSON.parse(readFileSync(workspaceFile, 'utf8')).lanes.slice(0, 3).map(lane => lane.baton.contextSourceIds),
}

const demonstration = {
  classification: 'SIMULATED END-TO-END WORKFLOW WITH EXECUTABLE LOCAL COMPONENTS',
  taskId,
  flow: [
    'task created',
    'three independent lanes attach conclusions and context sources',
    'judge receives conclusions only after independence phase',
    `router selects tier ${selection.tier}`,
    'provider capabilities discovered and approved read-only fixture adapters selected',
    'relevant sections selected within budget and sensitive fixture text redacted',
    'expired thread omitted while Git/test evidence remains',
    'evidence-weighted consensus records dissent',
    'decision provenance reconstructed and persisted',
  ],
  independence: {preservedUntilSynthesis: true, collaboratingBeforeJudge: false},
  lanes: conclusions.map(conclusion => ({laneId: conclusion.laneId, agentId: conclusion.agentId, provider: conclusion.provider, model: conclusion.model, conclusion: conclusion.claim, confidence: conclusion.confidence, contextSourceIds: conclusion.contextSourceIds, evidenceIds: conclusion.evidenceIds})),
  contextSelection: selection,
  providerCapabilities: [readerRegistry.discover(threadA), readerRegistry.discover(threadB), readerRegistry.discover(threadC)],
  loadedContext: loaded,
  consensus: decision,
  provenance,
  operatorView,
  restartProof,
  security: {createdPublicShare: false, storedCredentials: false, fetchedAuthenticatedContent: false, approvedAuthenticatedFixtureTransport: true, redactionApplied: true},
}
mkdirSync(path.dirname(output), {recursive: true})
writeFileSync(output, `${JSON.stringify(demonstration, null, 2)}\n`)
console.log(JSON.stringify({output, taskId, selectedTier: selection.tier, loadedSources: loaded.materials.length, omittedSources: selection.omitted.length, decision: decision.conclusion, dissent: decision.dissentingConclusionIds.length, provenanceNodes: provenance.nodes.length, restartProof}, null, 2))

function source(overrides) {
  return {
    taskId,
    repository: '/srv/agent-control',
    branch: 'research/shared-thread-context',
    commitSha: 'demo-commit-123',
    description: 'Shared context',
    classification: 'agent_observation',
    accessibility: 'available',
    estimatedTokens: 900,
    retention: {mode: 'ephemeral_extract'},
    ...overrides,
  }
}

function workspace() {
  const at = new Date().toISOString()
  return {
    version: 1,
    paused: false,
    lastRestorePoint: null,
    lanes: [1, 2, 3, 4].map(id => ({
      id,
      name: id === 4 ? 'Judge' : `Independent ${id}`,
      status: id === 4 ? 'waiting' : 'working',
      model: `model-${id}`,
      reasoning: 'medium',
      context: '',
      contract: {version: 2, laneId: id, goal: 'Evaluate shared context', constraints: [], cwd: '/repo', priority: 100 - id, mode: 'auto', capabilities: {requires: [], prefers: []}, modelLock: null, sharedTaskIds: [taskId], git: {branch: 'research/shared-thread-context', head: 'demo-commit-123'}, updatedAt: at},
      baton: {version: 1, laneId: id, revision: 1, status: 'independent', progress: [], hypothesis: '', evidence: [], changes: [], nextAction: id === 4 ? 'synthesize' : 'investigate', openQuestions: [], model: `model-${id}`, reasoning: 'medium', updatedAt: at},
      lease: {laneId: id, holder: id === 4 ? null : `agent-${id}`, acquiredAt: id === 4 ? null : at, expiresAt: id === 4 ? null : '2099-01-01T00:00:00.000Z'},
      lines: [],
    })),
  }
}
