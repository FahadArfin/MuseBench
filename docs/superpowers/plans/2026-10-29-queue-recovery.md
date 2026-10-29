# Queue recovery implementation plan

> Use superpowers:executing-plans task-by-task.

**Goal:** Preserve drafts and queue metadata while editing, and make queued delivery explicit and recoverable.

**Spec:** `docs/superpowers/specs/2026-10-29-queue-recovery-design.md`

**Architecture:** Shared queue binding/edit helpers, serialized controller actions and durable sending/unknown state; same compact editor and controls in preview/desktop.

## Constraints and review focus

- No queue edit may set the composer draft or silently drop attachments/options/checks/provenance.
- IDs/revisions guard stale edits and delivery. No automatic replay after unknown admission or restart.
- Persist sending before native dispatch; preserve all native/session/check/source permission guards.
- New runtime tests use injected providers only; no additional Muse usage is authorized.
- Existing workflows and automatic queue success progression remain compatible.

### Task 1: Queue actions and durable delivery

- [x] Add failing controller/shared tests for editing, draft preservation, stale bindings, known rejection, unknown admission, restart and per-item delivery.
- [x] Implement bounded shared helpers, trusted action validation/types, controller edit/pause/send logic and preview parity.
- [x] Preserve current draft on queued failures and persist sending/unknown outcomes before dispatch.
- [x] Run queue/workflow/session regressions and full unit suite.

### Task 2: Compact editor and delivery controls

- [x] Implement inline editor, metadata summary, pause/run queue and per-item Send now without setting composer state.
- [x] Verify shared browser/Electron UI, current draft preservation, stale editor rejection, keyboard focus, narrow layout and duplicate clicks.
- [x] Build, fresh review, address findings, validation record, commit and push.

### Task 3: Published acceptance

- [ ] Verify exact CI/release/installed sources and acceptance with an isolated profile. Update roadmap with distinct source, installed and model-runtime evidence.
