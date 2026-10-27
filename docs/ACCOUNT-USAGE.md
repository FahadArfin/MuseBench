# Account usage and billing

Shared preview and desktop UI: profile menu headline, subscription windows, API spending, refresh and official account links. Preview figures are visibly labelled samples.

Subscription data is read with the official `muse usage --json` command. Explicit `subs_usage.window/weekly.used_percent` counters become remaining percentages; missing or unknown shapes are unavailable. Raw CLI counters remain available in the bridge response. API spending is separate from subscription allowance; a payment threshold or current balance is never treated as spend or a budget.

Connect Meta billing opens an isolated, sandboxed official-site window. Sign in there, keep the billing page open, and refresh. The reader examines only rendered main content on dev.meta.ai/billing. It never reads cookies or authentication storage. Its deliberately narrow parser accepts unambiguous month-to-date spending with explicit ISO currency and an optional separately labelled monthly spend alert. Unrecognized layouts, currencies, duplicate totals and loading pages yield unavailable. No portal figure is inferred from model token counts. Closing the window removes its source. Checks refresh on focus and every five minutes while Usage is open.

## Validation limitations (27 October 2026)

Live CLI check returned credential_rejected. The signed-in Edge billing page remained Loading billing. Therefore subscription schema compatibility and the live billing parser have NOT been validated against this account. Parser and UI coverage uses synthetic fixtures, not successful live billing evidence. Further work requires a functioning official allowance response / fully rendered billing page. No hard spending cap is enforced by this feature.

Sources: https://dev.meta.ai/docs/muse-code/subscriptions ; https://dev.meta.ai/help/billing/spend-limit-alert ; https://dev.meta.ai/help/billing/api-bill . Meta documents spending alerts as notifications, not hard caps. A third-party implementation documents subs_usage field semantics: https://github.com/djbclark/aiuse/blob/main/docs/muse-quota.md ; this is provisional until verified against the installed CLI's successful output.
