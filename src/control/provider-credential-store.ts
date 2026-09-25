import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {ProviderAccountProfileConfig, ProviderAuthConfig, ProviderConfig, ProviderCredentialStoreReference} from './config.js';
import {accountCredentialResidency, accountProviderExecutionNode} from './provider-account-profile.js';

export type ProviderCredentialStatus = 'NOT_REQUIRED' | 'CONFIGURED' | 'MISSING' | 'INVALID_STORE';
export type ProviderApiCredentialReference = Exclude<ProviderCredentialStoreReference, {type: 'codex-home-env'}>;

/** Concrete controller-local backend for the pre-existing provider-secure-store reference kind. */
export class SecureProviderCredentialStore {
  constructor(readonly directory = defaultProviderCredentialDirectory()) {}

  set(reference: string, credential: string) {
    validateReference(reference);
    validateCredential(credential);
    this.prepareDirectory();
    const target = this.file(reference);
    rejectUnsafeTarget(target);
    const temporary = path.join(this.directory, `.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`);
    try {
      fs.writeFileSync(temporary, credential, {encoding: 'utf8', mode: 0o600, flag: 'wx'});
      fs.renameSync(temporary, target);
      try { assertOwnerOnlyFile(target); }
      catch (error) { try { fs.unlinkSync(target); } catch {} throw error; }
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
    return {status: 'CONFIGURED' as const, fingerprint: credentialFingerprint(credential)};
  }

  get(reference: string) {
    validateReference(reference);
    this.assertDirectory();
    const file = this.file(reference);
    assertOwnerOnlyFile(file);
    const value = fs.readFileSync(file, 'utf8').trim();
    validateCredential(value);
    return value;
  }

  status(reference: string): ProviderCredentialStatus {
    try {
      validateReference(reference);
      this.assertDirectory();
      const stat = assertOwnerOnlyFile(this.file(reference));
      return stat.size > 0 && stat.size <= 16_384 ? 'CONFIGURED' : 'INVALID_STORE';
    }
    catch (error) { return (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'MISSING' : 'INVALID_STORE'; }
  }

  revoke(reference: string) {
    validateReference(reference);
    try { this.assertDirectory(); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {status: 'MISSING' as const}; throw error; }
    const file = this.file(reference);
    try { assertOwnerOnlyFile(file); fs.unlinkSync(file); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    return {status: 'MISSING' as const};
  }

  private prepareDirectory() {
    fs.mkdirSync(this.directory, {recursive: true, mode: 0o700});
    const stat = fs.lstatSync(this.directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || !ownedByCurrentUser(stat)) throw new Error('provider_credential_store_permissions_invalid');
    fs.chmodSync(this.directory, 0o700);
    this.assertDirectory();
  }

  private assertDirectory() {
    const stat = fs.lstatSync(this.directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || !ownedByCurrentUser(stat) || (stat.mode & 0o077) !== 0) throw new Error('provider_credential_store_permissions_invalid');
  }

  private file(reference: string) {
    return path.join(this.directory, `${createHash('sha256').update(reference).digest('hex')}.credential`);
  }
}

export function defaultProviderCredentialDirectory(environment: NodeJS.ProcessEnv = process.env, cwd = process.cwd()) {
  const stateRoot = path.resolve(environment.AGENT_CONTROL_STATE_DIR || path.join(cwd, '.agent-control'));
  return path.resolve(environment.AGENT_CONTROL_PROVIDER_CREDENTIAL_STORE_DIR || path.join(stateRoot, 'credentials', 'providers'));
}

export function providerCredentialStatus(provider: ProviderConfig, environment: NodeJS.ProcessEnv = process.env, store = new SecureProviderCredentialStore(defaultProviderCredentialDirectory(environment))): ProviderCredentialStatus {
  const auth = normalizedAuth(provider);
  if (auth.type === 'none') return 'NOT_REQUIRED';
  const primary = credentialReferenceStatus(authReference(auth), environment, store);
  if (primary === 'CONFIGURED' || primary === 'INVALID_STORE' || auth.type === 'provider-secure-store') return primary;
  if (provider.credentialFileEnv && !(auth.type === 'bearer-file-env' && provider.credentialFileEnv === auth.env)) {
    const fallback = credentialReferenceStatus({type: 'bearer-file-env', env: provider.credentialFileEnv}, environment, store);
    if (fallback !== 'MISSING') return fallback;
  }
  if (provider.credentialEnv && !((auth.type === 'bearer-env' || auth.type === 'api-key-env') && provider.credentialEnv === auth.env)) {
    const fallback = credentialReferenceStatus({type: 'api-key-env', env: provider.credentialEnv}, environment, store);
    if (fallback !== 'MISSING') return fallback;
  }
  return primary;
}

export function resolveProviderCredential(provider: ProviderConfig, environment: NodeJS.ProcessEnv = process.env, store = new SecureProviderCredentialStore(defaultProviderCredentialDirectory(environment))) {
  const auth = normalizedAuth(provider);
  if (auth.type === 'none') return '';
  let value = resolveCredentialReference(authReference(auth), environment, store, false);
  if (!value && provider.credentialFileEnv && !(auth.type === 'bearer-file-env' && provider.credentialFileEnv === auth.env)) value = resolveCredentialReference({type: 'bearer-file-env', env: provider.credentialFileEnv}, environment, store, false);
  if (!value && provider.credentialEnv && !((auth.type === 'bearer-env' || auth.type === 'api-key-env') && provider.credentialEnv === auth.env)) value = environment[provider.credentialEnv]?.trim() ?? '';
  if (!value) throw new Error('provider_authentication_required');
  return value;
}

/** Resolve an API account profile on the controller without falling back to another provider/account credential. */
export function resolveProviderAccountCredential(provider: ProviderConfig, account: ProviderAccountProfileConfig, environment: NodeJS.ProcessEnv = process.env, store = new SecureProviderCredentialStore(defaultProviderCredentialDirectory(environment)), executionNodeId = 'controller') {
  if (provider.kind === 'cli') throw new Error('account_profile_api_provider_required');
  const residency = accountCredentialResidency(account);
  if (accountProviderExecutionNode(account) !== executionNodeId || residency.nodeId !== executionNodeId) throw new Error('account_profile_remote_resolution_forbidden');
  if (residency.store.type === 'codex-home-env') throw new Error('account_profile_credential_store_unsupported');
  return resolveCredentialReference(residency.store, environment, store);
}

export function credentialReferenceStatus(reference: ProviderApiCredentialReference, environment: NodeJS.ProcessEnv = process.env, store = new SecureProviderCredentialStore(defaultProviderCredentialDirectory(environment))): ProviderCredentialStatus {
  if (reference.type === 'provider-secure-store') return store.status(reference.reference);
  if (reference.type === 'bearer-file-env') return referencedFilePresent(reference.env, environment);
  return environment[reference.env]?.trim() ? 'CONFIGURED' : 'MISSING';
}

/** Resolve an existing generic credential reference only at its invocation boundary. */
export function resolveCredentialReference(reference: ProviderApiCredentialReference, environment: NodeJS.ProcessEnv = process.env, store = new SecureProviderCredentialStore(defaultProviderCredentialDirectory(environment)), required = true) {
  const value = reference.type === 'provider-secure-store'
    ? store.get(reference.reference)
    : reference.type === 'bearer-file-env'
      ? readReferencedFile(reference.env, environment)
      : environment[reference.env]?.trim() ?? '';
  if (!value && required) throw new Error('provider_authentication_required');
  return value;
}

export function providerCredentialReferenceType(provider: ProviderConfig) {
  const auth = normalizedAuth(provider);
  return auth.type === 'none' ? 'not-required' as const : auth.type === 'provider-secure-store' ? 'secure-store' as const : auth.type === 'bearer-file-env' ? 'file-environment' as const : 'environment' as const;
}

export function providerSecureStoreReference(provider: ProviderConfig) {
  const auth = normalizedAuth(provider);
  if (auth.type !== 'provider-secure-store') throw new Error('provider_secure_credential_store_not_configured');
  return auth.reference;
}

export function validateCredential(value: string) {
  if (typeof value !== 'string' || value.length < 16 || value.length > 16_384 || /[\r\n\0\s]/.test(value)) throw new Error('provider_credential_format_invalid');
}

export function credentialFingerprint(value: string) {
  validateCredential(value);
  const prefix = value.startsWith('nvapi-') ? 'nvapi-' : value.includes('-') ? value.slice(0, Math.min(value.indexOf('-') + 1, 12)) : 'credential-';
  return `${prefix}…${value.slice(-4)}`;
}

function normalizedAuth(provider: ProviderConfig): ProviderAuthConfig {
  if (provider.auth) return provider.auth;
  if (provider.credentialEnv) return {type: 'bearer-env', env: provider.credentialEnv};
  if (provider.credentialFileEnv) return {type: 'bearer-file-env', env: provider.credentialFileEnv};
  return provider.requiresAuth ? {type: 'bearer-env', env: ''} : {type: 'none'};
}

function authReference(auth: Exclude<ProviderAuthConfig, {type: 'none'}>): ProviderApiCredentialReference {
  return auth.type === 'bearer-env' ? {type: 'api-key-env', env: auth.env} : auth;
}

function readReferencedFile(environmentName: string, environment: NodeJS.ProcessEnv) {
  const file = environment[environmentName];
  if (!file || !path.isAbsolute(file)) return '';
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('provider_credential_file_invalid');
  return fs.readFileSync(file, 'utf8').trim();
}

function referencedFilePresent(environmentName: string, environment: NodeJS.ProcessEnv): ProviderCredentialStatus {
  const file = environment[environmentName];
  if (!file || !path.isAbsolute(file)) return 'MISSING';
  try {
    const stat = fs.lstatSync(file);
    return stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= 16_384 ? 'CONFIGURED' : 'INVALID_STORE';
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'MISSING' : 'INVALID_STORE';
  }
}

function rejectUnsafeTarget(file: string) {
  try { const stat = fs.lstatSync(file); if (!stat.isFile() || stat.isSymbolicLink() || !ownedByCurrentUser(stat)) throw new Error('provider_credential_store_permissions_invalid'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}

function assertOwnerOnlyFile(file: string) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || !ownedByCurrentUser(stat) || (stat.mode & 0o077) !== 0) throw new Error('provider_credential_store_permissions_invalid');
  return stat;
}

function ownedByCurrentUser(stat: fs.Stats) {
  return typeof process.getuid !== 'function' || stat.uid === process.getuid();
}

function validateReference(value: string) {
  if (!/^[a-z0-9][a-z0-9._:/-]{0,255}$/i.test(value)) throw new Error('provider_credential_reference_invalid');
}
