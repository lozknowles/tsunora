import assert from 'node:assert/strict';
import test from 'node:test';
import {ProviderRegistry, providersFromConfig} from './providers.js';

test('zero providers is a valid configuration', () => {
  assert.deepEqual(providersFromConfig([]), []);
});

test('provider endpoint and port come only from configuration', () => {
  const [provider] = providersFromConfig([{id: 'bridge-a', name: 'Approved bridge', kind: 'browser-bridge', baseUrl: 'http://127.0.0.1:19097/v1', wireApi: 'responses', parallelism: 1, costClass: 'included', capabilities: ['text']}]);
  assert.equal(provider.baseUrl, 'http://127.0.0.1:19097/v1');
  assert.equal(provider.wireApi, 'responses');
});

test('provider cannot run recipe until healthy', () => {
  const registry = new ProviderRegistry();
  registry.register(providersFromConfig([{id: 'api-a', kind: 'responses', baseUrl: 'https://api.example/v1'}])[0]);
  const recipe = {id: 'r', providerId: 'api-a', model: 'model-a', profile: 'default', reasoning: 'low' as const, promptVersion: 'v1', tools: [], skills: []};
  assert.equal(registry.canRun(recipe), false);
  registry.setHealth('api-a', 'healthy');
  assert.equal(registry.canRun(recipe), true);
});

test('unknown provider health update is rejected', () => {
  assert.throws(() => new ProviderRegistry().setHealth('missing', 'healthy'), /not registered/);
});
