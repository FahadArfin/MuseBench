# Context Continuity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline, one final review.

**Goal:** Preserve and explain observed native context history without hidden inference.
**Architecture:** Finite shared observation history, existing runtime/restore event paths, per-chat controller persistence and shared Session UI.
**Spec:** docs/superpowers/specs/2026-10-30-context-continuity-design.md

## Global Constraints
- No model calls, personal state changes, speculative retention knobs or automatic compaction.
- Existing manual command admission/busy/unknown behavior stays intact.
- Bound all metadata; current context occupancy and retained content remain unknown.
- Shared preview/desktop, focused checks, one independent final review, exact release verification.

## Review Focus
- Automatic, restored and manual observations must not settle unrelated manual commands or cross session/chat ownership.
- Stale/equal revisions, missing tokens and opaque boundaries cannot imply current occupancy or exact retained context.
- Restart/connection loss marks unfinished observations unknown without replay; later terminal evidence can reconcile them.
- Metadata is bounded, non-executable and does not create repeated writes for unchanged observations.
- Shared UI must distinguish fixture data, past sessions and current native restoration without losing manual controls.

### Task 1: Bounded native observation history
**Files:** src/shared/compaction-history.mjs, src/shared/compaction-history.d.mts, src/runtime/compaction.mjs, src/runtime/index.mjs, reference/patchlight/adapter/session-adapter.mjs, src/controller/index.mjs, src/shared/types.ts, focused tests.
**Interfaces:** `observeCompaction(item,{sessionId,source,at})`, `mergeCompactionHistory(previous,incoming)`, `interruptCompactionHistory(history)`; tracker `history()` and restored native items; task/runtime `contextCompactions`.
- [x] Write failing normalization/revision/bounds/restart, runtime restoration/ownership and controller persistence tests.
- [x] Implement finite history without altering manual command authority; preserve exact owning chat and skip unchanged writes.
- [x] Run focused compaction/runtime/adapter/controller tests; commit.

### Task 2: Shared context history presentation
**Files:** src/ui/CompactionPanel.tsx, src/ui/App.tsx, src/ui/SessionDialog.tsx, src/preview/bridge.ts, scripts/context-history-smoke.mjs, scripts/run-ci-suite.mjs, package.json, test/ci-suites.test.mjs, docs/CONTEXT-HISTORY.md, docs/ROADMAP-2026-10-29.md, validation/research notes.
**Interfaces:** Native observations plus existing manual receipts, shared read-only history, explicit unknown values and session/source identity. Observation chip opens Session only.
- [x] Write failing shared browser/real Electron fixture checks for history, unknown tokens, restored session wording, item isolation and narrow layout.
- [x] Implement compact shared controls, fixture labels and CI smoke in an existing parallel group.
- [x] Run shared smoke, existing session recovery checks, full tests and production build; commit.

### Task 3: Review and delivery
**Files:** focused corrections, validation and roadmap.
**Interfaces:** Reviewed source and exact verified Windows artifact; personal native inspection separate from isolated mutation evidence.
- [x] One fresh whole-branch review; re-grade findings and fix Important/Critical with RED to GREEN and full suite.
- [ ] Push feature, verify all six Windows groups and publication, then hash-check exact installer.
- [ ] Fresh idle check, complete profile backup, graceful install/reopen, native version/UI and isolated installed context-history check. Record remaining external prerequisites.
