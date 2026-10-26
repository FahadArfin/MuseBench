# Harness foundations implementation plan

> Use superpowers:executing-plans to implement each feature in this session.

**Goal:** Deliver screenshots, useful skill discovery, managed worktrees and durable Code sessions, keeping desktop and preview shared.

**Architecture:** Extend the existing controller, native exec adapter and React components. Preserve saved chats and explicit runtime provenance. Store image bytes outside chat JSON; bind native sessions and worktrees to stable task identities.

**Tech stack:** Electron, React, TypeScript, Node, SQLite, Git and Muse Code 1.4.13.

**Spec:** [Approved research roadmap](../../MUSE-CLI-HARNESS-RESEARCH-2026-10-26.md).

## Constraints and review focus

- Preserve sandbox, approval, cleanup and completion checks. No implicit model request, merge or destructive worktree cleanup.
- Keep draft, queue, history and image references bound to their project; reject stale navigation and tampered assets.
- Skill listing is discovery, not proof of invocation; preserve activation and source diagnostics.
- Dirty source checkouts are not silently copied into worktrees. Retain worktrees until explicitly removed.
- Session migration must not replay duplicate history or bind another task to an existing session. Interrupted sessions require explicit recovery.
- Feature commits are checked and pushed separately, as authorized by the user.

## Feature 1 Screenshots

- [x] Test bounded image storage, reference validation, tampering and cross-project rejection in `test/code-images.test.mjs`.
- [x] Add `src/controller/code-images.mjs` and shared reference validation; expose import/read through controller and IPC.
- [x] Carry image references through drafts, queue, branching, messages and runtime send; pass validated native image paths to exec.
- [x] Add shared composer file input, paste/drop, thumbnails and removal, plus transcript images and preview bridge simulation.
- [x] Verify controller/runtime tests, build, browser smoke and desktop/preview parity; package shared renderer; commit and push.

## Feature 2 Skills

- [x] Test catalog normalization, diagnostics, source filtering and activation.
- [x] Improve `electron/command-info.mjs`, shared types and skill UI with curated installed skill shortcuts and transparent availability.
- [x] Match preview fixtures to shared UI; verify build and targeted tests; commit and push.

## Feature 3 Worktrees

- [ ] Test Git creation, branch/base validation, dirty source preservation and restart persistence in disposable repositories.
- [ ] Add a controller-owned Git worktree service, persist ownership and expose creation/list/open without automatic deletion or merge.
- [ ] Add shared project UI with current folder versus isolated worktree, explicit base/branch and retained worktree list; preview simulates state.
- [ ] Verify tests, build and parity; commit and push.

## Feature 4 Persistent sessions

- [ ] Validate the installed durable exec contract and model continuity in a disposable project; retain restricted permissions.
- [ ] Persist native session identity per task; send full bounded context only on initial migration and fresh context thereafter.
- [ ] Test restart, branching, failed/cancelled runs, workspace mismatch, late events and migration of existing chats.
- [ ] Expose session state and explicit recovery in shared UI with preview fixtures.
- [ ] Verify all tests, production build, browser/desktop parity and packaged source parity; commit and push.

## Execution ledger

- Ruling: proceed using the roadmap already approved in the user's implementation request; no repeated design approval.
- Ruling: implement in the current clean checkout so the existing local preview continues to represent the working sources; publish each completed feature to the configured GitHub repository.

- Screenshots: storage tests RED then GREEN; 609 tests passed, browser smoke passed, 22 parity scenes passed, package verified (73 files). Image input native arguments are covered by injected runtime tests; no live model image request made.

- Skills: three failing catalog assertions made GREEN; 10 targeted tests, browser interaction checks, 22 parity scenes and production build passed. Package matches source. Skill requests remain explicitly distinguished from confirmed loader execution.
