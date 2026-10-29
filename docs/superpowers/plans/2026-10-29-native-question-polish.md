# Native question polish implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make native question cards readable, accessible and reliable to answer.

**Architecture:** Shared React Markdown presentation around the existing validated native input protocol. No provider or transport change.

**Tech Stack:** React 19, TypeScript, ReactMarkdown, Electron, Playwright and Node tests.

**Spec:** `docs/superpowers/specs/2026-10-29-native-question-polish-design.md`

## Global constraints

- Keep Muse as the backend and preserve exact session/turn/question/revision bindings.
- No model calls, new package, raw HTML rendering, remote images or automatic submissions.
- Same components in browser preview and desktop; installed acceptance is separate.
- Retain prior audit artifacts and user profile data.

## Review focus

- Link activation inside a choice must open only an allowed destination and not select/submit the choice.
- Repeated clicks or keyboard submission before a controller update must cause one answer request.
- IME composition, plain Enter and blank custom answers must not send unexpectedly.
- Large/wrapped Markdown and multiple questions must retain accessible grouping and option labels.
- Question identity/revision change and rejected/unknown native outcomes must reset or retain the lock appropriately.

### Task 1: Shared question presentation and answer interaction

**Files:** create `src/ui/QuestionMarkdown.tsx`, modify `src/ui/NativeQuestion.tsx` and `src/ui/native-question.css`; create `scripts/native-question-smoke.mjs`; extend validation/release workflows to run it for browser and production Electron.

**Interfaces:** Existing `NativeQuestion({runtime,taskId,busy,act})` and `answerInput` actions stay unchanged. `QuestionMarkdown({text,inline?})` renders display-only safe content; answer submissions retain original source labels.

- [x] Write a real-renderer smoke using a temporary fixture and isolated Electron profile. Assert safe formatting/links, no image or raw HTML execution, custom answer selection, choice switching, Ctrl+Enter, IME exclusion, duplicate submission lock, rejection recovery and revision reset.
- [x] Run the fixture against the current renderer; observe missing rich formatting/custom-answer behavior.
- [x] Implement the spec in shared components with an immediate submission ref and local pending state.
- [x] Run smoke in Chromium and production Electron, existing user-input/native-controls tests, TypeScript/build and full unit suite. Expected: all pass, no provider calls.
- [x] Review the complete diff with one fresh reviewer, address significant findings, record evidence, commit and push the completed feature.

### Task 2: Published desktop acceptance

**Files:** `docs/validation/2026-10-29-native-question-polish.md`, ignored release receipts.

**Interfaces:** Existing release matrix and native app status/inspection; no new update protocol.

- [ ] Wait for exact source CI and release, verify installer hashes and packaged sources.
- [ ] Install/reopen under standing authorization after confirming no running user work; preserve profile. Inspect current version and shared native-question UI through a safe fixture/installed package. No live model run.
- [ ] Update roadmap status and evidence with distinct source, CI, installed and native-runtime scope.
