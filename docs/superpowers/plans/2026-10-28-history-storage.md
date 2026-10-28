# Durable history storage implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this single feature inline, with one independent final review.

**Goal:** Reduce long-chat storage work while preserving durable text, search and receipt behavior.

**Architecture:** Keep synchronous SQLite as the authority. Batch metadata inspection for saved display windows, update canonical-message term indexes incrementally inside savepoints, and index task-scoped ordered reads. The renderer and native permission/session contracts stay unchanged.

**Tech Stack:** Node SQLite, existing Electron/React application.

**Spec:** ../specs/2026-10-28-history-storage-design.md

## Global constraints

Preserve insertion order, canonical text, legacy coverage, task scoping, capture limits, Unicode/literal newest-match search and atomic rollback. No persistence debounce, new dependency, provider request or auth change. Existing clean main checkout keeps the active preview connected; feature push/install already authorized.

## Review focus

- Large legacy migration and duplicate message identities must preserve canonical text and coverage.
- Metadata-only changes, including role, must agree with search visibility.
- Outer transaction rollback and SQL failures must not leave stale indexes or an authoritative cache.
- Partial-word newest matches must outrank older indexed whole-word matches.
- Multiple tasks with interleaved rows must page and delete only their own records.

## Task 1: Optimize durable history and receipt storage

Files: src/controller/chat-history.mjs, src/controller/execution-ledger.mjs, test/durable-history.test.mjs, scripts/history-storage-benchmark.mjs, docs/VALIDATION-history-storage.md.

Interfaces: preserve createHistoryStore(db) and createExecutionLedger(db) public methods. Use real DatabaseSync instrumentation only in tests/benchmark.

- [x] Add failing tests for bounded unchanged sync SQL, canonical metadata updates, incremental term writes, transaction rollback, newest partial-word search and task-scoped index query plans; run node --test test/durable-history.test.mjs.
- [x] Capture baseline on 150-message sync, large streaming replacement, 10,000-message paging and 100,000-receipt task reads.
- [x] Implement batched sync, prepared statements, term set differences and idempotent indexes. Run focused storage/controller tests until green.
- [x] Run the same benchmark and inspect correctness/timings; no absolute timing threshold replaces behavior tests.
- [x] Run npm test, npm run build, npm run test:code-responsiveness and npm run test:preview-parity. Review results and record actual limits.
- [x] Independent whole-change review; reproduce/fix material findings (none found).
- [ ] Commit/push the complete feature. Delivery status is recorded in the local release evidence to avoid a self-referential release-only commit.
- [ ] Verify exact-head Windows validation/release, manifest and installed source identity, reopen the matching desktop, and retain current preview.
