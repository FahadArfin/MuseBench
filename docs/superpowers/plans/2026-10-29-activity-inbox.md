# Persistent Activity inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep observed Code completions and attention events discoverable after runs and app restarts.

**Architecture:** A bounded SQLite metadata store receives events directly from owned runtime/check transitions. The existing Activity menu consumes its cached projection with Running and Recent tabs; browser preview supplies labeled samples.

**Tech Stack:** Existing Node SQLite, Electron, React/TypeScript, node:test and Playwright; no dependencies.

**Spec:** docs/superpowers/specs/2026-10-29-activity-inbox-design.md

## Global Constraints

- At most 200 events / 30 days; metadata only; no historical backfill or new model requests.
- Completion requires owned native turn and confirmed cleanup; OS delivery never determines outcome.
- Exact event IDs for read mutations; exact task for navigation; mark read after navigation succeeds.
- Shared preview/desktop UI, preserve active controls/drafts, no account or security setting changes.
- One reviewed finished-feature commit/push, with installed acceptance separately verified.

## Review Focus

- Rapid duplicate snapshots and repeated questions must not flood history; distinct pending IDs must remain distinct.
- Unconfirmed cleanup and mismatched native turns must never create completion events.
- Deletion and rollback must not leave cached events or break an enclosing transaction.
- An arrival during Mark all read must remain unread; a failed navigation must not consume its event.
- Restart, old timestamps and large histories must remain bounded without transcript work on streaming snapshots.

### Task 1: Durable metadata and controller observation

**Files:** Create `src/controller/activity-inbox.mjs`, `src/shared/activity-inbox.mjs` and declarations, `test/activity-inbox.test.mjs`; modify `src/controller/index.mjs`, `electron/security.mjs`, `src/shared/types.ts`, `test/work-activity.test.mjs`.

**Interfaces:** `createActivityInbox(db,{clock?})` exposes `record(taskId,{source,sourceId,kind,identity?,at?},persistSource?)`, `recordMany(taskId,events,persistSource)`, `list()`, `setRead(ids,read)`, `deleteTask(taskId)`, `refresh()`, `prune()`. Stored rows contain `id,taskId,source,sourceId,kind,at,readAt`. `validateActivityRead(action)` validates `{type:'setActivityRead',ids:string[],read:boolean}` with 1–200 bounded IDs and no extra fields. `AppState.activityInbox` adds current `title,projectName` to the rows.

- [x] Write and run store tests RED: dedupe and distinct identity; 200/30-day retention; read state/restart; source-write rollback; deletion/rollback cache; privacy/invalid actions.
- [x] Implement the store with savepoints and cached bounded rows. Run `node --test test/activity-inbox.test.mjs`; expect all pass.
- [x] Write controller tests RED in `test/work-activity.test.mjs` for selected/background owned completion, unconfirmed/mismatched completion, distinct input requests, checks, exact read IDs and restart without fake history.
- [x] Wire events only at existing runtime/check transition sites, source writes inside record savepoint, deletion cache refresh after commit/rollback, hourly pruning and action validation. Run `node --test test/activity-inbox.test.mjs test/work-activity.test.mjs`; expect all pass.

### Task 2: Compact shared inbox and feature acceptance

**Files:** Modify `src/ui/WorkActivityMenu.tsx`, `src/ui/App.tsx`, `src/ui/work-activity.css`, `src/preview/bridge.ts`, `scripts/work-activity-smoke.mjs`; add validation evidence and update roadmap.

**Interfaces:** Menu accepts `events:ActivityEvent[]` and `onRead(ids:string[],read:boolean):Promise<unknown>` alongside existing active rows/open/stop. App dispatches validated read changes; preview implements the same contract against sample state.

- [x] Extend component smoke RED for Recent rows, unread indicator, single and captured-ID bulk read changes, arriving-event preservation, exact navigation followed by read and navigation failure retention.
- [x] Implement shared tabs and compact historical rows. Keep existing focus, duplicate-action lock, Escape, active stop and draft protections. Run `npm run test:work-activity`; both engines must pass old and new cases including narrow/reduced-motion checks.
- [x] Run `npm test`, `npm run build`, relevant browser preview and C08 navigation regression checks; record exact outputs and privacy boundaries.
- [x] Independent whole-feature review against spec and diff; resolve material findings with regression tests. Update roadmap, validation and previous installed-release evidence.
- [ ] Commit/push the finished feature, then verify exact latest CI/release/installer before installed acceptance. Do not infer provider acceptance from fixtures.
