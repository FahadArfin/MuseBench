# Muse Code billing source and purchases

Users can select their Muse Code account/subscription or a separate Meta API key in Usage & billing, and start subscription purchases or API payments from the desktop app. The existing Overview and Analytics remain together.

## Approach

Use Meta-owned checkout in an isolated desktop window with a system-browser fallback. MuseBench presents the four documented plan names, but Meta displays regional prices, eligibility and final terms and takes payment. No payment card data, subscription-token extraction, or private checkout API. A native payment form would require a provider checkout API that the public documentation does not offer. Merely opening the general billing link would not provide the requested subscription discovery.

Keep browser account credentials in the official CLI store. Store an explicitly entered, separate API key with Electron safeStorage; only pass it to the owned Muse process via META_API_KEY. Inherited environment keys never select a route. Existing installations initially keep their CLI credential routing. Explicit account selection must verify accountLogin; explicit API selection must have the saved API key. There is no paid-route fallback when a subscription reaches its limit.

Source changes apply to subsequent Code requests after idle native connections are closed; active/queued/uncertain work blocks switching. Existing saved conversation IDs remain intact. Usage reads use the same selected credentials. Account-login state is not proof of subscription entitlement. API figures come from the connected Meta billing page and are labeled as that account's figures, not falsely attributed to an API key's team. Require the user to confirm the billing-page account matches their API key before showing its amounts in the compact usage bar; clear that association when the key changes.

## Compatibility and evidence

The installed official CLI updated to 1.4.14. Align the SDK and exact schema contract before using account/read. Refresh usage through the official host; absent/rejected allowance remains unavailable. Normalize snake_case CLI and camelCase MSP counters; over-limit percentages clamp the remaining bar to zero. Do not turn payment thresholds or spend alerts into hard limits.

## Validation

Unit tests cover encrypted persistence, credential isolation, switching while busy, account mismatch, unavailable allowance, stale source reads, exact payment destinations and checkout isolation. Browser/desktop fixtures exercise the real shared UI, route selection, API setup, plan selection, and returning from checkout. Read-only native handshake/account/allowance probes are allowed; no model run, real purchase, saved-account mutation or card interaction is part of validation.

The user has explicitly requested implementation and previously authorized commits and GitHub pushes; no additional design approval is needed.
