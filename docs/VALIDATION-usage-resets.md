# Usage resets validation

Validated locally on 28 October 2026 against SDK 1.4.14.

Usage & billing Overview now includes Resets: provider-reported reset dates, countdowns, a manual refresh, and a read scheduled just after the next future deadline. The existing five-minute and focus refresh behavior remains. Past timestamps show Awaiting Meta update; the bar is never refilled locally. API mode hides subscription timing.

Banked resets are unavailable through the current integration. [Meta's subscription documentation](https://dev.meta.ai/docs/muse-code/subscriptions) describes automatic usage refresh and upgrades, and the [pinned official protocol](https://github.com/meta-models/muse-code-sdk/blob/a45cb67cd2e27c8b6b4b55dcbaae6e6341123ea4/schema/msp/msp.d.ts) provides usage observations with reset timestamps. No banked inventory, claim, or redemption operation was found. The card does not imply the user has zero banked credits, and no speculative endpoint or local quota override was added.

## Evidence

- `node --test test/usage-resets.test.mjs`: 5 passed; future/past/invalid timestamps, absent and API/unknown data, no capacity mutation, bounded polling and countdown formatting.
- `npm test`: 1,084 passed, zero failures.
- `npm run build`: passed TypeScript, native helper checks and renderer bundling. Existing large-chunk advisory remains.
- `npm run test:billing-preview`: 12 checks passed.
- `npm run test:billing-desktop`: 14 checks passed with isolated Electron profile and local fixtures.
- Both billing checks advance the renderer clock across a deadline and assert exactly one additional usage read, unchanged exhausted capacity when Meta returns an old observation, no rapid retries, and refill only after a fresh provider value. Missing usage, leaving the panel, billing source selection, checkout dispatch and Analytics remain covered.
- `npm run test:browser-preview`: passed navigation, isolation, settings and responsive layout.
- `npm run test:preview-parity`: passed shared-control structure, styling and geometry checks.
- Independent code review: no blockers found; reviewer separately ran all 5 reset unit tests.

Local logs: `artifacts/resets-{tests,build,preview,desktop,browser,parity}.log`. Screenshots/reports: `artifacts/billing-ui/preview-HSV5NU` and `artifacts/billing-ui/desktop-vXWLtT`.

All displayed balances and deadline/refill scenarios in this validation are fixtures. No model requests, real purchases, reset claims or reset consumption were made. Actual native allowance availability still depends on what Meta returns for the signed-in account.
