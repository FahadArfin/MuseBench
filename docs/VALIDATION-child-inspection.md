# Native child activity inspection

Implemented 28 October 2026. The session panel offers **Read activity** on native subagents whose parent-stream record contains a child session ID. The shared preview/desktop viewer shows messages, tool output, and any reported worktree and token totals. Read timestamps, refresh, history omissions and unavailable data are explicit. It does not estimate billing, claim worktree existence, or change child lifecycle.

## Contract and implementation

The controller resolves the current task and parent connection; the runtime resolves the native child from the observed item and revision. `session/read` uses `excludeItems: false`. Replies must match the child and any supplied top-level parent identity. Inline and cursor-aligned schema-1 snapshots are supported. Unknown history is unavailable, not an empty transcript. Unknown item kinds retain their generic text.

Inspection has a separate read-only controller path so a slow read cannot hold up Stop or chat switching. It never emits a native lifecycle command or a goal-continuation trigger. Late replies are discarded after disconnect/ownership change; retargeted children are rejected. Ordinary revision progress marks a snapshot as older without preventing inspection of a running child. Failed refresh clears the old snapshot.

Retained activity is limited to the latest 200 items, 64 Ki characters total and 8 Ki per item; eight inspections are cached in memory and four reads may run concurrently. Only 25 rows render initially, with an earlier-activity control. Private child contents are excluded from the app database. There is no polling or automatic retry.

## Native evidence

A fresh owned, sandbox-default Muse 1.4.14 host used only initialization and two `session/read` requests against an existing diagnostic parent and child. It returned seven parent items and four child items: one user message, one agent message and two tool calls. The production projector accepted all four, with matching parent/child identities. The child remained `notLoaded`. No worktree or token totals were reported, so the production projection left them absent. Host shutdown completed.

The probe made **zero model turns** and no start/resume/subscribe/lease/control request. Private payloads and identifiers remain in ignored local artifacts; only this summary is committed. The exact installed SDK contract was 1.4.14, schema 1, fingerprint `sha256:c94c3d1f2f51e6424074b9ec43eac3eedcf532d3dcd77351ec1383a87d3049c6`.

Official reference: [session/read](https://meta-models.github.io/muse-code-sdk/next/generated/msp/methods/session-read/). The published `next` page is explanatory; the pinned declarations and native probe determine compatibility.

## Validation

- All 1,131 tests pass. The 90 focused runtime/controller/projector checks cover target forgery, stale revisions, foreign replies, unknown shapes, bounds, pending reads, disconnect, Stop responsiveness, concurrent-read error isolation and non-persistence.
- Nine shared-renderer checks pass in Chromium and production Electron: data rendering, smooth collapse/focus/inert behavior, cached reopening, large/unknown/partial data, failed refresh, unavailable history, in-flight collapse, reduced motion and narrow layout. These use isolated fixtures and make no provider calls.
- The production build and all 95 preview/desktop parity scenes pass, including expanded and collapsed activity. Independent review has no remaining actionable findings. Release CI and installed artifact evidence are recorded with delivery.

Remaining boundary: this viewer is a bounded point-in-time inspection, not a complete transcript export or a live attachment. Native direct-child follow-up/resume/reopen and workflow retry/skip still require suitable observed host states and separate acceptance proof. No new paid model experiment was run.
