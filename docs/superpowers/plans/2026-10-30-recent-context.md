# Recent context implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Let users review and include bounded recent local chat excerpts after native compaction, with no hidden model request.

**Architecture:** Pure bounded excerpt selection and formatting, authoritative controller source/owner binding, existing queue admission and context receipts, and one compact shared Session panel. Prepare once, explicitly stage, then include only in the next user-authored request.

**Tech Stack:** Existing JavaScript controller/runtime, React/TypeScript UI, SQLite persistence, Node tests and shared browser/Electron smoke harness.

**Spec:** `../specs/2026-10-30-recent-context-design.md`

## Global constraints

- Native Muse remains the backend; no personal profile access, credential changes, model inference or grants during implementation/testing.
- Two/four/eight messages, default four; entire formatted section at most 8,000 characters; at most 256 recent candidates; existing 64,000-character final context limit.
- Background preparation defaults off, is local only and never starts a turn. Inclusion requires explicit staging and an explicit later user send.
- Preserve exact queued snapshots and existing durable unknown/no-replay behavior. Do not invent native retention or model-quality guarantees.

## Review focus

- Compaction or source mutation between review, async preparation and dispatch must reject stale context without losing the current draft.
- Restart/deletion/new chat must never transfer or resurrect another chat's prepared/staged excerpts.
- Queue edit/reorder/cancel/unknown delivery must preserve exact reviewed context without attaching it twice or to an automatic request.
- Nested quotes, role-like text, Unicode and large escaped content must obey actual formatted limits and remain untrusted history.
- Context inspection must match the final native prompt, including the second durable/session-aware preparation path.

### Task 1: Reviewed local continuity excerpts

**Files:** Create `src/shared/recent-context.mjs` and declarations, `src/controller/recent-context.mjs`, `src/ui/RecentContextPanel.tsx`, focused `test/recent-context*.test.mjs`, `scripts/recent-context-smoke.mjs`, and guide/validation docs. Integrate with `src/controller/index.mjs`, `src/controller/context-receipts.mjs`, `src/shared/chat-context.mjs`, existing shared types/queue/draft modules, `src/ui/SessionDialog.tsx`, `src/ui/ChatComposer.tsx`, `src/ui/ContextReceipt.tsx`, `electron/security.mjs`, and preview/IPC wiring only where required. Do not modify unrelated settings/catalog flows or release workflows.

**Interfaces:** Pure selector returns versioned bounded message entries plus formatted text/source IDs/outcomes/truncation. Controller adds source digest, project/task/native-session and compaction ID/revision binding. Authoritative actions prepare/stage/remove and save local preparation preference; send consumes only an exact validated capsule. Extend composeChatContext with optional validated `recentContext`, and contextReceipt with capsule digest/provenance metadata. The implementation owns exact internal names consistently across controller, shared declarations and UI.

- [x] Add failing pure/controller regressions for selection bounds, stale/foreign binding, queue/restart/unknown outcomes and inspection/send parity.
- [x] Implement bounded pure selection and authoritative source binding, then make those tests pass.
- [x] Integrate explicit staging and durable dispatch/queue behavior. Test failure before dispatch separately from uncertain dispatch; verify no automatic requests or goal/schedule attachment.
- [x] Implement the compact shared panel and removable composer indicator, plus labeled browser samples; run browser and Electron smoke covering interaction, stale errors and narrow/reduced-motion layout.
- [x] Run relevant controller/context/queue tests, production build and full unit suite. Record exact results and practical limits.
- [x] Commit the feature on its isolated branch for independent review; parent performs integration/push and exact release acceptance under standing authorization.
