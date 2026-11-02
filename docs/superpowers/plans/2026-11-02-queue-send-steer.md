# Queue Send and Steer implementation plan

**Goal:** Match the supplied composer screenshots: an empty active composer shows Stop; a draft shows only Send; Send queues while work runs; a queued row can Steer into the exact active turn or wait for automatic next-turn delivery.

**Architecture:** Reuse the durable queue and its completion/cleanup gate. Separate explicit queued steering from ordinary composer submission. The controller validates the queued revision and exact native turn, persists delivery before dispatch, and removes only acknowledged input. Reuse native image validation and selected-file context for steering. Desktop and preview share the React controls.

**Constraints:** Preserve the existing local work-log batch and installed profile. No publication, app restart or paid model requests. Honor explicitly paused/disabled queuing. Planning, reviewed recent-context and workflow requests remain separate turns. Uncertain steering must pause the queue and never replay automatically. Live steering requires the native runtime capability; it must not interrupt/restart an unsupported run.

- [x] Write failing controller/native/UI regressions for queue-first Send, Stop/Send switching, explicit steering, exact ownership/revision/turn, images, rejected/unknown admission and automatic delivery after complete cleanup.
- [x] Implement shared queued eligibility, validated `steerQueued`, native image content parts and preview parity.
- [x] Update the composer and queue controls; retain editing, deletion, reordering and paused/off preferences.
- [x] Verify targeted suites, build/typecheck, isolated Electron full chat flow and screenshot comparison; review the diff and record evidence.

**Execution:** Continue on the existing `codex/inline-work-log` branch without moving or committing prior uncommitted work. No additional design decision is required: the user specified both button states and queue/steer semantics. Use the existing font, color and icon system. Tests use isolated profiles and synthetic native acknowledgements.

## Evidence and rulings

- Native SDK 1.4.14 `TurnSteerParams.input` accepts the same content parts as turn/start. Reused existing bounded image-file validation; selected-file snapshots and image annotations enter the prepared correction, not an arbitrary renderer-supplied native path. The user request remains bounded to 16,000 characters, and prepared native context to 64,000.
- `artifacts/queue-steer-red.log` records pre-implementation action/content-part failures. `artifacts/queue-composer-red.log` exercises the previous composer through a fixture-only baseline transform and fails because an empty active composer contains a submit button.
- A fresh reviewer found silent automatic-queue disarming across verified approval/input pauses and inactive composer behavior during those pauses. Added failing controller and Electron regressions (`queue-pause-red.log`, `queue-composer-pause-red.log`), then preserved queue intent and active-turn classification. Explicit pauses, unknown outcomes, actual failures and unverified blocks still hold delivery.
- Visual QA found Stop clipped in the narrow toolbar. `queue-composer-narrow-red.log` records the failing bounds check; the model selector now shrinks before the Stop/Send control. The final narrow capture passes the same bounds assertion.
- `artifacts/queue-final-build.log`: production build and TypeScript check passed.
- `artifacts/queue-final-targeted.log`: 203 runtime/controller tests passed. After extracting the identical pending-request predicate for TypeScript-safe shared use, all 20 queue-recovery tests passed again (`queue-final-recovery.log`).
- `artifacts/queue-final-electron.log`: seven isolated production-App/real-preview-bridge checks passed; report and screenshots in `artifacts/queue-composer/desktop-vmNGpy/`.
- `artifacts/queue-final-parity.log` and `artifacts/preview-parity/report.json`: desktop/preview compatibility flow passed on the final built candidate, including queued Send and explicit Steer. An earlier attempt was invalidated by development reload while source was still changing; it is not used as passing evidence.
- Visual comparison: `artifacts/queue-composer/comparison.png`; current review appended to project-root `design-qa.md` without replacing earlier reports.

No paid/live model request was made. This verifies native admission through controlled acknowledgements and the actual source UI in isolated Electron, not the installed profile. Live steering remains capability-gated; unsupported transports leave prompts queued. Publication remains unauthorized for this local batch.
