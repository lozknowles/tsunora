#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryFile = path.join(root, 'config', 'implementation-status.json');
const documentationFile = path.join(root, 'docs', 'implementation-status.md');
const statuses = new Set(['IMPLEMENTED', 'QUALIFIED', 'PARTIAL', 'PLANNED', 'NOT_IMPLEMENTED']);

function repositoryPath(relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error(`unsafe_status_path:${relative}`);
  return path.join(root, relative);
}

export function loadImplementationStatus() {
  const registry = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
  if (registry.schema !== 'agent-control.implementation-status/v1' || !Array.isArray(registry.capabilities)) throw new Error('invalid_implementation_status_schema');
  const ids = new Set();
  for (const capability of registry.capabilities) {
    if (!/^[a-z0-9][a-z0-9.-]+$/.test(capability.id ?? '') || ids.has(capability.id)) throw new Error(`invalid_or_duplicate_capability:${capability.id}`);
    ids.add(capability.id);
    if (!statuses.has(capability.status)) throw new Error(`invalid_capability_status:${capability.id}`);
    for (const key of ['sources', 'tests', 'evidence']) {
      const files = capability[key] ?? [];
      if (!Array.isArray(files)) throw new Error(`invalid_capability_${key}:${capability.id}`);
      for (const file of files) if (!fs.existsSync(repositoryPath(file))) throw new Error(`missing_capability_${key}:${capability.id}:${file}`);
    }
    if (['IMPLEMENTED', 'QUALIFIED', 'PARTIAL'].includes(capability.status) && (!capability.sources.length || !capability.tests.length)) throw new Error(`capability_requires_source_and_test:${capability.id}`);
    if (capability.status === 'QUALIFIED' && !(capability.evidence?.length > 0)) throw new Error(`qualified_capability_requires_evidence:${capability.id}`);
    if (['PARTIAL', 'PLANNED', 'NOT_IMPLEMENTED'].includes(capability.status) && !capability.limitation) throw new Error(`incomplete_capability_requires_limitation:${capability.id}`);
  }
  return registry;
}

const escape = value => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
const links = files => files.map(file => `[\`${file}\`](../${file.replaceAll('\\', '/')})`).join(', ');

export function renderImplementationStatus(registry = loadImplementationStatus()) {
  const lines = [
    '# Implementation status',
    '',
    `Release boundary: **${registry.release}**. Registry updated: **${registry.updated}**.`,
    '',
    'This document is generated from `config/implementation-status.json`. Update the registry and run `npm run status:implementation -- --write`; do not edit this projection directly. `IMPLEMENTED` means executable source and focused tests exist. `QUALIFIED` additionally requires recorded real evidence. `PARTIAL`, `PLANNED` and `NOT_IMPLEMENTED` remain explicit gaps.',
    '',
    '| Capability | Status | Executable truth | Remaining boundary |',
    '| --- | --- | --- | --- |',
  ];
  for (const item of registry.capabilities) lines.push(`| ${escape(item.title)} (\`${item.id}\`) | **${item.status}** | ${escape(item.summary)} | ${escape(item.limitation ?? 'None recorded.')} |`);
  lines.push('', '## Evidence map', '');
  for (const item of registry.capabilities) {
    lines.push(`### ${item.title}`, '', `- Source: ${item.sources.length ? links(item.sources) : 'not implemented'}`);
    lines.push(`- Tests: ${item.tests.length ? links(item.tests) : 'none'}`);
    if (item.evidence?.length) lines.push(`- Qualification evidence: ${links(item.evidence)}`);
    lines.push('');
  }
  return `${lines.join('\n').trim()}\n`;
}

export function main(argv = process.argv.slice(2)) {
  const registry = loadImplementationStatus(), rendered = renderImplementationStatus(registry);
  if (argv.includes('--write')) {
    fs.writeFileSync(documentationFile, rendered);
    console.log(`WROTE ${path.relative(root, documentationFile)}`);
    return 0;
  }
  if (argv.includes('--check')) {
    if (!fs.existsSync(documentationFile) || fs.readFileSync(documentationFile, 'utf8') !== rendered) throw new Error('implementation_status_documentation_stale');
    console.log(`PASS ${registry.capabilities.length} implementation-status entries`);
    return 0;
  }
  if (argv.includes('--json')) console.log(JSON.stringify(registry, null, 2));
  else console.log(rendered);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try { process.exitCode = main(); }
  catch (error) { console.error(`STATUS_FAILED ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; }
}
