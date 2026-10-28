# Subscription Resets Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this small change inline, then review it independently.

**Goal:** Show truthful subscription reset timing and refresh usage at the provider deadline.

**Architecture:** Pure reset projections and refresh scheduling feed a shared renderer section. The existing account usage hook continues to own reads and source changes. No mutation API is added.

**Tech Stack:** React, TypeScript, Electron, Node tests, existing Playwright billing checks.

**Spec:** docs/superpowers/specs/2026-10-28-usage-resets-design.md

## Global Constraints

- Only provider observations change allowance; no invented banked credits or use/claim success.
- API and unknown sources do not display subscription reset counters.
- Preview and desktop share UI; test data is isolated from real billing.

## Review Focus

- Past/invalid dates must not invent capacity or spin a request loop.
- Switching accounts or billing source must discard obsolete reads and timers.
- An unavailable provider must leave the user with an accurate state and a retry action.
- Paused/background windows must refresh on focus without overlapping reads.
- Preview sample dates must not drift forward each time they are fetched.

## Task 1: Reset section and scheduling

**Files:** Create src/shared/usage-resets.mjs and declarations, src/ui/UsageResets.tsx, test/usage-resets.test.mjs. Modify src/ui/AccountUsage.tsx, src/ui/account-usage.css, src/preview/bridge.ts and scripts/billing-smoke.mjs.

- [x] Test projections for future, past, absent and malformed dates, API/unknown source, and preservation of reported percentages.
- [x] Test bounded scheduling before/after deadlines and sub-minute/day countdown formatting; run the tests and confirm the missing implementation fails.
- [x] Implement pure projections, the shared compact section and the deadline-aware usage refresh hook.
- [x] Add fixed sample reset timestamps to preview and desktop fixtures. Exercise stale observations, automatic deadline refresh, unavailable data, source changes and no claim/use controls in both surfaces.
- [x] Run the focused tests, build, unit suite, billing preview/desktop, browser regression and parity checks. Inspect the screenshot and review the diff.
- [ ] Commit and push the completed feature; verify exact-commit CI and installer publication.

## Execution record

Base: 8052fb22c8d5f5553edc959418787bc04855f32a.
Implementation choice: expose scheduled reset tracking; banked claim/use remains blocked by absent provider support. No local refill workaround can change Meta's actual allowance.

Task 1 validation: tests first failed because the new reset module was absent, then all five passed after implementation. Full unit suite: 1,084 passed. Preview billing: 12 checks. Desktop billing: 14 checks. Build, browser regression and parity passed. Independent review found no blockers. See docs/VALIDATION-usage-resets.md.
