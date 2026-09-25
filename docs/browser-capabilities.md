# Browser and ChatGPT capabilities

Agent Control routes browser work through the existing Job, worker-placement, lock, artifact, verification and audit boundaries. A browser never becomes a second scheduler or authority path.

## Capability identities

- `browser.headless`, `browser.interactive`, `browser.authenticated`, `browser.javascript`, `browser.download`, `browser.screenshot`
- `chatgpt.plan`: official Codex CLI using saved ChatGPT authentication
- `chatgpt.web`: an authenticated interactive browser bridge; it is not interchangeable with `chatgpt.plan`
- `chatgpt.android` and `android.ui`: an authorised Android UI transport

Explicit route selection is authoritative. An unavailable `chatgpt.web` or `chatgpt.android` request fails closed and is never replaced by the headless worker, Codex CLI, or an API provider.

The Playwright worker accepts bounded structured steps, permits only HTTP(S) navigation, enforces a 120-second ceiling, propagates cancellation, returns screenshot and download hashes, and never returns cookies or browser storage. JavaScript and downloads require explicit request flags. Browser UI routes report tokens and monetary cost as unavailable unless their upstream transport supplies authoritative usage.

The headless worker deliberately rejects `authenticated: true`. Authenticated web and Android sessions must arrive through their separately qualified capability routes; a public Chromium session cannot impersonate either route.

## Remote Android activation

Secure-overlay reachability is discovery, not control authority. Agent Control can operate an Android resource remotely once its configured, previously authorised ADB, SSH, or Android UI transport is listening. If every control transport is stopped, Android requires one local trust action: start the installed Agent Control/Termux service, or approve Wireless debugging pairing. After that bootstrap, the retained transport can be probed and routed remotely. Agent Control does not bypass the Android pairing dialog.

## Current qualification boundary

The configured headless Chromium worker is independently qualified against a harmless public page. No approved desktop Edge session bridge was present during qualification, so `chatgpt.web` remains blocked. Secure-overlay reachability of an Android device is network evidence only; `chatgpt.android` additionally requires a fresh authorised ADB or Agent Control Android transport, a qualified UI-automation mechanism, and a non-exported authenticated ChatGPT session.
