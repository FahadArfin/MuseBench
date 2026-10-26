# Harness gaps implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task. Steps use checkbox syntax for tracking.

**Goal:** Implement all seven recommended additions in FEATURE-GAP-RESEARCH.md.
**Architecture:** Extend the existing controller with bounded context composition, source selection, persisted drafts/queues and reversible task metadata. Use focused UI components for context and chat library. Keep native exec and sandbox verification.
**Tech Stack:** Electron, React, TypeScript, Node SQLite; no additional dependencies.
**Spec:** ../../FEATURE-GAP-RESEARCH.md

## Constraints

- Preserve existing login partitions, profiles, tasks and approval/sandbox behavior.
- Do not auto-retry failed operations, execute queued work on restart, or restore files when branching.
- Source reads retain existing credential, symlink and size protections.
- No Git repository is present; retain a local source backup rather than inventing a branch.

## Review focus

1. Cross-project context/draft leakage and stale IPC operations.
2. Queue execution after cancellation, failure, uncertain cleanup or restart.
3. Prompt-file lifetime on spawn failure/cancellation and command-line limits.
4. Changed/deleted/secret/symlink attachment files.
5. Fork history semantics and reversible archived record persistence.

## Tasks

- [x] 1. Write failing integration tests for generic project folders, project instructions, context replay/omissions, attachment revisions and limits. Implement `src/shared/chat-context.mjs`, controller queries/actions and runtime prompt-file support. Test meaningful native transport invariants.
- [x] 2. Write failing tests for persisted drafts, queue serialization/pause/restart, branch/retry preparation and pin/archive/full-text search. Implement controller actions and trusted IPC validation; run targeted and regression tests.
- [x] 3. Build `CodeContext.tsx`, `ChatLibrary.tsx`, queue/draft UI and thread actions; wire composer, sidebar and project overview. Preserve existing visual tokens and keyboard behavior. Validate with TypeScript and an Electron smoke test.
- [x] 4. Run all relevant tests, inspect screenshots, independent code review, fix findings, build/package and verify exact packaged files. Reopen normal app preserving its profile.

## Execution ledger

- Research complete; seven additions selected. User explicitly requested implementing the recommendations, so implementation proceeds without another approval step.

- Completed all seven additions with no new dependencies. Baseline backup: `artifacts/harness-gaps-baseline`.
- Independent review found draft-target, outcome-retention and queue shutdown/hold edge cases. Each was corrected; final bounded review had no remaining findings.
- Fresh full unit/regression suite: 558/558. Feature controller tests: 21/21. TypeScript, Vite and Windows packaging passed.
- Electron source and packaged smoke paths passed, alongside navigation/keyboard and slash-command regressions. Two real Muse turns verified attachment prompt-file transport, queued follow-up and recalled source context with the sandbox enabled.
- Packaged verification: 57 source/build files plus both native helpers match. See `docs/FEATURE-GAP-VALIDATION.md` for exact evidence and limitations.
