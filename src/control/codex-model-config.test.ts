import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {materializeCodexModelConfig} from './codex-model-config.js';
import {SecureProviderCredentialStore} from './provider-credential-store.js';

test('materializes an ephemeral provider config without copying secret values or user config', () => { const secret = 'secret-value-must-not-appear'; const config = materializeCodexModelConfig({id:'openrouter',name:'OpenRouter',kind:'openai-compatible',baseUrl:'https://openrouter.ai/api/v1',wireApi:'responses',auth:{type:'bearer-env',env:'OPENROUTER_API_KEY'}},{id:'glm',provider:'openrouter',providerModel:'z-ai/glm',capabilities:['coding']},{OPENROUTER_API_KEY:secret}); try { const text=fs.readFileSync(config.configFile,'utf8'); assert.match(text,/model_provider = "agent_control_openrouter"/); assert.match(text,/env_key = "OPENROUTER_API_KEY"/); assert.equal(text.includes(secret),false); assert.equal(config.environment.CODEX_HOME,config.codexHome); assert.equal(fs.statSync(config.configFile).mode & 0o777,0o600); } finally { config.cleanup(); } });
test('missing provider secret fails closed', () => { assert.throws(()=>materializeCodexModelConfig({id:'p',kind:'openai-compatible',baseUrl:'https://example.test/v1',auth:{type:'bearer-env',env:'MISSING_KEY'}},{id:'m',provider:'p',providerModel:'m',capabilities:[]},{}),/provider_authentication_required/); });
test('Codex materialization rejects chat-completions-only providers', () => { assert.throws(()=>materializeCodexModelConfig({id:'p',kind:'openai-compatible',baseUrl:'https://example.test/v1',wireApi:'chat-completions',auth:{type:'none'}},{id:'m',provider:'p',providerModel:'m',capabilities:[]},{}),/codex_provider_wire_api_unsupported/); });

test('secure-store credentials enter only the ephemeral Codex child environment', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-codex-secure-provider-')), secret = 'opaque-secure-provider-fixture';
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  new SecureProviderCredentialStore(path.join(root, 'credentials', 'providers')).set('provider:responses-fixture', secret);
  const config = materializeCodexModelConfig(
    {id: 'responses-fixture', kind: 'openai-compatible', baseUrl: 'https://example.test/v1', wireApi: 'responses', auth: {type: 'provider-secure-store', reference: 'provider:responses-fixture'}},
    {id: 'fixture-model', provider: 'responses-fixture', providerModel: 'vendor/model', capabilities: []},
    {AGENT_CONTROL_STATE_DIR: root},
  );
  const codexHome = config.codexHome;
  try {
    const text = fs.readFileSync(config.configFile, 'utf8');
    assert.match(text, /env_key = "AGENT_CONTROL_EPHEMERAL_PROVIDER_CREDENTIAL"/);
    assert.equal(text.includes(secret), false);
    assert.equal(text.includes('provider:responses-fixture'), false);
    assert.equal(config.environment.AGENT_CONTROL_EPHEMERAL_PROVIDER_CREDENTIAL, secret);
    assert.equal(config.environment.CODEX_HOME, codexHome);
  } finally { config.cleanup(); }
  assert.equal(fs.existsSync(codexHome), false);
});
