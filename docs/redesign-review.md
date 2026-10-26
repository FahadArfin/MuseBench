# Coding workspace review

25 October 2026. Independent source review, renderer tests and visual inspection.

The review covered the new workspace shell, settings, safe Markdown rendering, extracted review/connection panels, task history migration, original-baseline restoration, source evidence invalidation, and runtime ownership when switching projects. The Muse runtime and Windows sandbox helper were unchanged.

## Resolved findings

- Plan mode originally lost its explicit read-only limitation disclosure. It now visibly states that planning is guidance and file/command tools remain available. Verified on an unapproved, unconnected Muse task without a model call.
- Search initially focused the dialog close button. The search input receives focus immediately and the dialog retains focus trapping and Escape dismissal.
- Visiting Customize originally unmounted the plan editor and discarded an unsaved draft. The workspace stays mounted, hidden and inert, and the draft survives returning Home.
- Choosing a previously used project from a new-chat composer originally restored its old task and discarded the new request. The new-chat intent and draft now survive folder selection.
- Switching from a Muse Plan conversation to a manual task originally retained a disabled Plan label. Each task opens in its own default conversation mode; manual tasks show Notes.

The three draft/mode regressions were reproduced before fixing, then exercised in the final source and packaged UI harness. The independent reviewer found no remaining actionable blockers in the reviewed source scope. Thirty focused controller/history tests passed independently; the final complete suite passed 216 tests.

## Final evidence

- Source redesign: `artifacts/redesign-ui/source-0hxPjT/report.json` — 16 checks.
- Packaged redesign: `artifacts/redesign-ui/packaged-MDOAFh/report.json` — 16 checks.
- Packaged original review workflow: `artifacts/packaged-ui-results.json` — 11 checks.
- Final packaged real Muse shell workflow: `artifacts/live-workflow/2026-10-26T00-01-47-360Z/report.json` — 9 checks.
- Visual comparison: `design-qa.md` — passed, with an optional small-label density refinement.

This is a bounded functional/code review, not an exhaustive security assessment or proof of compatibility with every project or upstream Muse release.
