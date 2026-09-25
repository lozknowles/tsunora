# Qualification evidence archive

Agent Control separates executable product source from heavyweight qualification evidence. A normal clone contains source, documentation, schemas, configuration, tests, lightweight fixtures and small evidence summaries. HD recordings, screenshots, binary captures, complete qualification working trees and oversized raw evidence are retained outside the source repository.

## Public archive

The pre-separation evidence is published in the public [Agent Control qualification evidence archive](https://github.com/lozknowles/agent-control-qualification-evidence/releases/tag/source-separation-20260912).

| Asset | Purpose | SHA-256 |
| --- | --- | --- |
| `agent-control-pre-separation.bundle` | Complete original Git history and refs before source separation | `6bca20655d2296d032dfadacbc28fc1cf9e3989891a176f482d9eab82577b15b` |
| `agent-control-candidate-146ba9d-heavy-evidence.tar.zst` | Heavy files from candidate `146ba9d2699ca9e1570762dea01e9b84da9374a8` at their original paths | `1704b027da092e6e8511893079b0f62145b2589e7a11dc0da27578fae9b54634` |
| `candidate-146ba9d-evidence.json` | Per-file source path, byte size, Git blob ID, SHA-256 and selection reason | `a49ec8370ac887047652967c1ddbbebd891f5e67d70741145344292e4c3092f2` |

The archive preserves the frozen 4.5 release candidate and all truthful negative, blocked and passing evidence. Separation changes distribution, not qualification outcomes.

## Verify and inspect

```bash
sha256sum -c SHA256SUMS
git bundle verify agent-control-pre-separation.bundle
tar --zstd -tf agent-control-candidate-146ba9d-heavy-evidence.tar.zst
```

Use the manifest to resolve an original repository path to its immutable SHA-256. Retrieve the full archive only when detailed evidence inspection is required. Do not unpack evidence into a product checkout and commit it again.

## New qualification output

Keep heavy output in an operator-owned evidence directory outside the source checkout. Qualification scripts that provide an output-directory environment variable should be pointed there. Commit only a reviewed, redacted, lightweight report or manifest that records:

- source commit and qualification identity;
- external archive/release URL;
- original path or artifact name;
- byte size and SHA-256;
- provider/runtime provenance and verdict;
- explicit authority and measurement limitations.

`npm run check:distribution` fails when a tracked source tree contains `qualification/`, dashboard screenshot media, binary media beneath `docs/evidence/`, or a file larger than 1,000,000 bytes. Product documentation PDFs and small deterministic fixtures remain permitted.

## History migration

The original commit graph is retained by the complete bundle. The external archive repository publishes the old-to-new commit/ref map produced by the controlled rewrite. Existing clones must be backed up and freshly cloned after the rewrite; do not merge an old clone into rewritten history. Contributors with unpublished work should create a patch or bundle before recloning, then reapply and review it against the new commit graph.

A partial or shallow clone is not the Agent Control installation procedure. The normal documented full clone must remain small enough to install on a clean supported device.
