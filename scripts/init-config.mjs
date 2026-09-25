#!/usr/bin/env node
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {initializeConfig} from './config.mjs';

export function main({environment = process.env, cwd = process.cwd(), output = console.log} = {}) {
  const result = initializeConfig({environment, cwd});
  output(JSON.stringify({
    schema: 'agent-control.init/v1',
    result: result.result,
    created: result.created,
    file: result.file,
  }, null, 2));
  output(`RESULT ${result.result} ${result.file}`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`INIT_FAILED ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
