# Update details implementation plan

> Use superpowers:executing-plans inline. Continue in the dedicated MuseBench checkout; feature pushes are already authorized.

## Task 1: Owned release metadata and restart observations

- [x] Reproduce missing exact downloaded version, inert bounded notes and named restart blockers with failing tests.
- [x] Add small controller blocker observations and main-process update metadata, preserving shutdown locks and mutation-time checks.
- [x] Run updater/controller regressions. Expected: no mismatched download can install, no work is silently cancelled, and uncertainty remains explicit.

## Task 2: Compact shared update UI

- [x] Show installed/ready versions, collapsible release notes, exact release link and blocking work in Settings; add version to the green toolbar tooltip.
- [x] Refresh blockers only while a downloaded-update panel is open. Keep preview and desktop on the same renderer.
- [x] Build, shared browser/Electron smoke and relevant parity. Expected: safe plain text, stable state, accessible compact narrow layout and no real installer/model invocation.
- [x] Independent review, evidence, commit and push.

## Task 3: Published acceptance

- [ ] Verify the finished exact release artifact before installing/reopening and inspecting the installed UI.
