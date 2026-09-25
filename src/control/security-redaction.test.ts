import assert from 'node:assert/strict';
import test from 'node:test';
import {assertNoSensitiveMaterial, containsSensitiveMaterial, redactSensitiveText, redactSensitiveValue} from './security-redaction.js';

const syntheticNvidiaCredential = () => ['nvapi', 'fixture', 'A'.repeat(24)].join('-');

test('provider credential patterns and bearer values are redacted recursively', () => {
  const secret = syntheticNvidiaCredential();
  const value = redactSensitiveValue({message: `upstream echoed ${secret}`, authorization: `Bearer ${secret}`, nested: [`api_key=${secret}`]});
  const serialized = JSON.stringify(value);
  assert.equal(serialized.includes(secret), false);
  assert.match(serialized, /REDACTED/);
  assert.equal(containsSensitiveMaterial(`failure: ${secret}`), true);
  assert.equal(containsSensitiveMaterial('provider:nvidia-hosted'), false);
});

test('credential-like assignments and private keys are removed from exception-safe text', () => {
  const privateKey = ['-----BEGIN PRIVATE KEY-----', 'fixture-private-material', '-----END PRIVATE KEY-----'].join('\n');
  const redacted = redactSensitiveText(`password=hunter2 ${privateKey}`);
  assert.equal(redacted.includes('hunter2'), false);
  assert.equal(redacted.includes('fixture-private-material'), false);
  assert.throws(() => assertNoSensitiveMaterial(`token=${syntheticNvidiaCredential()}`), /credential_material_forbidden/);
});

test('the exact invocation credential is redacted even when a future provider has no known key prefix', () => {
  const credential = 'opaque.future.provider.credential.2468';
  const encoded = encodeURIComponent(credential);
  const redacted = redactSensitiveValue({output: `echo ${credential}`, error: `upstream=${encoded}`}, '', [credential]);
  assert.equal(JSON.stringify(redacted).includes(credential), false);
  assert.equal(JSON.stringify(redacted).includes(encoded), false);
  assert.match(JSON.stringify(redacted), /REDACTED CREDENTIAL/);
});

test('common source-control chat and cloud credential identifiers are redacted',()=>{const values=['glpat-'+('A'.repeat(24)),'xoxb-123456789012-123456789012-'+('A'.repeat(24)),'AKIA'+('A'.repeat(16))];for(const value of values){const redacted=redactSensitiveText(`upstream echoed ${value}`);assert.equal(redacted.includes(value),false);assert.equal(containsSensitiveMaterial(value),true);}});
