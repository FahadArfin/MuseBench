# Finance in Muse Work

Open **Muse AI → Work → Finance**. This is a local personal-finance workspace with a Plaid adapter, CSV imports, deterministic calculations, and optional questions through the existing native Muse account.

## Available features

| Area | Implemented behavior |
| --- | --- |
| Overview | Known net worth, posted spending, income, net cash flow, six-month charts, category totals and source-coverage notes. |
| Transactions | Month/currency selection, merchant/category search, account filters, pending/transfer/refund labels and 50-row pagination. |
| Recurring | Weekly/monthly patterns from at least three comparable posted expenses, estimated next dates and observed price changes. These are estimates, not verified bills or subscriptions. |
| Budgets | Saved monthly category targets per currency, progress and over-target amounts. Targets apply to every month. |
| Accounts | Masked account details, cached balances, last-sync times, preparing/reconnect/error states, reconnect and disconnect. |
| Import | Native CSV picker, column mapping, amount-sign selection, preview, explicit commit and duplicate-import prevention. |
| Questions | Local calculated answers; a separate, consented Ask Muse action with Stop. Replies are discarded after switching financial context or cancelling. |
| Privacy | OS-encrypted local storage, separate fictional examples, protected credentials/tokens and accessible data-clearing controls. |

## Start without a bank connection

Choose **Import a CSV**. CSV import does not require Plaid or Muse. Choose **Explore an example** to see fictional data; sample budgets and transactions never become personal records. Browser preview exposes Finance as unavailable for private data; the working storage/import path is desktop-only.

The importer accepts UTF-8 CSV up to 2 MiB and 10,000 rows per file. Required columns are Date, Description and Amount; names can be mapped to your file's headers. Category and Type are optional. Dates must be valid `YYYY-MM-DD`; amounts must be plain decimals without thousands separators. Quoted CSV fields, commas, newlines and a UTF-8 BOM are supported. Invalid rows reject the whole import with row information.

```csv
Date,Description,Amount,Category,Type
2026-11-01,Payroll,-3000.00,Income,income
2026-11-02,Market,85.25,Groceries,expense
2026-11-03,Refund,-10.25,Groceries,refund
2026-11-04,Savings transfer,500.00,Transfers,transfer
```

This example uses **positive = money out**. Choose the opposite convention for exports where positive amounts are income. Optional Type values are `expense`, `income`, `refund`, and `transfer`; use explicit types for refunds and transfers. Without Type, a negative normalized amount is inferred as income unless its category identifies a refund/transfer. Review the preview before committing. Changing import settings invalidates the preview.

Use a distinct account name for each actual imported account. Deduplication uses that name, currency and normalized row contents, retaining multiple identical occurrences within the same file. Reimporting unchanged rows skips them. Changing descriptions, categories or the account name can produce additional records; this is not bank-ID reconciliation. Imported sources have **unknown balances** because transactions alone cannot establish current balances. Avoid importing a second copy of an already Plaid-linked account.

## Plaid connection setup

This local implementation uses **your own Plaid developer application**. It does not include a shared MuseBench Plaid secret or provision a hosted account service.

1. Open Finance connection settings and enter your Plaid client ID and the secret for the chosen environment. They are saved using OS encryption. Do not put them in the repository or a chat.
2. Start with **Sandbox**. Its connections are labelled test data. The adapter uses US institutions and the Transactions product.
3. Choose **Connect accounts**. Plaid Hosted Link opens in the system browser. Bank sign-in happens there.
4. Complete the browser flow, return to Finance and choose **Check connection**. The controller retrieves the completed Link session, exchanges its public token and synchronizes accounts and transactions.
5. If transactions are still preparing, balances remain visible with an incomplete-history message. Use **Sync** again later. No automatic polling/webhook service runs in this version.

Production needs your own approved Plaid application, Transactions access and applicable institution/OAuth approvals. Plaid fees under your agreement may apply. Access, institution coverage and available history depend on Plaid and the bank; requesting up to 730 days does not guarantee that much history. Balances and transaction updates are snapshots, not guaranteed real-time values. The adapter does not call the separately billed Transactions Refresh or Recurring products.

Reconnect uses Hosted Link update mode for the saved Item. Sync stages every page, reconciles added/modified/removed records and pending-to-posted replacements, and atomically commits records plus the cursor. Pagination mutation restarts from the original cursor. A failed page retains the last committed data. Account/transaction identities are scoped to their source Item.

### Disconnect and recovery

**Accounts → Disconnect** first calls Plaid Item removal, then removes local records. If removal fails, the app retains the connection token and reports failure so revocation can be retried. An already-removed Item can be cleared locally. Disconnecting a CSV source only removes local records.

**Dismiss linking** dismisses the local browser-link session; it is not a revocation action. Close the browser tab and revoke any completed or uncertain connection in your Plaid dashboard before acknowledging dismissal. If a token exchange was interrupted, the app preserves an uncertain-outcome marker across restart and refuses automatic re-exchange. Review the Plaid dashboard instead of assuming the bank connection failed.

**Connection settings → Clear local finance data** removes imported data, budgets and saved Plaid setup after linked banks are disconnected and the Link session is resolved. This control remains available with zero accounts. The app replaces its stored record; it does not promise forensic secure erasure from OS caches, backups or storage media.

## Calculation and privacy boundaries

- Amounts use integer minor units for each currency. Currencies are displayed separately; there is no implicit exchange-rate conversion. The per-value cap is 100 billion minor units (USD 1 billion), with a maximum of 25,000 transactions, 100 accounts and 16 sources, keeping aggregate arithmetic exact.
- Spending includes posted expenses minus refunds. Income is counted separately. Transfers, credit-card payments identified as transfers, and pending records are excluded from spending/cash flow. CSV Type and provider categories determine classification; there is no manual transaction editor yet.
- Known net worth is available asset balances minus credit/loan balances in the selected currency. Missing balances remain unknown. Six-month totals reflect available records; missing history must not be treated as proof of no activity.
- Recurring estimates use the available history, independent of the selected spending month. Duplicate checks flag equal account/date/merchant/amount groups within the selected month. Neither is a fraud determination or a guaranteed upcoming payment.
- Data lives in `work/finance/finance.bin` under the app profile, separate from Work documents. Writes are encrypted and atomic; unavailable encryption, corrupt records or external file changes fail closed and preserve the existing file. Windows protection is tied to the OS user; it does not protect an unlocked session from other software running as that user. New writes use the current OS key.
- Plaid client credentials, access tokens, cursors, Link tokens and Hosted Link URLs stay out of renderer snapshots and Muse prompts. The settings fields receive user-entered credentials only long enough to configure the controller. Provider errors are reduced to bounded safe messages.
- Opening Finance, samples, imports, budgets and quick answers do not call a model. **Ask Muse** requires a checkbox before each financial context, and sends a computed summary: selected-month totals, balances, categories, six-month totals and merchant patterns. No credentials or full transaction rows are sent. Native Muse/provider prompt and retention settings apply; this app does not promise the privacy policies of Claude or ChatGPT.
- Muse questions use a separate native owner with one tool-free prediction step, at most 15 seconds of native execution and a 25-second owner deadline. Shell, file tools, web tools, MCP, hooks and extensions are disabled by the existing runtime boundary. Finance does not save these replies as Work artifacts or chats. Unconfirmed cleanup remains a shutdown blocker with Stop available.

There is no money movement, trading, subscription cancellation, portfolio holdings analysis, tax filing or automated financial action in this feature.

## Implementation map and follow-up work

| Location | Responsibility |
| --- | --- |
| `src/shared/finance-model.mjs`, `finance-types.ts` | Money, CSV parsing, local summaries and shared contracts. |
| `src/finance/store.mjs` | Encrypted atomic persistence and file-change checks. |
| `src/finance/plaid.mjs`, `service.mjs` | Fixed Plaid endpoints, sync, source lifecycle, budgets and imports. |
| `src/finance/questions.mjs` | Independent bounded/cancellable Muse request owner. |
| `electron/finance.mjs`, main/preload | Native file picker, OS protection, trusted IPC and shutdown/billing ownership. |
| `src/ui/work/finance/WorkFinance.tsx`, `finance.css` | Lazy-loaded Work UI, source consent, filters, charts and forms. |
| `scripts/finance-smoke.mjs` | Isolated Electron acceptance with real encrypted storage and fixture-only AI replies. |

For a consumer version where users only sign into their bank, implement an authenticated server-side Plaid broker with tenant-bound Items, server-side token protection, Hosted Link completion, verified webhooks, revocation/deletion and operational support. Do not distribute a shared Plaid secret in Electron. Further optional work includes manual categorization rules, richer CSV format adapters, report exports, budget history and additional country/product coverage. Each needs its own scope and verification.

See the [implementation plan](superpowers/plans/2026-11-05-work-finance.md) and [verification record](validation/work-finance.md). Live Sandbox/Production bank consent and a real Muse answer remain external prerequisites, not proven by fixture tests.

## Research references

- [Claude Personal Finance](https://support.claude.com/en/articles/18185620-use-personal-finance-in-claude): personal-finance dashboard and questions; this account access is separate from Claude Code's enterprise finance tooling.
- [ChatGPT Finances workflow](https://learn.chatgpt.com/use-cases/track-bills-subscriptions-and-spending) and [Plaid's ChatGPT announcement](https://plaid.com/blog/chatgpt-personal-finance-plaid/).
- [Plaid Hosted Link](https://plaid.com/docs/link/hosted-link/), [Link API](https://plaid.com/docs/api/link/), [Transactions API](https://plaid.com/docs/api/products/transactions/) and [Items API](https://plaid.com/docs/api/items/).
- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage): async availability and `{result, shouldReEncrypt}` decryption contract.
