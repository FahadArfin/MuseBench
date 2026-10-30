# Faster Windows releases

The user wants substantially less waiting for Windows builds without dropping validation. Routine releases remain Windows 11 x64. Existing conversation-import work is preserved in its separate worktree.

## Measured baseline

Exact source `ccf56e2d31595a6c7f5e75c3bce41b7bf905f76b`: release run 40998607397 passed, with a 675-second Windows job and 37-second publication job. Validation run 40998608075 passed in 548 seconds. Packaging itself took 55 seconds. Release unit tests took 92 seconds, parity 71, motion 64, startup 30, catalog preview 30, and browser preview 28. Most UI checks were duplicated between both workflows.

## Design

- One reusable Windows validation workflow contains six independent jobs: unit tests and five balanced UI groups (appearance, navigation, extensions, chats, native controls). Each group owns a fresh runner, temporary profiles and ports. Tests within a group remain sequential so existing fixture assumptions stay valid.
- Main releases call that workflow once, concurrently with installer packaging. Publication explicitly requires validation success AND verified package success. Optional platforms stay manual and artifact-only. Failed, cancelled or skipped validation must never publish.
- Branch pushes and pull requests call the same reusable workflow. Standalone validation excludes main pushes because release owns their identical checks. No branch protection or account permissions change; current main has no required-check rules.
- Keep the union of every previous release and validation check, exactly once. In particular plugin-tool checks become a release requirement, and native/mobile/navigation checks also run for branches. Preserve build/type checks, native package boot, manifest/hash checks, immutable releases, latest-source guard and draft protection.
- A small runner executes each allowlisted group with explicit child exit-code propagation, stops on the first failure, records per-check elapsed time and writes a compact GitHub summary. Unknown group names fail before execution. Failure artifacts contain only existing clean fixture reports; group timing receipts are always uploaded.
- Reuse existing npm download caching. Extra browser/build caches and same-machine parallel Electron processes are unnecessary for the first optimization: setup costs are small and the latter risks port/profile contention. Do not share mutable node_modules or run untrusted PR code with publishing credentials.

Based on measured durations, five UI groups have about 95-112 seconds of test work each. Setup and publication suggest approximately 3-4 minutes elapsed, subject to runner availability. This is an estimate until the new exact-source GitHub run finishes. More runners overlap, but duplicate full runs are removed; report elapsed and total runner time separately.

GitHub documents [same-commit reusable workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows) and [parallel matrix jobs](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/run-job-variations). Local relative workflow references bind the called checks to the caller's source revision.

## Acceptance

Regression tests prove complete/nonduplicated check coverage, same-source workflow wiring, release failure/skip/cancellation gating, real subprocess failure propagation and usable timing output. One independent review precedes integration. Run local unit/build checks, push the focused change, inspect the real parallel run and compare elapsed time with the baseline. Install only the latest exact, published, hash-verified Windows artifact after a fresh idle check and profile backup; installed proof stays separate from fixture checks.
