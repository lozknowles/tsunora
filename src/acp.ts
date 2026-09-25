import {Readable, Writable} from 'node:stream';
import {ndJsonStream} from '@agentclientprotocol/sdk';
import {bootstrapAcpRuntime} from './control/acp-bootstrap.js';

export async function runAcpStdio(environment: NodeJS.ProcessEnv = process.env) {
  const {runtime, stopScheduler} = bootstrapAcpRuntime(environment);
  const output = Writable.toWeb(process.stdout) as WritableStream<Uint8Array>;
  const input = Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>;
  const connection = runtime.app.connect(ndJsonStream(output, input));
  const shutdown = () => connection.close();
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
  try { await connection.closed; }
  finally { stopScheduler(); process.removeListener('SIGINT', shutdown); process.removeListener('SIGTERM', shutdown); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAcpStdio().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
}
