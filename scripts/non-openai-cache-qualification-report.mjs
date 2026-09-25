#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [command = 'report', ...arguments_] = process.argv.slice(2);

if (command === 'boundary') {
  const options = parseArguments(arguments_);
  const file = required(options.file, 'boundary_file_required');
  const slotsUrl = required(options.slotsUrl, 'slots_url_required');
  const slots = await fetch(slotsUrl).then(response => {
    if (!response.ok) throw new Error(`slots_http_${response.status}`);
    return response.json();
  });
  const event = {
    schema: 'agent-control.non-openai-cache-boundary/v1',
    at: new Date().toISOString(),
    cycle: Number(required(options.cycle, 'cycle_required')),
    arm: required(options.arm, 'arm_required'),
    backendPid: Number(execFileSync('systemctl', ['--user', 'show', required(options.unit, 'unit_required'), '-p', 'MainPID', '--value'], {encoding: 'utf8'}).trim()),
    slots: Array.isArray(slots) ? slots.map(slot => ({id: slot.id ?? null, nCtx: slot.n_ctx ?? null, processing: slot.is_processing ?? null})) : [],
  };
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.appendFileSync(file, `${JSON.stringify(event)}\n`, {mode: 0o600});
  process.stdout.write(`${JSON.stringify(event)}\n`);
  process.exit(0);
}

if (command !== 'report') throw new Error('expected_boundary_or_report');
const options = parseArguments(arguments_);
const stateDir = path.resolve(required(options.state, 'state_dir_required'));
const outputDir = path.resolve(required(options.output, 'output_dir_required'));
const boundariesFile = path.resolve(required(options.boundaries, 'boundaries_file_required'));
const repository = path.resolve(options.repository ?? process.cwd());
const configFile = path.resolve(required(options.config, 'config_file_required'));
const llamaBinary = path.resolve(required(options.llamaBinary, 'llama_binary_required'));
const modelFile = path.resolve(required(options.modelFile, 'model_file_required'));
const parcels = readJson(path.join(stateDir, 'work-parcels', 'parcels.json')).parcels.sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
const artifactsIndex = readJson(path.join(stateDir, 'jobs', 'artifact-store', 'artifacts.json')).artifacts;
const boundaries = fs.readFileSync(boundariesFile, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
if (parcels.length !== 9) throw new Error(`expected_9_parcels_received_${parcels.length}`);
if (boundaries.length !== 9) throw new Error(`expected_9_boundaries_received_${boundaries.length}`);

const records = parcels.map((parcel, index) => {
  const expectedArm = ['cold', 'warm', 'changed-prefix-control'][index % 3];
  const runId = parcel.stages[0]?.runId;
  const artifact = artifactsIndex.find(item => item.runId === runId && item.name === 'verification-report');
  const attemptArtifact = artifactsIndex.find(item => item.runId === runId && item.name === 'mutation-attempt');
  if (!artifact) throw new Error(`verification_artifact_missing:${runId}`);
  if (!attemptArtifact) throw new Error(`attempt_artifact_missing:${runId}`);
  const content = readJson(path.join(stateDir, 'jobs', 'artifact-store', 'objects', `${artifact.id}.json`));
  const attempt = readJson(path.join(stateDir, 'jobs', 'artifact-store', 'objects', `${attemptArtifact.id}.json`));
  const providerEvents = content.transcript.filter(item => item.type === 'provider');
  const firstInvocation = parcel.audit.invocations[0];
  const boundary = boundaries[index];
  if (boundary.arm !== expectedArm || boundary.cycle !== Math.floor(index / 3) + 1) throw new Error(`boundary_order_mismatch:${index}`);
  if (parcel.status !== 'SUCCEEDED' || !content.passed || firstInvocation?.verifierResult !== 'PASS') throw new Error(`qualification_failure:${runId}`);
  return {
    cycle: Math.floor(index / 3) + 1,
    arm: expectedArm,
    parcelId: parcel.id,
    jobId: parcel.stages[0].job,
    runId,
    invocationIds: parcel.audit.invocations.map(item => item.id),
    provider: firstInvocation.provider,
    model: firstInvocation.model,
    node: firstInvocation.node,
    slotScope: boundary.slots,
    backendPid: boundary.backendPid,
    boundaryAt: boundary.at,
    startingRevision: attempt.startingRevision,
    fixtureSha256: attempt.fixtureSha256,
    requestPrefixSha256: firstInvocation.cacheEvidence?.requestPrefixSha256 ?? null,
    firstInvocation: {
      reusedTokens: firstInvocation.cacheEvidence?.reusedTokens ?? null,
      processedPromptTokens: firstInvocation.cacheEvidence?.processedPromptTokens ?? null,
      cacheWriteTokens: firstInvocation.cacheEvidence?.cacheWriteTokens ?? null,
      promptProcessingMs: firstInvocation.cacheEvidence?.promptProcessingMs ?? null,
      generationMs: firstInvocation.cacheEvidence?.generationMs ?? null,
      timeToFirstTokenMs: null,
      elapsedMs: firstInvocation.elapsedMs,
      outputTokens: firstInvocation.outputTokens,
      totalTokens: firstInvocation.totalTokens,
      authority: firstInvocation.cacheEvidence?.authority ?? 'unavailable',
      source: firstInvocation.cacheEvidence?.source ?? 'unavailable',
    },
    parcelTotals: parcel.audit.totals,
    diffSha256: content.patchSha256,
    patch: content.patch,
    verifier: content.verifier,
    transcript: [{type: 'original-initiating-prompt', at: parcel.createdAt, prompt: parcel.prompt}, ...content.transcript],
    rawProviderEvidence: providerEvents.map(item => ({at: item.at, requestPrefixSha256: item.requestPrefixSha256, usage: item.usage, timings: item.timings, finishReason: item.finishReason, responseModel: item.responseModel})),
    verificationArtifact: {id: artifact.id, sha256: artifact.sha256},
  };
});

const groups = [1, 2, 3].map(cycle => Object.fromEntries(records.filter(record => record.cycle === cycle).map(record => [record.arm, record])));
for (const group of groups) {
  if (group.cold.firstInvocation.reusedTokens !== 0) throw new Error(`cold_not_empty:cycle_${group.cold.cycle}`);
  if (group.warm.requestPrefixSha256 !== group.cold.requestPrefixSha256) throw new Error(`stable_prefix_mismatch:cycle_${group.cold.cycle}`);
  if (group['changed-prefix-control'].requestPrefixSha256 === group.warm.requestPrefixSha256) throw new Error(`control_prefix_unchanged:cycle_${group.cold.cycle}`);
  if (group.warm.firstInvocation.reusedTokens <= group['changed-prefix-control'].firstInvocation.reusedTokens) throw new Error(`control_did_not_reduce_reuse:cycle_${group.cold.cycle}`);
}

const cold = groups.map(group => group.cold.firstInvocation), warm = groups.map(group => group.warm.firstInvocation), control = groups.map(group => group['changed-prefix-control'].firstInvocation);
const comparison = {
  cold: aggregate(cold),
  warm: aggregate(warm),
  changedPrefixControl: aggregate(control),
  meanWarmReuseIncreaseVsCold: mean(warm.map((item, index) => item.reusedTokens - cold[index].reusedTokens)),
  meanControlReuseLossVsWarm: mean(control.map((item, index) => warm[index].reusedTokens - item.reusedTokens)),
  meanWarmPromptProcessingSpeedup: mean(warm.map((item, index) => cold[index].promptProcessingMs / item.promptProcessingMs)),
};
const config = readJson(configFile), gitHead = git(repository, ['rev-parse', 'HEAD']), gitStatus = git(repository, ['status', '--porcelain']), gitDiff = git(repository, ['diff', '--binary']);
const evidence = {
  schema: 'agent-control.non-openai-cache-qualification/v1',
  generatedAt: new Date().toISOString(),
  verdicts: {cacheReuse: 'PROVEN', performanceBenefit: 'MEASURED', monetarySavings: 'UNAVAILABLE', warmExpertDelegation: 'NOT_IMPLEMENTED'},
  source: {repository, head: gitHead, dirtyAtReportGeneration: Boolean(gitStatus), implementationDiffSha256: sha256(gitDiff)},
  runtime: {
    provider: config.providers.find(item => item.id === 'local-llama-cache-qualification'),
    model: config.models.find(item => item.id === 'qwen2.5-coder-3b-cache-qualified'),
    node: config.resources.find(item => item.id === 'controller-cache-qualification'),
    llamaCppVersion: execFileSync(llamaBinary, ['--version'], {encoding: 'utf8'}).trim(),
    llamaBinarySha256: sha256File(llamaBinary),
    modelFile: path.basename(modelFile),
    modelFileSha256: sha256File(modelFile),
    cacheConfiguration: {cachePrompt: true, cacheReuseThresholdTokens: 0, contextTokens: 8192, parallelSlots: 1, host: 'loopback-only'},
    perInvocationSlotIdentity: 'unavailable; isolated backend exposed one slot (id 0) but responses did not carry a slot identifier',
  },
  controls: {executionOrder: records.map(record => ({cycle: record.cycle, arm: record.arm, parcelId: record.parcelId, runId: record.runId})), boundaries, stableTask: 'MUT-001', stableStartingRevision: [...new Set(records.map(record => record.startingRevision))], fixtureSha256: [...new Set(records.map(record => record.fixtureSha256))], cacheWrites: 'unavailable', timeToFirstToken: 'unavailable'},
  comparison,
  records,
  notes: [
    'cache_n is llama.cpp authoritative reused prompt/KV token count; prompt_n is newly evaluated prompt tokens.',
    'Latency was measured but was not used as proof of cache reuse.',
    'Each cold arm followed a new isolated backend process and an idle one-slot observation.',
    'Every arm mutated a fresh disposable repository and passed public tests plus an independent hidden verifier.',
    'The changed-prefix control retained a common system prefix, so partial reuse was expected; reuse fell materially versus the identical warm arm.',
    'No tariff or measured energy input exists for this local route, so monetary savings are unavailable.',
    'No production routing policy currently selects an agent by retained-context/cache affinity; basic backend cache reuse does not prove warm-expert delegation.',
  ],
};

fs.mkdirSync(outputDir, {recursive: true});
const measurementsFile = path.join(outputDir, 'non-openai-cache-measurements.json');
fs.writeFileSync(measurementsFile, `${JSON.stringify(evidence, null, 2)}\n`, {mode: 0o600});
const markdown = reportMarkdown(evidence), transcript = transcriptMarkdown(evidence);
fs.writeFileSync(path.join(outputDir, 'non-openai-cache-qualification.md'), markdown, {mode: 0o600});
fs.writeFileSync(path.join(outputDir, 'complete-human-readable-transcript.md'), transcript, {mode: 0o600});
fs.writeFileSync(path.join(outputDir, 'transcript.html'), reportHtml(evidence, markdown, transcript), {mode: 0o600});
process.stdout.write(`${JSON.stringify({outputDir, verdicts: evidence.verdicts, comparison}, null, 2)}\n`);

function reportMarkdown(evidence) {
  const rows = evidence.records.map(record => `| ${record.cycle} | ${record.arm} | ${record.parcelId} | ${record.runId} | ${record.firstInvocation.reusedTokens} | ${record.firstInvocation.processedPromptTokens} | ${record.firstInvocation.promptProcessingMs} | ${record.firstInvocation.elapsedMs} | PASS |`).join('\n');
  return `# Agent Control non-OpenAI prompt/KV cache qualification\n\nGenerated: ${evidence.generatedAt}\n\n## Verdict\n\n- CACHE REUSE: **${evidence.verdicts.cacheReuse}**\n- PERFORMANCE BENEFIT: **${evidence.verdicts.performanceBenefit}**\n- MONETARY SAVINGS: **${evidence.verdicts.monetarySavings}**\n- WARM-EXPERT DELEGATION: **${evidence.verdicts.warmExpertDelegation}**\n\n## Runtime\n\n- Provider: ${evidence.runtime.provider.id} (local llama.cpp; non-OpenAI)\n- Model: ${evidence.runtime.model.providerModel}\n- Node: ${evidence.runtime.node.id}\n- llama.cpp: ${oneLine(evidence.runtime.llamaCppVersion)}\n- Cache: --cache-prompt; --cache-reuse 0; one 8,192-token slot; loopback only\n- Per-response slot ID: unavailable (isolated service exposed only slot 0)\n- Cache writes: unavailable\n- TTFT: unavailable\n\n## Matched trial results\n\n| Cycle | Arm | Parcel | Run | Reused (cache_n) | Processed (prompt_n) | Prompt ms | Invocation ms | Verification |\n|---:|---|---|---|---:|---:|---:|---:|---|\n${rows}\n\nCold mean reused: ${evidence.comparison.cold.meanReusedTokens}; warm: ${evidence.comparison.warm.meanReusedTokens}; changed-prefix control: ${evidence.comparison.changedPrefixControl.meanReusedTokens}. Mean warm prompt-processing speedup versus cold: ${evidence.comparison.meanWarmPromptProcessingSpeedup.toFixed(2)}×.\n\nThe identical stable prefix reused ${evidence.comparison.meanWarmReuseIncreaseVsCold} additional tokens versus cold. Changing the relevant prefix removed ${evidence.comparison.meanControlReuseLossVsWarm} reused tokens on average. Direct token counters—not latency—establish reuse.\n\n## Correctness and economics\n\nAll nine arms performed the same real mutation in fresh disposable fixture repositories and passed the public suite, scope checks, syntax checks, credential scan and independent hidden verifier. Cache population is included: each cycle begins with the measured cold population arm before the warm arm. This local route reports neither a tariff nor measured energy, so no monetary saving is claimed.\n\n## Warm-expert delegation\n\nNOT IMPLEMENTED. The provider retained reusable KV state, but Agent Control has no production route-selection policy based on relevant retained-context affinity. Capability, correctness and authority therefore remain independent of cache locality.\n\n## Source integrity\n\n- HEAD at report generation: ${evidence.source.head}\n- Implementation diff SHA-256: ${evidence.source.implementationDiffSha256}\n- Runtime binary SHA-256: ${evidence.runtime.llamaBinarySha256}\n- Model SHA-256: ${evidence.runtime.modelFileSha256}\n`;
}

function transcriptMarkdown(evidence) {
  return `# Complete native human-readable transcript\n\nThis is the naturally produced Agent Control transcript. Each run begins with the original operator prompt, followed by the exact model request, provider outputs, typed tool calls/results and independent verification.\n\n${evidence.records.map(record => `## Cycle ${record.cycle} — ${record.arm}\n\n- Parcel: ${record.parcelId}\n- Run: ${record.runId}\n- Invocations: ${record.invocationIds.join(', ')}\n- Provider/model/node: ${record.provider} / ${record.model} / ${record.node}\n- Verification artifact: ${record.verificationArtifact.id} · sha256:${record.verificationArtifact.sha256}\n\n${record.transcript.map((event, index) => `### ${index + 1}. ${event.type}\n\n\`\`\`json\n${JSON.stringify(event, null, 2)}\n\`\`\`\n`).join('\n')}\n### Independent verifier\n\n\`\`\`json\n${JSON.stringify(record.verifier, null, 2)}\n\`\`\`\n\n### Applied patch\n\n\`\`\`diff\n${record.patch}\n\`\`\`\n`).join('\n')}\n`;
}

function reportHtml(evidence, markdown, transcript) {
  const rows = evidence.records.map(record => `<tr><td>${record.cycle}</td><td>${escapeHtml(record.arm)}</td><td><code>${escapeHtml(record.parcelId)}</code></td><td>${record.firstInvocation.reusedTokens}</td><td>${record.firstInvocation.processedPromptTokens}</td><td>${record.firstInvocation.promptProcessingMs}</td><td>PASS</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Agent Control non-OpenAI cache qualification</title><style>body{margin:0;background:#071016;color:#edf7ff;font:16px/1.45 system-ui}header{position:sticky;top:0;padding:18px 28px;background:#0b1720;border-bottom:1px solid #24505b}main{max-width:1500px;margin:auto;padding:24px}h1,h2{margin:.2em 0}.verdict{color:#68f29a}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.card,section{background:#0d1a24;border:1px solid #27404d;border-radius:10px;padding:16px}.card b{display:block;color:#62e6de}table{width:100%;border-collapse:collapse}th,td{padding:9px;border:1px solid #27404d;text-align:left;font-size:13px}code,pre{font:12px/1.45 ui-monospace,monospace}pre{white-space:pre-wrap;overflow-wrap:anywhere}.transcript{max-height:720px;overflow:auto}.muted{color:#9bb3c8}@media(max-width:900px){.cards{grid-template-columns:1fr 1fr}}</style></head><body><header><b>Agent Control · genuine physical qualification</b><h1>Non-OpenAI prompt/KV cache reuse</h1></header><main><div class="cards"><div class="card"><b>CACHE REUSE</b>${evidence.verdicts.cacheReuse}</div><div class="card"><b>PERFORMANCE</b>${evidence.verdicts.performanceBenefit}</div><div class="card"><b>MONETARY</b>${evidence.verdicts.monetarySavings}</div><div class="card"><b>WARM EXPERT</b>${evidence.verdicts.warmExpertDelegation}</div></div><section><h2>Reconciled direct measurements</h2><p class="muted">llama.cpp cache_n and prompt_n are authoritative. Latency is supplementary, not proof.</p><table><thead><tr><th>Cycle</th><th>Arm</th><th>Parcel</th><th>Reused</th><th>Processed</th><th>Prompt ms</th><th>Verifier</th></tr></thead><tbody>${rows}</tbody></table><p>Warm reuse: ${evidence.comparison.warm.meanReusedTokens} mean · cold: ${evidence.comparison.cold.meanReusedTokens} · changed prefix: ${evidence.comparison.changedPrefixControl.meanReusedTokens}. Prompt-processing speedup: ${evidence.comparison.meanWarmPromptProcessingSpeedup.toFixed(2)}×.</p></section><section><h2>Complete native transcript</h2><p>The original initiating prompt appears first for every run. Scroll to inspect every provider/tool event and independent verification.</p><pre class="transcript">${escapeHtml(transcript)}</pre></section><details><summary>Machine-readable report narrative</summary><pre>${escapeHtml(markdown)}</pre></details></main></body></html>`;
}

function aggregate(items) { return {trials: items.length, meanReusedTokens: mean(items.map(item => item.reusedTokens)), meanProcessedPromptTokens: mean(items.map(item => item.processedPromptTokens)), meanPromptProcessingMs: mean(items.map(item => item.promptProcessingMs)), meanElapsedMs: mean(items.map(item => item.elapsedMs))}; }
function mean(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function parseArguments(values) { const result = {}; for (let index = 0; index < values.length; index += 2) result[values[index].replace(/^--/, '')] = values[index + 1]; return result; }
function required(value, reason) { if (!value) throw new Error(reason); return value; }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function git(cwd, args) { return execFileSync('git', ['-C', cwd, ...args], {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024}).trim(); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function sha256File(file) { const hash = createHash('sha256'), descriptor = fs.openSync(file, 'r'), buffer = Buffer.allocUnsafe(1024 * 1024); try { let size; while ((size = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, size)); } finally { fs.closeSync(descriptor); } return hash.digest('hex'); }
function oneLine(value) { return value.replace(/\s+/g, ' ').trim(); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character])); }
