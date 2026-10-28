# Muse Code billing source and purchases — 28 October 2026

Usage & billing now has Overview, Plans and Analytics. Users can choose their signed-in Muse Code account or a separate API key for subsequent Code requests. The four documented subscription tiers lead to Meta Accounts Center in an isolated desktop window; API payments open Meta billing. A browser fallback is available. Meta displays regional pricing, eligibility and final purchase terms. Plan selection in MuseBench is guidance: users select and confirm that plan on Meta's page.

API keys are encrypted with Electron safeStorage, excluded from renderer state/logs/arguments and supplied only to the selected Code process and its model discovery. Switching closes idle connections and preserves saved chats. Running, queued or uncertain work blocks changes. The sign-in reservation covers connection shutdown until onboarding owns the operation. Billing-account confirmation holds the same mutation lock while reading the page, preventing key replacement from inheriting the preceding association.

The compact usage display follows the selected route. API account figures require explicit confirmation that the connected billing page matches the selected key. Replacing the key clears that association. Account login does not establish subscription entitlement; missing allowance stays unavailable. Work and Sites retain their existing credential policy.

## Local verification

- `npm test`: 1,079 tests passed. Includes encrypted persistence, failed storage, revision races, busy switching, billing-account matching, native account privacy/timeouts, and both Code transports.
- `npm run build`: TypeScript, native helpers and Vite passed. Existing large-bundle warning remains.
- `npm run test:billing-preview`: 7 interaction checks passed.
- `npm run test:billing-desktop`: 9 checks passed, including real main-process IPC opening separate subscription/API windows at their fixed Meta URLs. Those windows load local HTTPS protocol fixtures in isolated app data; no real purchase is attempted. Tests also cover Work/Sites completion, failed API-window browser fallback, API-key clearing, usage routing and Analytics.
- `npm run test:preview-parity`: 92 existing cross-surface checks passed.
- `node scripts/live-smoke.mjs --connect-only --muse-bin <installed 1.4.14-R7309.1>`: real Electron/native connection and sandbox readiness passed; native shutdown confirmed. The smoke script now explicitly selects Muse Code because startup defaults to Meta AI chat.
- Read-only native `account/read` recognized account login; allowance refresh remained unavailable. This is not subscription or model entitlement proof. No paid model request, API-key replacement, credential-store change or real payment was performed during live validation.

The SDK, native version and schema are pinned to 1.4.14. The exact official manifest and source commit are retained under `reference/patchlight/adapter/evidence`. Historical 1.4.13 observations remain historical rather than being relabeled as new evidence.

Preview and desktop use the same billing components. Both billing UI checks are required in validation and release CI. GitHub CI/release outcomes must be verified separately after push; local success alone does not establish a published installer.

The independent review identified and reproduced the sign-in and account-link races; both were fixed and regression tested. Payment completion, regional availability, API-key access and subscription allowance require Meta's account-side confirmation.
