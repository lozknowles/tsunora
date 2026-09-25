# Morrow and the Agent Control crew

Morrow is Agent Control's original chief steward and conversational host. He has short silver hair, a clean-shaven face, a midnight-teal utility jacket and a copper badge. His manner is warm, calmly authoritative and quietly witty. He remains Morrow when the underlying model, provider or execution runtime changes.

The six crew characters remain robots. They now share ceramic faces, teal armour, copper joints and expressive eyes, with their established identifying colours and accessories:

| Character | Existing role | Identifying colour | Accessories retained |
| --- | --- | --- | --- |
| Cadence | Controller & Lane Dispatcher | Blue | Three-lane crown and conductor baton |
| Quill | Work Parcel Reviewer | Purple | Document and marking quill |
| Relay | Tool & Execution Worker | Teal | Parcel harness and relay baton |
| Lumen | Model Router & Scout | Orange | Survey lens and signal dish |
| Rook | Resource & Node Guardian | Green | Shield and pressure gauge |
| Verity | Verification & Evidence Inspector | Gold | Inspection lens and check seal |

Morrow helps the operator understand and prepare work. Cadence retains dispatch; the established runtimes retain execution and verification. Character presentation does not create a separate autonomous agent or change authority.

## Compatibility

The public name, greeting, model persona, help text, transcript download name and artwork change. The following retain their existing values:

- `/api/poe` routes, `poe.*` events, schema identifiers and TypeScript runtime classes;
- `poe` actor IDs, channel provenance, conversation storage keys and per-tab session identity;
- saved conversation text, existing greetings, sealed proposal hashes and approval boundaries;
- configured model roles, environment variable names and the designed OmniVoice configuration, seed and voice hashes;
- all six crew IDs, roles, state projection, navigation, idle/sleep/wake behaviour and completion freshness checks.

Use `Morrow: status` or `Ask Morrow status` in the enrolled social channel. Existing `POE:` / `Ask POE` commands and their audited speech normalization remain accepted. Morrow voice interruption uses the existing playback boundary; it does not cancel a Work Parcel. No fuzzy matching of “tomorrow” is introduced.

Existing conversation greetings are preserved as history. A new conversation introduces Morrow once. No stored transcript is rewritten during the identity change.

The original designed male British voice remains configured. This change does not generate, clone, requalify or deploy a new voice. Physical recognition of the new name and live playback still require device verification.

## Artwork and preview

The actual host SVG is in `assets/dashboard/index.html`; the six robot SVGs are produced by `assets/dashboard/dashboard-bots.js`. Their animation hooks remain connected to existing state. Each robot instance has unique gradient IDs, and its paint uses SVG attributes compatible with the dashboard's strict Content Security Policy. No additional image or font service is required.

Morrow follows system reduced motion and the crew's Reduced/Off controls. Existing crew motion, visibility and off-screen controls remain intact.

Generate a standalone preview from the current source:

```bash
node scripts/preview-morrow-crew.mjs
```

Open the printed HTML file. Its states are explicitly simulated and it configures no providers, jobs, credentials or network requests. The included 390px frame is a visual aid, not evidence that the full dashboard passed a mobile browser test.

See the [implementation artwork](./evidence-archive.md), [standalone preview](provenance/EXTERNAL-EVIDENCE.md) and [validation and integration record](provenance/EXTERNAL-EVIDENCE.md).

## Integration with the completed 4.5 work

The identity was developed independently on `feature/morrow-host-identity`, based on main commit `2e74d88db57e3ad15ce1d85ec93220d087b9592f`, then combined with the 4.5 release-gate work. That integration is now present in final product candidate `31ccdf07f9aeb96cec0ea87a8cfb2bf1607ae86b`. The merge preserves the completed route qualification, memory and learning implementations and all recorded physical evidence.

See the [combined integration record](provenance/EXTERNAL-EVIDENCE.md), [final 4.5 closure audit](provenance/EXTERNAL-EVIDENCE.md) and [testing guide](DEPLOYMENT.md#morrow-integration-testing). Grounded Runtime Map narration and governed Work Parcel behavior are qualified in the final evidence. Historical physical voice evidence remains bound to its recorded candidate and is not relabelled. No stable tag, release or deployment is performed by this documentation update.

Rollback of the identity is a normal revert of the original identity commit, followed by regeneration of implementation status and review of documentation; there is no database migration.
