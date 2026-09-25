# System appearance

Agent Control follows the operating system or browser's light/dark preference by default. Desktop, laptop and mobile use the same palette. A system preference change updates the open interface without navigating, reloading, or modifying the operator session. Browsers that do not expose `prefers-color-scheme` receive the light fallback. Browser emulation verifies layout and media-query behavior; it does not qualify a physical phone's OS settings or browser chrome.

The shared `assets/dashboard/dashboard-theme.css` defines semantic background, surface, elevated/inset surface, text, secondary text, border, accent, success, warning, error, running, complete, blocked, degraded, graph, focus, tooltip and overlay tokens. Existing component aliases resolve to those tokens. CSS media queries update the palette directly; no theme JavaScript, storage, time-of-day logic, provider dependency or mobile-specific colour logic is required. No manual theme selector or persisted override existed before this change, so none is introduced.

The palette covers the main dashboard, Estate/Process graph, Node Dashboard, Run Inspector, usage, readable history, dialogs, forms, menus, tables, cards, session replay and auxiliary Social/Voice and WhatsApp setup pages. Native controls and scrollbars receive the matching `color-scheme`. The offline shell caches only its static page and the same theme stylesheet; it never caches operational API responses. Browser chrome theme-colour metadata is media-scoped where supported.

Interface colour literals live in the shared palette. Remaining fixed colours belong to existing avatar/illustration artwork, the static PWA icon/manifest fallback, and the browser-chrome metadata (which cannot reference CSS variables). These are not separate interface themes. Avatars, textual state labels, directed process relations, running animation, elapsed timers and reduced-motion support are retained.

Validation combines focused palette/contrast/entry-point/offline tests, actual populated desktop and mobile browser journeys in both themes, live light-dark-light switching, and the normal full regression suite. Evidence is stored outside ordinary source pulls. Theme switching must preserve the document, operator storage, selected Estate node, selected operation and section, and canonical run identity. A controlled running-state regression is labelled separately from the real completed-job screenshots.

Normal-text palette pairs target WCAG AA (4.5:1); important focus/graph/border pairs target 3:1. Contrast checks and browser captures are bounded verification, not a claim of complete WCAG conformance for every possible job or graph. Dense Estate maps still benefit from filtering and the full-size physical-node picker on mobile.

This change does not close the existing formal release-sealing requirement or physical Pixel/live voice limitations. It does not change job execution, model routing, billing, discovery qualification or stored evidence.

References: [MDN prefers-color-scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-color-scheme), [MDN color-scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/color-scheme).

## Qualification on 14 September 2026

Implementation `9317b81afaf981c5ac010c4a94befa9841ac98b1`: full regression **1,548 passed, 0 failed, 0 skipped**, including 12 focused theme tests. **74 browser checks passed** across desktop, portrait and landscape with both initial themes and live preference changes. Recorded-history downloads match their canonical source. Paired screenshots and a continuous 12.04-second live-switch proof are stored in the dedicated system-theme evidence pack, outside source pulls. The controlled RUNNING/timer check is separate from real completed-run images. Formal release sealing remains outstanding.
