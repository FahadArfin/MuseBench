# Durable draft saves without chat-history work

The authorized responsiveness roadmap identified whole-state persistence on each Code keystroke. Current desktop draft IPC dispatches saveDraft, flushes pending runtime progress, persists the selected task/history/app/projects, constructs a complete state snapshot, and discards that snapshot. This makes typing cost depend on retained conversations.

Keep the existing UI, immediate saves, draft binding, attachment validation, and ordering with other controller operations. Add an authoritative SQLite code_drafts table and a dedicated controller saveCodeDraft(input) acknowledgement. The existing dispatch action remains compatible for callers needing state. Desktop and preview keep the same bridge signature and shared composer.

Approaches considered: delaying saves would reduce work but weaken immediate durability; optimizing only the returned snapshot leaves broad database writes; a separate draft row removes both costs. The latter is the implementer's choice under the user's standing instruction to continue the roadmap without repeated approvals.

Migration imports existing app drafts atomically only when the new table is created. An existing empty table is authoritative, so clearing a draft cannot resurrect its legacy copy. General controller persistence synchronizes draft changes from sends, restores, moves, review integration and deletion. Synchronization must work within existing transactions and remain correct after rollback. Existing app JSON remains readable; the dedicated table is authoritative in this version.

The dedicated save joins the existing operation queue, validates project/chat ownership and attachments, commits the draft before updating the in-memory view, and resolves without a state snapshot. A failed save rejects without clearing unrelated errors or replacing the previous draft. Closing drains admitted saves and rejects new ones. Saving a draft does not flush coalesced runtime activity or change busy state.

Acceptance: preserved legacy drafts and attachments; immediate database durability; no stale-draft resurrection; send/clear/delete/move and failed-move rollback remain correct; queued navigation and shutdown preserve order; invalid saves retain prior content. In an isolated realistic controller fixture, typing performs zero writes to app/task/project/history tables and zero runtime snapshot reads. Record before/after timings separately from these deterministic operation checks; do not claim native inference improvements.

No new dependencies, model calls, provider configuration, UI redesign, or speculative general persistence rewrite. Keep the authorized main checkout, shared preview and desktop aligned, obtain one final review, then push, verify the release and install/reopen it while retaining the profile and audit evidence.
