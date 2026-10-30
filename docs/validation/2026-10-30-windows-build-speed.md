# Windows build speed validation

Scope: scheduling and reporting only. Production desktop/preview behavior and packaging integrity checks remain unchanged. Separate conversation-import work is excluded.

## Baseline

- Source `ccf56e2d31595a6c7f5e75c3bce41b7bf905f76b`, version 0.2.184.
- [Release 40998607397](https://github.com/FahadArfin/MuseBench/actions/runs/40998607397): Windows job **675 seconds**, publication **37 seconds**; success.
- [Validation 40998608075](https://github.com/FahadArfin/MuseBench/actions/runs/40998608075): duplicated Windows validation **548 seconds**; success.
- Packaging took 55 seconds; unit tests 92, parity 71 and motion 64. UI checks ran sequentially. These observations support parallelizing independent jobs instead of weakening tests or changing compression.

## Local evidence

- New runner/coverage tests observed RED before implementation, then **17 focused tests passed** including actual child-process failure/stop behavior, complete check inventory and failed/cancelled/skipped validation blocking publication.
- Full suite executed through the new `unit` group: **1,513 passed, 0 failed, 1 existing optional replay skipped** (1,514 total), 40.4 seconds including setup on this local machine. This is not a GitHub timing estimate.
- Actionlint 1.7.12 validated all three changed workflows; the downloaded linter archive was checked against its published SHA-256 checksum.
- Production type-check/build passed (existing large-bundle advisory only). The complete representative `native` group passed all 14 commands in 80.3 seconds, exercising browser and real Electron fixtures through the same command runner used in CI.
- No paid model request is part of this change. Local timings do not include GitHub runner setup or publication.
- Independent review cleared integration with no material findings and independently confirmed **33 unique checks, zero missing/extra/duplicated**. One minor follow-up is deferred: interrupted/timed-out groups can lose their timing receipt because it is written after execution; the job still fails and cannot publish. Existing feature correctness, provider acceptance, unchanged non-Windows internals and later installed acceptance remain separate scopes, not inferred passes.

## Remaining verification

The 3-4 minute estimate depends on runner availability and must be confirmed by a completed GitHub release for this exact change. A successful CI run is not installed desktop proof. The current installed 0.2.181 remains unchanged until the newest candidate passes release checks, published-artifact hashes, fresh app-idle checks and profile backup.
