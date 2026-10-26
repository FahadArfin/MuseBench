# Runtime and approval integration review

Reviewed 2026-10-25. Scope: `src/runtime/index.mjs`, its runtime tests, the preserved session adapter, installed `@muse-code/sdk` 1.4.13 contracts, and approval/completion integration in the controller and renderer. No native Muse host, model calls, CLI installation, or credentials were used. Application source was not changed by this reviewer. References below describe the initially reviewed code; concurrent fixes can move lines.

## Findings and fix verification

### P1: A late approval can revive an uncertain turn

`src/runtime/index.mjs:131-134` and `:240-256`.

After `turn/start` times out, the adapter emits `uncertain` and the runtime clears `permissionVerified`. A later `approval/requested` still replaces the pending state and exposes an approval token; `decide()` checks only owner/pending identity and sends `approval/decide` despite the uncertain lifecycle. Reproduced with an injected native boundary: `uncertain / false` became `blocked / false`, and the approval command was dispatched. Ignore or close late requests after lifecycle certainty is lost and independently guard decision dispatch.

Resolved: pending requests now require verified permissions and an active/submitting adapter, and `decide()` checks the same boundary. A late request stops the session. The focused regression passes independently.

### P2: Pre-session permission refusal strands an owned host

`src/runtime/index.mjs:196-202`, `src/ui/App.tsx:116`, and the runtime modal at `:172`.

When experimental permission evidence is unavailable, Connect returns `blocked` before session creation while retaining the host owner. The UI decides whether to show Disconnect solely from `sessionId`, which is null. Reproduced: a second Connect rejects with “Disconnect the current Muse session before connecting again,” but the modal offers only Connect and Choose executable. Close the refused host or expose owned-connection state independently of session identity.

Resolved: permission-gate refusal now closes the owned host and preserves the actionable refusal reason and cleanup outcome. The focused regression passes independently.

### P2: A normal approval pause loses completion attribution

`src/controller/index.mjs:135-136`.

Every `blocked` runtime event clears `museTurnPending`, including a verified ordinary approval pause. Approve-once followed by `approval/resolved` resumes the same turn, but its eventual `completed` event cannot set `runtimeComplete`, so Work completed and acceptance remain unavailable. Preserve submitted-turn attribution across a verified approval pause while continuing to clear it for uncertain, failed, cancelled, or unavailable outcomes.

Resolved: the controller preserves attribution only for a verified approval whose pending session matches the active session. Independently ran the regression covering normal approval continuation and unverified/input/mismatched-session/uncertain cases: passed.

### P2: Approval details silently omit the end of long requests

`src/ui/App.tsx:23-25`.

Both subject and raw arguments are silently sliced to 12,000 characters, while the one-time approval control remains enabled. A long shell command can put consequential operations beyond both displayed prefixes. Provide the complete request for review, or visibly identify truncation and withhold approval until the complete content can be inspected.

Resolved: `src/ui/permissions.mjs` now preserves complete fields up to 65,536 characters. Truncated or unrenderable fields set `approvalAllowed` false; the modal displays an explicit alert, disables approval, and guards its click handler while retaining denial and disconnect. Reviewed the helper and modal wiring and independently ran its four regression tests: all passed.

### P2: A second concurrent approval overwrites the first

`src/runtime/index.mjs:131-137` and the analogous `onServerRequest` handler.

The SDK permits multiple pending approvals (`ApprovalListPendingResult.approvals`) and projects native subagent approvals onto the parent's session. Request A followed by request B overwrites A; resolving B clears pending entirely and marks the runtime running although A remains unresolved. Retain approvals by identity, or fail closed on unsupported overlapping requests instead of silently losing one.

Resolved: this MVP explicitly stops the session without deciding either request when distinct pending requests overlap. The focused regression passes independently.

## Contract checks and limits

The inspected SDK confirms that `{}` acknowledges presentation only, that approval decisions send a current server-offered choice ID plus the requirement guard, and that command admission acknowledgement is not authoritative approval resolution. The runtime pins SDK/host/schema identity, uses `maxAttempts: 1`, starts no turn during Connect, and passes a curated environment rather than provider credentials. The stable schema omits experimental permission projections; their provenance was independently checked by the runtime implementation agent against the pinned official experimental SDK sources.

Focused reproductions used temporary inert binary files and injected process boundaries and removed their fixtures afterward. Observed the new regressions failing before the fixes. After the fixes, independently ran `node --test test/runtime.test.mjs`: 18/18 passed, and `node --test --test-name-pattern='verified approval pause' test/controller.test.mjs`: 1/1 passed. This is not a live-host compatibility or sandbox verification claim.

The implementation agent subsequently fixed an additional cleanup invariant: a repeated Disconnect must not replace an unconfirmed shutdown with `not-started` and thereby allow reconnect. Reviewed the guard and independently ran `node --test --test-name-pattern='unconfirmed' test/runtime.test.mjs`: 1/1 passed.

## Verdict

No findings remain open in this bounded runtime and approval-integration review. All five reported findings are resolved with focused independent verification. Live Muse compatibility, real sandbox behavior, and actual provider/account execution remain unverified because no native host or model was exercised.
