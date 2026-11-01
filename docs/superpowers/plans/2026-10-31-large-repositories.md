# Large Repository Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Support 16 GiB / 256 MiB-file / 100,000-file projects with bounded source-body memory.

**Architecture:** Store text content as immutable SHA-256 disk objects. Persist compact manifests and materialize text only under operation-specific budgets. Reuse stable file metadata for ordinary refresh; rehash before evidence and mutation.

**Tech Stack:** Existing Node/Electron, asynchronous filesystem I/O, SHA-256, SQLite manifests, React shared desktop/preview.

**Spec:** `docs/superpowers/specs/2026-10-31-large-repositories.md`

## Global Constraints

- Preserve existing local edits, data formats, native Muse backend and profiles.
- 16 GiB total; 256 MiB/file; 100,000 files; 1 MiB I/O buffers.
- Inline text <=128 KiB/file and <=1 MiB/manifest; lazy diff <=2 MiB/side.
- No paid requests, dependencies, services, Git config changes, push or release.
- Preserve legacy inline snapshots and reject incomplete/unsafe evidence.

## Review Focus

- File replacement, equal-size edits and restored timestamps must invalidate hashes.
- Interrupted scans and storage failures must not replace complete manifests.
- Missing historical text must never be interpreted as an empty restorable file.
- Deferred text must not appear as an empty exact diff or pass context attachment checks.
- Snapshot admission budgets must not become prompt, renderer or RAM budgets.

### Task 1: Streamed capture and disk objects

**Files:** Create `src/controller/source-snapshots.mjs`, `test/source-snapshots.test.mjs`; modify `src/controller/workspace-sources.mjs`.

**Interfaces:** `createSourceSnapshots({directory,safeFile,excluded,excludedPatterns,limits})` returns `snapshot(root,{verify,signal})`, `text(file,maxBytes)`, `copy(file,destination)`, `close()` and scan statistics. Snapshot shape stays `{revision,files}`; file descriptors retain `{hash,binary,text?}` and add `{size,object?}`.

- [x] Write failing tests for streamed large JSON, bounded manifests, duplicate objects, binary hashing, limits, path safety, stable scan cache, strict scan, cancellation and corrupted object reads.
- [x] Run tests to observe failures, implement atomic disk objects and bounded scanning, then pass the suite.
- [x] Increase Git inventory output/time budgets; retain all exclusion and Git environment safeguards.

### Task 2: Controller integration and lazy review

**Files:** Modify `src/controller/index.mjs`, `src/controller/run-changes.mjs`, `src/controller/checkpoint-restore.mjs`; add regression coverage in controller/restore tests.

**Interfaces:** Keep persisted legacy descriptors readable. Add `inspectSourceDiff({taskId,path,revision})` with ownership and content checks. All mutation/evidence paths use verified snapshots; ordinary refresh can reuse metadata.

- [x] Reproduce current >8 MiB and aggregate failures and missing-text consumer failures.
- [x] Replace eager capture; bound eager diff bodies and use explicit deferred states.
- [x] Load selected context under its existing 24,000-character limit, not the source limit.
- [x] Stream working-copy and checkpoint restore; preflight every selected capture before project mutation.
- [x] Preserve run-review capture budgets and mark uncaptured text omitted.
- [x] Pass controller, source selection, context, checkpoint, run-review and working-copy suites.

### Task 3: Shared IPC/UI and scale verification

**Files:** Modify `electron/main.mjs`, `electron/preload.cjs`, `src/shared/types.ts`, `src/ui/WorkspacePanels.tsx`, `src/preview/bridge.ts`; create `scripts/large-repository-smoke.mjs` and validation documentation.

- [x] Connect a selected deferred diff to the shared UI; keep preview and desktop behavior aligned.
- [x] Verify stale ownership/revision rejects lazy requests and oversized text reports its size limit.
- [x] Run typecheck and relevant suites; run an isolated Electron flow with no provider requests.
- [x] Run a >22,089-file, multi-GiB fixture; record elapsed time, peak RSS, serialized manifest size, cache reuse and event-loop delay.
- [x] Obtain one independent whole-patch review, resolve material findings and record evidence.

## Execution ledger

- Planning: source inspected; existing eager JSON snapshots affect context, run review, checkpoint and working-copy consumers, so all must change together.
- Ruling: implement in place, preserving the existing uncommitted batch, rather than committing or moving user work to a worktree.
- Ruling: large binary snapshots retain hashes only, matching current restore semantics; do not claim full binary backup support.
- Ruling: no automatic pruning of historical objects in this batch; correctness of old checkpoints takes precedence over speculative disk cleanup.

- Completed: streamed capture, controller consumers, selected and checkpoint diff IPC/UI, scale script and native CI coverage.
- Evidence: 2,174 full unit tests passed; isolated Electron source-diff flow passed; 6.29 GiB / 22,133-file scale run used 122.38 MiB peak Node RSS and refreshed in 3.27 s.
- Review: three P2 findings fixed with regressions; independent re-review clean.
- Ruling: disk-backed content is a compatibility extension to existing manifests, not a new database schema; preserve old inline rows.
- Ruling: keep the existing 8 MiB package.json parsing bound separate from the 256 MiB source-file capture limit.
- Ruling: no commits were created because this batch is to stay local and combined with the existing user fixes.
- Final verification: complete 2,174-test suite passed after read-only/baseline paths adopted metadata reuse; acceptance/check/restore verification still rehashes content. Electron IPC/UI flow passed again after those changes.
