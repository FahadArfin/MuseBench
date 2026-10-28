# Motion refinement implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Smooth the remaining abrupt disclosure and selection transitions without adding navigation latency.

**Architecture:** Extend existing `MotionDisclosure`, native details CSS and navigation-only `useSurfaceMotion`; introduce a small shared Chat/Work selector with cancellable indicator motion.

**Tech Stack:** React, CSS, Web Animations, existing Playwright/Electron test harness.

**Spec:** `docs/superpowers/specs/2026-10-28-motion-refinement-design.md`

## Global constraints

- Shared preview/desktop renderer; no new dependencies or paid/provider requests.
- No streamed-token animation or native-browser transform/size animation.
- Respect app and OS reduced motion, including in-flight changes.
- Keep large closed content lazy; navigation, focus and drafts remain immediate.

## Review focus

- Reversing while content is being mounted/unmounted must settle at the correct height.
- Closing focused details must not leave focus inside invisible content.
- Hidden workspace switch instances must not animate from stale selection on reveal.
- Long tool output and thousands of diff lines must release their DOM after closing.
- Native details transitions must not affect positioned editor menus or escape reduced motion.

### Task 1: Complete and verify shared motion refinement

**Files:** `src/ui/WorkActivity.tsx`, `WorkspacePanels.tsx`, `motion.css`, `work-activity.css`, `WorkModeSwitch.tsx`, `work-mode.css`, `App.tsx`, `brand.css`; `scripts/motion-refinement-checks.mjs`, `scripts/motion-smoke.mjs`; validation documentation.

**Interfaces:** Reuse `MotionDisclosure` and `animateMotion(element, keyframes, options)`. New `WorkModeSwitch({mode, onChange})` replaces inline controls, keeping existing accessible names and pressed state. Export `checkMotionRefinements({page, pass, report, shot})` for both motion runners.

- [x] Add renderer checks for intermediate activity/diff/native-details heights, file-list expansion, keyboard semantics/focus, rapid reversals, reduced motion, DOM release, indicator alignment, and Sub-Agent navigation fade.
- [x] Run `node scripts/motion-smoke.mjs`; observe a genuine missing-interpolation failure before changes.
- [x] Implement the shared transitions with unchanged final layout and accessible names. Native details enhancement uses a support query and excludes `.diff-editor-menu`.
- [x] Run `npm run build`, `npm run test:motion`, `npm test`, startup, responsiveness, browser-preview and preview-parity checks. Expected: all required checks pass, with no page errors or data/draft regression.
- [x] Capture and inspect representative current UI states; document what changed and what remains intentionally immediate.
- [x] Obtain a fresh final code review and resolve material findings with reproductions.

Delivery follows this validated feature commit: push main, verify terminal CI/release, hash-check and install its exact artifact, then reopen and inspect desktop controls while preserving the real profile. Delivery evidence and completion are tracked in `artifacts/motion-refinement/` without making a second documentation-only release.
