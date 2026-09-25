# Workforce Lab demonstration guide

Run only on an isolated development host. No production install or service changes are needed. Start with the [current Tsunora clean-install guide](docs/TSUNORA-CLEAN-INSTALL.md), including the matching Chromium prerequisite before recording.

```sh
npm ci
node --import tsx scripts/workforce-lab.ts /tmp/workforce-demo-new
```

The server selects an unused loopback port. Read the private-session.json launcher locally, open http://127.0.0.1:PORT/#OPERATOR_CAPABILITY, and do not share or record that launcher URL. The page clears its fragment. No capability belongs in Git, evidence or a public URL. Employee sessions cannot approve.

A: choose Employment letter, create job, observe intake/policy/prepare/execute/verify and COMPLETE. The document is a synthetic receipt, not a real employment document.

B: choose Bank change, confirm the displayed synthetic replacement, create job. WAITING_FOR_APPROVAL is the execute-step state; the overall Run is WAITING. Inspect preparation evidence. Approve as synthetic HR; observe resumed mutation and independent readback. Repeat and reject to demonstrate cancellation with no mutation.

C: use a fresh disposable instance, choose Contain & recover. Approve the bank change. Inspect the EXECUTE step's two attempts and the Evidence & incidents tab: scope violation, real process containment, quarantine, fallback worker and final verified result. EMP-0197 must remain unchanged.

Controlled faults are server-side behavior, not UI-only statuses. Worker/model unavailability are injected conditions (no actual model call); tool faults operate on mock integrations. Incorrect output and verification-failure demonstrations intentionally retain unsuccessful outcomes. Do not claim success merely because the UI remains responsive.

Qualification and live recording:

```sh
node --import ./scripts/test-environment.mjs --import tsx scripts/qualify-workforce.ts /tmp/workforce-qualification-new
node scripts/record-workforce.mjs /tmp/workforce-heroes-new
npm run check
```

Copy rd-results.json into a running lab's state root to display measured comparisons. The R&D workspace is a result viewer; batch execution is initiated through the reproducible CLI, not a browser button. Local/API model, remote-worker and execution-mode comparisons are not yet implemented for this domain.

The recording script starts a live browser recorder BEFORE each request, drives real runtime operations, verifies results and creates three WebM videos. It uses fresh synthetic instances for each hero. Create STOP in a lab state root to stop its owned server. Videos are recordings of actual runs, not event replay.

The repaired launcher consumes STOP during graceful shutdown. Restart preserves retained jobs but rotates temporary sessions; reload private-session.json locally. `node --test scripts/workforce-installation.test.mjs` verifies approval persistence and expired-session rejection across that process boundary.
