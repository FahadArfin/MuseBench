# Read-only child activity

The harness research requested child inspection alongside lifecycle controls. Native child rows already retain `childSessionId`, but users cannot inspect the child's messages, tool output or recorded worktree. Add an on-demand activity viewer to the existing Sub-Agents/session panel.

## Authority and scope

Use the owned, pinned Muse MSP connection and `session/read` with `excludeItems: false`. Resolve the target exclusively from the current parent-stream item and its revision. The renderer supplies task, parent session and item identities, never an authoritative native child target. Validate the returned session identity and any supplied top-level parent identity. This read does not attach, resume, subscribe, acquire a lease, pause goal continuation, consume a reset, or start model work.

The installed SDK and a fresh Muse 1.4.14 probe on 28 October returned four inline child items without loading the child. This proves read support, not new lifecycle acceptance. Parent and child reads and clean host shutdown used zero model turns. Private diagnostic transcripts remain in ignored artifacts.

## User experience

Each observed subagent with a child session offers **Read activity**. Opening reveals a smooth, reversible disclosure using the shared motion policy. It shows a point-in-time timestamp, status/model/workspace, messages and tool output, and recorded worktree/token facts when present. Missing facts are labelled unavailable, never zero. Refresh is manual. A changed parent item marks the snapshot as older; disconnect/reconnect clears it. A failed refresh clears old contents and offers retry.

The display is bounded: newest 200 items, 64 Ki characters across activity text, 8 Ki characters per field/item, and a maximum of eight in-memory inspections. Render 25 recent items initially with **Show earlier activity**. Report omitted items, shortened text, host elision, unsupported history and unknown item kinds visibly. This is a bounded activity inspection, not a complete transcript export or live child attachment. No tool arguments or arbitrary metadata JSON are copied to the UI. All displayed content is plain escaped text.

Accept inline history and cursor-aligned schema-1 snapshots/anchored snapshots. Unsupported or absent history is shown as unavailable while independently verified session metadata remains visible. No guessing event-fold semantics or silently treating unavailable history as empty.

## Races and responsiveness

One read per item at a time, bounded by the runtime timeout. Allow reads during running/approval states; do not change parent runtime status or busy flags. Reject stale request identities before dispatch. Discard replies after connection ownership changes or if the item's child identity changes. A normal revision update during the read does not discard valid data; retain the requested revision as the as-of marker. Keep state ephemeral and reset on disconnect/reconnect. No automatic polling or per-token animation.

## Validation and delivery

Tests cover authorization, cross-session replies, stale/late responses, concurrent reads, history variants, output limits, absent facts, running-state isolation and failure recovery. Shared renderer checks cover readable content, collapse/focus/reduced-motion, refresh errors and preview/desktop parity. Re-run the zero-model native probe through the production projector. Run the full suite/build, obtain an independent review, commit/push the feature, verify exact-head CI and the resulting release. Existing authorization covers delivery on main and desktop update installation.

Source: [official session/read contract](https://meta-models.github.io/muse-code-sdk/next/generated/msp/methods/session-read/); exact implementation contract is the installed SDK 1.4.14 declarations.
