# T303: Recoverable saved prompts

Implemented on 30 October 2026 in the shared Code composer, keeping Muse as the coding backend.

Save for later and Saved prompts live in Add to chat. Each project/chat (including a project new-chat draft) owns at most 20 full text/file/image/mode drafts. Saving clears only after SQLite acknowledgement. Restore atomically swaps an occupied current draft into the saved slot. Explicit deletion is separate; no save, restore or deletion sends or queues a prompt.

## Storage and lifecycle

The separate `saved_prompts` SQLite table and current `code_drafts` row change in a savepoint on the controller queue. The caller supplies the expected current payload, compared by normalized exact content before mutation. File and image intake rules run again before park/restore. Full shelves reject without eviction. Failed transactions preserve the SQLite rows and controller draft mirror through later persist/restart.

Text-only entries migrate with chat moves transactionally. File/image entries reject cross-project moves without loss. Archive/restore retains entries; permanent deletion and 30-day expiry remove owned rows. Screenshot cleanup checks current drafts, saved prompts, retained tasks/queues and temporary import ownership. It never sweeps unrelated pending imports. Physical file removal is best effort after the logical transaction; storage errors leave bytes available rather than report rollback after a committed row change.

`useCodeDraft` locks an owner synchronously, drains every accepted save acknowledgement, and fences typing, programmatic text/quote appends, files, image completions, mode changes, send/queue guards and another shelf mutation until acknowledgement. Generations reject stale owner callbacks. A returned durable draft is reconciled locally without a save. An unmounted shelf cannot close a different owner's newly opened shelf. Deleting an entry preserves the current draft, including its empty Plan mode.

Unfinished screenshot uploads show Attaching screenshots and disable the Add control. Included recent excerpts must be removed or resolved before park/restore. Existing context and draft limits remain authoritative.

## Local evidence

- `node --test test/prompt-shelf.test.mjs test/controller-drafts.test.mjs test/code-images.test.mjs`: 26 passed, including 12 shelf tests. Coverage includes restart, full capacity/no eviction, occupied swap, wrong owner/missing entries, stale source/image rejection, draft expectation mismatch, rollback/mirror persistence, move rollback/migration, archive/restore/expiry, deletion/reference retention, project new-chat ownership and a pending same-image upload.
- `npm test`: 2,073 passed, one skipped, zero failed. A prior run caught the missing new CI inventory entry; the inventory was updated and the full suite rerun successfully.
- `npm run build`: passed; existing large-chunk warning only. A final renderer rebuild includes the multi-save drain fence.
- `node scripts/prompt-shelf-smoke.mjs`: real App backed by real controller RPC plus an independent production preview-bridge contract. The hook harness imports production `useCodeDraft` and exercises delayed save/shelf acknowledgements, every draft mutation path, navigation, empty-mode preservation and an earlier held acknowledgement after a later save completes.
- `node scripts/prompt-shelf-smoke.mjs --desktop`: production Electron preload/IPC/controller with a disposable SQLite profile. Supports `MUSEBENCH_EXECUTABLE` for later exact-artifact checks. Verifies text/image/Plan, keyboard restore, occupied swap, deletion, pending upload feedback, held draft drain, held shelf reply, navigation, stale dialog handling, renderer reload durability, 390px layout, reduced motion and Escape focus restoration.
- `npm run test:chat-navigation`: passed, including browser/Electron navigation, context readers and sidebar move/draft/reload behavior.
- `npm run test:chat-history-find`: browser and production Electron checks passed, preserving T302.

Both shelf UI variants wrap their actual request-admission boundary and count calls. Observed admission actions: zero. The disposable seeding runtime also records zero connect/send calls. No paid request, upstream executable, personal profile, account, permission or billing mutation was used.

RED evidence includes absent initial controller APIs, missing image-reference release, removal of the production fence causing an extra draft write, stale dialog closure after navigation, pending same-image retention, empty Plan mode reset, and an undrained earlier save acknowledgement. Each production regression was corrected and the focused checks rerun.

## Evidence boundaries

Local source/fixture verification is complete. Required remote CI, packaged/installed exact-artifact checks and live native provider acceptance remain separate. The preview sample stores shelf payloads, image data and owning sample chats in browser storage; unavailable sample source files reject safely. Desktop storage uses SQLite and existing image files.

Registered as `test:prompt-shelf` in the chats CI suite, with clean fixture reports under `artifacts/prompt-shelf/**/report.json`.
