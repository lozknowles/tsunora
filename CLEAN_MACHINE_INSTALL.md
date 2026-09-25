# RC2 clean-machine installation

Use INSTALL-REQUIREMENTS-v4.14.md and FIRST-RUN-v4.14.md for the supported procedure. OS prerequisites are explicit: the application bootstrap does not install Node, Git, Bash, CA trust or a system service.

Qualification restores a pristine disposable Ubuntu Minimal CPU-only snapshot, verifies prerequisite absence, installs verified prerequisites, verifies the candidate bundle and exact Git revision, runs bootstrap check/install, doctor, the ordinary web entry point, FIRST_RUN discovery and an approved observation Job. No fake optional executable or discovery workaround is permitted. Provider/model absence is recorded rather than converted into model readiness.

The final RC2 receipt records the exact tested commit, OS, CPU-only/no-nvidia state, service identity, API/Job outcomes and raw logs. Historical RC1 installation results are preserved separately and are not claimed as fresh RC2 results. Existing installations must not be upgraded without separate approval.
