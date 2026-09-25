import {loadConfig} from '../src/control/config.js';
import {buildJobRuntime} from '../src/control/job-bootstrap.js';
import type {ManagedNodeOperation} from '../src/control/managed-node.js';

function usage(message?: string): never { if (message) process.stderr.write(`${message}\n`); process.stderr.write('Usage: npm run qualify:managed-node -- --resource <id> [--package <name>] [--service <unit>]\n'); process.exit(2); }

const allowed = new Set(['--resource', '--package', '--service']), options = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index], value = process.argv[index + 1];
  if (!allowed.has(name)) usage(`Unsupported option: ${name}`);
  if (!value || value.startsWith('--')) usage(`A value is required for ${name}`);
  if (options.has(name)) usage(`Duplicate option: ${name}`);
  options.set(name, value);
}
const option = (name: string) => options.get(name);
const resourceId = option('--resource'); if (!resourceId) usage('A configured resource id is required');
const packageName = option('--package'), serviceUnit = option('--service'), config = loadConfig(), resource = config.resources.find(item => item.id === resourceId);
if (!resource?.managedNode) usage(`Managed node is not configured: ${resourceId}`);

const runtime = buildJobRuntime(config), snapshot = await runtime.managedNodes.poll(resourceId);
if (snapshot.state === 'OFFLINE') { process.stdout.write(`${JSON.stringify({schema: 'agent-control.managed-node-qualification/v1', resourceId, result: 'FAIL', snapshot}, null, 2)}\n`); process.exit(1); }

const requests: Array<{operation: ManagedNodeOperation; target?: string}> = [{operation: 'system.identity'}];
if (packageName) requests.push({operation: 'package.query', target: packageName});
if (serviceUnit) requests.push({operation: 'service.status', target: serviceUnit});
const runs = [];
for (const request of requests) {
  const created = runtime.createRun('managed-node-inspection@1.0.0', request, {type: 'manual', actor: 'managed-node-qualification'});
  await runtime.tick();
  const run = runtime.ledger.get(created.id)!;
  const artifacts = run.artifacts.map(id => { const metadata = runtime.artifacts.get(id)!; const {storageRef: _storageRef, ...publicMetadata} = metadata; return {metadata: publicMetadata, value: runtime.artifacts.read(id)}; });
  runs.push({id: run.id, operation: request.operation, status: run.status, selectedWorkers: run.selectedWorkers, verification: run.steps[0].verification, provenance: run.provenance, artifacts});
}
const pass = runs.every(run => run.status === 'SUCCEEDED');
process.stdout.write(`${JSON.stringify({schema: 'agent-control.managed-node-qualification/v1', resourceId, result: pass ? 'PASS' : 'FAIL', readOnly: true, snapshot, runs}, null, 2)}\n`);
if (!pass) process.exitCode = 1;
