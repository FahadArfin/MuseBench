# Durable draft saves implementation plan

> For agentic workers: use superpowers:executing-plans inline. Preserve the user's standing implementation, publication and installation authorization.

Goal: make Code typing independent of conversation serialization while preserving immediate durable drafts.

Architecture: a small SQLite draft store migrates legacy data and synchronizes non-typing mutations. A queued controller acknowledgement writes only the changed draft, and desktop IPC uses it without requesting a full state snapshot. Preview retains the same bridge and composer.

Tech stack: existing Node SQLite, Electron and React; no added dependency.

Spec: docs/superpowers/specs/2026-10-29-durable-draft-saves-design.md

## Global constraints

- Keep the 16,000-character text limit, project/chat ownership and existing file/image validation.
- Save immediately, without debounce or replay. Preserve serialized action order and close draining.
- Migrate atomically; an empty migrated store must never revive legacy drafts.
- Full-state snapshots, native safety guards and actual task notifications remain unchanged for ordinary actions.
- No provider/model calls, real draft edits, third-party hook execution or audit-folder cleanup.

## Review focus

- A save queued just before send/navigation/close must persist in the original chat; a new save after close starts must reject.
- A failed attachment check or SQLite write must leave the previous draft available.
- Draft synchronization inside a rolled-back move/delete must not keep a misleading cache or lose the old binding.
- Clearing and restarting with stale legacy app JSON must not revive text.
- Runtime activity must retain its existing coalescing and shutdown flush when draft saves stop forcing a flush.

## Task 1: Storage, controller and desktop integration

Files: create src/controller/code-drafts.mjs and test/code-drafts.test.mjs; modify src/controller/index.mjs and electron/main.mjs; create test/controller-drafts.test.mjs and scripts/draft-save-benchmark.mjs.

Interfaces: createDraftStore(db, legacyDrafts) returns read(), write(key, draftOrNull), sync(drafts). Controller saveCodeDraft(input) returns Promise<void>; it consumes the existing saveDraft fields. The public renderer bridge is unchanged.

- [ ] Record an isolated pre-change benchmark using the existing desktop dispatch route, small and 150-message/16,000-character-per-message chats, repeated immediate saves, durable row checks and runtime snapshot counts.
- [ ] Add failing storage tests for one-time legacy migration, empty-store authority, rollback and write failure.
- [ ] Add failing controller tests for durable acknowledgement, zero unrelated database writes/snapshot reads, existing validation, operation ordering, immediate close, send/clear, delete, move and rollback.
- [ ] Implement the small store and shared draft validation/write helper. General persistence synchronizes non-typing draft mutations; keep legacy dispatch behavior compatible.
- [ ] Wire the existing desktop draft IPC to the acknowledgement method. Verify browser/desktop draft fixture contracts remain unchanged.
- [ ] Run focused draft, chat context, retention, sidebar move, screenshot and runtime streaming tests, then production build and the full suite. Record after timings and operation counts.
- [ ] Commit the verified feature and its evidence note.

## Task 2: Review and release

- [ ] Obtain one fresh final review of the immutable commit range. Fix Important findings once with failing regressions; record minor items and declined scope.
- [ ] Push the completed feature, await exact-commit Validate and Release success, verify the installer against its manifest and update metadata, install and reopen.
- [ ] Verify installed modules, native Codex connection and responsive shell. Use isolated packaged-controller fixtures for durable drafts; do not edit the user's drafts.
- [ ] Record the release receipt and leave all audit folders intact.
