# Connection diagnostics implementation plan

> Use superpowers:executing-plans task by task.

**Goal:** Explain connection/setup readiness and preserve useful inventory during failed refreshes.

**Spec:** `docs/superpowers/specs/2026-10-29-connection-diagnostics-design.md`

### Task 1: Truthful diagnostic projections

- [x] Write and run failing tests for runtime/extension readiness and allowlisted copied reports.
- [x] Implement shared pure projections and compact connection/customize views.
- [x] Run focused tests and TypeScript build. Expected: all projected states remain factual and no secret-bearing inputs reach reports.

### Task 2: Stable session inventory

- [x] Make the shared smoke test fail for disappearing rows on pending/failed refresh.
- [x] Retain same-owner rows with explicit snapshot labels; invalidate changed/unavailable owners and late responses.
- [x] Browser and Electron smoke, controller inventory tests, build and relevant shared parity checks. Expected: one bounded read, no cross-session stale facts or raw errors.
- [x] Independent final review, resolve findings, write evidence, commit and push.

### Task 3: Published acceptance

- [ ] Verify exact release and installed application separately from fixture evidence.
