import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {ModelConfig, ProviderConfig} from './config.js';
import {resolveProviderCredential} from './provider-credential-store.js';

export interface MaterializedCodexModelConfig {codexHome: string; configFile: string; environment: NodeJS.ProcessEnv; cleanup(): void;}

export function materializeCodexModelConfig(provider: ProviderConfig, model: ModelConfig, environment: NodeJS.ProcessEnv = process.env): MaterializedCodexModelConfig {
  if (!provider.baseUrl) throw new Error('provider_base_url_required');
  if (provider.wireApi === 'chat-completions') throw new Error('codex_provider_wire_api_unsupported');
  const auth = provider.auth ?? (provider.credentialEnv ? {type: 'bearer-env' as const, env: provider.credentialEnv} : {type: 'none' as const});
  const credential = auth.type === 'none' ? '' : resolveProviderCredential(provider, environment);
  const credentialEnvironment = auth.type === 'none' ? undefined : auth.type === 'provider-secure-store' ? 'AGENT_CONTROL_EPHEMERAL_PROVIDER_CREDENTIAL' : auth.env;
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-codex-provider-')), configFile = path.join(codexHome, 'config.toml');
  const providerId = `agent_control_${provider.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const lines = [
    `model = ${toml(model.providerModel)}`,
    `model_provider = ${toml(providerId)}`,
    'history.persistence = "none"',
    '',
    `[model_providers.${providerId}]`,
    `name = ${toml(provider.name ?? provider.id)}`,
    `base_url = ${toml(provider.baseUrl)}`,
    'wire_api = "responses"',
    ...(credentialEnvironment ? [`env_key = ${toml(credentialEnvironment)}`] : []),
  ];
  fs.writeFileSync(configFile, `${lines.join('\n')}\n`, {mode: 0o600});
  return {codexHome, configFile, environment: {...environment, ...(credentialEnvironment ? {[credentialEnvironment]: credential} : {}), CODEX_HOME: codexHome}, cleanup: () => fs.rmSync(codexHome, {recursive: true, force: true})};
}
function toml(value: string) { return JSON.stringify(value); }
