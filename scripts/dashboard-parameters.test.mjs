import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

test('dashboard serializes parameter fields according to the manifest schema', () => {
  const context = {window: {}}; vm.runInNewContext(fs.readFileSync(path.resolve('assets/dashboard/dashboard-parameters.js'), 'utf8'), context);
  const fields = [
    {dataset: {jobParameter: 'count'}, value: '12'},
    {dataset: {jobParameter: 'ratio'}, value: '1.25'},
    {dataset: {jobParameter: 'enabled'}, checked: true},
    {dataset: {jobParameter: 'label'}, value: 'fixture'},
  ];
  const definitions = {count: {type: 'integer', required: true}, ratio: {type: 'number'}, enabled: {type: 'boolean'}, label: {type: 'string'}};
  const result = context.window.AgentControlDashboardParameters.collect(definitions, {querySelectorAll: () => fields});
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {count: 12, ratio: 1.25, enabled: true, label: 'fixture'});
  assert.throws(() => context.window.AgentControlDashboardParameters.collect({count: {type: 'integer'}}, {querySelectorAll: () => [{dataset: {jobParameter: 'count'}, value: '1.5'}]}), /must be an integer/);
});

test('dirty fields survive repeated refresh while untouched defaults remain server-owned', () => {
  const context = {window: {}}; vm.runInNewContext(fs.readFileSync(path.resolve('assets/dashboard/dashboard-parameters.js'), 'utf8'), context);
  const api = context.window.AgentControlDashboardParameters;
  const form = fields => {
    const listeners = {};
    return {fields, listeners, querySelectorAll: selector => selector.includes('data-dirty') ? fields.filter(field => field.dataset.dirty === 'true') : fields, addEventListener: (name, listener) => { listeners[name] = listener; }};
  };
  const firstFields = [{dataset: {jobParameter: 'count'}, value: '1', type: 'number'}, {dataset: {jobParameter: 'label'}, value: 'server-a', type: 'text'}];
  for (const field of firstFields) field.closest = () => field;
  const first = form(firstFields); api.bind('job-a', first);
  firstFields[0].value = '42'; first.listeners.input({target: firstFields[0]});
  const secondFields = [{dataset: {jobParameter: 'count'}, value: '2', type: 'number'}, {dataset: {jobParameter: 'label'}, value: 'server-b', type: 'text'}];
  const second = form(secondFields); api.bind('job-a', second);
  assert.equal(secondFields[0].value, '42');
  assert.equal(secondFields[0].dataset.dirty, 'true');
  assert.equal(secondFields[1].value, 'server-b');
  secondFields[1].closest = () => secondFields[1]; secondFields[1].value = 'typed'; second.listeners.change({target: secondFields[1]});
  const thirdFields = [{dataset: {jobParameter: 'count'}, value: '3', type: 'number'}, {dataset: {jobParameter: 'label'}, value: 'server-c', type: 'text'}];
  const third = form(thirdFields); api.bind('job-a', third);
  assert.deepEqual(thirdFields.map(field => field.value), ['42', 'typed']);
  api.clear('job-a', third);
  const resetFields = [{dataset: {jobParameter: 'count'}, value: '4', type: 'number'}, {dataset: {jobParameter: 'label'}, value: 'server-d', type: 'text'}];
  api.bind('job-a', form(resetFields));
  assert.deepEqual(resetFields.map(field => field.value), ['4', 'server-d']);
});

test('job detail source renders live pending state and canonical invocation history', () => {
  const source = fs.readFileSync(path.resolve('assets/dashboard/dashboard-enhancements.js'), 'utf8');
  assert.match(source, /awaiting completion/);
  assert.match(source, /Invocation lifecycle/);
  assert.match(source, /Immutable submitted parameters/);
  assert.match(source, /Replacement \/ retry lineage/);
  assert.match(source, /usage unavailable/);
  assert.match(source, /costSource === 'reported'/);
  assert.match(source, /costSource === 'estimated'/);
  assert.match(source, /item\.runId === run\.id/);
  assert.match(source, /setInterval\(\(\) => refresh\(\)/);
});
