# Responsive chat navigation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Avoid repeated sidebar rendering and overlapping search/context preparation while preserving exact chat ownership and existing interactions.

**Architecture:** A memoized sidebar uses committed event delegates and shared pure grouping/equality helpers. A dependency-free latest-read scheduler, wrapped by a React hook, debounces input changes and serializes read-only bridge requests.

**Tech Stack:** Existing React 19.3.1, TypeScript, Node tests, Playwright Chromium/Electron; no dependency changes.

**Spec:** `docs/superpowers/specs/2026-10-29-chat-navigation-design.md`.

## Global constraints

- Retain layout, drag/drop, keyboard reorder, menu anchors, active chat and unsent drafts.
- Debounce input changes by 150 ms; initial, owner and refresh changes use 0 ms.
- One active read and one newest pending read per mounted surface; admitted IPC cannot be cancelled.
- Clear old-owner context immediately; retain same-owner data with an explicit pending state.
- No provider requests, account changes, new dependencies or user profile writes in tests.
- Source acceptance, published release and installed acceptance are separate evidence.

## Review focus

- New callbacks with unchanged visual props must still target their current owner (Task 1 fixture).
- Equivalent cloned snapshots must preserve menu focus and anchors (Task 1 fixture).
- Busy flags and a selected chat moving projects must update the sidebar (Task 1 fixture).
- An old read resolving or rejecting after a new owner must not repaint old context (Task 2 queue/UI checks).
- Closing during a read must suppress queued requests and completion callbacks (Task 2 queue/UI checks).

### Task 1: Isolate sidebar work

**Files:** Create `src/shared/sidebar-model.mjs`, its `.d.mts`, `test/sidebar-model.test.mjs` and `scripts/chat-navigation-smoke.mjs`; modify `src/ui/ChatSidebar.tsx`.

**Interfaces:** `sidebarCollections(projects, tasks, orders)` returns ordered projects, project chat Map, pinned and recents; `sameSidebarData(previous, next)` compares primitive task/project data and order arrays. `ChatSidebar` keeps its existing public Props.

- [x] Add deterministic collection tests for ordering, archived filtering and one membership read per task; capture the current 1,000-chat renderer baseline and failing no-work-on-draft assertion.
- [x] Add pure grouping and equality helpers; wrap the existing sidebar with memoization and layout-effect-updated delegates. Memoize grouped lists for local drag/menu state updates.
- [x] Verify latest callbacks, cloned snapshot menu/focus identity, genuine field changes, busy state, selected-project expansion, keyboard reorder and drag ownership in the real component fixture.
- [x] Run `node --test test/sidebar-model.test.mjs test/sidebar-order.test.mjs`; run the fixture in Chromium and Electron. Retain baseline and after measurements.

### Task 2: Coalesce reads without stale ownership

**Files:** Create `src/shared/latest-read.mjs`, its `.d.mts`, `test/latest-read.test.mjs`, `src/ui/useLatestRead.ts`; modify `src/ui/ChatLibrary.tsx`, `src/ui/CodeContext.tsx`, the shared fixture, package scripts and both Windows validation workflows.

**Interfaces:** `createLatestReadQueue({setTimer?,clearTimer?,now?})` exposes `schedule({read,onValue,onError,delay}) -> cancel`. `useLatestRead<T>({owner,key,revision,read})` returns `{value,error,pending}`. The hook accepts the exact request closure for the committed input and uses 150 ms only for ordinary input changes.

- [x] Write and run failing queue tests for newest-only pending reads, no overlap, stale success/error, cancellation, synchronous throw and subsequent recovery. Add failing real-component burst/owner-switch checks.
- [x] Implement the scheduler and adapter; integrate search and context. Show searching/loading state, hide mismatched owner data, and reset project-bound editor/preview state when its owner changes.
- [x] Verify search bursts coalesce, old results/errors do not win, owner changes clear context immediately, refresh runs without typing delay, and unmount prevents the deferred follow-up.
- [x] Run queue/sidebar tests, the shared fixture in both engines, `npm run build`, existing Code responsiveness, sidebar drag and chat organization checks, and the full unit suite.

### Task 3: Review and deliver

**Files:** Add validation evidence, update C08 in the roadmap and retain the installed 0.2.178 receipt separately from new source evidence.

- [x] Inspect the final diff and request an independent whole-feature review; resolve material findings with focused red/green checks.
- [ ] Commit the complete feature, fast-forward authorized main after checking for intervening work, and push. Verify shared preview before claiming its availability.
- [ ] Track the exact new commit through validation/release, verify the published installer and safely install/reopen it when idle. Keep any unavailable provider acceptance explicitly pending.
