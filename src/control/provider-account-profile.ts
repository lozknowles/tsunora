import fs from 'node:fs';
import path from 'node:path';
import type {ProviderAccountProfileConfig, ProviderConfig, ProviderCredentialResidencyConfig, ProviderCredentialStoreReference} from './config.js';

export interface ResolvedCodexAccountProfile {
  profile: ProviderAccountProfileConfig;
  environment: NodeJS.ProcessEnv;
}

/** Normalize the 3.8.0 account.nodeId/credentialStore shape without changing its meaning. */
export function accountCredentialResidency(profile: ProviderAccountProfileConfig): ProviderCredentialResidencyConfig {
  if (profile.credentialResidency) return structuredClone(profile.credentialResidency);
  if (!profile.credentialStore) throw new Error('account_profile_credential_store_missing');
  return {nodeId: profile.nodeId ?? 'controller', store: structuredClone(profile.credentialStore)};
}

export function accountProviderExecutionNode(profile: ProviderAccountProfileConfig) {
  return profile.providerExecutionNodeId ?? profile.credentialResidency?.nodeId ?? profile.nodeId ?? 'controller';
}

export function accountCredentialStore(profile: ProviderAccountProfileConfig): ProviderCredentialStoreReference {
  return accountCredentialResidency(profile).store;
}

/** Resolve one pre-authenticated Codex home for one child process without reading or copying its credentials. */
export function resolveCodexAccountProfile(provider: ProviderConfig, accountProfileId: string, environment: NodeJS.ProcessEnv = process.env): ResolvedCodexAccountProfile {
  if (provider.kind !== 'cli') throw new Error('account_profile_codex_provider_required');
  const profile = provider.accountProfiles?.find(value => value.id === accountProfileId);
  if (!profile) throw new Error('account_profile_missing');
  if (profile.enabled === false) throw new Error('account_profile_disabled');
  return resolveCodexAccountEnvironment(profile, environment);
}

export function resolveCodexAccountEnvironment(profile: ProviderAccountProfileConfig, environment: NodeJS.ProcessEnv = process.env, nodeId = accountProviderExecutionNode(profile)): ResolvedCodexAccountProfile {
  const residency = accountCredentialResidency(profile), store = residency.store;
  if (store.type !== 'codex-home-env') throw new Error('account_profile_credential_store_unsupported');
  if (residency.nodeId !== nodeId || accountProviderExecutionNode(profile) !== nodeId) throw new Error('account_profile_remote_resolution_forbidden');
  const codexHome = environment[store.env]?.trim();
  if (!codexHome) throw new Error('account_profile_authentication_required');
  if (!path.isAbsolute(codexHome)) throw new Error('account_profile_codex_home_must_be_absolute');
  let stat: fs.Stats;
  try { stat = fs.statSync(codexHome); } catch { throw new Error('account_profile_codex_home_unavailable'); }
  if (!stat.isDirectory()) throw new Error('account_profile_codex_home_unavailable');
  const isolatedEnvironment: NodeJS.ProcessEnv = {...environment, CODEX_HOME: codexHome};
  delete isolatedEnvironment.OPENAI_API_KEY;
  delete isolatedEnvironment.CODEX_API_KEY;
  return {profile: structuredClone(profile), environment: isolatedEnvironment};
}
