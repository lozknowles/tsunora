import {bootstrapAcpRuntime} from './control/acp-bootstrap.js';
import {acpRemoteConfig, startAcpRemoteServer} from './control/acp-remote.js';

export async function runAcpRemote(environment: NodeJS.ProcessEnv = process.env) {
  const config = acpRemoteConfig(environment);
  const {runtime, stopScheduler} = bootstrapAcpRuntime(environment);
  const server = await startAcpRemoteServer(runtime.app, config);
  process.stderr.write(`Agent Control ACP remote listening at ${server.url}\n`);
  await new Promise<void>((resolve, reject) => {
    const stop = () => resolve();
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    process.once('uncaughtException', reject);
  }).finally(async () => { await server.close(); stopScheduler(); });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAcpRemote().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
}
