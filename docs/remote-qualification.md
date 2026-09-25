# Remote qualification

`scripts/qualify-remote.sh` resolves the repository from its own location by default, so installations do not need a fixed absolute path:

```bash
ssh operator@worker.example '/srv/agent-control/scripts/qualify-remote.sh'
```

Use `AGENT_CONTROL_ROOT` only when the checkout is elsewhere. Secrets are never sent on the command line. Put local configuration in the ignored state directory and provide credentials through named environment variables or the remote service manager.

Remote PASS proves only the commands actually executed. It does not imply reboot survival, failover, provider availability or authority recovery unless each was independently demonstrated.
