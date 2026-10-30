# Local Code Schedules Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline, task by task, under the standing implementation authorization.

**Goal:** Explicitly enabled, bounded local Code schedules with durable run history and safe native ownership.
**Architecture:** Shared validation/time functions, a SQLite schedule ledger, controller-owned dispatch into independent runtime contexts and a compact Scheduled page. Existing native admission, receipts and cancellation remain authoritative.
**Tech Stack:** Existing JavaScript/TypeScript, React, Electron and node:sqlite; no new dependencies.
**Spec:** docs/superpowers/specs/2026-10-30-code-schedules-design.md
**Base:** 7e28580536b005f71290ba6463ad4c28bd79349b, codex/local-code-schedules in the existing attached isolated worktree.

## Global constraints

50 schedules; 100 total attempts each; 16,000-character prompts; optional fixed intervals from 15 minutes to 30 days; 15-second timer, 60-second lateness tolerance; standard/extended/deep budgets; no automatic actual provider test. Saving pauses; enablement requires exact revision and explicit confirmation. Preserve Windows x64 release policy and ignored evidence.

## Review focus

1. Sleep/restart or wall-clock jumps: skip missed occurrences and never replay an uncertain request (Task 1).
2. Approval, children or ambiguous cleanup: pause future runs and retain exact owned occurrence (Task 2).
3. Concurrent user navigation, draft edits, checkout writes and app close: never overwrite selection or send into a new owner (Task 2).
4. Edited/stale schedule or replaced project path: reject old enable/stop requests and revalidate before dispatch (Tasks 1–2).
5. Small displays, native keyboard form submission and stale async UI: clear review step and no accidental enablement (Task 3).

## Task 1: Validated schedules and durable ledger

Files: src/shared/code-schedules.mjs and .d.mts; src/controller/code-schedules.mjs; test/code-schedules.test.mjs.
Interfaces: validateScheduleSpec(input), validateScheduleAction(action), nextOccurrence(due, intervalMinutes, now); createCodeSchedules(db,{now}) exposes list/save/enable/pause/remove/due/claim/skip/attach/settle/recover, with exact revision guards and bounded history.

- [x] Write and observe failing tests for save-paused/explicit-enable, stale revisions, interval advancement, missed occurrences, no overlap, run limits, durable claims, restart uncertainty, retained chats and bounded history.
- [x] Implement shared validator and synchronous SQLite ledger; no provider calls in this layer.
- [x] Run node --test test/code-schedules.test.mjs. Expected: all pass.

## Task 2: Owned native scheduling

Files: src/controller/index.mjs; electron/security.mjs; src/shared/types.ts; test/code-schedule-controller.test.mjs.
Interfaces: controller.dispatch({type:'codeSchedule',...validated operation}); AppState.codeSchedules; trusted tickCodeSchedules() for injected clock tests, never renderer IPC. New independent context and task per occurrence; same sendToTask path with internal schedule ownership guard.

- [x] Write failing injected-runtime tests for actual admission/receipt association, selected chat and draft preservation, checkout overlap, approval/uncertainty pause, stop ownership, root replacement, per-run timeout, closing and restart without replay.
- [x] Integrate durable admission, runtime observation, timeout and timer cleanup; update blockers and internal-flag rejection.
- [x] Run both schedule suites and existing background chats/queue/controller tests. Expected: all pass, zero real provider calls.

## Task 3: Shared Scheduled UI, review and delivery

Files: src/ui/CodeSchedules.tsx and CSS; src/ui/App.tsx; src/preview/bridge.ts; shared types; scripts/code-schedules-smoke.mjs; CI suite inventory; guide/validation/roadmap docs.

- [x] Add a failing real-controller UI smoke for editor/review/enable/pause/history/stop and stale submissions, in Chromium and Electron.
- [x] Implement compact list, editor, explicit enable review, history and errors; visibly simulated browser samples with no timer/provider claim.
- [x] Run new UI checks, adjacent destination/navigation checks, full offline suite and production build. Expected: all required checks pass.
- [ ] Independent fresh whole-feature review; reproduce and fix material findings in one pass. Record any external acceptance prerequisites.
- [ ] Carry 0.2.187 installation evidence and prior import plan completion into tracked docs. Commit/push completed feature, verify exact release and idle work, install/reopen latest Windows artifact, retain profile and report installed versus fixture evidence accurately.
