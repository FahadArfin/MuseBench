# Work Finance Implementation Plan

**Goal:** Implement a read-only personal finance workspace inside Muse Work, inspired by Claude Personal Finance and ChatGPT Finances.
**Authorization:** User requested implementation and asked to continue after a power outage. Keep changes local under the existing release policy.
**Architecture:** Separate `src/finance` service, main-process Plaid client and encrypted store, typed IPC, and a lazy-loaded Work finance screen. Preserve the uncommitted creative-studio work; add narrow integration points without rewriting it.
**Spec:** This document is the product brief and execution ledger. Initial scope is personal account aggregation, transaction analysis, recurring-charge estimates, budgets, CSV import, and explicit Muse questions. No money movement, trading, subscription cancellation, or automatic sharing.

## Research and decisions

- [Claude Personal Finance](https://support.claude.com/en/articles/18185620-use-personal-finance-in-claude) uses Plaid for a read-only dashboard and questions about selected accounts. Its personal-finance account access is not available in Claude Code. This is distinct from enterprise financial-analysis plugins.
- [ChatGPT Finances workflow](https://learn.chatgpt.com/use-cases/track-bills-subscriptions-and-spending) covers connected spending, balances, subscriptions, upcoming bills and unusual charges. [Plaid confirms its ChatGPT integration](https://plaid.com/blog/chatgpt-personal-finance-plaid/).
- Use Plaid's [Hosted Link](https://plaid.com/docs/link/hosted-link/) in the system browser because the app has an isolated Electron UI rather than a hosted web frontend. Retrieve completion through `/link/token/get`; no public webhook server is required for this local implementation.
- Follow [Transactions Sync](https://plaid.com/docs/api/products/transactions/): stage all pages, reconcile added/modified/removed transactions, retry the entire pagination loop from its original cursor on mutation errors, and commit records/cursor atomically.
- Plaid credentials/access tokens never enter renderer snapshots, generated artifacts, logs, or Muse context. Local setup accepts the user's own Plaid developer credentials and protects them with Electron safeStorage. No shared application secret is shipped. A distributed consumer service would need a separately operated authenticated broker; it is not silently provisioned here.
- Sandbox is labelled test data. Production needs the user's approved Plaid application/products and explicit linking. No credentials are present or live connection claimed during development.
- CSV is a useful fully local path, not a simulated bank connection. Sample data is explicitly labelled and kept separate from saved personal data.
- Bank data stays in an encrypted local store. Explicit Ask Muse sends a bounded summary through the existing native account, with a disclosure; provider retention settings apply. The request uses the existing verified tool-free prediction boundary, not a shell-enabled Work task.
- Opening Finance, calculating totals, changing budgets and viewing samples do not call a model. Source amounts/dates and currency grouping drive deterministic calculations; model prose is not the ledger.

## Tasks

### Task 1: Financial data model and calculations

- [x] Add types, bounded validation, currency-safe integer money, deterministic balances/cash flow/category/recurrence summaries, and RFC-style CSV parsing with preview/deduplication.
- [x] Write and run failing tests first for transfers, pending/replaced transactions, refunds, mixed currencies, missing balances, malformed CSV, quoted fields, duplicate import and recurrence estimates.
- [x] Implement and pass `node --test test/finance-model.test.mjs`.

### Task 2: Protected store, Plaid client, and service

- [x] Add encrypted atomic persistence and serialized updates; fail closed if protection is unavailable or data is corrupt.
- [x] Implement Hosted Link, completion/token exchange, reconnect/update mode, accounts, full paginated sync, unlink, and clear-local-data behavior with bounded fixed API endpoints.
- [x] Add CSV import preview/commit, budgets, safe snapshots, source freshness, and explicit error/recovery states.
- [x] Prove secrets stay out of snapshots/errors, partial pages never commit, cancellation/restart retains recoverable state, and unlink failures do not falsely report revocation.
- [x] Pass `node --test test/finance-store.test.mjs test/finance-plaid.test.mjs test/finance-service.test.mjs`.

### Task 3: Work UI and explicit questions

- [x] Add Finance entry in Work, overview cards/charts, transaction search and account filters, recurring estimates, editable budgets, account management and last-sync/error states.
- [x] Add sample/empty/import/setup/link/reconnect flows; supported CSV mapping and sign convention are explicit before import.
- [x] Wire the native bridge and an honest desktop-only fallback in browser preview. Add a tool-free, cancellable Muse question adapter with no automatic generation or finance data in ordinary Work artifacts.
- [x] Verify keyboard activation/narrow layout, sample isolation, import preview, budget updates, owner failure handling and Stop behavior. Real missing/connected-provider acceptance remains below.

### Task 4: Verification and handoff

- [x] Run focused finance tests, TypeScript/build and affected Work/native bridge regressions.
- [x] Run isolated native/browser acceptance and visually inspect desktop/narrow screenshots. Never use the installed profile or real bank accounts as fixtures.
- [x] Review the finance patch with a fresh reviewer; fix actionable defects and rerun affected checks.
- [x] Document configuration, data/sign/recurrence assumptions, privacy boundaries, actual verification and remaining live Plaid/Muse prerequisites. Keep local; no publication/installation.

## Acceptance

CSV import → review → persisted transactions → accurate totals/budgets → restart/reopen must work without Plaid or a model. Configured Plaid must follow a real API path with no fake connected state. A fake transport is contract evidence only; real Sandbox/Production verification remains unverified until credentials and the consent flow are supplied. Unknown balances are unknown, pending and transfers do not inflate spend, currencies are never silently combined, and recurring charges/upcoming dates are estimates with evidence.

## Progress ledger

- 2026-11-05: Resumed after outage. Source branch `codex/work-creative-studio`, HEAD `8b1572d`, substantial pre-existing uncommitted studio work. No finance code existed. Existing branch retained to integrate with that work; all unrelated changes preserved. Native worktree inventory was empty.
- Ruling: Implement the user's requested local finance flow now; do not stall on a separately deployed broker or absent Plaid credentials. Developer-owned credentials are an explicit local integration mode, not a consumer-ready hosted backend.
- Ruling: Use targeted checks per AGENTS.md rather than automatically running every unrelated local CI group.

- 2026-11-05: Implemented the Finance model, encrypted store, Plaid lifecycle/sync adapter, CSV preview/import, budgets, Work UI and independent tool-free question owner.
- Review: Resolved initial-empty Plaid sync, delayed replies crossing views, inaccessible clear-data controls, pagination/source filters and sidebar navigation. Native verification additionally caught the async Electron decryption return contract and dark-theme token mismatch; both were fixed and rechecked.
- Verification: 100 focused tests plus the native prediction-boundary test passed; full source build passed; 12 isolated desktop scenarios passed, including actual OS-encrypted storage across restart. Latest report: `artifacts/finance/native-p0V2ac/report.json`. No renderer errors. Details: [verification record](../../validation/work-finance.md).
- Handoff: [Finance setup, architecture, limits and follow-up work](../../FINANCE.md). Changes remain local; no release or installation was performed.

## External acceptance still pending

- [ ] Exercise real Plaid Sandbox consent, synchronization, reconnect and revocation with the user's own approved credentials.
- [ ] Exercise Production after Plaid/institution approval and explicit account consent.
- [ ] Verify a real Muse answer with the native runtime installed and signed in; fixture answers are not live provider evidence.
- [ ] If a consumer experience without developer credentials is desired, implement and operate the authenticated Plaid broker described in FINANCE.md as a separately scoped service.
