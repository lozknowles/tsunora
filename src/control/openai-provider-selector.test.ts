import assert from 'node:assert/strict';
import test from 'node:test';
import {selectOpenAIExecutionProvider, type OpenAIExecutionProvider} from './openai-provider-selector.js';

const provider = (id: string): OpenAIExecutionProvider => ({candidate: () => ({route: {providerId: id}} as never), executor: () => ({execute: async () => ({})})});

test('auto selection prefers a present API key without returning it', () => {
  const secret = 'test-secret-not-real';
  let captured = '';
  const selection = selectOpenAIExecutionProvider({apiKey: () => secret, apiProvider: authorization => { captured = authorization(); return provider('api'); }, chatGptPlanProvider: () => provider('chatgpt')});
  assert.equal(selection.mode, 'api-key');
  assert.equal(selection.reason, 'api_key_present');
  assert.equal(selection.provider.candidate().route.providerId, 'api');
  assert.equal(captured, secret);
  assert.doesNotMatch(JSON.stringify(selection), /test-secret-not-real/);
});

test('auto selection falls back to ChatGPT plan when API key is absent', () => {
  const selection = selectOpenAIExecutionProvider({apiKey: () => '  ', apiProvider: () => provider('api'), chatGptPlanProvider: () => provider('chatgpt')});
  assert.equal(selection.mode, 'chatgpt-plan');
  assert.equal(selection.reason, 'api_key_absent');
  assert.equal(selection.provider.candidate().route.providerId, 'chatgpt');
});

test('operator can force either mode and forced API mode fails closed without a key', () => {
  const options = {apiKey: () => 'key', apiProvider: () => provider('api'), chatGptPlanProvider: () => provider('chatgpt')};
  assert.equal(selectOpenAIExecutionProvider({...options, preference: 'chatgpt-plan'}).mode, 'chatgpt-plan');
  assert.equal(selectOpenAIExecutionProvider({...options, preference: 'api-key'}).mode, 'api-key');
  assert.throws(() => selectOpenAIExecutionProvider({...options, preference: 'api-key', apiKey: () => undefined}), /openai_api_key_required/);
});
