# Recoverable queued-message editing

Roadmap C03. Edit a queued request in a compact editor within the queue, leaving the composer's current text, files, images and mode untouched. Beginning an edit pauses the queue. Save changes text/mode only and preserves attached files/images, run settings, workflow checks and context-handoff provenance. Cancel keeps the queued request unchanged. Both leave the queue paused until explicit delivery.

Bind edits and per-item Send now to chat ID, prompt ID and revision. Stale selections and requests that have already started must reject. Show the queue's paused/automatic state and explicit Pause/Run queue controls. Each item has Send now, available only when the current native session is idle; it starts one selected request, keeping the remaining queue paused. This is a new turn, not native steering. Existing resume behavior can still deliberately run the queue in order.

Before dispatch, persist the selected entry as sending. On acknowledged dispatch remove it. If the app restarts or the provider acknowledgment is lost, retain it as outcome unknown, block edit/send/automatic replay and show recovery guidance. Known pre-dispatch rejection restores a ready queued entry. Queued send failures must never overwrite the current draft. Keep existing required-check, image, source-hash, permissions and native recovery guards.

No model requests are required: use injected runtimes for exact dispatch/receipt tests and real shared UI for browser/desktop evidence. Preserve profile data and earlier artifacts. Continue feature-by-feature publishing under standing authorization.
