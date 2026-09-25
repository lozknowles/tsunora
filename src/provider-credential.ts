import {configPath, loadConfig} from './control/config.js';
import {defaultProviderAdapterRegistry} from './control/provider-catalog.js';
import {defaultProviderCredentialDirectory, providerSecureStoreReference, SecureProviderCredentialStore} from './control/provider-credential-store.js';
import {accountCredentialResidency, accountProviderExecutionNode} from './control/provider-account-profile.js';

export async function main(argv = process.argv.slice(2)) {
  const [operation, providerId, ...options] = argv;
  const accountProfileId = options.length === 0 ? undefined : options.length === 2 && options[0] === '--account' && options[1] ? options[1] : null;
  if (!['set','status','revoke'].includes(operation ?? '') || !providerId || accountProfileId === null) return usage();
  const provider = loadConfig(configPath()).providers.find(item => item.id === providerId);
  if (!provider) throw new Error('provider_missing');
  const reference = accountProfileId ? accountSecureStoreReference(provider, accountProfileId) : providerSecureStoreReference(provider);
  const store = new SecureProviderCredentialStore(defaultProviderCredentialDirectory());
  if (operation === 'status') {
    const status = store.status(reference);
    process.stdout.write(`${JSON.stringify({providerId, ...(accountProfileId ? {accountProfileId} : {}), status})}\n`);
    return status === 'CONFIGURED' ? 0 : 2;
  }
  if (operation === 'revoke') {
    const result = store.revoke(reference);
    process.stdout.write(`${JSON.stringify({providerId, ...(accountProfileId ? {accountProfileId} : {}), status: result.status})}\n`);
    return 0;
  }
  const credential = await readCredential();
  const adapter = defaultProviderAdapterRegistry().resolve(provider);
  adapter.validateCredential?.(credential);
  const result = store.set(reference, credential);
  process.stdout.write(`${JSON.stringify({providerId, ...(accountProfileId ? {accountProfileId} : {}), status: result.status, fingerprint: result.fingerprint})}\n`);
  return 0;
}

function usage() {
  process.stderr.write('Usage: agent-control providers credential set|status|revoke PROVIDER_ID [--account PROFILE_ID]\nThe set operation reads one credential from hidden stdin; never pass it as an argument.\n');
  return 2;
}

function accountSecureStoreReference(provider: ReturnType<typeof loadConfig>['providers'][number], accountProfileId: string) {
  const account = provider.accountProfiles?.find(item => item.id === accountProfileId);
  if (!account) throw new Error('account_profile_missing');
  const residency = accountCredentialResidency(account);
  if (residency.nodeId !== 'controller' || accountProviderExecutionNode(account) !== 'controller') throw new Error('account_profile_remote_resolution_forbidden');
  if (residency.store.type !== 'provider-secure-store') throw new Error('account_profile_secure_credential_store_not_configured');
  return residency.store.reference;
}

async function readCredential() {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of process.stdin) {
      const value = Buffer.from(chunk); size += value.length;
      if (size > 16_385) throw new Error('provider_credential_format_invalid');
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8').trim();
  }
  process.stdout.write('Provider credential: ');
  process.stdin.setRawMode(true); process.stdin.resume();
  try {
    return await new Promise<string>((resolve, reject) => {
      let value = '';
      const onData = (chunk: Buffer | string) => {
        for (const character of String(chunk)) {
          if (character === '\u0003') { cleanup(); reject(new Error('provider_credential_entry_cancelled')); return; }
          if (character === '\r' || character === '\n') { cleanup(); process.stdout.write('\n'); resolve(value); return; }
          if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
          else if (character >= ' ') {
            if (Buffer.byteLength(value + character, 'utf8') > 16_384) { cleanup(); reject(new Error('provider_credential_format_invalid')); return; }
            value += character;
          }
        }
      };
      const cleanup = () => process.stdin.off('data', onData);
      process.stdin.on('data', onData);
    });
  } finally { process.stdin.setRawMode(false); process.stdin.pause(); }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = await main();
