# Dashboard operational Crew

The **Crew** is a human-readable, read-only projection of Agent Control's canonical state. It does not create agents, schedule work, invoke models, advance a Work Parcel, or decide that work succeeded. The execution system behaves identically when the dashboard is closed, JavaScript fails, assets fail to load, or motion is disabled.

The governing rule is:

> **Animation state is not operational state.**

An operationally `IDLE` character may look around or sleep. Those movements are browser presentation and cannot become telemetry.

## Crew roster

| Name | Agent Control role | Stable visual identity | Idle personality | Working personality | Engineering view |
| --- | --- | --- | --- | --- | --- |
| Cadence | Controller & Lane Dispatcher | blue; conductor baton and three-lane crown | quietly counts lanes and checks the room | conducts concurrent lanes and exposes scheduling | Lanes |
| Quill | Work Parcel Reviewer | purple; document visor and marking quill | reads and annotates a page | checks objective, constraints, plan and operator questions | task entry |
| Relay | Tool & Execution Worker | teal; parcel harness and relay baton | keeps the harness ready | carries bounded work through tools, workers and dependencies | Work Parcels |
| Lumen | Model Router & Scout | orange; survey lens and signal dish | watches qualified routes | projects recorded discovery, evaluation and routing | Models |
| Rook | Resource & Node Guardian | green; shield frame and pressure gauge | checks gauges and nearby workers | watches nodes, capacity, remote execution and credential locality | Systems |
| Verity | Verification & Evidence Inspector | gold; inspection lens and check seal | reviews the latest evidence seal | independently checks results and exact failures | Runs/evidence |

Colour is identity, not status. Every card also carries a name, role, state text, icon, activity text, reason, source, progress and accessible name.

Quill's instrumentation remains deliberately partial: Agent Control has no separate prompt-review worker. Quill reports only durable planning, readiness and question state and says when deeper review evidence is unavailable.

## Three independent state layers

The `agent-control.dashboard-character-crew/v2` projection keeps three concepts separate:

| Layer | Purpose | Examples | Authority |
| --- | --- | --- | --- |
| Operational state | what Agent Control records as true | `IDLE`, `PLANNING`, `ROUTING`, `EXECUTING`, `WAITING`, `VERIFYING`, `PAUSED`, `SUCCEEDED`, `FAILED`, `CANCELLED`, `RECOVERING`, `UNKNOWN` | canonical control records |
| Activity | what current source-backed work is doing | `CODING`, `SEARCHING`, `READING`, `REMOTE_EXECUTION`, `BENCHMARKING`, `MODEL_DISCOVERY`, `REVIEWING_OUTPUT`, `PASSING_BATON` | current Run/stage/event evidence |
| Animation expression | how that fact is illustrated | `LOOKING_AROUND`, `SLEEPING`, `WAKING`, `TYPING`, `THINKING`, `CARRYING_PARCEL`, `INSPECTING`, `CONCERNED` | `presentation-only` |

The older lower-case card state remains a compatibility-oriented visual vocabulary. The explicit operational state and activity are the facts. An animation cue is always marked `authority: presentation-only` and is never fed back into the controller.

Active event-derived activity expires after 30 seconds unless a canonical Run or stage still records active work. An otherwise-live observation older than 120 seconds becomes visually `stale`, never `failed`. Missing information is `UNKNOWN` or unavailable. A cancellation remains pending until canonical cleanup confirms its terminal state.

## Projection and event flow

```text
lanes / scheduler / Runs / steps / Work Parcels / batons
workers / tools / systems / models / provider and routing events
                              |
                 AgentControlService.snapshot()
                              |
              projectDashboardCharacterCrew()
                              |
       GET /api/status + typed SSE refresh/reconciliation
                              |
     Level 1 Crew + Level 2 explanation + Level 3 evidence
```

The projector is deterministic and read-only. The browser does not parse terminal text or model prose to infer work. SSE events request a fresh authoritative snapshot; the normal five-second refresh is a recovery fallback.

The six primary cards use source precedence appropriate to their roles. One pose cannot encode every concurrent fact, so active, queued, waiting, blocked, completed and failed counts remain visible as independent badges. A currently running stage wins over a future waiting stage when selecting Relay's tool activity.

## Work Parcel flow and concurrency

Each real Work Parcel is rendered as a compact object with its immutable objective, status, current owner and reason, stage dependency graph, progress, Run/worker, route and classified tool. The role stations explain responsibility, but do not pretend a concurrent DAG is linear.

Every canonical `RUNNING` stage gets its own visible mini worker. Two or three genuinely parallel stages therefore show two or three workers simultaneously. A queued, waiting or completed stage never becomes a running worker merely to make the scene look busy. The durable Parcel journey remains available beneath the visual summary.

## Baton and route transfers

A moving baton can originate only from one of these authoritative sources:

- a token governor `BATON_AND_HANDOFF` routing decision;
- a durable Work Parcel baton view or `baton.created` audit event;
- a typed `lane.handoff` event.

The projection retains source event ID, baton ID where available, recorded time, source route, destination route, outcome, context percentage where reported and the exact recorded reason. Clicking the baton opens that reason in Level 2 and links to Work Parcel evidence in Level 3. Merely crossing a threshold, displaying a recommendation or completing an old handoff does not create an active transfer animation.

For ordinary Job stages without a provider/model route, the Crew names the actual selected worker. It does not substitute an invented model route.

## Tool activity

Tool classification is provider-neutral and derives from the current action, resources and declared capabilities:

| Tool kind | Visual shorthand | Typical evidence |
| --- | --- | --- |
| `SEARCH` | magnifying glass | repository/search action |
| `CODE_EDIT` | keyboard/terminal | code or patch action |
| `FILE` | document | file read/write action |
| `WEB_BROWSER` | browser window | browser capability |
| `REMOTE_MACHINE` | linked nodes | remote/SSH/managed-node action |
| `BENCHMARK` | stopwatch/gauge | test, benchmark or verification action |
| `VOICE` | waveform | voice capability |
| `SOCIAL` | message indicator | approved social/messaging action |
| `MODEL_DISCOVERY` | candidate cards/lens | model discovery or evaluation |
| `GENERIC_TOOL` | restrained tool badge | a real but otherwise unclassified action |

Unknown tools remain generic; they are not guessed from output prose.

## Provider and model discovery

Typed `provider.catalog_changed` and existing `model.intelligence_changed` events support provider connection, catalogue discovery, candidate evaluation and routing state. Cards preserve provider/model identity, status, failure class, HTTP status and explicit routing eligibility when those fields exist. `LIMITED`, call failure and `routing-disabled` remain distinct. Endpoint reachability or a completed evaluation batch does not silently qualify a model for routing.

This applies to NVIDIA and every other provider through the same projection contract. A provider adapter or qualification workflow must emit the factual lifecycle event; the Crew does not poll providers or manufacture candidate status itself.

## Event-backed Activity Matrix

The Crew view includes an original retro Activity Matrix inspired by banks of status lights, not a reproduction of a film prop. Its `agent-control.dashboard-activity-panel/v1` data is produced by the same deterministic projector as the Crew. High-frequency events are coalesced into one current state and count per indicator; no timer generates fake work.

| Indicator | Canonical source | Meaning and persistence | Stale/disconnected behavior |
| --- | --- | --- | --- |
| Controller | non-terminal Runs and Work Parcels | active while controller-owned work is non-terminal; recent for 30 seconds | unchanged active work older than 120 seconds is `STALE` |
| Queue | queued/scheduled Run status | active until dispatch or terminal transition | an old unchanged queue claim is `STALE`, not repulsed |
| Execution lanes | `WORKING` lanes and active Job Runs | coalesced real workspace/Job execution count | old last-meaningful activity is `STALE` |
| Tool execution | active Job step action/status | active only while a canonical step executes | unchanged active step after 120 seconds is `STALE` |
| Model request | active token-routing thread | open provider invocation; never inferred token streaming | no fresh thread telemetry after 120 seconds is `STALE` |
| Model response | completed token-routing thread | a 30-second recent-completion pulse | expires to `IDLE`; ledger history remains durable |
| Baton / escalation | token, Parcel or lane baton/handoff record | active only for a recorded transfer; recent for 30 seconds after outcome | incomplete transfer older than 120 seconds is `STALE` |
| Verification | canonical verification/terminal Run state | active during verification; recent outcome for 30 seconds | an unchanged active verifier becomes `STALE` |
| Node health | configured-system readiness/workload | faults persist until replaced by successful readiness evidence | missing is `UNKNOWN`; unreachable/auth-required is `DISCONNECTED`, never healthy |

Every indicator is a native button with visible focus and shape-plus-text state. Mouse, Enter or Space opens the associated source, event ID/time, lane, provider/model, explanation, persistence and stale rule. `ACTIVE`, `RECENT`, `IDLE`, `STALE`, `FAILED`, `DISCONNECTED` and `UNKNOWN` are explicit labels, not colours alone. Full motion uses slow coalesced pulses; reduced motion removes those pulses, Off removes all animation, and hidden/background views pause unnecessary work.

The panel has one slow decorative connection heartbeat. Its authority is `presentation-only`, its label says `NOT WORK ACTIVITY`, and it carries no controller, provider, token or hardware meaning.

## Persistent usage while navigating

The **Live usage** strip remains mounted above Jobs, Lanes, Sessions, Systems, Models, Crew and Configuration. Choose a thread or lane to inspect provider/safe account/model, execution node, operational state, elapsed time, governor reason and thresholds, context value/limit/percentage plus authority, cumulative input/fresh/cache-read/cache-write/output/total tokens, cost plus authority and the complete Work Parcel model chain.

The selected ID is browser-local presentation state. Data always comes from the latest `GET /api/status` snapshot and typed SSE refresh; a replacement snapshot is rendered rather than accumulated, so navigation, reload and reconnect cannot double-count. A handoff adds a model leg without resetting parcel totals. Missing context or cost is shown as `Unavailable`; cumulative usage never masquerades as current-context occupancy.

## Deterministic narration and progressive disclosure

Narration is assembled from fixed templates and the same source IDs used by the cards. No model is called to explain another model or worker.

- **Level 1 — Crew:** names, roles, operational state, current activity, concise headline and parallel-work summary.
- **Level 2 — Human explanation:** source-backed narrative, route/lane, elapsed time, counts, exact baton reason and presentation-only expression.
- **Level 3 — Engineering evidence:** existing Jobs, Work Parcels, Models, Systems, Runs, transcripts, token/cache telemetry, routing history and evidence.

Pointer, tap, Enter and Space interactions reach the same underlying views. The Crew augments rather than replaces engineering telemetry.

## Motion, idle and terminal behavior

Open **Crew** and choose Full, Reduced or Off motion; choose Shown or Hidden independently. Preferences are browser-local (`agent-control-character-motion` and `agent-control-character-display`) and never enter Agent Control state.

In Full mode, a newly idle character looks around for 45 seconds. Sustained idle then sleeps with a gentle breathing cycle. Character-specific delays keep the roster from moving in lockstep. When an authoritative transition records work, a previously sleeping character gets one short waking expression before its role activity. That expression cannot change the operational state.

Failures use still/concerned/retrying treatments with the real reason available; there is no flashing alarm. Success gets a brief transition-only acknowledgement. Initial load, stale reconstruction and SSE reconnect cannot replay old success.

Reduced mode retains static state, parcel and baton changes and allows only an infrequent blink. Off mode removes animation. Off-screen characters, hidden views and background tabs pause movement. Continuous animation uses opacity and transforms rather than layout-changing properties.

## Accessibility, mobile and isolation

- Native buttons, visible focus rings and descriptive accessible names support keyboard and screen-reader use.
- State text, icons and reasons mean no fact depends on colour or animation.
- `prefers-reduced-motion` caps Full at Reduced.
- At narrow widths, the six cards become a horizontally scrollable, snap-aligned active-worker strip; Work Parcel, baton and model columns stack vertically.
- Character JavaScript imports no execution module and has no mutation endpoint. The clearly marked simulated gallery is isolated browser state and is excluded from runtime qualification evidence.

Disable the dashboard with `AGENT_CONTROL_WEB_ENABLED=0`. To remove only the Crew presentation, choose Hidden and Off. Neither action needs state migration or affects execution.

## Qualification

Run focused tests and the real isolated dashboard recording with:

```bash
node --test scripts/dashboard-bots.test.mjs scripts/dashboard-wopr.test.mjs
node --import tsx --test src/control/dashboard-characters.test.ts src/control/web-server.test.ts
npm run record:crew-workflow
npm run record:crew-wopr-escalation
npm run check
```

The recorder submits a real authenticated Work Parcel, executes concurrent repository search and file-read stages through separate workers, consumes their sealed batons in a composition stage, independently verifies the result, queries a live local provider catalogue and runs a frozen local-model evaluation. Its video never enables the simulated gallery. Results, hashes, performance measurements and evidence boundaries are in [Crew workflow qualification evidence](provenance/EXTERNAL-EVIDENCE.md).

The escalation recorder is a separate, continuous 1× physical trial. It submits the exact visible prompt against a frozen reservation-service fixture, shows two concurrent control Jobs, lets local Qwen complete normally, applies an independent acceptance gate, seals the unresolved criteria into a token baton, automatically changes the explicit route to Codex/Controller Account A/Luna, and independently verifies the destination result and additive usage. The first model is not instructed or constrained to fail, and the trigger is `QUALITY_GATE`, not fabricated context pressure. See the [plain-English model-change transcript](provenance/EXTERNAL-EVIDENCE.md) and [qualification report](provenance/EXTERNAL-EVIDENCE.md).

The subsequent routing-admission release candidate uses two new recordings rather than the obsolete tournament demo. A 632.76-second `LIVE` recording follows an ordinary frozen repository-review Saved Job through Jobs, Lanes, Models, Crew and its product-generated transcript. A separate 86.92-second recording is visibly labelled `CONTROLLED FAULT INJECTION` and projects two injected 503 responses, retry exhaustion, a provider-failure governor decision, the sealed route change to Codex, destination continuation and verification. Both are 1920×1080 H.264 at 25 fps with 105% presentation zoom; the browser recorded no console or HTTP errors.

Post-restart API reconciliation checks the visible Job, parameterised lane card source, registered/executed models, every Crew journey event ID, token-routing baton IDs, transcript hashes and terminal state against the durable stores. A separate three-second frame-MD5 measurement over each isolated character sprite recorded motion on all 74 consecutive frame boundaries for Cadence, Quill, Relay, Lumen, Rook and Verity. That proves rendered animation only; the report continues to treat every animation cue as `presentation-only`. The natural task itself missed one frozen objective criterion, so this evidence remains `PARTIAL` rather than a release pass. See [routing-admission release qualification](provenance/EXTERNAL-EVIDENCE.md).
