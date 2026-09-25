import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {createToolHandlerRegistry} from './harness-dispatch.js';
import {parseMutationBenchmarkSuite} from './harness-mutation-benchmark.js';
import {MUTATION_TOOL_DEFINITIONS, MUTATION_TOOL_IDS, MUTATION_TOOL_SCHEMAS, MUTATION_SEMANTIC_TOOL_V1, MutationWorkspace, fixtureContentSha256, hasNumberedReadDisplay} from './harness-mutation-workspace.js';
import {StructuredChatLoopProvider} from './structured-chat-loop-provider.js';

const root = process.cwd(), suite = parseMutationBenchmarkSuite(JSON.parse(fs.readFileSync(path.join(root, 'benchmarks', 'harness-mutation-jobs.json'), 'utf8')));

test('disposable workspace preserves fixture identity and exposes compact inspect then scoped mutation', async () => {
  const prepared = MutationWorkspace.prepare(path.join(root, suite.fixturePath), suite.tasks[0]);
  try {
    assert.equal(prepared.fixtureSha256, suite.fixtureSha256);
    assert.match(prepared.startingRevision, /^[a-f0-9]{40}$/);
    const registry = createToolHandlerRegistry(prepared.workspace.toolBindings());
    const recipe = {} as never;
    const search = await registry.invoke(MUTATION_TOOL_IDS.search, {query: 'DEFAULT_JOB_TIMEOUT_MS'}, recipe, {assertActive: () => undefined}) as any;
    assert.ok(search.totalMatches >= 1);
    assert.ok(search.compactIndex.every((item: any) => Array.isArray(item.lines)));
    const read = await registry.invoke(MUTATION_TOOL_IDS.read, {path: 'src/constants.js', startLine: 1, endLine: 4}, recipe, {assertActive: () => undefined}) as any;
    assert.match(read.content, /DEFAULT_JOB_TIMEOUT_MS/);
    await registry.invoke(MUTATION_TOOL_IDS.replace, {path: 'src/constants.js', oldText: '30_000', newText: '45_000'}, recipe, {assertActive: () => undefined});
    assert.deepEqual(prepared.workspace.changedFiles(), ['src/constants.js']);
    assert.match(prepared.workspace.diff(), /45_000/);
  } finally { prepared.workspace.cleanup(); }
});

test('mutation workspace rejects path escape, forbidden writes and duplicate replacement ambiguity', async () => {
  const prepared = MutationWorkspace.prepare(path.join(root, suite.fixturePath), suite.tasks[0]);
  try {
    const registry = createToolHandlerRegistry(prepared.workspace.toolBindings()), recipe = {} as never;
    await assert.rejects(() => registry.invoke(MUTATION_TOOL_IDS.read, {path: '../outside'}, recipe, {assertActive: () => undefined}), /path_invalid/);
    await assert.rejects(() => registry.invoke(MUTATION_TOOL_IDS.write, {path: 'src/policy.js', content: 'unsafe'}, recipe, {assertActive: () => undefined}), /scope_violation/);
    await assert.rejects(() => registry.invoke(MUTATION_TOOL_IDS.replace, {path: 'src/constants.js', oldText: "'FAILED'", newText: "'BROKEN'"}, recipe, {assertActive: () => undefined}), /occurrences/);
  } finally { prepared.workspace.cleanup(); }
});

test('new allowlisted files become authoritative Git diff content and cleanup is bounded', async () => {
  const task = suite.tasks.find(item => item.id === 'MUT-003')!, prepared = MutationWorkspace.prepare(path.join(root, suite.fixturePath), task);
  const temporaryRoot = path.dirname(prepared.workspace.root);
  const registry = createToolHandlerRegistry(prepared.workspace.toolBindings());
  await registry.invoke(MUTATION_TOOL_IDS.write, {path: 'test/human-takeover.test.js', content: "export const marker = 'test';\n"}, {} as never, {assertActive: () => undefined});
  assert.deepEqual(prepared.workspace.changedFiles(), ['test/human-takeover.test.js']);
  assert.match(prepared.workspace.diff(), /new file mode/);
  prepared.workspace.cleanup();
  assert.equal(fs.existsSync(temporaryRoot), false);
});

test('fixture content hash is deterministic and excludes no declared source', () => {
  assert.equal(fixtureContentSha256(path.join(root, suite.fixturePath)), fixtureContentSha256(path.join(root, suite.fixturePath)));
});

for (const {taskId, file} of [{taskId: 'MUT-004', file: 'src/telemetry.js'}, {taskId: 'MUT-008', file: 'src/dispatcher.js'}]) {
  test(`${taskId} numbered read-display copy is rejected before source mutation`, async () => {
    const task = suite.tasks.find(item => item.id === taskId)!;
    const prepared = MutationWorkspace.prepare(path.join(root, suite.fixturePath), task);
    try {
      const registry = createToolHandlerRegistry(prepared.workspace.toolBindings()), recipe = {} as never;
      const source = fs.readFileSync(path.join(prepared.workspace.root, file), 'utf8');
      const numbered = source.split(/\r?\n/).map((line, index) => `${String(index + 1).padStart(4, ' ')} | ${line}`).join('\n');
      assert.equal(hasNumberedReadDisplay(numbered), true);
      await assert.rejects(() => registry.invoke(MUTATION_TOOL_IDS.write, {path: file, content: numbered}, recipe, {assertActive: () => undefined}), /numbered_read_display_denied/);
      assert.equal(fs.readFileSync(path.join(prepared.workspace.root, file), 'utf8'), source);
      assert.deepEqual(prepared.workspace.changedFiles(), []);
      const read = await registry.invoke(MUTATION_TOOL_IDS.read, {path: file, startLine: 1, endLine: 3}, recipe, {assertActive: () => undefined}) as {content: string};
      assert.equal(read.content, source.split(/\r?\n/).slice(0, 3).join('\n'));
      assert.equal(hasNumberedReadDisplay(read.content), false);
    } finally { prepared.workspace.cleanup(); }
  });
  test(`${taskId} SEMANTIC_TOOL_V1 native write still rejects numbered read-display before mutation`, async () => {
    const task=suite.tasks.find(item=>item.id===taskId)!;
    const prepared=MutationWorkspace.prepare(path.join(root,suite.fixturePath),task);
    try{
      const original=fs.readFileSync(path.join(prepared.workspace.root,file),'utf8');
      const numbered=original.split(/\r?\n/).map((line,index)=>`${String(index+1).padStart(4,' ')} | ${line}`).join('\n');
      const provider=new StructuredChatLoopProvider({providerId:'fixture',modelId:'fixture',baseUrl:'http://127.0.0.1:18000/v1',toolSchemas:MUTATION_TOOL_SCHEMAS,finishToolId:MUTATION_TOOL_IDS.finish,semanticToolV1:{tools:MUTATION_SEMANTIC_TOOL_V1},fetch:async()=>Response.json({choices:[{message:{content:null,tool_calls:[{id:'native-write',type:'function',function:{name:'write_file',arguments:JSON.stringify({path:file,content:numbered})}}]}}]})});
      const recipe={id:`${taskId}-semantic-write`,taskId,jobId:taskId,runId:taskId,workerId:'fixture',providerId:'fixture',modelId:'fixture',promptProfile:{id:'fixture',version:'1',description:'fixture'},harness:{profile:'STANDARD',recommendedProfile:'STANDARD',routingMode:'EXPERIMENT',evidenceQualified:false,decisionReasons:[],contextStrategyId:'fixture',maximumTurns:1},context:{tier:0,sourceIds:[],evidenceIds:[],estimatedTokens:0},skills:[],tools:MUTATION_TOOL_DEFINITIONS,runtime:{},authority:{laneId:'fixture',leaseGeneration:1,ownershipGeneration:1,owner:'fixture'},resourceLimits:{maximumLatencyMs:10000},verification:{requiredEvidence:[],requireIndependentCheck:true},escalation:{minimumConfidence:.8,maximumAttempts:1,onFailure:'review'},routeReason:'fixture',fingerprint:'fixture'} as never;
      const registry=createToolHandlerRegistry(prepared.workspace.toolBindings());
      let blocked=false;
      await provider.executor('Use the native write tool.').execute(recipe,{assertActive:()=>undefined,invoke:async(tool,input)=>{try{return await registry.invoke(tool,input,recipe,{assertActive:()=>undefined});}catch(error){blocked=/numbered_read_display_denied/.test(String(error));throw error;}}});
      assert.equal(blocked,true);
      assert.equal(fs.readFileSync(path.join(prepared.workspace.root,file),'utf8'),original);
      assert.deepEqual(prepared.workspace.changedFiles(),[]);
    }finally{prepared.workspace.cleanup();}
  });
}

test('numbered read-display content is rejected through exact replacement before mutation', async () => {
  const task = suite.tasks.find(item => item.id === 'MUT-004')!;
  const prepared = MutationWorkspace.prepare(path.join(root, suite.fixturePath), task);
  try {
    const file = 'src/telemetry.js';
    const original = fs.readFileSync(path.join(prepared.workspace.root, file), 'utf8');
    const oldText = original.split(/\r?\n/)[0]!;
    assert.ok(oldText.length > 0);
    const replacement = '   1 | const first = true;\n   2 | const second = true;';
    const registry = createToolHandlerRegistry(prepared.workspace.toolBindings());
    await assert.rejects(
      () => registry.invoke(MUTATION_TOOL_IDS.replace, {path: file, oldText, newText: replacement}, {} as never, {assertActive: () => undefined}),
      /numbered_read_display_denied/,
    );
    assert.equal(fs.readFileSync(path.join(prepared.workspace.root, file), 'utf8'), original);
    assert.deepEqual(prepared.workspace.changedFiles(), []);
  } finally { prepared.workspace.cleanup(); }
});

test('governance metadata is unavailable or read-only inside mutation workspaces', async () => {
  const prepared = MutationWorkspace.prepare(path.join(root, suite.fixturePath), suite.tasks[0]);
  try {
    fs.mkdirSync(path.join(prepared.workspace.root, '.codex'), {recursive: true});
    fs.writeFileSync(path.join(prepared.workspace.root, '.codex', 'settings.json'), '{}\n');
    fs.writeFileSync(path.join(prepared.workspace.root, 'AGENTS.md'), '# governed\n');
    const registry = createToolHandlerRegistry(prepared.workspace.toolBindings()), recipe = {} as never;
    await assert.rejects(() => registry.invoke(MUTATION_TOOL_IDS.read, {path: '.codex/settings.json', startLine: 1, endLine: 5}, recipe, {assertActive: () => undefined}), /governance_metadata_denied/);
    const readable = await registry.invoke(MUTATION_TOOL_IDS.read, {path: 'AGENTS.md', startLine: 1, endLine: 2}, recipe, {assertActive: () => undefined}) as any;
    assert.match(readable.content, /governed/);
    await assert.rejects(() => registry.invoke(MUTATION_TOOL_IDS.write, {path: 'AGENTS.md', content: 'changed\n'}, recipe, {assertActive: () => undefined}), /governance_metadata_denied/);
    assert.doesNotMatch(JSON.stringify(prepared.workspace.evidenceSnapshot()), /settings\.json/);
  } finally { prepared.workspace.cleanup(); }
});

for (const content of ['1 | first item\n2 | second item', '   1 | first item\n   2 | second item', '1 | alpha\n2 | beta', '   1 | const x = 1;\n   2 | const y = 2;']) {
  test(`numbered documentation is allowed without a source/read relationship: ${JSON.stringify(content)}`, () => {
    assert.equal(hasNumberedReadDisplay(content, {file: 'notes.txt', source: 'original prose'}), false);
  });
}
test('numbered text is rejected when two payloads match trusted read line positions', () => {
  assert.equal(hasNumberedReadDisplay('41 | alpha\n42 | beta', {file: 'notes.txt', source: '', reads: [{startLine: 41, content: 'alpha\nbeta'}]}), true);
  assert.equal(hasNumberedReadDisplay('41 | alpha\n42 | beta', {file: 'notes.txt', source: '', reads: [{startLine: 1, content: 'alpha\nbeta'}]}), false);
});
test('number-like rows inside valid JavaScript strings and comments are not contamination', () => {
  for (const content of ['export const doc = `1 | alpha\n2 | beta`;', '/*\n1 | alpha\n2 | beta\n*/', 'const alpha=1,beta=2;\n1 | alpha\n2 | beta']) {
    assert.equal(hasNumberedReadDisplay(content, {file: 'source.js', source: 'alpha\nbeta'}), false);
  }
});
