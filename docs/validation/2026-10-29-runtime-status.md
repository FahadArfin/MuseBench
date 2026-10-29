# Fresh runtime status validation

Saved Code chats previously read a full runtime snapshot up to six times per summary. Exec and interactive snapshots clone retained messages and activity. An ordinary dispatch constructs five summary passes, so 100 idle retained runtimes generated 3,000 full snapshots just to display their status.

Exec, interactive and selector runtimes now expose a fresh `statusSnapshot()` containing five primitive lifecycle fields. It reads current state on every call. Existing injected runtimes without the method fall back to one full snapshot per observation. A summary's busy flag and status label use the same result. Existing full snapshots, native event publication, UI and IPC contracts are unchanged.

The shared projection accepts plain synchronous objects, rejects malformed declared readers/results, and never traverses messages, activity, child inspections or credentials. Local controller pending work and every prior native busy condition remain blocking. Pending or unconfirmed post-disconnect cleanup still prevents billing reset. Native approval reasons remain intact.

## Regressions and measurements

Four controller regressions failed on the old implementation: six legacy snapshots instead of one, full transcript copies despite an available compact reader, inconsistent label/busy observations, and accepting a malformed declared status method as idle. Four runtime/selector tests also failed because the new accessor was absent. Additional tests preserve no-event transitions, background checkout conflicts, mutation/update/billing guards, local pending work and native approval reasons. Injected exec and interactive lifecycle tests compare the compact fields with full state and assert zero `structuredClone` calls during compact reads.

The full local suite passed 1,390 tests, including 17 new cases. The production build and existing renderer/dictation/timeline responsiveness checks passed. The existing large-bundle warning is unchanged. This is local evidence; release and installed checks are recorded separately.

`node scripts/runtime-status-benchmark.mjs <output-directory>` uses owned synthetic profiles, 10 fictional 4,000-character messages per runtime, three warmups, 20 getState samples and 10 clear-error dispatch samples. No user chats or model requests are used. The original before/after receipts identify the base commit because they were recorded before committing; a separate clean-head receipt is retained during release validation.

| Retained runtimes | getState median before / after | Dispatch median before / after | Full snapshots per getState before / after | Full snapshots per dispatch before / after |
| --- | --- | --- | --- | --- |
| 20 | 1.063 / 0.051 ms | 6.056 / 1.407 ms | 120 / 0 | 600 / 0 |
| 100 | 5.320 / 0.131 ms | 26.620 / 1.766 ms | 600 / 0 | 3,000 / 0 |

Each after getState still makes one cheap compact read per retained runtime; each dispatch still makes five summary passes. This is not a claim to eliminate all state serialization, selected-chat snapshots, SQLite persistence, native inference latency, or visible frame latency. Legacy adapters get the single-full-snapshot fallback instead of zero full copies. Missing optional lifecycle fields keep their prior meaning; cleanup `pending` remains separately guarded where the prior implementation guarded it.

Raw synthetic receipts are retained in `artifacts/runtime-status/`. Test/review receipts live in the plan's ignored `.superpowers/sdd/2026-10-29-runtime-status/` workspace. Source tests, exact-commit CI and installed-package acceptance are separate gates recorded in the release receipt.
