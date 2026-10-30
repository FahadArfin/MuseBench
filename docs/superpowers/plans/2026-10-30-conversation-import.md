# Conversation import implementation

Spec: `docs/superpowers/specs/2026-10-30-conversation-import-design.md`
Base: 3539b0dc23e2a26b3e704218648b76c51b853ca4 (fast-forwarded from ccf56e2 with pending work preserved). Isolated branch codex/conversation-import. Inline execution under the standing roadmap implementation authorization; no new provider usage.

## Task 1: Source parsing and durable import service

- [x] Write failing parser tests covering supported JSON branches/Claude text/portable/text formats, omissions, malformed/cyclic input and quotas.
- [x] Implement the shared parser and off-thread bounded native file/ZIP reader, preserving original bytes and detecting changed sources.
- [x] Write failing transactional store tests for preview-only behavior, selected commits, exact deduplication/restart, stale/expired tokens, rollback and import-only removal; implement the service using existing history storage.
- [x] Run focused parser/reader/store tests and inspect their results.

## Task 2: Controller and shared compact UI

- [x] Add failing controller coverage for separate imported identities, search/read persistence, stale selection and no runtime/config/task/draft side effects. Add bounded picker/IPC methods.
- [x] Add import preview/selection to ChatLibrary and imported-history rendering/removal. Stage excerpts using an explicit current-chat owner, preserving existing drafts and attachments.
- [x] Implement browser preview parity, bounded stale-response/unmount guards, keyboard controls and errors.
- [x] Verify production UI in Chromium and Electron with real isolated backend import where applicable. Run adjacent chat-history/context tests, full offline suite and production build.

## Task 3: Review and release

- [x] Fresh independent whole-feature review, one material-fix pass with regression evidence, record decisions and deferred findings.
- [x] Commit/push completed source with roadmap/evidence updates. Keep routine releases Windows x64 only.
- [x] Verify the exact latest published Windows artifact and install/reopen when required checks and idle-work checks pass; record installed versus fixture evidence separately.

Interfaces: normalized parser output feeds preview tokens and history records; imported IDs never become task/session IDs. Picker-owned source paths never come from renderer payloads. Search results and history pages carry optional import provenance; all existing task navigation remains unchanged.

Review focus: untrusted ZIP paths and bombs, schema drift/branch ordering, duplicate and changed-source semantics, transaction failure and restart, stale async owners/draft edits, oversized histories, cancellation and shutdown, accidental account/config/runtime admission, preview/desktop distinctions and keyboard accessibility.
