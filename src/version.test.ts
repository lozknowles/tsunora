import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {AGENT_CONTROL_VERSION} from './version.js';

test('runtime and package versions identify the same release candidate',()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 assert.equal(AGENT_CONTROL_VERSION,manifest.version);
});
