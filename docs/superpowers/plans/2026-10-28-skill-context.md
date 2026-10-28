# Skill Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expose native skill context estimates and loader diagnostics in Customize.

**Architecture:** A bounded pure metadata projection feeds the existing main-process Customize snapshot. A small React inspector presents aggregate and per-skill observations in the shared renderer.

**Tech Stack:** JavaScript, TypeScript, React, Node test runner, Playwright/Electron.

**Spec:** docs/superpowers/specs/2026-10-28-skill-context-design.md

## Constraints and review focus

No model calls, imports, permissions or profile mutations. Estimates are not billing or live context occupancy. Missing/partial/malformed/overflow data must stay visibly uncertain. Global totals must survive search, exact-item navigation and failed refreshes. Retain activity guards and project review. Check keyboard and narrow-screen disclosure behavior.

## Task 1

- [x] Add failing metadata/aggregation tests and a Customize service regression showing dropped costs and diagnostics.
- [x] Implement src/shared/skill-context.mjs/declarations, extend CustomizeState and preserve native metadata through electron/customize.mjs.
- [x] Add compact shared SkillContext UI, simulated preview metadata and browser/Electron coverage for filtering, activation refresh, diagnostics and responsive layout.
- [x] Run focused tests, production build, full suite and catalog/parity regressions; inspect screenshots and obtain one independent review.
- [ ] Commit/push, verify exact-head validation/release, and synchronize the desktop.

## Execution record

Base: c02cf5f91dcc171881a5d07f71abb6f9df5bfd5d. Existing main checkout is clean and owns the live preview. Ruling: continue in this checkout under the user's continuing feature-by-feature implementation/publication authorization; no concurrent implementers. The prior motion feature is already released in 0.2.114, now installed and reopened through the verified in-app updater.

Independent review identified lost observations after refresh failure. Added same-context cache retention with visible staleness, invalidation on project/trust/CLI changes, fresh-only activation validation, and success/failure/recovery tests. See docs/VALIDATION-skill-context.md for current evidence. Exact-head CI and installation are verified after publication; they are not inferred from local checks.
