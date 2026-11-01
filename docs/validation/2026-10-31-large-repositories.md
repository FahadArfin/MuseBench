# Large repository backend validation

Implemented locally on 31 October 2026. Not released or installed.

## Implemented

- 16 GiB snapshot, 256 MiB individual file and 100,000-file admission budgets.
- Asynchronous SHA-256 capture in <=1 MiB blocks, with disk-backed text objects.
  Binary assets contribute hashes and sizes without retained binary bodies.
- At most 128 KiB inline per file and 1 MiB inline per manifest. Up to eight
  project metadata caches retain at most 1 MiB inline text each.
- Unchanged-file refresh uses validated path metadata; evidence actions rehash
  content. Cache metadata includes inode, size and nanosecond mtime/ctime.
- Lazy selected-file and checkpoint comparisons, scoped to chat, revision and
  before/after hashes. Two MiB per side is a rendering/read limit, independent
  of source capture and model context. Deferred counts are not displayed as zero.
- Context attachments keep the existing 24,000-character budget. Working copies
  and text restores stream bytes, preserve hashes and support legacy captures.
- Active inspection cancellation during shutdown preserves queued prompt saves.
  The controller also exposes `cancelSourceScan()` for callers that need to stop
  an in-flight scan without closing the app.
- Git inventory remains read-only, bounded to 32 MiB output and 30 seconds.

## Research

The design and alternatives are documented in
[the design](../superpowers/specs/2026-10-31-large-repositories.md) and
[task plan](../superpowers/plans/2026-10-31-large-repositories.md).
Primary sources informed immutable content-addressed storage, Node stream
backpressure and metadata-based incremental inspection. No repository Git
configuration, hooks, staging or commits are changed to enable the feature.

## Evidence

- Full unit suite: **2,174 passed**, zero failures
  (`artifacts/large-repo-unit-verified.log`). New review, cancellation, encoding,
  admission and pipeline regressions also pass in the final targeted checks.
- Typecheck and production renderer build passed. Full native/production build
  passed earlier in this batch; existing bundle-size advisory remains.
- Real Electron preload/controller + shared review UI: passed, zero provider
  requests, isolated temporary profile. Opens >8 MiB text, creates a manual chat,
  checks exact on-demand historical/current text over IPC and clicks Load
  comparison. Evidence: `artifacts/source-diff/desktop-wLVvQP/report.json`.
- Independent read-only review found three issues: corrupt existing objects,
  admission accounting during a file-size race, and missing lazy checkpoint
  comparisons. All were corrected and regression-tested; re-review was clean.
- The initial unit run exposed two fixtures depending on the old 2 MiB cap and
  a real shutdown regression affecting pending enqueues. Fixtures now exceed
  256 MiB using sparse files. Shutdown cancels active scans, then drains queued
  operations before permanently closing snapshot storage; enqueue regression
  and the complete unit suite pass.

## Synthetic scale result

`npm run test:large-repository` created a temporary fixture outside user projects:
22,100 small text files, 32 sparse 200 MiB binary files and one 37 MiB text file.
All binary bytes were actually read and hashed; sparse allocation saves disk
space but does not substitute metadata for byte verification.

| Measurement | Result |
| --- | ---: |
| Files | 22,133 |
| Total bytes inspected | 6,750,125,712 (6.29 GiB) |
| Manifest JSON | 5,021,203 bytes (4.79 MiB) |
| Initial capture | 90.64 seconds |
| Warm refresh | 3.27 seconds |
| Warm source bytes read | 0 |
| Warm reused files | 22,133 |
| Single-file edit | Exactly 1 file rehashed |
| Peak Node process RSS | 122.38 MiB |
| Event-loop delay, 99th percentile | 25.92 ms |
| Maximum event-loop delay | 52.40 ms |

Machine-specific evidence: `artifacts/large-repository/scale-report.json` and
`artifacts/large-repo-scale-final.log`. The source service benchmark ran in Node;
it is not an Electron-wide memory measurement. It ran alongside unit/build
checks, so durations are not a controlled performance comparison. It proves
bounded source-body memory and cache reuse on this fixture, not a speed promise
for OneDrive, network storage or every user checkout. The actual Nook-and-Nest
and PVPartPicker checkouts were not modified or used for provider requests.

## Limits and follow-ups

First capture and explicit verified evidence actions still read all eligible
source bytes. Large assets can take time even though RAM is bounded. Source
capture is not a transactional filesystem snapshot and cannot detect every
transient external edit between observations.

Binary restore remains unavailable. Text above the 2 MiB comparison budget is
tracked and captured but opened externally for inspection. Referenced historical
objects are not automatically pruned; retained text history can grow disk usage.
Future work is listed in [future features](../FUTURE-FEATURES.md). These are
declared limits, not claims of implemented chunked diff or binary backup support.
