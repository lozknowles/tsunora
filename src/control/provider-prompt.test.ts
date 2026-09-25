import assert from 'node:assert/strict';
import test from 'node:test';
import {providerPromptBoundary, renderProviderPrompt, type ProviderPrompt} from './provider-prompt.js';

const prompt = (volatile = 'run:a'): ProviderPrompt => ({
  schema: 'agent-control.provider-prompt/v1',
  cacheScope: 'repository-review-v1',
  blocks: [
    {type: 'text', stability: 'stable', text: 'fixed instructions\n\nfrozen evidence'},
    {type: 'text', stability: 'volatile', text: `\n\n${volatile}`},
  ],
});

test('structured prompts preserve the exact legacy text while exposing a stable prefix', () => {
  const first = prompt('run:a'), second = prompt('run:b');
  assert.equal(renderProviderPrompt(first), 'fixed instructions\n\nfrozen evidence\n\nrun:a');
  assert.equal(first.blocks[0].text, second.blocks[0].text);
  assert.notEqual(renderProviderPrompt(first), renderProviderPrompt(second));
  assert.equal(providerPromptBoundary(first)?.lastStableBlock, 0);
});

test('a stable block after volatile material fails closed instead of guessing a boundary', () => {
  const invalid: ProviderPrompt = {...prompt(), blocks: [prompt().blocks[1], prompt().blocks[0]]};
  assert.throws(() => providerPromptBoundary(invalid), /provider_prompt_stable_prefix_noncontiguous/);
});

test('plain strings retain their existing shape and have no structural cache boundary', () => {
  assert.equal(renderProviderPrompt('unchanged'), 'unchanged');
  assert.equal(providerPromptBoundary('unchanged'), null);
});
