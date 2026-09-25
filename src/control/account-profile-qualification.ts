import type {ModelQualificationState} from './config.js';
import type {CodexChatGptAuth} from './codex-exec-provider.js';
import {LocalCodexNodeExecutionPort, type CodexNodeExecutionPort} from './codex-node-execution.js';
import type {AccountProfileQualificationRecord, ModelRegistry} from './model-registry.js';
import {resolveCodexAccountProfile} from './provider-account-profile.js';
import {accountCredentialResidency, accountProviderExecutionNode} from './provider-account-profile.js';

export interface AccountProfileQualificationEvidence {
  schema: 'agent-control.account-profile-qualification/v1';
  providerId: string;
  accountProfileId: string;
  providerExecutionNodeId: string;
  credentialNodeId: string;
  nodeId: string;
  state: ModelQualificationState;
  startedAt: string;
  completedAt: string;
  checks: Array<{id: 'codex-chatgpt-auth'; passed: boolean}>;
  detail?: string;
}

export async function qualifyAccountProfile(input: {registry: ModelRegistry; providerId: string; accountProfileId: string; command?: string; cwd?: string; timeoutMs?: number; environment?: NodeJS.ProcessEnv; probe?: (command: string, cwd: string, timeoutMs: number, environment: NodeJS.ProcessEnv) => Promise<CodexChatGptAuth>; nodeExecution?: CodexNodeExecutionPort; version?: string}) {
  const provider = input.registry.provider(input.providerId); if (!provider) throw new Error('provider_missing');
  const account = input.registry.accountProfile(input.providerId, input.accountProfileId); if (!account) throw new Error('account_profile_missing');
  const providerExecutionNodeId = accountProviderExecutionNode(account), credentialNodeId = accountCredentialResidency(account).nodeId, nodeId = providerExecutionNodeId, startedAt = new Date().toISOString(), version = input.version ?? `account-qualification-${startedAt.slice(0, 10)}`;
  input.registry.setAccountQualification({providerId: input.providerId, accountProfileId: input.accountProfileId, nodeId, providerExecutionNodeId, credentialNodeId, state: 'QUALIFYING', version, checkedAt: startedAt, capabilities: [], evidence: []});
  try {
    let codexVersion = 'probe-qualified', executableSha256 = 'unavailable', discoveredAt = new Date().toISOString();
    if (input.probe) {
      const resolved = resolveCodexAccountProfile(provider, input.accountProfileId, input.environment);
      await input.probe(input.command ?? process.env.CODEX_COMMAND ?? 'codex', input.cwd ?? process.cwd(), input.timeoutMs ?? 30_000, resolved.environment);
    } else {
      const status = await (input.nodeExecution ?? new LocalCodexNodeExecutionPort(input.environment, input.command)).accountStatus({provider, account, nodeId, timeoutMs: input.timeoutMs ?? 30_000});
      if (status.providerId !== provider.id || status.accountProfileId !== account.id || status.nodeId !== nodeId) throw new Error('codex_node_execution_identity_mismatch');
      codexVersion = status.codexVersion; executableSha256 = status.executableSha256; discoveredAt = status.discoveredAt;
    }
    const completedAt = new Date().toISOString(), discovery = executableSha256 === 'unavailable' ? [] : [`codex-cli:${codexVersion}`, `codex-executable-sha256:${executableSha256}`, `codex-discovered-at:${discoveredAt}`];
    const record: AccountProfileQualificationRecord = {providerId: provider.id, accountProfileId: account.id, nodeId, providerExecutionNodeId, credentialNodeId, state: 'QUALIFIED', version, checkedAt: completedAt, qualifiedAt: completedAt, capabilities: [...new Set([...(account.capabilities ?? []), 'codex-chatgpt-authenticated'])], evidence: ['codex-login-status:chatgpt', ...discovery]};
    input.registry.setAccountQualification(record);
    return {record, evidence: {schema: 'agent-control.account-profile-qualification/v1', providerId: provider.id, accountProfileId: account.id, nodeId, providerExecutionNodeId, credentialNodeId, state: 'QUALIFIED', startedAt, completedAt, checks: [{id: 'codex-chatgpt-auth', passed: true}]} satisfies AccountProfileQualificationEvidence};
  } catch (error) {
    const completedAt = new Date().toISOString(), detail = safe(error);
    const record: AccountProfileQualificationRecord = {providerId: provider.id, accountProfileId: account.id, nodeId, providerExecutionNodeId, credentialNodeId, state: 'FAILED', version, checkedAt: completedAt, capabilities: [], evidence: [], detail};
    input.registry.setAccountQualification(record);
    return {record, evidence: {schema: 'agent-control.account-profile-qualification/v1', providerId: provider.id, accountProfileId: account.id, nodeId, providerExecutionNodeId, credentialNodeId, state: 'FAILED', startedAt, completedAt, checks: [{id: 'codex-chatgpt-auth', passed: false}], detail} satisfies AccountProfileQualificationEvidence};
  }
}

function safe(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /^(?:account_profile_[a-z_]+|codex_[a-z_]+)$/.test(message) ? message : 'account_profile_qualification_failed';
}
