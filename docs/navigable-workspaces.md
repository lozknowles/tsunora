# Navigable Workspaces

## 4.12.1 dashboard navigation

The authenticated dashboard can search the authoritative workspace projection across projects, repositories, devices, nested environments, runtimes, workers, runs, invocations and retained artifacts. Results use a bounded cursor and are rebuilt from current Agent Control records; there is no separately maintained workspace index or topology.

Operators can save up to 64 favourites. The durable preference file stores only the operator identity, opaque workspace ID and creation time. Labels and state are resolved from the current projection whenever the workspace panel opens, so a favourite cannot become an alternative source of truth.

Where an exact execution-session relationship is recorded, a workspace exposes **WATCH**. This calls the existing Live Shell attachment in read-only mode. Any intervention still requires the existing explicit Live Shell authorization and confirmation.

Project workspaces derive only from durable Dynamic Work Board project declarations. Repository workspaces derive only from resolved parameterized-job repository records and their reviewed commit SHA. Runs link to both as related authoritative context rather than pretending either is an execution-container parent. Retained Agent Control-managed artifacts can be opened with the existing authenticated, redacted artifact viewer. Workspace navigation does not expose repository source paths, snapshots or an arbitrary host filesystem browser.

The Dynamic Work Board also renders an authenticated containment and recovery timeline derived from durable containment records. It includes the stop request, completion state, recovery transitions, actor, scope, timestamps and evidence references without reconstructing missing events.

Navigable Workspaces are read-only views over Agent Control's authoritative Estate, Node Dashboard and Run Inspector records. They let an operator move down from the Estate to a device, nested environment, runtime, worker, run and invocation, or reconstruct that path upward from retained run evidence.

They are not checkouts, folders, terminals or execution authorities. Opening a workspace never grants file, shell, job, deployment, credential or protected-resource access. Where one of those capabilities is relevant, the projection reports `REQUIRES_AUTHORIZATION` and the existing Agent Control control remains responsible for it.

## Identity and modes

The versioned schema is `agent-control.navigable-workspace/v1`. An opaque `acw1` identifier contains only the object kind and existing authoritative object identifiers. Transport, hostnames, credentials and filesystem paths do not form workspace identity.

Each projection distinguishes:

- `LIVE`: current authoritative context;
- `HISTORICAL`: reconstructed from retained execution evidence;
- `STALE`: the source projection is no longer fresh;
- `UNAVAILABLE`: the referenced context cannot currently be used.

Missing telemetry is `null` or unavailable. It is never converted to zero.

## API

Both endpoints require the existing operator authentication:

- `GET /api/workspaces` opens the Estate workspace.
- `GET /api/workspaces/:workspaceId` opens one workspace.

There are no workspace mutation routes. The response includes breadcrumbs, a parent, progressively disclosed children, status, capabilities, context, evidence references and links back to the authoritative dashboard/history.

## Dashboard and CLI

The dashboard offers **Workspaces**, `Alt/Command+W`, and **Open Workspace** from Node Dashboard and Run Inspector. Breadcrumbs preserve context while the child list reveals only the next useful level. **Open authoritative dashboard view** and **Open human-readable evidence** return to the existing evidence surfaces.

CLI examples:

```text
agent-control workspace list
agent-control workspace open WORKSPACE-ID
agent-control open job RUN-ID
```

Workspace reads use `AGENT_CONTROL_WEB_URL` and require `AGENT_CONTROL_WEB_OPERATOR_TOKEN`. Cleartext HTTP remains limited to loopback; remote URLs must use HTTPS.

## Mallow

**Ask Mallow** passes the workspace reference to the existing grounded evidence resolver. Mallow explains recorded status, mode, children and read-only capabilities. It does not invent topology and cannot gain control merely by referring to a workspace.

## Current boundaries

- Workspaces project current authoritative records on demand; they do not persist another Estate graph.
- Recent navigation is session-local UI convenience, not an authoritative record.
- Terminals remain governed by existing execution-session controls.
- Managed artifacts use the authenticated redacted evidence viewer. Repository source browsing remains deliberately unavailable until a separately governed source-view capability exists.
- Projects and repositories appear only when durable Work Board or resolved-repository evidence supplies the relationship; ordinary devices gain no empty panels.
- This implementation has no dependency on Rune or any Rune source code.

## Release evidence and upgrade

See [fresh release verification](release-verification-4.8.0.md), [visual evidence](provenance/EXTERNAL-EVIDENCE.md), [upgrade guidance](upgrade-4.8.md) and the [five deferred enhancements](../TODO.md). Existing configuration and retained histories remain authoritative; workspaces project them where sufficient evidence exists. No workspace database migration is required.
