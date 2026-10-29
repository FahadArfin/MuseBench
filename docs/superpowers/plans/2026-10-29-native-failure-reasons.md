# Native failure reasons implementation plan

> Execute inline using superpowers:executing-plans; one final independent review.

**Goal:** Show the native explanation when an interactive Muse turn fails, including required MCP startup failures, without leaking credentials or retrying a request.

**Architecture:** Normalize diagnostic text before the adapter publishes a terminal state. Keep the existing runtime/controller/activity route and shared renderer. Reuse the same text redaction for exec diagnostics while retaining its established authentication and billing explanations.

**Spec:** The approved remaining harness solutions plan, step 5 and its native acceptance requirements, plus the observed Muse 1.4.14 startup receipts in `artifacts/mcp-startup-native/report.json`.

**Tech stack:** Official Muse SDK 1.4.14, JavaScript adapter/runtime, shared React UI and preview fixtures.

## Constraints and review focus

- No extra provider calls, paid model usage, automatic retry, credential changes or approval changes.
- Capture only a bounded plain-text reason; never persist the arbitrary native error object, stack or diagnostic payload.
- Native text stays untrusted. Render as text; redact bearer tokens, credential assignments, known API key shapes and URL credentials/query fragments.
- Preserve terminal outcome, exact run ownership and existing conflict/replay rules. A new explicit turn clears the previous explanation.
- Missing/malformed details remain unknown. Successful completion must not display an old error.
- Keep the existing live checkout and shared preview aligned under the user's standing main/release authorization. Retain temporary audit folders following the earlier cleanup rejection.

## Task 1: Preserve and display native terminal reasons

- [x] Reproduce the missing reason with an actual captured native startup-failure shape through the adapter, runtime and controller persistence boundaries.
- [x] Add regressions for reason/error-message fallback, malformed input, secret redaction, bounded display, cancelled/completed outcomes, and explicit next-turn reset. Observe failures before changing product code.
- [x] Implement the smallest adapter/diagnostic change. Keep existing exec billing/auth classification and no-retry behavior.
- [x] Add matching preview and isolated desktop failure scenes; verify the reason appears in the conversation/activity and remains after chat reload.
- [x] Verify native missing-command, initialization-error, timeout, optional failure and conflicting-name receipts using the local echo provider. Distinguish native protocol behavior from model tool use and configuration inventory from tool health.
- [ ] Run focused tests, build and appropriate shared UI checks, then the full suite. Conduct one independent final review; fix actionable findings with regression proof.
- [ ] Commit/push the verified change, await validation/release, hash-check and install the exact desktop artifact, reopen and inspect it through native control.

## Initial evidence

Seven native cases were attempted with isolated profiles and verified echo provider. Required missing executables, initialization errors and project startup timeouts all yielded `turn/completed` with `terminal: failed`, a useful `reason`, and `error.kind: configError`. Optional missing servers completed the echo turn. A project/session name collision rejected session creation before a turn was submitted. The adapter currently assigns `reason = null` on every terminal event, discarding these explanations. Native process shutdown was confirmed in the completed-turn cases; the collision cleanup receipt needs separate interpretation because a second idempotent disconnect reports `not-started` after startup already closed its owner.

The repeat probe confirmed all seven host exits and all fixture server exits, including the collision's cleanup-before-disconnect receipt. See `docs/VALIDATION-native-failure-reasons.md` for the evidence boundary and repeatable regression/UI checks.
