# Native Context Usage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline, one final review.

**Goal:** Display the native context usage facts that the pinned Muse contract already supplies.
**Architecture:** Strict shared normalization, admitted adapter projection, exact owning-chat persistence, existing composer and Session UI.
**Tech Stack:** Existing JavaScript/TypeScript, React, Electron and Node test runner; no dependencies.
**Spec:** docs/superpowers/specs/2026-10-30-native-context-usage-design.md

## Global Constraints
- No model requests, personal settings or permission changes; latest SDK remains pinned at 1.4.14.
- Native counts are last-reported occupancy floors; no invented denominator, zero, retention or exact live-size claim.
- One bounded reading per chat; saved/reconnected/foreign session data cannot become current without admitted native evidence.
- Shared preview and desktop, meaningful regression checks, one independent final review, push then exact verified Windows install.

## Review Focus
- Readings buffered during open/send, disconnect and replacement connections preserve exact ownership and provenance.
- Lower token counts after compaction and counts above the window retain truthful numbers without invalid visual ranges.
- Missing or malformed snapshot fields and provider omissions cannot resurrect a prior live reading.
- Cross-chat switching, deletion and interrupted database writes cannot transfer or downgrade recorded evidence.
- A context meter must never be confused with billing allowance, local prepared-request estimates or proof of retained messages.

### Task 1: Native reading projection and durable ownership
**Files:** src/shared/native-context-usage.mjs and .d.mts, reference/patchlight/adapter/session-adapter.mjs, src/runtime/index.mjs, src/controller/index.mjs, src/shared/types.ts; test/native-context-usage.test.mjs, test/runtime.test.mjs, test/harness-gaps.test.mjs and adapter tests.
**Interfaces:** `normalizeContextUsage(value,{sessionId,viewCursor,source,observedAt})` returns bounded reading or null; `restoreContextUsage(value)` marks valid saved data stale; `contextUsagePresentation(reading)` derives truthful label/meter. Runtime `contextUsage`; task `nativeContextUsage`.
- [ ] RED: normalization invalid/missing/zero/overflow/open-pressure tests; live/restore/duplicate/conflict/foreign/old-connection projection; exact chat, deletion and interrupted-write persistence.
- [ ] Implement admitted readings in adapter state, runtime current/stale state and exact owner persistence; keep unrelated command authority unchanged.
- [ ] GREEN focused normalizer, adapter, runtime and controller tests; commit.

### Task 2: Shared context display and acceptance
**Files:** src/ui/NativeContextUsage.tsx, App.tsx, SessionDialog.tsx, CompactionPanel.tsx, code-context.css; src/preview/bridge.ts; scripts/context-history-smoke.mjs or a focused extension; docs/CONTEXT-HISTORY.md, ROADMAP-2026-10-29.md, validation notes and the previous 0.2.210 receipt.
**Interfaces:** Admitted task reading plus runtime freshness; compact Context button and Session usage disclosure; explicit preview fixtures and installed executable support.
- [ ] RED shared browser/Electron checks for known/unknown window, saved/connected readings, over-window bounds, keyboard/narrow layout and chat changes.
- [ ] Implement shared UI and update inaccurate unavailable wording; extend the existing chats CI group without a new serial stage.
- [ ] GREEN shared scenarios, production build and full suite; commit.

### Task 3: Review and verified delivery
**Files:** focused corrections, review/validation and delivery receipts.
**Interfaces:** Immutable whole-branch review, exact published commit/installer, separate personal inspection and isolated installed fixtures.
- [ ] One independent final review; re-grade and fix material issues in one RED/GREEN correction pass, then full suite.
- [ ] Commit/push finished feature; require six Windows groups/package/publication; verify published manifest and installer hashes.
- [ ] Fresh idle preflight, complete profile backup, graceful install/reopen, native version/health and installed fixture acceptance; record remaining prerequisites honestly.
