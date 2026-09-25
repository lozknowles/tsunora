import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ContextStore} from '../src/control/context.ts';
import {ContextReaderRegistry, discoverOpenAiChatKitThreadId, openAiChatKitHttpTransport, openAiChatKitThreadAdapter} from '../src/control/context-readers.ts';

const apiKey = process.env.OPENAI_API_KEY;
let threadId = process.env.OPENAI_CHATKIT_THREAD_ID;
const approved = process.env.AGENT_CONTROL_ALLOW_AUTHENTICATED_CONTEXT_READ === 'true';
const outputArgument = process.argv.find(argument => argument.startsWith('--output='));
const output = outputArgument ? path.resolve(outputArgument.slice('--output='.length)) : undefined;
const result = {
  schemaVersion: 1,
  recordedAt: new Date().toISOString(),
  provider: 'openai_chatkit',
  contract: 'GET /v1/chatkit/threads/{thread_id}/items',
  verdict: 'SUPPORTED+UNQUALIFIED',
  persistedSecret: false,
  authority: 'bounded read-only context; no scheduling, lease, ownership, PTY, takeover or baton mutation path',
};

if (!apiKey) result.blocker = 'OPENAI_API_KEY unavailable';
else if (!approved) result.blocker = 'authenticated context read requires AGENT_CONTROL_ALLOW_AUTHENTICATED_CONTEXT_READ=true';
else {
  try {
    const transport = openAiChatKitHttpTransport(apiKey);
    if (!threadId) threadId = await discoverOpenAiChatKitThreadId(transport);
    if (!threadId || !/^cthr_[A-Za-z0-9_-]+$/.test(threadId)) throw new Error('no_accessible_chatkit_thread');
    const store = new ContextStore(path.join(mkdtempSync(path.join(os.tmpdir(), 'agent-control-live-chatkit-')), 'context.json'));
    const source = store.attachSource({
      type: 'openai_chatkit_thread', provider: 'openai', url: `https://api.openai.com/v1/chatkit/threads/${threadId}`,
      originatingLaneId: 0, originatingAgent: 'live-qualification', taskId: 'provider-qualification',
      description: 'Live OpenAI ChatKit thread qualification', classification: 'agent_observation',
      accessibility: 'available', retention: {mode: 'ephemeral_extract'}, estimatedTokens: 2000,
    }).source;
    const registry = new ContextReaderRegistry({
      approvedCapabilityIds: ['openai_chatkit_thread_api_v1'], allowAuthenticatedRead: true, redactSensitiveText: true,
    }).register(openAiChatKitThreadAdapter(transport));
    const read = await registry.read(source, 2000, {sectionHints: ['evidence', 'decision', 'failure']});
    result.verdict = 'SUPPORTED+QUALIFIED';
    result.threadId = threadId;
    result.sections = read.sections?.length ?? 0;
    result.tokens = read.tokens;
  } catch (error) {
    result.blocker = error instanceof Error ? error.message : 'provider_read_failed';
  }
}

if (output) {
  mkdirSync(path.dirname(output), {recursive: true});
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, {mode: 0o600});
  result.output = output;
}
console.log(JSON.stringify(result, null, 2));
