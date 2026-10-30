# Per-reply source review implementation

> Execute inline with superpowers:executing-plans, then one fresh independent whole-feature review.

**Goal:** Observe bounded per-run source changes, persist revision-bound file review, and stage exact source feedback without sending.

**Spec:** `docs/superpowers/specs/2026-10-30-reply-change-review-design.md`

**Architecture:** Dedicated bounded SQLite capture service, existing controller queue and snapshots, trusted IPC inspection/feedback, shared React dialog and composer append. No new dependencies.

## Global constraints

20 captures/chat, 100 globally; baseline text 1 MiB, per-file 128 KiB, final 100 files/1 MiB text. Confirmed owned terminal events only, no automatic model calls. Preserve drafts, images, sessions and checkpoint semantics.

## Review focus

- Terminal capture must precede queued next-run dispatch; background completion must retain its original owner/root.
- Unknown/restarted/resumed work must not acquire a falsely complete capture.
- Current file changes invalidate review, stale inspection cannot mutate another chat, and old data never crosses a navigation boundary.
- Feedback validates exact captured side/lines and preserves current draft text/images, with no implicit send.
- Bounds, binary and unavailable data must be explicit; do not return baseline contents to the renderer.

### Task 1: Capture store and native controller

**Files:** new controller/shared run-change services and tests; controller/index, Electron IPC/security/preload and shared types.

**Interfaces:** Store begin/finish/unavailable/read/review/feedback/deleteTask; controller inspectRunChanges({taskId,runId}), setRunFileReviewed action, prepareRunFeedback(input) returns validated editable text. Inspection includes captured revision, status, files, stale/reviewed flags and omission counts.

- [x] Write/run store tests for exact changes, no changes, bounds/binary, retention, restart, markers/stale hashes and feedback lines. Expected RED missing service, then GREEN implementation.
- [x] Write/run controller tests for owned completion, queue ordering, background owner, uncertain/restart handling, deletion and stale mutation. Expected RED missing API, then GREEN implementation.
- [x] Run adjacent native ownership, draft, queue and checkpoint tests. Expected zero failures.

### Task 2: Shared lazy review UI

**Files:** new RunChanges dialog/styles and browser/Electron smoke; ResponseActions, App, preview bridge, package and workflows; user guide, validation and roadmap.

**Interfaces:** Consume Task1 inspection/action/feedback. Response opens exact turn; callback appends returned feedback to existing composer, preserving attachments.

- [x] Write shared component fixture for diff, marker toggle, source feedback, stale/rejected state, late navigation response and narrow layout. Expected RED before implementation, then GREEN Chromium/Electron.
- [x] Build and run full suite plus browser preview, response actions and Activity regressions. Expected zero failures; note existing advisories/optional skips.
- [x] Obtain fresh independent review, rule on all findings; fix material issues RED→GREEN plus full suite.
- [x] Record evidence, mark roadmap source verified, commit and push. Verify/install exact latest release separately.
