# Runtime Map and Process Explorer

The **Runtime Map** is a read-only projection of Agent Control's governed
execution records. It is not a scheduler, execution engine or audit ledger.
The executive graph and every drill-down resolve to the existing Work Parcel,
Run, execution-session, token-routing, retrieval and evidence records.

In 4.5 the same graph renderer also provides **Estate Map**. Process Map answers
what Agent Control is doing; Estate Map answers what it can currently see and
use. Estate nodes come from governed Environment Discovery and resource-health
evidence, never from decorative fixtures. See [Environment Discovery](environment-discovery.md).

## Architecture and source-of-truth analysis

```text
Work Parcel store + Run ledger + Execution Session runtime
Token governor + retrieval evidence + baton/audit timeline
                              |
                              v
              provider-neutral RuntimeMapProjection
                              |
                    authenticated HTTP + SSE
                              |
      Runtime Map / Control Room / inspector / Replay timeline
```

```text
Environment Discovery + managed-node/resource health
                              |
                              v
                 same RuntimeMapProjection schema
                              |
           Estate Map / resource + connection inspector
```

The existing runtime already supplied authoritative parcel stages, dependency
edges, Runs, worker placement, verified artifacts, baton events, provider/model
invocations, cache evidence, Your Memories retrieval, retry state and owned
process sessions. The implementation reuses those records. The small schema
delta is `agent-control.runtime-map/v1`, a sanitized view containing typed
nodes, edges, timestamped state events, evidence references, summary counts and
Control Room tiles. It adds no durable execution state.

Gaps found during inspection:

- execution-session output was already emitted but the main dashboard did not
  subscribe to its two SSE event names; the subscriptions now trigger the same
  throttled projection refresh;
- generic Work Parcel invocation audits retained provider-reported usage but
  did not mark its authority; the audit now records `authoritative`, `estimated`
  or `unavailable` from the existing observation;
- no prior cross-ledger graph/replay projection existed;
- the authenticated Compare API and dashboard now project both completed runs
  independently, synchronize their graphical viewports and report explicit
  route, model, provider, machine, worker, decision, cache, memory, baton,
  retry, failure, duration, token and cost facets. It never aligns work by
  display label.

## Operator guide

Open **Runtime Map** in the dashboard and choose a Work Parcel. The default map
shows the request, planner, parcel, dynamically created branches, aggregation,
verification and result. Large maps automatically collapse job and lane groups;
use the `+`/`-` marker to progressively reveal a branch. Use the mouse or touch
surface to pan and the wheel to zoom; **Fit** restores the full topology.
The KPI row separates concurrently running root Jobs from total governed stages,
completed work, attention state, aggregation state and the latest authoritative
transition. Aggregation remains waiting until its real dependencies complete.

Choose **Process Map** or **Estate Map** at the top of the same workspace. Estate
Map adds search, type filtering, hierarchical machine/transport/runtime/model
expansion and a freshness-based heartbeat. Dense same-kind resources are shown
first as explicitly derived category groups (for example, **Tools · 21**) linked
to the same discovery scan. Expand a group to inspect every real resource; the
wrapped layout remains readable without dropping inventory. A known but stale
resource remains visible in grey as not currently verified. Selecting an edge
opens the governed connection evidence; authentication is always a fixed-length
mask and no secret is sent to the browser.

State is conveyed by text and symbol as well as colour:

- grey circle: waiting or skipped;
- blue diamond: queued or ready;
- orange play indicator: running;
- green tick: successfully completed;
- red exclamation: failed or blocked;
- yellow retry: degraded, retrying or escalated;
- purple arrow: sealed baton or governed handover.

Reduced-motion preferences disable animated running edges.

Select a node to inspect its safe metadata and content-addressed evidence. A
terminal node links to the existing authenticated **Live Shell** viewer; Runtime
Map does not add arbitrary shell input or terminal takeover. Provider/model,
tool, route, cache, memory, validation and baton nodes expose only metadata
already admitted to the corresponding authoritative record. Credentials,
protected reasoning and unredacted terminal bytes are excluded at the projection
boundary.

**Control Room** presents one adaptive tile per actual Job, including worker,
model, activity, elapsed state and latest safe session output where available.
Selecting a tile returns to the corresponding graph branch.

**Compare** accepts two completed Work Parcels. Each side remains its own
authoritative graph; scroll position is synchronized for inspection convenience,
while differences are computed only from explicit route/resource fields and
evidence identities. If one run lacks token or cost authority, the delta remains
unavailable rather than treating the missing value as zero.

**Replay** evaluates the same projection at a selected authoritative timestamp.
Nodes that had not started are restored to waiting, active nodes to running and
completed nodes to their terminal state. Recorded terminal output is bounded to
the replay time. Replay never resumes or mutates work.

Morrow/POE can resolve a Runtime Map reference and describe counts and the
latest transition from the same projection. It cannot invent a transition or
explain protected model reasoning.

When a Process Map worker, model, provider or node has an exact configured
resource identity, **View Estate resource** focuses that object in Estate Map.
**View current work** performs the inverse lookup. Similar names are never enough
to establish identity; missing exact identity produces no link.

## Failure, scalability and overhead

Dashboard refreshes are batched to at most four per second. A stale or failed
projection request changes the health banner to disconnected; execution remains
independent and a later SSE event reconciles the view. The 50+ job deterministic
test projects nested topology in about 30–42 ms on the qualification controller.
The physical 54-node graph projected 1,000 times in 4,769 ms (4.77 ms average),
with a 4.25 MB transient heap delta. Its complete isolated runtime evidence was
331,812 bytes across 16 files. These are controller-specific observations, not
universal performance guarantees.

## Security and governance

All Runtime Map endpoints require the existing operator bearer token. Redaction
is applied before data enters the projection/API response. WATCH is the default
and only new authority. Pause, cancel, retry, approval, redirection and takeover
remain separate existing governed actions and are not granted by this view.

Run the focused qualification with a qualified local OpenAI-compatible model:

```bash
npm run qualify:runtime-map
```

See the [six-job visual acceptance report](evidence/agent-control-4.5-runtime-map-visual-acceptance-20260912.md),
the earlier [physical qualification](provenance/EXTERNAL-EVIDENCE.md),
and [Live Shell guide](live-shell.md).
