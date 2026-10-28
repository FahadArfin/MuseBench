# Durable history storage responsiveness

Validated locally on Windows, 28 October 2026, with Node 22.14.0. Baseline: `28cdf798d39277db7aff1243ebec33e6fdccb94a`.

## Change

Retained conversation windows now read metadata in bounded batches, preserving longer canonical message bodies. Streaming replacements change only added/removed search terms inside the same savepoint as the text. New additive indexes serve task-scoped history pages and execution receipt lists. Existing public store methods and renderer contracts are unchanged.

Window synchronization is atomic. Role corrections now update the search-visible database column as well as metadata. Search also checks for newer partial-word matches after finding an indexed whole-word candidate; an older `cat` result no longer hides a newer `catalogue` result.

## Measured workload

Run `node scripts/history-storage-benchmark.mjs <output.json>` from each revision. It uses an isolated temporary, file-backed SQLite database with WAL, no user profile and no model requests. The same workload ran before and after. Values are per-operation medians; 15 samples except streaming (7).

| Operation | Workload | Before | After |
| --- | --- | ---: | ---: |
| Unchanged retained-window sync | 150 messages | 1.294 ms | 0.448 ms |
| Streaming replacement | 508,889 characters, 40,000 distinct terms, one changed trailing term | 125.278 ms | 14.931 ms |
| History page | Latest 20 of 10,000 messages | 2.234 ms | 0.199 ms |
| Receipt list | 20 selected-task rows preceding 99,980 unrelated rows | 6.884 ms | 0.030 ms |

An unchanged window fell from 301 prepared query/write executions to 2; the new sync additionally opens/releases one savepoint. It reads no canonical text and writes no message or search-term rows. Receipt timing represents a deliberately unfavorable multi-chat distribution, not a typical user's history.

This measures storage work, not end-to-end chat switching, rendering frame rate or model latency. Large text still needs tokenization; history count queries and startup receipt recovery still scale with their relevant data. No deferred persistence or authoritative memory cache was introduced.

## Verification

- Six intended regressions failed before implementation: bounded sync work, metadata role visibility, changed-term writes, whole-window rollback, newest partial-word result, and ordered task indexes.
- Focused storage/controller suite: 21 passed. Uses real SQLite, including outer transaction rollback, injected SQL failures, deletion, scoped cursors, long canonical text, Unicode search, duplicate IDs, and an existing populated schema upgraded twice with a 1,105-message legacy window.
- Benchmark correctness: passed before and after; canonical search, page totals/order and receipt selection verified.
- Full suite: 1,140 passed; production build passed. Existing Vite bundle-size advisory remains.
- Responsiveness: all 17 renderer behavior checks, dictation subscription regression, and timeline navigation cases passed.
- Preview/desktop parity: 97 scenes passed, comparing shared controls, styles and geometry within 1 px.
- Independent review: no critical, important or minor findings. The reviewer independently passed 23 storage/controller/receipt tests and repeated the benchmark with correctness passing (sync 0.432 ms; streaming 15.541 ms; page 0.197 ms; receipt 0.023 ms).
- Release/install gate: require successful Windows validation and release jobs for this exact committed change, verify the installer against `latest.yml`, and compare installed source/release identity before reopening. Delivery evidence belongs to the ignored release folder, avoiding an extra source commit merely to report its own release.

## Review scope decisions

Preserve the existing native queue-recovery guards; no live provider run was needed for this storage change. Startup receipt recovery's scan and task JSON serialization are separate remaining performance work. Text lost before durable-history migration cannot be reconstructed. Benchmark results establish storage performance only. Exact-commit CI and installed binary identity are subsequent delivery checks, not evidence supplied by the code reviewer.

Local evidence is in ignored `artifacts/history-storage/`. The benchmark and behavior tests are committed so the measurements can be repeated without sharing private chat data.
