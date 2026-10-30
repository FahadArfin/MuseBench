# Reviewed Project Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Save portable local project actions and run only the exact reviewed command with owned output/stop receipts.

**Architecture:** A bounded shared schema and controller file service supply reviewed definitions. Extend the existing check process owner rather than add a parallel executor. The shared Checks UI provides compact discovery, editing and review.

**Tech Stack:** Existing Node 22, Electron, TypeScript, React, SQLite and Playwright; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-30-project-actions-design.md`

## Global Constraints

- `.musebench/actions.json`, schema version 1, 64 KiB, 50 actions, 80-character name/ID, 4,000-character commands, 1–600 second timeout, default 120.
- Existing project-relative folders only; no traversal, symlinks or arbitrary command/cwd overrides in run actions.
- Per-run exact command/folder/shell review; no automatic execution or new model requests.
- Preserve profile/session data and existing package-check semantics. Preview never starts a process.

## Review Focus

- A repository changes between review and run/save: reject stale content and never execute the replacement.
- The user changes chats during inspection: late data cannot bind a command to the new owner.
- A command is stopped during navigation: persist output/stop receipt without clobbering a later run.
- An action and package script share a name: action success cannot satisfy validation.
- A missing, linked, oversized or malformed definition file: useful error, no overwrite or execution.

### Task 1: Definition service and owned execution

**Files:** Create `src/shared/project-actions.mjs`, `.d.mts`, `src/controller/project-actions.mjs`, `test/project-actions.test.mjs`, `test/project-action-controller.test.mjs`; modify controller, shared types, validation, Electron IPC/preload/security.

**Interfaces:** `validateProjectAction`, `validateProjectActionRequest`; `inspectProjectActions(root,{platform}) -> {root,platform,revision,actions}`; `saveProjectAction(root,{revision,definition},{platform})`; `resolveProjectAction(root,{revision,actionId},{platform})`. Controller bridge `inspectProjectActions({projectId,taskId})`; dispatch `saveProjectAction` and `runProjectAction` carry `projectId`, `taskId`, `revision` and definition/actionId. Inspection rows include command/folder/shell/supported plus portable definition. Check gains optional action metadata.

- [x] Write schema/service regressions for bounds, duplicate IDs, platform resolution, missing/malformed/linked files, cwd escapes and stale saves/runs. Run `node --test test/project-actions.test.mjs`; expected RED for missing behavior.
- [x] Implement bounded read/save/resolve without executing definitions. Run the same tests; expected all pass.
- [x] Write controller regressions for no auto-run, exact identity, real local output/exit, stop/timeout/restart receipts, duplicate starts, changed definitions and package-validation isolation. Run `node --test test/project-action-controller.test.mjs`; expected RED for missing behavior.
- [x] Extend the owned check runner and IPC contracts, preserving existing checks. Run both new files plus validation/work-activity/controller checks; expected zero failures.

### Task 2: Compact shared UI and release evidence

**Files:** Create `src/ui/ProjectActions.tsx`, `src/ui/project-actions.css`, `scripts/project-actions-smoke.mjs`; modify WorkspacePanels, preview bridge, package scripts and CI; add user documentation and validation receipt.

**Interfaces:** Consumes Task 1 bridge/action types. `ProjectActions({state,busy,act})` shows action discovery, edit form and exact review; output uses existing check terminal.

- [x] Add browser/Electron fixture for explicit review/run, save without run, failed run/save, stale inspection across chats, duplicate lock, unsupported platform and 390px layout. Run `node scripts/project-actions-smoke.mjs`; expected RED until UI exists.
- [x] Implement UI and fixture-only preview behavior. Run `npm run test:project-actions`; expected both engines pass.
- [x] Run `npm test`, `npm run build`, `npm run test:work-activity`, `npm run test:browser-preview`, `git diff --check`; expected zero failures, document any existing advisory/skip.
- [x] Obtain one fresh independent whole-feature review and fix material findings with RED→GREEN plus full suite. Record limitations without provider claims.
- [x] Update roadmap/validation, commit, fast-forward clean main and push under the user's standing authorization. Verify exact latest published release separately before installing.
