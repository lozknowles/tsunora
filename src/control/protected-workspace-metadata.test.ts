import assert from 'node:assert/strict';
import test from 'node:test';
import {assertWorkspaceMetadataAccess,protectedMetadataDecision} from './protected-workspace-metadata.js';

test('governance directories remain absent and instructions are read only',()=>{for(const value of ['.git/config','nested/.codex/config.toml','.agents/policy','.agent-control/evidence','nested/.agent-control-evidence/hash'])assert.equal(protectedMetadataDecision(value,'CREATE').verdict,'UNAVAILABLE');assert.equal(protectedMetadataDecision('AGENTS.md','READ').verdict,'READ_ONLY');assert.equal(protectedMetadataDecision('nested/AGENTS.md','WRITE').verdict,'UNAVAILABLE');assert.equal(protectedMetadataDecision('src/index.ts','WRITE').verdict,'ALLOW');});
test('alternate separators and traversal cannot bypass policy',()=>{assert.throws(()=>assertWorkspaceMetadataAccess('nested\\.git\\config','WRITE'),/metadata_denied/);assert.throws(()=>assertWorkspaceMetadataAccess('nested/../.git/config','WRITE'),/metadata_denied/);});
