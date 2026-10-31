# T3-inspired Muse Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver seven focused T3-inspired improvements while retaining native Muse and the existing compact UI.

**Architecture:** Small UI hooks/components plus bounded controller read/storage operations. Reuse existing SQLite, bridge, preview fixtures and native event admission.

**Tech Stack:** React/TypeScript, Electron, Node ESM, SQLite, existing Playwright smoke harness.

**Spec:** `docs/superpowers/specs/2026-10-30-t3-workflows-design.md`

## Global Constraints

- Muse remains the only coding backend; no new providers or subscription aggregation.
- No paid model requests, upstream executable runs, account/billing/security permission changes or personal-session test mutation.
- Shared preview and Electron behavior, accessible names/focus, narrow layouts and reduced motion are required.
- Preserve existing draft/context limits, session identities, permission/admission gates and stored data.
- Tests use disposable profiles and counted fake runtime boundaries when asserting zero sends; no constant zero-call report fields.
- Native fixtures, source tests, CI, published artifacts and installed UI are separate evidence classes.
- Review and push each completed feature; final Windows x64 install only after exact-head required CI/release/hash checks and fresh idle preflight. Preserve profile and reopen normally.

## Review Focus

- Navigation during delayed reads/restores must never edit or focus the wrong chat (tasks 1–5).
- Failed storage and full shelf must preserve every acknowledged draft and attachment (task 3).
- Unicode, hostile Markdown and duplicate occurrences must retain exact text without authority escalation (tasks 2,4).
- Native retry notices must never replay input or clear unknown outcomes (task 6).
- Memoization must not freeze changed actions or hide streaming/tool progress (task 7).

### Task 1: Per-chat reading continuity

**Files:** Create `src/ui/useTranscriptPosition.ts`, `scripts/transcript-position-smoke.mjs`; modify `src/ui/App.tsx`, relevant timeline wiring, package/CI smoke registration; add focused helper tests if pure state logic is extracted.
**Interfaces:** Hook owns project/task-keyed positions and follow state; returns `scrolledUp`, `onScroll`, `jumpToLatest` and an explicit navigation release for find/minimap. Existing App transcript ref remains stable.
- [ ] Add failing preview fixture for A→B→A restoration within 4px, small upward release during stream, explicit rearm, missing anchor and rapid navigation cancellation.
- [ ] Implement bounded 100-entry cache, anchor/fallback capture, layout restore and canceled bounded correction; remove array-identity-driven auto-scroll.
- [ ] Run fixture preview + `--desktop`, existing chat-navigation/timeline tests relevant to changed behavior; check keyboard/reduced-motion and resize/late-image cases.
- [ ] Record evidence in `docs/validation/2026-10-30-t3-reading.md`, update T301 roadmap row and commit.

### Task 2: Captured-history occurrence search

**Files:** Modify `src/controller/chat-history.mjs`, `src/controller/index.mjs`, `src/shared/types.ts`, `electron/preload.cjs`, bridge allowlists/preview bridge, `src/ui/ChatFind.tsx`, `src/ui/chat-find.css`; create `test/chat-history-find.test.mjs`, `scripts/chat-history-find-smoke.mjs`.
**Interfaces:** `findChatHistory({projectId,taskId,query,cursor?:{messageId,offset},direction:'next'|'previous'})` returns one bounded captured-text hit with message ID, absolute match offset/length, excerpt offset/text, coverage and wrapped boolean, or no-match. Validate project/task ownership; no total count required. Reuse latest-read sequencing.
- [ ] Add failing tests for repeated literal matches, backward/wrap, beyond 150 messages and 12k excerpt, Unicode/punctuation/case, wrong owner and invalid/stale cursor.
- [ ] Extend existing Ctrl+F UI with Visible/Saved history scope and compact safe-text hit reader. Preserve DOM formatted search; keep the selected message/occurrence through streaming refresh without jumping to the first result. Only explicit query/navigation changes reveal a result. Never load full history into App.
- [ ] Run focused controller tests, preview + Electron smoke with stale-result/chat-switch race, one active highlight and coverage labels. Measure fixed-fixture lookup latency without arbitrary benchmark claims.
- [ ] Document T302 evidence, register CI coverage, update roadmap and commit.

### Task 3: Recoverable saved prompts

**Files:** Create `src/controller/prompt-shelf.mjs`, `src/ui/PromptShelf.tsx`, `test/prompt-shelf.test.mjs`, `scripts/prompt-shelf-smoke.mjs`; modify controller/bridge/types/preview, `src/ui/useCodeDraft.ts`, `src/ui/ChatComposer.tsx`, `src/ui/App.tsx`, attachment retention ownership sites.
**Interfaces:** owner-keyed `listSavedPrompts`, `parkCodeDraft` and `restoreSavedPrompt` plus explicit removal. Atomic current/shelf swap; use a current-draft revision/digest expectation to reject racing edits instead of overwriting. Existing `CodeDraft` fields remain the payload. Bound 20 per project/chat, no eviction.
- [ ] Failing SQLite/controller tests: restart, full shelf, storage rollback, occupied swap, wrong owner/missing image/source, concurrent draft edit and deletion retention.
- [ ] Implement atomic storage and compact Add-menu entry; pending uploads/recent-context capsule block park with clear feedback. Restore UI only updates current owner after acknowledged success.
- [ ] Fence all owner draft mutations from pending-save drain through acknowledgement using a per-owner generation; reconcile returned state without a blind save. Test delayed replies against typing, programmatic quote/file/image completion, send/queue, second shelf operation and navigation. Keep controller draft mirror and SQLite rollback consistent.
- [ ] Integrate owner lifecycle: migrate text-only shelf entries on chat move; reject attachment-bearing moves without loss; retain on archive/restore; cascade on permanent deletion/archive expiry. Test restart and wrong-project reads after migration, reference release and rollback.
- [ ] Preview/Electron tests text+image/mode save/restore, occupied swap, reload durability, keyboard/narrow view and counted no-send boundary. Existing draft save/send/navigation behavior must pass.
- [ ] Record T303 evidence, register CI, update roadmap and commit.

### Task 4: Direct response quotes

**Files:** Create `src/shared/response-quote.mjs`, `test/response-quote.test.mjs`, `scripts/response-quote-smoke.mjs`; modify `src/ui/ResponseActions.tsx`, `src/ui/App.tsx`, draft integration/source-reader UI as needed.
**Interfaces:** Pure bounded attributed text builder; Quote callback carries captured task/message identity and displayed selection. Reuse `appendDraftText` and existing history read for source display. No new generalized context format or native API.
- [ ] Failing tests for exact selection/full reply, quote escaping, combined 16k rejection without loss, emoji and source attribution.
- [ ] Implement Quote button and source inspection for one settled assistant reply; reject selection crossing replies or changed destination. Draft remains ordinary durable text through queue/restart. Source-reader missing/changed state never changes quote.
- [ ] Preview/Electron smoke selection in code/list/link, keyboard whole-reply fallback, existing text preservation, streaming rejection, chat-switch race and no automatic send.
- [ ] Record T304 evidence, register CI, update roadmap and commit.

### Task 5: Keyboard workspace focus

**Files:** Create `src/ui/useWorkspaceFocus.ts`, `scripts/workspace-focus-smoke.mjs`; modify `src/ui/App.tsx`, `src/ui/ChatSidebar.tsx`, shortcut help and focused CSS as needed.
**Interfaces:** area attributes and one Code-only focus hook; no controller action/API. Existing project disclosure and chat rename/activate handlers remain authoritative.
- [ ] Failing preview fixture: F6 forward/back wrap, Ctrl+F6, hidden areas skipped, focus memory, modal/menu/slash boundaries, no reading-position change.
- [ ] Implement focus areas, sidebar Up/Down/Home/End and F2 using existing rename. Preserve Enter, context menu, Alt+Shift reorder and ordinary Tab access.
- [ ] Run preview/Electron keyboard fixture, existing sidebar reorder tests, narrow/collapsed layout and delayed state update focus checks.
- [ ] Record T305 evidence, register CI, update roadmap and commit.

### Task 6: Native retry observations

**Files:** Modify `reference/patchlight/adapter/session-adapter.mjs` and existing event/projection modules, `src/runtime/index.mjs`, shared runtime types and status UI; create focused adapter/runtime tests and `scripts/native-retry-smoke.mjs`.
**Interfaces:** bounded current-turn retry metadata from SDK 1.4.14 `turn/modelRetryScheduled` and `turn/retryScheduled`; no command or retry scheduler. Follow current exact identity/cursor/source gates; retain counts/delay only, not raw error strings.
- [ ] Read installed SDK declaration and existing adapter ownership rules; add failing fake-port tests for valid notices, foreign/malformed/stale/duplicate/conflicting events, clear on progress/terminal/disconnect.
- [ ] Implement read-only projection/status with unknown remaining delay handled honestly. Never admit queue work, resend or change native status to terminal merely for retry.
- [ ] Run focused adapter/runtime tests and preview/Electron notice fixtures, assert fake native call counts unchanged; no live provider test.
- [ ] Record source/fixture versus unverified live-host boundary, T306 roadmap, CI registration and commit.

### Task 7: Measured transcript render containment

**Files:** Modify `src/ui/App.tsx`; create a focused transcript/row component only if baseline proves redundant work, and `scripts/transcript-render-smoke.mjs`; reuse responsiveness fixtures.
**Interfaces:** stable message identity plus current callbacks; preserve tasks 1–5. No new state library/transport/virtualization. Fixture-only instrumentation must not export personal content.
- [ ] Measure baseline row/render work while typing a fixed prompt in a 150-message fixture; retain exact fixture/input and timings.
- [ ] Introduce the smallest memo boundary avoiding unchanged transcript work, with current callback semantics. If no meaningful reducible work exists, retain baseline and record why.
- [ ] Compare same fixture after, verify streaming/tool progress/selection/quote/find/scroll and callback freshness on preview/Electron; report counts versus timings distinctly.
- [ ] Remove the known unmeasured `providerRequests:0` field from `scripts/project-mcp-smoke.mjs` as evidence housekeeping; retain assertions and qualify any output claim. Register relevant CI, document T307, update roadmap and commit.

## Final delivery

- [ ] Independent whole-range review and one consolidated fix wave if required.
- [ ] Required local build/focused tests and exact latest required GitHub CI groups pass.
- [ ] Hash-verify published Windows x64 installer, fresh native/SQLite idle preflight, complete profile backup, graceful close, install and reopen.
- [ ] Verify installed version/commit and requested controls using native MCP or isolated exact-ASAR fixtures, explicitly distinguishing fixture and personal UI proof. Preserve evidence and disclose remaining external prerequisites.
