# Warm Cache Runtime design QA

Date: 2026-09-09

Viewport: 1920 × 1080 desktop; 390 × 844 mobile

Reference: operator-supplied Warm Cache Runtime screenshot

Implementation: `assets/dashboard/index.html`, `dashboard-cache-runtime.css`, `dashboard-cache-experts.js`

## Visual comparison

- Preserved the existing Agent Control dark navy design system, typography, panel treatment and status semantics.
- Matched the reference hierarchy: top-level runtime heading, four evidence metrics, dominant lane timeline, right-side ranked experts and recent events, and detailed panels below.
- Used green for observed warm reuse, amber for cold/no reuse, blue for model invocation, red for invalidated state, gray for wait/unknown and cyan dashed boundaries for baton handoff.
- Kept POE as a compact operational guide rather than decorative content that competes with runtime data.
- Replaced illustrative sample values with the live Cache Expert and Work Parcel projections.
- Made Heatmap, Utilization and Compatibility real interactive views rather than decorative controls.

## Evidence integrity review

- Headline token totals are summed from the selected Work Parcel's provider-normalized invocation evidence.
- Timeline rows use persisted Work Parcel stages, invocation records, route decisions and baton fields.
- Heatmap cells are discrete task-history observations; absent cells remain unknown and are not promoted to warm idle time.
- Compatibility rows are emitted only from durable candidate assessments. Context percentages are labelled derived; unobserved relationships remain `UNKNOWN`.
- Estimated latency is not invented. Missing route-assessment latency is shown as `UNAVAILABLE`.
- Monetary benefit remains `MONETARY SAVING UNAVAILABLE` without authoritative pricing.

## Functional and responsive review

- Timeline, Heatmap, Utilization and Compatibility controls all switch their associated operational view.
- Browser console/page-error capture reported no errors across all four views.
- The 390 px viewport has no page-level horizontal overflow (`scrollWidth` 375 CSS px within a 390 px viewport). The primary navigation remains independently scrollable.
- Dense timeline and matrix content scrolls within its panel at narrow widths instead of widening the document.
- Live/current status pulse and active-step glow respect `prefers-reduced-motion`.

## Validation

```text
node --check assets/dashboard/dashboard-cache-experts.js
npm run typecheck
node --import tsx --test --test-concurrency=1 \
  src/control/cache-aware-expert.test.ts \
  src/control/work-parcels.test.ts \
  src/control/web-server.test.ts
```

Desktop and mobile screenshots were captured from the live qualification dashboard through the existing Chromium control session and compared with the supplied reference at matched 16:9 desktop framing.

final result: passed
