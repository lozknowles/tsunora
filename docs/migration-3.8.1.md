# Migrating from 3.8.0 to 3.8.1

3.8.1 is backward-compatible with 3.8 account-profile configuration. Existing `account.nodeId` is interpreted as both provider execution and credential residency, and existing `credentialStore` remains the credential-store reference.

For new configuration, replace:

```json
{"nodeId":"node-a","credentialStore":{"type":"codex-home-env","env":"CODEX_HOME_A"}}
```

with:

```json
{"providerExecutionNodeId":"node-a","credentialResidency":{"nodeId":"node-a","store":{"type":"codex-home-env","env":"CODEX_HOME_A"}}}
```

To review a repository on another node, leave the account on its credential/provider-execution node and set the Saved Job repository `node` to the workload node. Do not copy credentials. Ensure the workload Resource permits the repository root and the account/model are qualified on the provider-execution node.

After upgrade, run `npm run check`, inspect Models for distinct execution and credential nodes, and re-run account qualification. Windows accounts that are not logged in should now fail promptly with `codex_chatgpt_auth_required`, not a transport timeout.

Rollback is source/config compatible: the old fields remain accepted. A configuration using only the new explicit fields must be translated back to `nodeId` and `credentialStore` before running 3.8.0.
