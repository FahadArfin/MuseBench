# Faster durable chat history

The approved harness roadmap includes responsive long chats and durable native-session records. The existing history store repeats a lookup and coverage write for every retained message on each save, rebuilds every search term on streaming replacement, and lacks task/sequence indexes for history and execution receipts. Improve these actual paths without changing the shared renderer or discarding history.

## Approach

Use prepared SQLite statements, a task/sequence history index and a task receipt index. Synchronize each retained window with bounded batched metadata reads; existing canonical text is never fetched or overwritten by a display-window save. Update search terms by set difference in the same savepoint as canonical text. Retain synchronous persistence: no debounce, background worker, or in-memory authority cache that could lose data or disagree with rollback.

Alternatives: a permanent in-memory message/term cache needs external-write and rollback invalidation; deferring history writes would change crash durability. Both add complexity the current bottleneck does not require. Keep native resume guards: paged events alone do not prove the complete admitted native queue, and this work does not claim unsupported snapshot recovery.

## Required behavior

- Preserve message insertion order, task-scoped cursors, Unicode/literal substring search and newest matching result, canonical text beyond the renderer window, capture limits, legacy coverage and permanent deletion.
- Metadata changes and corrections remain durable. Text and search terms commit/roll back together, including caller-owned transactions. Failed window synchronization is atomic.
- An unchanged 150-message sync uses bounded SQL work rather than per-message queries/writes. Large replacement with only one new term does not rewrite unchanged terms.
- Existing databases gain indexes idempotently; no migration deletes messages, tasks, receipts, credentials or sessions.
- Measure the actual store on synthetic long/multi-chat datasets before and after. Report storage timing, not model speed or guaranteed foreground frame rate.
- Run unit/controller regressions, production build, responsiveness and preview/desktop parity. Push the tested feature, verify exact-head CI/release, then synchronize the installed desktop.

User authorization: standing instruction to continue the roadmap, implement, test, push and synchronize desktop/preview. No new provider calls or purchases are needed.
