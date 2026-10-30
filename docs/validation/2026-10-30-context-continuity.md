# Context continuity: contract and validation

## Contract investigation

[OpenCode 2 compaction](https://opencode.ai/v2/docs/compaction/) describes recent-context retention and experimental advance summaries; unused summaries can still consume tokens. These are directions, not transferable configuration keys.

The installed `@muse-code/sdk` 1.4.14 `dist/src/msp.d.ts` and MuseBench's exact pinned fingerprint were inspected. `SessionCompactParams` contains commandId, sessionId and optional turnId; it contains no recent-token or background-summary parameter. Compaction items expose manual/auto trigger, revision, outcome and optional before/after token measurements and opaque summarizedThrough provenance. [Official compact reference](https://meta-models.github.io/muse-code-sdk/next/generated/msp/methods/session-compact/) confirms the acknowledgement is admission only. `recap/request` is a separate admission-only recap operation; no verified contract says it installs a replacement model context.

Accordingly OC06 implements observed continuity and leaves retention tuning/background summaries unavailable. Prerequisites for those additions: a pinned supported native configuration/admission contract, invalidation and cancellation semantics, and separately authorized bounded model acceptance. No provider request was made for this work.

## Source evidence

- New normalization/tracker tests failed before implementation (`task1-red.log`). Runtime restoration and controller persistence tests failed before wiring (`task1-wiring-red.log`).
- Focused normalization, manual compaction, runtime, adapter and controller tests passed (209 in `task1-green.log`). Coverage includes finite metadata, identity/revision isolation, restored observations, interrupted/restart uncertainty, preservation across manual requests and correct owning chat while another is selected.
- Two additional regression cases reproduced stale notifications buffered during reconnect and a conflicting event cursor fabricating completed history (`projection-red.log`). Observation now follows adapter cursor validation and old callbacks are rejected before buffering. Command admission remains separate.
- Shared smoke uses the actual renderer. Preview injects explicitly labeled observation fixtures; desktop loads bounded records from a disposable controller database through real Electron IPC with external network blocked. No personal profile is used.
- Browser and desktop history, missing measurements, restored provenance, keyboard disclosures, narrow layout and chat switching passed: `artifacts/context-history/preview-ZK7lJ1`, `desktop-EsTtPU`. The initial smoke assertion ran before disclosure animation completed; it now waits for the selected row's visible content, avoiding an ambiguous text selector.
- Existing sidebar loading and full-process session/cookie durability regressions passed (`task2-session.log`). Production TypeScript/Vite build passed (`task2-build.log`); the existing chunk-size advisory remains.
- Final source checks after projection guards: 211 focused tests passed (`projection-green.log`), full suite 1,662 passed with zero failures and one pre-existing optional skip (`task2-final-full.log`), production build passed (`task2-final-build.log`). Shared preview `preview-ZlrgcM` and actual desktop `desktop-0Ft2EL` passed (`task2-final-shared.log`).

Logs and rulings are retained in `.superpowers/sdd/2026-10-30-context-continuity/`. Final checks, independent review and installed acceptance are recorded separately. Fixtures prove host behavior; they do not establish current provider context occupancy or live compaction quality.

## Decisions

Continue inline using the attached worktree and existing authorization; one fresh final review. Preserve evidence and avoid rerunning unchanged checks solely for bookkeeping. Keep separate observation history instead of broadening manual command receipts into automatic authority. Require verified connection ownership and native cursor validation before recording live history. No unverified API settings, background inference or personal-state changes.
