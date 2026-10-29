# Work activity implementation plan

> Use superpowers:executing-plans task by task.

**Goal:** Make cross-chat running work and checks visible and directly manageable.

**Spec:** `docs/superpowers/specs/2026-10-29-work-activity-design.md`

### Task 1: Bound activity projection and controls

- [ ] Add failing tests for two independent owners, pending input, stale stop, unchanged selected draft, check ownership, restart and lightweight observations.
- [ ] Add ephemeral activity projection, trusted stop binding, shared stop helper and preview simulation.
- [ ] Verify controller lifecycle, queue recovery, source permission and status-copy regressions.

### Task 2: Compact activity menu and acceptance

- [ ] Add shared toolbar menu with stable rows, Open/Stop, pending/error states and accessible narrow layout.
- [ ] Browser/Electron component and integrated parity checks; build and full tests.
- [ ] Fresh review, resolve findings, validation record, commit and push.

### Task 3: Published acceptance

- [ ] Verify exact release and installed application separately from source fixtures.
