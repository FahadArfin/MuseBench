# Conversation import — validation

CX03 adds reviewed, selected conversation imports to searchable local history. Shared browser/desktop UI keeps imported history read-only and stages text only into a named, unsent draft. Native source paths come from the operating-system picker, never renderer commands.

- Parser, reader, transactional store and controller checks: **19 passed**. Selected ChatGPT branches, Claude text-only content, versioned portable/text formats, invalid shapes/cycles, long-message retention, ZIP traversal/expansion/checksum limits, empty shards, aggregate source-message limits, timeout/close, changed/expired previews, selection/work caps, exact duplicates, rollback, restart and native-session exclusion are covered.
- New UI check failed first on the absent **Import chats** control. Final shared checks: **9 Chromium + 9 Electron passed**, using the real isolated controller, file reader, database and image store. Only the test file choice and renderer host are fixtures. Searching all export bodies, continuous list reveal, batch bounds, paging, selected persistence, source preservation, real draft attachments/mode, duplicate display, removal, late-picker cleanup and stale draft ownership are exercised. The browser-only sample path is visibly labeled and uses the same UI.
- Empty ZIP shard regression failed first; empty shards now contribute to omission/message accounting without blocking readable siblings. Aggregate source messages still fail closed at the archive limit.
- **Final full offline suite: 1,532 passed, 0 failed, 1 skipped.** The existing optional native replay lacks a capture in this checkout. Production TypeScript/Vite build passed with the existing large-chunk advisory.
- Existing chat-navigation, single-flight search/context, drag/reorder and persistence UI checks passed in browser/Electron. Narrow/reduced-motion and desktop import screenshots were inspected.
- Packaged Windows x64 boot passed: real packaged preload/IPC/controller and ASAR worker selected, persisted, read and removed a fixture conversation. Only the OS file picker was stubbed to return the clean fixture. Packaged MCP inspection also passed. This validates shipping paths/dependencies; it is separate from installing a published release or importing a user's personal export.
- All new UI coverage participates in the existing parallel Windows release checks; no previous check was removed. No provider request, credential access, billing action or account permission change was made.

Evidence: ignored `artifacts/conversation-import/`, `artifacts/portable-desktop/report.json` and `.superpowers/sdd/2026-10-30-conversation-import/`. An initial packaged smoke was started before packaging completed and could not launch; the complete package subsequently passed. That invocation is not a product failure or passing evidence.

## Review and acceptance

Independent whole-feature review of `3539b0d..fff7be3` found three important issues and one navigation minor. All were addressed in one focused fix pass:

1. **Corrupt selected ZIP entries:** reproduced missing rejection; verify CRC-32 of each decompressed conversation entry before parsing. Size checks alone were insufficient. Regression now passes.
2. **Excessive synchronous persistence:** reproduced a 50,000-short-message selection bypassing the byte cap. Confirmation now rejects more than 2,000 messages or 20,000 per-message unique index entries before any write. Work is counted in the parsing worker; the shared SQLite transaction never yields/interleaves. A boundary fixture verifies 2,000 saved messages and exactly 20,000 indexed entries. Local maximum message/index batch: 210.5 ms confirmation / 171.0 ms maximum event-loop gap. Also testing nearly the maximum text allowance (2,096,000 bytes) with those same counts produced 369.4 ms confirmation / 299.0 ms maximum gap. These are local measurements, not hardware-independent latency guarantees. The review's formerly accepted 50,000-message fixture caused a 3,680 ms gap; it is now rejected without writes. The documented tradeoff is a smaller export for a single conversation above confirmation limits.
3. **Tool-directed assistant content:** reproduced routing-to-browser content appearing as an answer; tool recipients, explicitly non-final channels and hidden-message metadata are omitted. User and public final assistant messages remain, with omission counts. Regression passes.
4. **One-way excerpts:** added Previous excerpt and Back to conversation. Both browser and Electron tests return to the beginning and sibling messages without leaving the import.

Final 9+9 UI checks and packaged ASAR worker/preload/controller boot passed after these fixes. No redundant second review. The reviewer declined universal provider-export compatibility and published/installed acceptance; both remain explicit limits. No unresolved review findings.

Published installer and installed desktop acceptance remain pending for this feature. The already verified 0.2.185 build-speed release is recorded separately in [its installation receipt](2026-10-30-desktop-0.2.185.md).

## Boundaries

Export shapes are validated adapters, not provider guarantees. Unsupported or oversized sources fail without partial imports. Missing dates remain missing. Display excerpts do not replace the full accepted text. No provider session, configuration, instructions, tool grants, attachment bytes or executable entries are admitted. Ordinary conversation text remains verbatim and may include personal information. Imported history never contributes to model usage until the user explicitly sends a staged excerpt.

The current library search returns at most 100 matching rows, as before. Import preview search covers the full accepted export; its rendered list grows as the user scrolls. Confirmation is bounded to 100 chats / 2 MiB / 2,000 messages / 20,000 index entries and can be repeated on the remaining preview selection. Browser preview imports are fictional and in memory; desktop imports are durable.
