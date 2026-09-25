# Precision Topology observer views

Concept B replaces the Estate and Factory presentation with a light, two-dimensional map, selected-record inspector, evidence drawers and a deterministic Mallow briefing. The established Mallow SVG is reused. Device and runtime icons are code-drawn generic symbols; no new external image or font dependency is introduced.

## Discovery is the source

There is no fixed host list or host count in the renderer. Estate cards are derived from the current projection. Accepted current observations appear by default. Expected, connecting, failed, unauthorised and stale records remain in Inventory and can be included with **Show unavailable / retained hosts**. Failed contact does not establish removal. Pixel-style SSH-installation identity can establish a successful response without establishing physical hardware identity; expired projection metadata also applies to these limited records.

Power loss becomes visible when a subsequent authorised discovery records failed contact, or when the existing five-minute snapshot freshness boundary expires. The UI does not perform background network scans, infer instant power state or add permissions. Changing to a new discovery scope follows the existing native evidence rules.

Up to six current hosts use an overview layout; larger results use a scrollable grid with deterministic ordering. Twenty host controls are directly accessible, including by keyboard. Rendering remains bounded (80 normal / 20 low-detail map objects), with explicit overflow notice and Inventory access. Existing streamed-projection and search limits remain in force. The twenty-host qualification is a labelled UI fixture, not physical twenty-host certification.

Only evidenced controller-to-host discovery relationships are displayed. Lines do not represent network traffic. Factory groups workers and models, native Jobs, and evidence in separate columns. No animation fabricates runtime activity.

## Privacy and authority

`GET /api/estate/labels` is authenticated operator presentation only. It provides existing display names bound to resource aliases, without endpoints, SSH arguments or credentials. `?privacy=public` returns no names. Canonical projections and exported replay retain their existing aliases. Public presentation and video capture use aliases. Recording waits for a confirmed alias-rendered frame before capture, including in low-detail mode; concurrent recording owners retain privacy until the last owner stops.

Native execution ownership, host identity pins, grants, probe implementation, provenance and stable IDs are unchanged. This work does not deploy, enable production authority or expand discovery/log scope.

## Accessibility and state

Every map object has a native focusable button with an accessible name and pressed selection state. Inventory provides a non-canvas route to records. Drawers use native modal dialogs with Escape and focus return. Colour is accompanied by text, warnings, exact canonical states and evidence. Motion is static and respects reduced-motion preferences. Narrow layouts stack panels; large datasets scroll inside the map rather than shrinking host labels.

The observer workspace uses a deliberate light palette from the shared theme file; other workspaces retain their system theme. Controller health, UI transport, discovery completeness, reachability, identity, Job outcome and voice availability remain separate. Mallow's text is explicitly a deterministic summary; opening supported text chat uses the established interface. Voice-unavailable wording does not imply estate failure.

## Validation

`scripts/precision-model.test.mjs` exercises arbitrary host identities, five-to-two state changes, twenty results, expired limited-identity observations, relationship provenance and replay outcomes. `src/control/estate-presentation.test.ts` exercises label authentication, public response and transport exclusion. Existing native discovery/remote tests remain unchanged.

Browser qualification uses the same retained native five-host capture for the original and redesigned views. Startup is measured on three fresh pages; selection uses forty interactions followed by two animation frames. Paint metrics measure map-producing animation callback CPU time, not GPU presentation latency. Retained heap growth is measured after twenty replay refreshes and forced garbage collection. Recording overhead uses the existing evidence recorder. The accepted bounds are startup <=2 s, selection p95 <=100 ms, paint p95 <=33 ms (67 ms recording), retained heap growth <=10 MiB.

Browser tests label simulated failed contacts and twenty-host data as fixtures. Physical qualification and a continuous video use a separate native Job and the existing approved resource bindings. A 200%-zoom-equivalent CSS viewport verifies reflow; this is not a screen-reader or native browser zoom certification. Full current-suite results, actual performance samples, screenshots and video checksum belong to the accompanying qualification report.
