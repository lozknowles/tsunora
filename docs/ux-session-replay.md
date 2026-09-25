# UX Session Capture, Replay and Sharing

Status: released in Agent Control 4.4.0. Deployment remains a separate operator action.

## Purpose

A UX Session turns one completed governed execution into an understandable,
reviewable experience without making an MP4 or a giant transcript the source
of truth. The canonical record points back to the existing authoritative Run,
Work Parcel, POE/Crew, provider, token, baton, gate, ContextGraph and evidence
records. Its SHA-256 protects event order and content.

The same session can be rendered as an interactive replay, conventional MP4,
complete Markdown transcript, human-readable digest and evidence manifest.
Every representation records the same session ID and hash.

## Reviewer experience

The default view explains the UX outcome. Selecting an event progressively
reveals its Agent Control action, lane, provider/model, gate/baton relationship,
sanitised tool input/output, telemetry and evidence references. Parallel lanes
remain visible together, so a reviewer can understand fan-out, independent
failure/success and aggregation without reading the complete transcript.

Telemetry is shown only when reported. Current context, cache reuse, monetary
cost or content from Your Memories remain `unavailable` when no authority supplied them.
Lifetime tokens are never presented as current-context occupancy.

Normal replay uses **Your Memories** as the Agent Control capability name:

`Your Memories → relevant memories found → governance/provenance checked → accepted or rejected → used in this session`

It may explain relevance, rejection reason, human-readable provenance and
measured context/token reduction. Backend names and implementation terminology
appear only in architecture, evidence and authorised technical diagnostics.

## Audience levels

| Audience | Intended content |
| --- | --- |
| `UX_ONLY` | Visible outcome and high-level POE/UI events |
| `UX_INTERACTIONS` | UX plus bounded user interaction and Job/Parcel milestones |
| `EXECUTION_OVERVIEW` | Lanes, routes, gates, models and aggregate telemetry |
| `SANITISED_DIAGNOSTIC` | Declared bounded tool/provider diagnostic fields after redaction |
| `AUTHORISED_FULL_EVIDENCE` | Operator-authenticated richest permitted projection; still no credentials or private reasoning |

Projection uses an allow-list for every level. Redaction is applied again at
the web boundary. A lower audience never receives a richer object hidden only
by CSS or client JavaScript.

## Read-only links

An authenticated operator creates a share for one immutable session and one
audience. Agent Control returns a URL whose capability is in the fragment. The
server stores only its SHA-256. Shares can expire or be revoked. The player can
read only its bounded projection and annotations; it cannot run work, operate
the dashboard, access a shell/repository, retrieve credentials or modify the
session.

Reviewer comments are separate records tied to an event and session hash. An
authorised workflow may later reference a comment from an issue or Work Parcel;
this never edits historical evidence.

## Qualification

Run focused validation with:

```bash
node --import tsx --test src/control/ux-session.test.ts src/control/ux-session-web.test.ts
npm run qualify:ux-session-replay
```

The physical qualification replays the real immutable 4.3 three-provider run
and the real 4.4 governed memory experiment. It does not re-label generated
fixtures as provider work. See the [qualification report](evidence/agent-control-4.4-ux-session-replay-20260911.md).
