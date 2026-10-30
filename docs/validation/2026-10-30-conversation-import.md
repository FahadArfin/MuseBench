# Conversation import — validation

CX03 adds reviewed, selected conversation imports to searchable local history. Shared browser/desktop UI keeps imported history read-only and stages text only into a named, unsent draft. Native source paths come from the operating-system picker, never renderer commands.

- Parser, reader, transactional store and controller checks: **15 passed**. Selected ChatGPT branches, Claude text-only content, versioned portable/text formats, invalid shapes/cycles, long-message retention, ZIP traversal/expansion limits, empty shards, aggregate source-message limits, timeout/close, changed/expired previews, selection caps, exact duplicates, rollback, restart and native-session exclusion are covered.
- New UI check failed first on the absent **Import chats** control. Final shared checks: **9 Chromium + 9 Electron passed**, using the real isolated controller, file reader, database and image store. Only the test file choice and renderer host are fixtures. Searching all export bodies, continuous list reveal, batch bounds, paging, selected persistence, source preservation, real draft attachments/mode, duplicate display, removal, late-picker cleanup and stale draft ownership are exercised. The browser-only sample path is visibly labeled and uses the same UI.
- Empty ZIP shard regression failed first; empty shards now contribute to omission/message accounting without blocking readable siblings. Aggregate source messages still fail closed at the archive limit.
- **Full offline suite: 1,528 passed, 0 failed, 1 skipped.** The existing optional native replay lacks a capture in this checkout. Production TypeScript/Vite build passed with the existing large-chunk advisory.
- Existing chat-navigation, single-flight search/context, drag/reorder and persistence UI checks passed in browser/Electron. Narrow/reduced-motion and desktop import screenshots were inspected.
- Packaged Windows x64 boot passed: real packaged preload/IPC/controller and ASAR worker selected, persisted, read and removed a fixture conversation. Only the OS file picker was stubbed to return the clean fixture. Packaged MCP inspection also passed. This validates shipping paths/dependencies; it is separate from installing a published release or importing a user's personal export.
- All new UI coverage participates in the existing parallel Windows release checks; no previous check was removed. No provider request, credential access, billing action or account permission change was made.

Evidence: ignored `artifacts/conversation-import/`, `artifacts/portable-desktop/report.json` and `.superpowers/sdd/2026-10-30-conversation-import/`. An initial packaged smoke was started before packaging completed and could not launch; the complete package subsequently passed. That invocation is not a product failure or passing evidence.

## Review and acceptance

Independent whole-feature review is pending. Published installer and installed desktop acceptance remain pending for this feature. The already verified 0.2.185 build-speed release is recorded separately in [its installation receipt](2026-10-30-desktop-0.2.185.md).

## Boundaries

Export shapes are validated adapters, not provider guarantees. Unsupported or oversized sources fail without partial imports. Missing dates remain missing. Display excerpts do not replace the full accepted text. No provider session, configuration, instructions, tool grants, attachment bytes or executable entries are admitted. Ordinary conversation text remains verbatim and may include personal information. Imported history never contributes to model usage until the user explicitly sends a staged excerpt.

The current library search returns at most 100 matching rows, as before. Import preview search covers the full accepted export; its rendered list grows as the user scrolls. Confirmation is bounded to 100 chats / 2 MiB and can be repeated on the remaining preview selection. Browser preview imports are fictional and in memory; desktop imports are durable.
