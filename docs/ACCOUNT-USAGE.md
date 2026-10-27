# Account usage and billing

Shared preview and desktop UI: profile menu headline, subscription windows, API balances and spending, refresh and official account links. Preview figures are visibly labelled samples.

Subscription data is read with the official `muse usage --json` command. Explicit `subs_usage.window/weekly.used_percent` counters become remaining percentages; missing or unknown shapes are unavailable. API billing is separate from subscription allowance. Current balance is not monthly spending; free credits are not an inferred percentage; a payment threshold is not a budget.

Connect Meta billing opens an isolated, sandboxed official-site window. Sign in there and refresh usage once billing has loaded. Edge authentication is separate and is never copied. The reader selects the rendered billing.dev.meta.ai/payment_settings/ iframe belonging to the top-level dev.meta.ai/billing team, rejecting duplicate matches and navigation changes. It also supports labelled top-level billing content. Only approved financial labels and values leave the page; payment-method identifiers are excluded. Cookies and authentication storage are never read.

The narrow parser accepts labelled balance, free credits, payment threshold, explicit month-to-date spending and monthly spend alerts. Dollar symbols are preserved without guessing which dollar currency they denote. Missing values remain unavailable. No portal figure is inferred from token counts. Spend alerts are notifications, not enforced caps.

Closing the billing window hides it. It refreshes every five minutes until MuseBench exits; opening Connect Meta billing shows it again. Usage checks run on focus and every five minutes while the usage UI is open. During loading or expired authentication the reader returns unavailable rather than presenting stale data as current. Reopen Connect Meta billing after restarting MuseBench.

## Validation limitations (27 October 2026)

Live signed-in Edge inspection confirmed the embedded frame structure and the balance, free-credit, payment-threshold and unconfigured-spend-alert labels. Tests cover extraction, private-field exclusion, frame selection and parser semantics. Native MuseBench account authentication and end-to-end live synchronization remain pending the user signing into its separate billing window. A successful Edge inspection does not establish native synchronization.

The official CLI allowance check still returned credential_rejected. Subscription schema compatibility remains provisional until a successful response is available. Model requests having worked does not verify allowance reporting.

Sources: https://dev.meta.ai/docs/muse-code/subscriptions ; https://dev.meta.ai/help/billing/spend-limit-alert ; https://dev.meta.ai/help/billing/api-bill . A third-party implementation documents provisional subs_usage semantics: https://github.com/djbclark/aiuse/blob/main/docs/muse-quota.md .
