# Controller reliability validation

## Scope

Controller scan/close scheduling, long-history persistence, and the controller side of source-object collection. These checks use temporary profiles and fictional native runtimes; they make no provider request and do not replace the installed app or a user profile.

## Scheduling and recovery

- Repository refresh reads run outside the command queue. Concurrent refresh callers share one pending operation. Sends, navigation, disconnect/stop, strict evidence reads, explicit cancellation and close invalidate the captured generation.
- Observation commits recheck the captured project, task, owner, baseline and review evidence. An obsolete read or error cannot update a replacement chat. Accept/restore retain verified source reads and revision/evidence checks.
- Close first interrupts runtime preparation, drains accepted operations, then disconnects all owners again. A queued native connect cannot start after closing begins. Previously accepted draft/queue writes remain durable and held; new work is rejected. A terminal callback during close cannot schedule another source capture.
- Refresh persistence failures roll back the combined snapshot write, return the storage error without an unhandled rejection, and remain retryable.

## Persistence

- Primitive revision tokens detect nested changes without hashing or JSON-encoding every retained text body. Unchanged progress creates no task/app/history write or transcript notification.
- A bounded cache of encoded messages covers eight recently persisted chats. Changing a tail encodes the changed message and task metadata, then composes the same task JSON. The app snapshot reuses that JSON. Signatures contain primitive leaves; cached JSON is immutable.
- The current SQLite JSON format, complete canonical history/index, bounded display window and session recovery remain intact. Changed task and app snapshots are still written durably on each coalesced flush. Savepoints group related writes; rollback invalidates caches and restores pending observations. WAL and durability settings were not weakened.
- The changing-tail regression verifies the actual task row after every flush. It also verifies complete canonical text beyond 17,000 characters, search, restart, completion outcomes, optional nested metadata, Unicode and escaping. Four measured changing flushes perform zero whole-transcript encodings.

## Source-object inventory

- Stable keyset reads use retained prepared statements and one row at a time. This avoids the reproduced Node 22.14 native crash from temporary `StatementSync.iterate()` objects over large JSON rows.
- Inventory work advances at most eight rows with an 8 ms cooperative budget per slice. A single JSON parse can exceed that scheduling budget. Incomplete inventories authorize no deletion. Maintenance resumes bounded slices while idle.
- Source-owner generations advance for baseline/checkpoint/restore writes and actual task/app CAS-descriptor changes. Ordinary acknowledged drafts and text progress preserve inventory progress/cache. External SQLite changes invalidate it separately.
- The final reference recheck and unlink run synchronously under a nonwaiting SQLite `BEGIN IMMEDIATE` grant. An existing/external writer prevents deletion; the transaction is rolled back before any await. Close joins collection before closing SQLite.
- All retained baseline/checkpoint/restore manifests and nested task/app descriptors are included. Malformed, missing, oversized or changing inventories fail closed. Inventory limits are 20,000 owner rows and 512 MiB of owner JSON.

## Evidence

`artifacts/app-audit/controller-reliability-tests.log` records 128 passing focused tests, zero failures and zero cancellations after the final controller changes.

```powershell
node --test --test-concurrency=4 test/controller-refresh-scheduling.test.mjs test/controller-stream-persistence.test.mjs test/controller-source-gc.test.mjs test/harness-gaps.test.mjs test/code-schedule-controller.test.mjs test/recent-context-controller.test.mjs test/controller-drafts.test.mjs
```

An earlier, broader controller/history/evidence run passed 225 tests. Full app build/unit/desktop checks are tracked by the integration owner separately.

The repeatable changing-stream benchmark is `artifacts/controller-changing-stream-audit.mjs`; it compares the baseline Git controller with the working controller in separate temporary profiles, records the source hash, and verifies canonical text/search/restart for both. Timing is local synthetic evidence and varies with SQLite I/O and host load; it is not a hard latency guarantee or live-provider evidence.

The final quiet measurement is `artifacts/app-audit/controller-changing-stream-before-after.json`, for controller SHA-256 `3c384c46f5f0631c19ee47fea3ba480c7e5bc4196285381025fb50c2a79c7320`. Twelve actual changing-tail updates reduced whole-transcript encodings from 48 to 0 and message-window characters passed through JSON encoding from 114,431,369 to 191,594 (over 99.8% less). Median extra time beyond the 45 ms scheduling timer was 18.11 ms before and 16.51 ms after. The worst observed excess was 46.46 ms before and 54.98 ms after; the fixture establishes reduced serialization work and an 8.8% median improvement in this run, without claiming improved worst-case latency. Durable SQLite writes and host I/O still contribute to that latency.
