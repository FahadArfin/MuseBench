# Active workflow child restart implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make MuseBench's workflow restart control use the supported current running attempt and prove actual native attempt progression.

**Architecture:** Reuse the shared child eligibility policy, native tracker/runtime dispatch and command receipts. Extend the isolated native acceptance runner and shared renderer fixture to exercise the same identities and transitions. This is one coupled feature task; the parent owns independent whole-feature review and delivery.

**Tech Stack:** JavaScript/TypeScript, React, Electron 45, Node tests/Playwright, pinned Muse SDK/host 1.4.14, existing scripted loopback native runner.

**Spec:** `docs/superpowers/specs/2026-10-30-child-restart-design.md`

## Global constraints

- Native wire action remains `retry`; visible label is **Restart attempt**.
- Exactly one explicit command per user action; no uncertain-outcome replay.
- Real native evidence requires a later observed attempt, not just acknowledgment.
- No personal settings/grants/auth changes or model inference. Temporary fixture ownership, finite budgets and confirmed cleanup remain mandatory.
- Keep desktop and browser preview on the same shared implementation.
- Do not commit ignored artifacts, credentials or machine-specific profile data. Do not push or install from the implementer worktree; parent owns those gates.

## Review focus

1. A terminal parent containing an older active child cannot authorize restarting that child.
2. A retained earlier attempt cannot become the target after a newer attempt appears.
3. Restart acknowledgment without attempt progression must not display a restarted/completed result.
4. Unknown dispatch outcomes must not unlock another restart or lose ownership.
5. Keyboard selection, compact layout and a long-running fixture must not hide Skip or accidentally issue two commands.

## Task 1: Correct active-attempt restart end to end

**Files:**
- Modify `src/shared/child-actions.mjs`, `src/runtime/children.mjs` only as required by exact ownership/parent-state validation.
- Modify `src/ui/NativeChildrenPanel.tsx`, `src/preview/bridge.ts` or the actual existing preview state file as located, without duplicating policy.
- Modify `scripts/native-child-contract.mjs`, `test/native-children.test.mjs`, relevant `test/runtime.test.mjs` cases.
- Modify `scripts/preview-parity.mjs` and/or add a focused `scripts/child-restart-smoke.mjs`, wired into the existing native CI group when adding a new smoke.
- Add `docs/validation/2026-10-30-child-restart.md`; update the original native contract report and roadmap/inventory with clearly dated superseding evidence.

**Interfaces:**
- Consume `childActions(item)`, `CHILD_ACTION_LABELS`, `createChildTracker().prepare(input)` and existing `runtime.childControl`.
- Preserve `{workflowRunId, childId, attempt, action:'retry'}` on the native wire and the existing durable command-receipt representation.
- Produce bounded native receipts showing exact workflow/child identities and attempt progression, plus shared browser/Electron control evidence.

- [ ] Write and run failing tests for active restart eligibility, terminal absence and terminal-parent protection. Existing terminal-retry expectations must not be relabeled into passing assertions without demonstrating the defect.
- [ ] Extend the scripted native controls scenario to keep two children active, restart one exact observed attempt once, observe its subsequent attempt, and keep unrelated child ownership intact. Update the obsolete terminal-retry interpretation. Retain explicit refusal of invalid CLI arguments and negative-proof checks; no live inference.
- [ ] Make the smallest shared policy/label/guard correction consistent with the observed host. Preserve once-only dispatch and stale revision/attempt checks. Run `node --test test/native-children.test.mjs test/child-inspection.test.mjs test/runtime.test.mjs` and `node scripts/native-child-contract.mjs --local-fixture`.
- [ ] Add meaningful rendered checks for active Restart/Skip selection, terminal absence, attempt-2 display, stale attempts, pending/unknown blocking and keyboard/narrow layout. Use source browser and Electron fixtures with no personal profile/network/provider calls. Update parity selectors and sample behavior where the changed contract invalidates them.
- [ ] Run focused tests, production build, affected shared UI/parity checks, then the full `npm.cmd test` once. Rerun only affected checks after subsequent edits. Capture exact commands/results and evidence hashes in the ignored report.
- [ ] Update documentation to distinguish the earlier invalid terminal target from verified active restart. Run `git diff --check`, self-review, commit the feature and report exact commit/tree to parent. Keep all source/evidence fixed for independent review.

## Parent completion

Parent reviews the immutable full feature diff independently, resolves findings in one consolidated fix wave if needed, verifies integrated source, pushes each finished feature, waits for exact CI/publication, verifies installer hashes, checks fresh idle status, backs up the profile, gracefully installs/reopens and verifies the installed version/controls. No personal model call is part of acceptance.
