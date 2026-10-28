# App Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make navigation and disclosure motion consistent, responsive and accessible throughout MuseBench.

**Architecture:** Shared CSS motion tokens and a small reversible disclosure component; a cancellable, compositor-only surface fade keyed to navigation identity. Central reduced-motion policy handles CSS, scripted fades and scroll actions. Both application entry points use the same implementation.

**Tech Stack:** React, TypeScript, CSS grid transitions, Web Animations API, Electron, Playwright.

**Spec:** docs/superpowers/specs/2026-10-28-app-motion-design.md

## Global constraints

Preserve existing startup/typewriter cadence, native browser bounds, drafts, scroll anchoring and streaming performance. No provider/model calls or real-profile changes. No new dependencies. Existing user authorization covers implementation and GitHub publication.

## Review focus

- Rapid collapse/reopen leaves focus in a visible control and no stale animation.
- App or OS reduced motion cancels in-flight transitions and delayed typing.
- Navigation updates do not remount editors or replay on token streaming.
- Hidden/native views retain correct measurement; menus stay viewport positioned.
- Large and empty sidebar groups, narrow/light windows remain usable.

## Tasks

- [x] Capture baseline screens and real motion samples in scripts/motion-smoke.mjs; demonstrate missing interpolation before changing product code.
- [x] Add MotionDisclosure.tsx, motion.mjs/types, useSurfaceMotion.ts and motion.css; integrate sidebar disclosures, shared renderer bootstrap, menus/dialogs and navigation identities.
- [x] Exercise real preview and Electron frames, fast reversal, focused collapse, reduced-motion changes, tab/menu/dialog motion, retained drafts and responsive layouts. Add CI coverage.
- [x] Run unit suite/build plus startup, navigation-cache, Code responsiveness and preview/desktop parity regressions. Inspect saved screenshots.
- [x] Obtain one independent final review, resolve actionable findings and document results.
- [ ] Commit and push, then verify exact-head CI and release in GitHub Actions.

## Execution record

Baseline: main a353bc5, clean working tree, preview and desktop share bootstrap. Working in the existing user-selected checkout to keep the running preview aligned; no concurrent implementation writers. Provider snapshot skeletons are historical evidence, not current network performance measurements.

Ruling: retain immediate native browser geometry and dialog dismissal; animate owned content and entrances instead. This avoids misaligned native views and delayed focus/actions. Offscreen Electron rendering is used only for timed animation measurement; existing native startup and parity suites still run. Independent review found the composer reduced-motion cancellation gap; reproduced RED, registered its animation centrally, and verified GREEN in both renderers. Closed Code project children are lazy to avoid hidden row construction. See docs/VALIDATION-app-motion.md for evidence and remaining native-provider scope.
