import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export const emptyConfig = () => ({schemaVersion: 1, resources: [], providers: [], services: [], lanes: []});
const idPattern = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
// Keep bootstrap's credential-key guard aligned with the authoritative
// TypeScript configuration loader. These names are numeric policy/accounting
// metadata; their values still pass the recursive secret-value scan.
const safeTokenAccountingKeys = new Set(['tokenAwareOutput', 'tokenBatonRouting', 'completeMaxTokens', 'artifactOnlyAboveReturnedTokens', 'minimumCompleteTokens', 'harnessEfficiency', 'maximumInitialContextTokens', 'maximumContextTokens', 'maximumEvidenceTokens', 'advertisedContextLimitTokens', 'maximumObservedInputTokens', 'inputPerMillionTokens', 'outputPerMillionTokens', 'cachedInputPerMillionTokens', 'cacheWritePerMillionTokens', 'contextTokens', 'outputTokens', 'continuePercent', 'prepareBatonPercent', 'compactPercent', 'handoffPercent', 'sampleRetention']);

function rejectSecrets(value, trail = 'config') {
  if (typeof value === 'string' && /\b(?:nvapi-|sk-(?:proj-)?|sk-ant-|gh[opusr]_)[A-Za-z0-9_-]{8,}\b|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/i.test(value)) throw new Error(`secret_material_forbidden:${trail}`);
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (/token|password|secret|api.?key/i.test(key) && !['credentialEnv','credentialFileEnv'].includes(key) && !safeTokenAccountingKeys.has(key)) throw new Error(`secret_material_forbidden:${trail}.${key}`);
    rejectSecrets(child, `${trail}.${key}`);
  }
}

function validateUrl(value, label) {
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error(`invalid_${label}_url`);
}

export function validateConfig(raw) {
  if (!raw || typeof raw !== 'object' || raw.schemaVersion !== 1) throw new Error('unsupported_config_schema');
  rejectSecrets(raw);
  const config = {...emptyConfig(), ...raw};
  for (const key of ['resources', 'providers', 'services', 'lanes']) if (!Array.isArray(config[key])) throw new Error(`invalid_config_${key}`);
  const ids = new Set();
  for (const [kind, entries] of [['resource', config.resources], ['provider', config.providers], ['service', config.services]]) {
    for (const entry of entries) {
      if (!idPattern.test(entry.id ?? '')) throw new Error(`invalid_${kind}_id`);
      if (ids.has(entry.id)) throw new Error(`duplicate_id:${entry.id}`);
      ids.add(entry.id);
    }
  }
  for (const resource of config.resources) {
    if (!resource.transport || !['local', 'ssh', 'http', 'orca'].includes(resource.transport.type)) throw new Error(`invalid_transport:${resource.id}`);
    if (resource.transport.type === 'ssh' && !resource.transport.host) throw new Error(`ssh_host_required:${resource.id}`);
    if (resource.transport.type === 'http') validateUrl(resource.transport.baseUrl, `transport_${resource.id}`);
    if (resource.healthUrl) validateUrl(resource.healthUrl, `resource_${resource.id}`);
  }
  for (const provider of config.providers) if (provider.baseUrl) validateUrl(provider.baseUrl, `provider_${provider.id}`);
  for (const service of config.services) validateUrl(service.healthUrl, `service_${service.id}`);
  return config;
}

export function resolveConfigPath(environment = process.env, cwd = process.cwd()) {
  return path.resolve(environment.AGENT_CONTROL_CONFIG || path.join(environment.AGENT_CONTROL_STATE_DIR || path.join(cwd, '.agent-control'), 'config.json'));
}

export function loadConfig({environment = process.env, cwd = process.cwd(), file = resolveConfigPath(environment, cwd)} = {}) {
  if (!fs.existsSync(file)) return {config: emptyConfig(), file, configured: false};
  return {config: validateConfig(JSON.parse(fs.readFileSync(file, 'utf8'))), file, configured: true};
}

function emptyCollections(config) {
  return ['resources', 'providers', 'services', 'lanes'].every(key => config[key].length === 0);
}

const unsupportedHardLinkErrors = new Set(['EACCES', 'EPERM', 'ENOSYS', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV']);

function publishExclusive(fileSystem, temporary, target) {
  try {
    fileSystem.linkSync(temporary, target);
    return;
  } catch (error) {
    if (!unsupportedHardLinkErrors.has(error?.code)) throw error;
  }

  // Android/Termux filesystems can permit ordinary owner-only files while
  // denying hard-link creation. COPYFILE_EXCL retains the no-overwrite race
  // boundary without weakening permissions or replacing an existing config.
  fileSystem.copyFileSync(temporary, target, fileSystem.constants.COPYFILE_EXCL);
  fileSystem.chmodSync(target, 0o600);
  const descriptor = fileSystem.openSync(target, 'r');
  try {
    fileSystem.fsyncSync(descriptor);
  } finally {
    fileSystem.closeSync(descriptor);
  }
}

/**
 * Create the smallest safe configuration without discovering infrastructure or
 * overwriting operator state. The completed temporary file is linked into place
 * atomically where hard links are supported. Filesystems that deny hard links
 * use an exclusive copy, which preserves the same create-if-absent boundary.
 */
export function initializeConfig({environment = process.env, cwd = process.cwd(), file = resolveConfigPath(environment, cwd), fileSystem = fs} = {}) {
  const target = path.resolve(file);
  if (fileSystem.existsSync(target)) {
    const config = validateConfig(JSON.parse(fileSystem.readFileSync(target, 'utf8')));
    return {result: emptyCollections(config) ? 'UNCHANGED_EMPTY' : 'PRESERVED_EXISTING', created: false, file: target, config};
  }

  const directory = path.dirname(target);
  fileSystem.mkdirSync(directory, {recursive: true});
  const temporary = path.join(directory, `.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`);
  const config = emptyConfig();
  const payload = `${JSON.stringify(config, null, 2)}\n`;
  let descriptor;
  try {
    descriptor = fileSystem.openSync(temporary, 'wx', 0o600);
    fileSystem.writeFileSync(descriptor, payload, 'utf8');
    fileSystem.fsyncSync(descriptor);
    fileSystem.closeSync(descriptor);
    descriptor = undefined;
    try {
      publishExclusive(fileSystem, temporary, target);
      return {result: 'CREATED', created: true, file: target, config};
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const existing = validateConfig(JSON.parse(fileSystem.readFileSync(target, 'utf8')));
      return {result: emptyCollections(existing) ? 'UNCHANGED_EMPTY' : 'PRESERVED_EXISTING', created: false, file: target, config: existing};
    }
  } finally {
    if (descriptor !== undefined) fileSystem.closeSync(descriptor);
    try { fileSystem.unlinkSync(temporary); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
}

export function expandUserPath(value, environment = process.env) {
  return value?.replace(/^~(?=$|[\\/])/, environment.HOME || environment.USERPROFILE || '');
}
