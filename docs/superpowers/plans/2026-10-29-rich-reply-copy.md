# Rich reply copying implementation plan

> Use superpowers:executing-plans task-by-task.

**Goal:** Copy reply Markdown and rich formatting safely in preview and desktop.

**Spec:** `docs/superpowers/specs/2026-10-29-rich-reply-copy-design.md`

**Architecture:** Shared bounded safe Markdown serializer; narrow source-only desktop IPC; browser ClipboardItem and text fallback. On-demand rendering, no new dependency or model call.

## Constraints and review focus

- Clipboard plain text is byte-for-byte the reply; HTML is created independently from source, never transcript DOM.
- Images, raw HTML, executable/local URLs and controls do not survive in rich output.
- Main-process clipboard handler checks source bounds and relies on existing trusted sender validation.
- Failed rich copy falls back to text; failed all-copy attempts do not show success.
- Shared browser/desktop behavior; installed acceptance follows a verified release. Preserve profile and audit artifacts.

### Task 1: Source-only copying and regression evidence

- [x] Write serializer tests and observe failure before implementation.
- [x] Implement `src/shared/reply-copy.mjs`, typed declarations, UI clipboard helper, optional bridge method and host IPC.
- [x] Add browser fallback checks and extend the real desktop response actions smoke to inspect HTML, exact plain text and rejection of invalid payloads.
- [x] Run focused tests, build, existing response action/responsiveness checks and required full suite.
- [x] Fresh review, address findings, record evidence, commit and push C02.

### Task 2: Published acceptance

- [ ] Verify exact CI/release and installer identity, inspect installed modules and clipboard behavior with an isolated profile. Install/reopen the latest completed cumulative release under standing authorization when user work is idle.
- [ ] Record source versus installed/runtime evidence in roadmap and validation.
