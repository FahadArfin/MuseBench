# Durable draft save validation

The desktop's former draft route flushed runtime progress, persisted the selected conversation and app/project snapshots, then built a complete return snapshot that IPC discarded. The new route writes one SQLite draft row and acknowledges it through the existing serialized controller queue.

The code_drafts table imports legacy app drafts in an atomic savepoint. Its existence is the migration marker; an empty table never falls back to stale legacy text. General persistence synchronizes draft mutations from sends, moves, deletion and other existing actions. Synchronization reads current rows rather than caching a state that could survive an outer transaction rollback. App JSON remains present for profile compatibility, but this version treats the dedicated table as authoritative. Older versions do not understand new row-only saves until ordinary state persistence mirrors them.

Three behavior regressions failed on the old route: typing rewrote the app snapshot, erased an unrelated controller error, and forced coalesced runtime updates to publish. They passed with the dedicated route. Seventeen storage/controller cases cover migration, immediate durability, images/files, validation failure, database failure, queued navigation/close, clearing/sending/deletion, transaction rollback and runtime progress. The full suite passed 1,373 tests. The production build and existing renderer/dictation/timeline responsiveness checks passed; the existing large-bundle build warning is unchanged.

## Isolated measurement

Run scripts/draft-save-benchmark.mjs with an output directory. Each case warms up five saves, then measures 30 immediate saves in an owned synthetic profile. This does not call a model or edit the user's drafts.

| Retained messages | Former median / p95 | New median / p95 | Former runtime snapshots | New runtime snapshots |
| --- | --- | --- | --- | --- |
| 0 | 1.234 / 1.503 ms | 0.274 / 0.373 ms | 360 | 0 |
| 150 × 16,000 characters | 18.057 / 30.437 ms | 0.308 / 0.437 ms | 360 | 0 |

Across the large case, the former route updated app and task JSON with 145,243,190 serialized characters plus 30 project writes. The new route performed zero updates to those tables during typing. A separate SQLite connection confirmed the final draft before controller shutdown in both cases. These are local controller acknowledgement measurements, not presented-frame latency, physical disk traffic, native inference speed, or a general peak-memory claim. Existing screenshot validation still runs when a draft contains images.

Raw receipts are retained under artifacts/draft-saves/before/ and artifacts/draft-saves/after/. Test logs and review decisions are retained in the plan's ignored .superpowers/sdd workspace. Publication and installed-package acceptance remain separate delivery gates.
