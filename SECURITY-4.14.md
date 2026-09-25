# Security review of v4.14 RC2

Coverage remains PARTIAL. The v4.13 small 47-case AI-reviewed evaluation is not expanded by this release exercise.

RC1's 98 original findings retain their source-linked dispositions: 92 FALSE_POSITIVE, 4 TRUE_POSITIVE_FIXED and 2 NOT_APPLICABLE. Four findings concern two renderer encoding mechanisms. Browser reproductions established local HTML insertion before the fixes and no insertion afterward; remote exploitability was not established. Native scanner entries and separate manual dispositions are both preserved.

RC2 changes require focused security checks and a fresh source-bound review. The accompanying final receipt records new findings, reconciliation, unresolved release-critical findings and the security gate. Acceptable bounded wording is PASS WITH DOCUMENTED PARTIAL COVERAGE when all known findings are dispositioned, no release-critical issue remains and claims stay within evidence. Otherwise the gate is BLOCKED. Do not state SECURITY COMPLETE.

The numbered guard never evaluates supplied source. Its JavaScript discriminator invokes the fixed Node executable in syntax-check mode without a shell, with bounded input/output/time and no inherited environment. Provenance derives from authorised workspace source/read results, not a model-supplied claim. Authority, path scope and duplicate-key rejection remain independent controls.

Installed experimental paths require the existing qualification gate plus the explicit semantic capability gate. Selecting legacy repair is explicit; native malformed calls remain rejected. The normal service safety supervisor and action governance remain in force. Runtime effects, cleanup and durable evidence are checked in disposable environments.

The sandbox credential probe now checks generic home entries and runtime-user state instead of one personal username. Its containment evidence remains bounded to the adapter and controls actually exercised.

Public source packages exclude private historical evidence, model-output patches, screenshots and machine-bound research scripts through committed export rules. Final review must inspect actual members, text and binary metadata and disposition synthetic credential/address fixtures. Regex scanning alone is not clearance. Gated synthetic forensic material may appear only in an explicitly scoped, reviewed evidence bundle; unrestricted private forensic content is prohibited from normal packages.

Private qualification bundles can retain internal paths and process identities. Such a bundle is not automatically suitable for public release even when source-artifact privacy passes. No publication is authorised by qualification.
