# Background Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Keep owned work available with no window when explicitly enabled, with safe reopen/quit/update behavior.

**Architecture:** Main process owns persistent services; disposable windows attach renderer IPC and personal browser surfaces. A small lifecycle module owns the background preference and tray, with one authenticated native gateway across window changes.

**Tech Stack:** Existing Electron, Node, React/TypeScript and Playwright. No new dependencies.

**Spec:** docs/superpowers/specs/2026-10-30-background-engine-design.md

## Global Constraints
- Default off; no account/security changes or paid model calls.
- Preserve profile, sessions, source identifiers and existing native/mobile authentication.
- No request replay or duplicate controller on reopen; actual UI destruction, not a hidden shell.
- Use current isolated worktree and one final independent review; retain evidence.

## Review Focus
- Concurrent reopen calls and close during loading must not create duplicate windows/IPC handlers (Task 2 lifecycle smoke).
- Background activity/queued work/uncertain cleanup must block quit and update (Task 1 guards and Task 2 integration).
- Tray or preference-write failure must not strand a headless app (Task 1 rollback tests).
- Old window callbacks must not dispose new services or leak listeners (Task 2 repeated reopen smoke).
- Fresh process after an update must restore the preference without replaying work (Task 2 isolated restart smoke).

### Task 1: Owned lifecycle and background native projection
**Files:** electron/background-engine.mjs, electron/native-control-service.mjs, test/background-engine.test.mjs, test/native-control.test.mjs.
**Interfaces:** createBackgroundEngine({dataDir,createTray,openWindow,quit,isBusy,onBlocked}) exposes snapshot(), command({type:'status'|'set',enabled?}), windowClosed(), beforeQuit(event), close(). A stable native router delegates UI calls only to an attached view, and reads controller state without one.
- [x] Write failing tests for default/persisted settings, serialized mutation/rollback, tray-open/quit, active work guards and read-only native behavior with no window.
- [x] Run `node --test test/background-engine.test.mjs test/native-control.test.mjs` and observe RED.
- [x] Implement the bounded lifecycle and native projection. No new public execution methods.
- [x] Run the same tests, expect all PASS, then commit.

### Task 2: Disposable desktop windows and shared setting
**Files:** electron/main.mjs, electron/preload.cjs, electron/personal.mjs, src/shared/types.ts, src/preview/bridge.ts, src/ui/BackgroundSettings.tsx, src/ui/Preferences.tsx, scripts/background-engine-smoke.mjs, scripts/run-ci-suite.mjs, package.json, .github/workflows/windows-checks.yml, docs/BACKGROUND-ENGINE.md.
**Interfaces:** MuseBenchBridge.backgroundEngine({type:'status'|'set',enabled?}) returns {enabled,running,windowOpen,simulation?}. Main attaches exactly one window; closes UI listeners/handlers on disposal while existing controller/mobile/native owners persist.
- [x] Add real-Electron smoke for setting defaults, actual window disposal, repeated/concurrent reopen, profile preference persistence, stable native owner and safe quit; use disposable profile and zero provider calls. Add shared settings UI checks.
- [x] Run `npm run test:background-engine` and observe RED against the missing feature.
- [x] Refactor owner/window boundaries and add the compact setting; preserve existing window security and update guards. Wire CI and docs, including 0.2.199 installed acceptance from retained evidence.
- [x] Run targeted lifecycle/native/update/personal tests, shared smoke, `npm test` and `npm run build`; expect PASS then commit.

### Task 3: Review and verified delivery
**Files:** docs/ROADMAP-2026-10-29.md, docs/validation/2026-10-30-background-engine.md and focused corrections if required.
**Interfaces:** Exact-source published release, manifest/hash validation and native installed proof, distinct from fixtures.
- [ ] Request one fresh whole-branch review. Re-grade findings; fix Important/Critical in one test-driven pass; record/defer Minor.
- [ ] Run full suite/build and relevant UI smokes, update roadmap/evidence, commit and push authorized main.
- [ ] Wait for exact-source Windows checks/publication. Verify installer against release manifest and hashes, confirm idle state, back up profile, gracefully install and reopen.
- [ ] Verify installed version/settings through native MCP. Keep personal background preference unchanged. Record exact delivery evidence.
