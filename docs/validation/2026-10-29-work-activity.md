# Work activity validation

29 October 2026. Roadmap C05 / OC01. Baseline 0fb6d4b.

The Code toolbar now shows compact cross-chat work activity: owner and project, working/waiting/connection/cleanup status, Open, and a supported Stop. Stop binds task, retained controller context, prompt/run/session, pending request revision and native compaction/child command identities. Fresh mutation-time readback rejects stale controls. Unknown cleanup remains visible; stopping a background owner pauses its queue and bounded goal without changing selected chat or draft.

## Evidence

- Eight activity regressions cover independent owners, check cancellation, old run and operation tokens, fresh readback after silent change, pending input, restart, validation and draft/queue preservation. Nine existing controller status regressions still pass: getState uses one compact observation per retained context, zero inactive full transcript copies.
- Full unit suite: 1,419 tests passed, zero failures. Production build and TypeScript passed (existing bundle-size advisory).
- Shared component: seven browser and seven Electron checks; stable DOM/focus through updates, duplicate lock, stale-error preservation, exact Open, narrow/reduced motion and hidden-surface close.
- Integrated browser preview passed, including error propagation through the real App bridge and fork selection without duplicating pending questions.
- Existing activity smoke passed after retaining its original styles. Full browser/Electron parity passed. Final minor preview and error-wiring refinements have integrated browser coverage.
- Independent review found stylesheet replacement, operation token gaps, stale readback recovery, absorbed bridge errors and preview ownership/hidden surface issues; fixes and regressions included.

Ignored artifacts: artifacts/changelog-roadmap-2026-10-29/work-activity-*.log; artifacts/work-activity; artifacts/activity-ui. No model or external provider request was made. Preview activity is simulated. Exact published/installed acceptance remains pending.
