# Per-reply source review — validation

OC02 adds bounded local source captures for owned Code runs, a shared reply Changes control, revision-bound file review and editable source feedback. Capture and review failures remain separate from the model's execution result.

- Store RED: missing service, then eight focused tests passed. Controller RED: missing inspection API, then ownership/queue/background/uncertain-state tests passed.
- An already enqueued manual send could overtake terminal capture. A regression failed first; the pending-capture checkout guard made it pass. Project moves also wait for that capture.
- Fresh independent review found two material issues: a completed capture lost its original project root, and feedback accepted phantom lines after terminal newlines. Four regressions reproduced these issues. Captures now retain and enforce their canonical root privately; feedback and the diff renderer share line-count semantics. **Final focused suite: 18 passed.**
- **Final full suite: 1,501 passed, 0 failed, 1 skipped.** The existing optional native replay lacks a capture in this checkout. Production build passed with the existing large-chunk advisory.
- Shared UI: **5 Chromium + 5 Electron checks passed** after fixes. Draft append preserves text, images, file references and mode, rejects stale feedback, and ignores late responses after navigation. Narrow/reduced-motion screenshots inspected.
- Rich reply copy/response actions, browser preview and Activity regression suites passed. No provider requests were made. `git diff --check` passed.

Evidence: `.superpowers/sdd/2026-10-30-reply-change-review/` and `artifacts/run-changes/` (ignored). Review was independent; material fixes were validated RED→GREEN and by the full suite without a redundant second review.

## Decisions and limits

- Label edits as observed during a run, because external writers may contribute. No exclusive authorship or atomic filesystem snapshot is claimed.
- Reuse controller serialization, with an additional pending-capture checkout guard. This introduces a brief local wait before competing work or moving the chat, instead of misattributing later edits.
- Capture failure never changes the provider outcome. Restarted or uncertain captures remain unavailable; bounded retention and omitted-text states are explicit.
- Return validated feedback text and use the existing functional composer update. No automatic send or replacement of drafts/attachments is introduced.
- Preserve ignored evidence and proceed under continuous implementation authorization. Installed/provider acceptance remains separate. The reviewer declined those stages and atomic external-writer protection; both remain explicitly outside the source-validation claim.
- Hold this feature's main push until the newly requested Windows-only release configuration is ready, avoiding another seven-platform build. Keep separate feature commits.

No deferred review minors.
