import assert from 'node:assert/strict';
import test from 'node:test';
import {parseQualificationOutputBudget} from './qualification-output-budget.js';

const bounds = {defaultTokens: 512, minimumTokens: 64, maximumTokens: 2048};

test('qualification output budget preserves the frozen default and accepts finite bounded overrides', () => {
  assert.equal(parseQualificationOutputBudget(undefined, bounds), 512);
  assert.equal(parseQualificationOutputBudget('768', bounds), 768);
  assert.equal(parseQualificationOutputBudget('1024', bounds), 1024);
  assert.equal(parseQualificationOutputBudget('1536', bounds), 1536);
});

test('qualification output budget rejects zero, fractions, non-numbers and unbounded values', () => {
  for (const value of ['0', '63', '768.5', 'NaN', '2049', '65536']) {
    assert.throws(() => parseQualificationOutputBudget(value, bounds), /qualification_output_budget_invalid/);
  }
});
