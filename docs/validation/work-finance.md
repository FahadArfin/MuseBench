# Work Finance verification

Verified locally on Windows on 2026-11-05 America/New_York (2026-11-06 UTC), on `codex/work-creative-studio` with base HEAD `8b1572db45e81e72f12b35e10138efeb7485bfa2` plus the local working changes. This is source-build evidence, not a release, installed-app update, live Plaid integration certificate or GitHub CI result. Substantial existing creative-studio work was preserved.

## Completed checks

| Check | Result | Evidence |
| --- | --- | --- |
| Finance model, Plaid transport, store, service, native adapter, question owner; affected shutdown/billing/Work regressions; CI registration | 100 tests passed, 0 failed | `artifacts/finance/focused-tests.log` |
| Existing native prediction permission boundary | 1 test passed, 0 failed | `artifacts/finance/runtime-boundary.log` |
| Native helpers, TypeScript, Vite, file viewer and native MCP build | Passed; Vite retains its bundle-size advisory | `artifacts/finance/build.log` |
| Isolated Electron finance acceptance | 12 scenarios passed, no renderer errors | `artifacts/finance/native-p0V2ac/report.json` |
| Diff whitespace check | Passed; Git emitted line-ending notices only | `git diff --check` |

The focused test command was:

```powershell
node --test test/finance-model.test.mjs test/finance-plaid.test.mjs test/finance-store.test.mjs test/finance-service.test.mjs test/finance-questions.test.mjs test/finance-desktop.test.mjs test/main-close-admission.test.mjs test/code-billing.test.mjs test/work-service.test.mjs test/work-catalog.test.mjs test/ci-suites.test.mjs
node --test --test-name-pattern='prediction mode' test/exec-runtime.test.mjs
npm.cmd run build
node scripts/finance-smoke.mjs
git diff --check
```

Checks were fresh, not reused from prior commits or releases. The native report records hashes of the tested Finance modules and probe. `npm.cmd run test:finance` runs the desktop probe and is registered in the required native CI group for future CI execution. The full local CI matrix and release preflight were not run; targeted verification follows AGENTS.md.

## Desktop acceptance

The probe launches only the source app with its own generated `MUSEBENCH_DATA_DIR` and projects directory. It closes/reopens that test process to establish persistence. It never attaches to, closes, installs or modifies the installed app/profile. Every record and credential value used by the probe is a fixture.

1. Open Finance through Muse AI → Work; activate the fictional example by keyboard. Local answers leave personal storage empty and sharing disabled for the example.
2. Inspect the overview at desktop and 820 × 900 viewport sizes with no Finance horizontal overflow. Dark and light Finance screenshots were inspected after correcting the theme-token mismatch. The narrower view stacks the charts.
3. Connect without configuration opens explicit setup defaulting to Sandbox, without fabricating a connected bank.
4. Change settings after CSV preview; the stale preview disappears before commit.
5. Import 56 CSV records through the actual file-picker adapter, trusted IPC, calculations and encrypted store. Expected USD results: $1,000 income, $152 spending, $848 net cash flow; a $200 transfer is excluded and refunds reduce spending. Balances remain unknown.
6. Import a second currency and switch currency/source while paginated; page/filter state resets correctly.
7. Reimport the original CSV; preview reports zero new rows and total records remain unchanged.
8. Save a category budget, close/relaunch the isolated app, and read back 112 records and the saved budget through actual Electron OS encryption. Stored ciphertext does not contain fixture merchant names.
9. Inject a delayed answer in the isolated fixture's Ask IPC, switch to the example, and verify the private prior-view answer is discarded. The real import/storage IPC remains active.
10. Stop a pending fixture answer and verify a concurrently completed reply is not shown.
11. Remove all sources, save fixture Plaid setup, and clear that setup and budgets through always-accessible connection settings.
12. Use the sidebar's New work action to leave Finance and return to the existing Work home.

Images are retained under `artifacts/finance/native-p0V2ac/`: `01-empty.png`, `02-overview.png`, `02-overview-light.png`, `03-narrow.png`, and `04-imported.png`. These use fictional/imported fixture data only. Layout inspection and keyboard activation do not establish full screen-reader or physical-device accessibility acceptance.

## Review fixes and regression coverage

A separate read-only reviewer identified three material issues plus a pagination issue. Fixed and covered:

- Plaid's valid initial terminal empty cursor now keeps fetched accounts visible with a preparing state; later sync transitions to connected.
- Delayed Ask results are bound to the original source/month/currency/revision. Cancellation invalidates replies too.
- Connection settings can clear saved setup/budgets after the final account disappears.
- Currency/source changes reset pagination and unavailable account filters.

Additional checks cover institution-scoped identifiers, pending-to-posted replacement, modified/removed transactions, staged pagination rollback/restart, unknown token-exchange outcomes after reopen, explicit link-dismissal acknowledgement, failed revocation retention, corrupt/unavailable encrypted storage, asynchronous Electron decryption, exact bounded money arithmetic and unconfirmed question cleanup. The native reopen test caught and fixed the async decryption return-contract mismatch; a contract test now reproduces it independently.

## Still requires external acceptance

- Real Plaid Sandbox Hosted Link consent, token exchange, institution history, reconnect and revocation using a configured developer application. Transport fixtures prove controller behavior against the documented contract; they do not prove Plaid network acceptance.
- Production Plaid approval, institution/OAuth requirements, credentials, fee review and a real consenting account. No shared consumer broker has been deployed.
- A real answer through a signed-in, installed native Muse runtime. Tests prove ownership, source binding, Stop and the existing tool-free argument boundary, not provider answer quality or provider retention behavior.
- macOS/Linux OS encryption and platform-specific UX; the native acceptance here is Windows.
- Public release/installer/updater/CI validation remains a separate user-authorized batch. No publication, installation or installed-profile repair occurred.

See [Finance setup and boundaries](../FINANCE.md) and the [implementation plan](../superpowers/plans/2026-11-05-work-finance.md).

## Publication authorization and local release gate

The user subsequently authorized publication of this combined Finance/Creative Studio batch. `npm.cmd run release:preflight` passed all six checks, and `node scripts/run-ci-suite.mjs unit --reuse` passed **2,814 tests with no failures or skips**. Both timing reports recorded `reused:false`, `evidenceStable:true`, and the same source/build/runtime fingerprint: `9859de388111d5ee64823609131e00879b8a7ce620e245b77ed2e876b52ba6c3`. These are local release-candidate checks. The release workflow must still run all required GitHub CI groups and verify/package/publish the exact commit. Installation is not part of this release authorization.
