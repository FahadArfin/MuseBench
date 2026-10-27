# Optional Full access implementation plan

> Execute inline with the executing-plans skill; use test-driven-development and a final independent review.

Goal: offer an explicit, connection-scoped Windows unsandboxed mode after verifying the supported native flag bypasses issue #107.

Design: retain the existing Windows exec transport, session handling, approval choices and process cleanup. Only an explicit fullAccess=true connection may append --disable-sandbox, omit sandbox readiness checks and enable managed PowerShell inside the user profile. Default connections remain sandboxed. Do not silently escalate, change global Muse settings, or claim that the upstream sandbox bug is fixed. SDK/MSP remains unchanged by this feature. Preview uses the same controls with simulated state.

Alternatives: changing SDK permission responses does not fix native execution; replacing the working exec transport with the older MSP adapter would lose existing features. Use the supported exec launch flag instead.

- [x] Add failing runtime tests for opt-in arguments, skipped readiness, default reconnect, invalid values, and unchanged approval policy.
- [x] Implement the exec runtime option and forward it through controller/action validation.
- [x] Add connection selector, visible active-mode indicator, and preview simulation using shared UI.
- [x] Run focused and full tests, build, inspect preview, and verify native shell execution. Review diff, commit and push.

Review focus: active runs cannot change permission scope; unrelated auto-connects never inherit full access; resumed runs use the explicitly selected connection scope; UI never calls unsandboxed commands sandboxed; absent/invalid options cannot grant full access.

Evidence before implementation: native serve with default sandbox failed a fixed userShell marker; the same call with --disable-sandbox completed. Both hosts shut down normally and neither called a model. Separate exec validation is required before claiming the shipped integration works.

Verification: 42 focused tests passed; full suite after integration with main: 698 passed, 1 skipped after restoring the tutorial fixture to repository LF bytes (fresh worktree CRLF caused five pre-existing tutorial failures). Build passed. Native exec Ask me + --disable-sandbox completed a real-model PowerShell marker under the user profile with exit 0 and confirmed cleanup. Browser controls verified: selector locks while connected, active badge appears, disconnect restores sandboxed default. Independent review corrected stale sandbox guarantees.
