# App-owned remote OAuth: final local acceptance, 30 October 2026

All 18 selected roadmap rows are implemented. This consolidated final OAuth correction passes source, actual pinned-native, real OS-protection and fresh exact-package acceptance. The code freeze is `1d05d9c0d7c406dd7f1b6d207643d6e7dcc0b8ae` (tree `baa5c1309aaa744b9117b7ab2f4e8838f73a6030`). The final documentation commit changes no frozen production/build/helper/harness input. Parent scoped independent rereview, latest CI/publication and exact installation remain separate gates. **0.2.241 is the last historical verified installed checkpoint**, not a claim that unpublished OAuth is installed; no speculative next release number is assigned.

## Consolidated findings resolved

- **P2 refresh save recovery:** a known returned result whose protected completion fails during provisional preconnection transfers to bounded local-save capability only while the exact selected main task/root/epoch matches. Ordinary failed connection cleanup revokes execution and preserves that exact epoch; no general adoption or dead-runtime authority exists. Source/revision/auth identity/latest enrollment/refresh transaction/account generation/review/deadline guard local saving, including synchronous durable publication. Connected recovery retains keyed live-lease authority. Explicit close/cancel/source/account/owner/expiry rejects stale saves; local Retry repeats no POST/browser/code exchange or native turn.
- **P2 connected UI:** only local status/cancel/retry becomes reachable when connected and idle. Execution/account changes stay locked; active work disables recovery. Current idle projection is restored only for auth preparation failure before native submission. The real production RuntimeDialog/controller/runtime/factory/store tests demonstrate zero native turns through recovery, then one deliberately requested synthetic native turn.
- **P3 presentation/scopes:** compact Ready has explicit details, reauthorization and local Forget disclosures. Discovery/details/Forget consent states are independent. Approved scopes come from the exact durable binding; unavailable information is omitted rather than displayed as None. No inner source scrollbar remains in the accepted Ready view.
- **Documentation:** factory cases are correctly traced to `test/discovery-oauth-integration.test.mjs`, preserving existing config tests without duplicate filename-only changes. [Decision/cost history](2026-10-30-remote-oauth-decisions.md) retains original and superseded ledger rulings. Baseline warning disclosure includes missing author.

## Current frozen checks

| Check | Result | Evidence under `artifacts/remote-oauth/` |
| --- | --- | --- |
| Focused service/store/identity/flow/callback/factory/controller/runtime/session/CI |281 passed, 0 failed/skips|`task3-final-wave-freeze-focused.txt`|
| One final `npm.cmd test` |1,924 passed, 0 failed, 1 existing optional skip; 1,925 total|`task3-final-freeze-full-test.txt`|
| One final `npm.cmd run build` |TypeScript/native/Vite passed|`task3-final-freeze-build.txt`|
| Source browser/Electron OAuth controls |8 checks each,390/1280 and independent consent/scopes|`ui/browser-ANEu5r/report.json`, `ui/desktop-XgWMZ8/report.json`|
| Real production dialog/controller/runtime browser/Electron |4 checks each, idle connected local recovery and active locks|`recovery-ui/browser-798yme/report.json`, `recovery-ui/desktop-bWj88f/report.json`|
| Existing full renderer discovery browser/Electron |8 checks each|`task3-final-freeze-existing-ui.txt`|
| Actual source Electron45 async safeStorage |6 checks, two isolated fake-credential processes|`protection/source-ZpsJP6/report.json`|
| Actual source pinned Muse current/legacy |5 scenarios / 14 scripted Responses each; approved effect1, denial0additional, marker/restart/Forget and cleanup|`native-source-current-6xEhP5/report.json`, `native-source-legacy-oCQIIt/report.json`|
| Fresh directory package |Build passed, never installed|`task3-final-freeze-package-build.txt`|
| Fresh exact-ASAR wrapper |All 5 children exit0; current+legacy actual native5 scenarios / 14 requests each, protection6, exact shared renderer8, verifier 312 files|`package/acceptance-b8gT3s/report.json`|
| Immutable acceptance |564 source/build/helper/harness inputs and76 package files equal before/after|Same wrapper report, `immutableInputs:true`|

The new wrapper passed directly; no failed-wrapper composition was needed for this freeze. Each native run retains60s/32request/1MiB/2000event maxima (script uses stricter24request cap), actual locally PKCE-minted bearer acceptance and seeded-bearer rejection, no inference/personal credentials, confirmed process/socket cleanup and exact owned disposable-root removal. Source and packaged safeStorage are actual Electron45 APIs; UI recovery uses the real product dialog/controller/runtime with only the external native process simulated. That separate fixture deliberately submits one native protocol turn only after explicit save and send; it makes no inference. The native current/legacy acceptance uses actual pinned Muse with scripted loopback Responses. Exact-ASAR visual UI uses a disposable bridge/local service, so it does not claim personal-provider or full production IPC/provider acceptance.

Production-path regression proves expired-grant preconnection refresh, one injected completion-write failure, ordinary real runtime/factory owner cleanup with confirmed host close and no session/turn submission, explicit local retry preserving binding with1 refresh total/0 new browser or code exchanges, then a freshly reviewed usable connection. Held publication cancellation retains durable intent without publishing stale candidate. Additional source/account/latest-binding/owner/expiry/explicit-close and repeated-write-failure cases reject stale recovery. Existing busy-refusal, provisional generation, observed-authority, terminal status, no-replay and supersession regressions remain green.

## Current immutable identities

- Source freeze: `1d05d9c0d7c406dd7f1b6d207643d6e7dcc0b8ae`; source/build/helper/harness aggregate `ffd081e99c615559140353a9e4bd7ab5e3ba949ca07fc0fa4d6f056080b691dd` (564 entries).
- Exact package: `artifacts/remote-oauth-package/win-unpacked/MuseBench.exe`; ASAR SHA-256 `866178fbe3cee60a0af012cfba479458ae6e00bb8416f2672a132caa6444790f`; EXE `f6e7efa85c1b6094a14ddc942d093de119d9997af183cdc057b0005634162606`.
- Exact-ASAR renderer: `c61b16bb8866bad49d3108a6d8814dc1fbd2ba25fc58836393d2bf755ab86115`.
- Wrapper receipt: `package/acceptance-b8gT3s/report.json`, SHA-256 `8a3137b5dac8e39eaacd6538876f88292b906c74aa0dc5778fdecf28c710328a`.
- Focused/full/build/package-build log SHA-256 respectively: `6349fda4c1d6cd748910a9da942a51d134deccd974ae525c3d96ebbcb94be22e`, `dc0edb59bec78481679619c128bd453bcfb4e10c359a2750ad3c5302016ff7f0`, `7102b0761829d111c5941d57d46cb685fdd361434b8dfec5e5a2f579b7699b6a`, `e0732e59903ae5996536d8ae2dc184da6fa89653d836173b6a0747094b03c457`.
- Complete source/build/package manifests, child commands/logs and before/after equality are in the wrapper report. Individual final report/log hashes are indexed in `task3-final-freeze-evidence.json`.
- Pins unchanged: Muse SDK1.4.14, local MCP SDK1.32.2, remote client/core2.4.0, Electron45.0.0; lock SHA-256 `ae079d7bad104f4234771a5631b0396806919b1ec3897eba566835261afebbf0`; packaged Job helper `ded994433f6f9893aa533b0ee234f94708fee4eebc696b8ea40f04347e26d27e`, speech helper `b289d622b57928d7892e37f5999331c145b02470e6246ab9aa4b9ea8dfc6b7af`.

Parent independently rehashed all564inputs / all76 package files and checked before/after equality, all 5 child exit0 and current/legacy/protection/UI receipts. Parent also inspected exact-ASAR390/1280 screenshots and confirmed selector +compact Ready/read scopes visible without inner source scrolling. No tests were rerun for that independent evidence check.

## Preservation and limits

The previous `artifacts/remote-oauth-package` was moved using checked canonical workspace paths to `artifacts/remote-oauth-package-pre-final-wave-20261030`; its ASAR stayed `14ae3aec17de91311992bc2adf7935edd465a82ddeb7435aa6ac6be5ed4badfe`. Receipt `package/final-wave-archive.json` records exact old/new paths and equality. Earlier `remote-oauth-package-pre-authority-20261030`, all historical successes/failures, reports and failed roots remain. Historical evidence below binds its prior source only.

Warnings remain baseline/configuration debt: SQLite ExperimentalWarning; Vite large-chunk warning; missing package author; duplicate dependency references; executable signing deliberately skipped by current config. No pin/package metadata/signing/chunk policy change or warning-free claim is made.

No provider/model inference, personal/native OAuth storage, grant/account/security changes, install, push, merge, other-tree writes or subagents occurred. Public-client registration/admin policy, entitlement/TLS/PKCE/CIMD compatibility, real-model selection, unsupported native source/schema/retention features and remote effect cancellation remain explicit prerequisites/limits. Parent owns scoped rereview and exact current release/install; [241](2026-10-30-desktop-0.2.241.md) remains historical.

## Historical pre-correction acceptance and receipts


Historical correction round1 checkpoint: independent review of `dfdc1abb320fd836fdad5c9f52d73aaf04cd92f0`: a refused source-wide account mutation could temporarily gate or revoke busy background authorization. Trusted synchronous mutation reservation now precedes source lookup, source-blocking flags and revocation; accepted reservations block new factory/dispatch/idle admission and retain existing provisional/refresh race protections. The focused correction suite passes265/265 with0failures/skips. The full/build/native/protection/package receipts below remain historical evidence for the old immutable source, not acceptance of this correction. No broad suite/build/native/package rerun occurred in this scoped round; a refreshed final freeze/package is required after whole-feature review. All prior artifacts/packages remain intact.

Task3 completes the app-owned public-client sign-in path for reviewed disabled global remote MCP sources. This is local source, real native, OS-protection and exact-package evidence. Independent whole-feature review, publication, installation and personal-provider compatibility remain separately owned. Desktop **0.2.241** remains the installed release; its [separate receipt](2026-10-30-desktop-0.2.241.md) predates OAuth delivery.

## Behavior and authority

The shared connection review provides explicit Prepare, destination/issuer review, Begin, Cancel, manual public client ID/callback port, Check status, Retry saving and Forget. Successful enrollment clears source execution selection; it starts no connection, search or message. Forget deletes local credentials without provider revocation or native/browser logout. No confidential-client secret field or fabricated publisher registration is supplied.

Main owns the encrypted ledger, selected interactive owner, independently keyed live runtime owners and synchronous source snapshots. Only the authenticated private worker route returns an access token, bound to its source/revision/enrollment/native session. Tokens never enter native bootstrap, argv, environment, persisted selections, renderer state or model schemas. The token-only remote adapter cannot refresh, escalate scopes, open a browser or replay an unauthorized operation. Pre-turn refresh uses an atomic idle admission gate and epoch/live-owner checks.

Actual pinned Muse launches the gateway lazily. Trusted native session/read and Ask me proof therefore bind the private lease before the first turn; an eager authenticated bootstrap must agree with that exact identity. New enrollment durably retires older same-source/same-auth-identity reusable tokens, so restart or Forget-latest cannot revive a saved older marker. Navigation cancels interactive sign-in while unchanged background runtime owners remain valid. Actual close/root/epoch/source/account changes revoke execution authority.

Factory inspections are serialized with immutable effective-environment snapshots and failure recovery. Observed global file/profile/environment/review/plugin changes invalidate all root snapshots. Root/overlay changes preserve matching durable enrollment but require fresh execution review. This is observed-change authority; no atomic detection of unobserved filesystem edits is claimed. Terminal status projection captures an attempt, checks exact identity after awaits and preserves only current safe failed/cancelled state without invalidating a replacement.

## Final checks

| Check | Result | Retained evidence under `artifacts/remote-oauth/` |
| --- | --- | --- |
| Focused store/flow/callback/service/identity/integration/runtime/broker/controller/session/security/CI regressions | 260 passed, 0 failed/skipped | `task3-frozen-focused.txt` |
| `npm.cmd test` | 1,903 passed, 0 failed, 1 existing optional skip (1,904 tests) | `task3-frozen-full-test.txt` |
| `npm.cmd run build` | TypeScript, native helper and Vite passed | `task3-frozen-build.txt` |
| OAuth source browser / Electron | 7 checks each; real local PKCE, seeded bearer rejected, 390/1280, safe error/save/cancel/Forget | `ui/browser-DbJLL7/report.json`, `ui/desktop-r2L4av/report.json` |
| Existing discovery full-renderer browser / Electron | 8 checks each, original endpoint/header assertion retained | `task3-existing-discovery-ui-corrected.txt` (reports under `artifacts/discovery-tools-ui/`) |
| Real source Electron45 async safeStorage | 6 checks, two actual Electron processes | `protection/source-FEDY4e/report.json` |
| Source real pinned Muse current / legacy resource | 5 scenarios each, 14 scripted Responses each, one approved effect, denial adds zero | `native-source-current-l1egcN/report.json`, `native-source-legacy-5Gnesy/report.json` |
| Exact ASAR production/native/dependencies/helper verifier | 312 files matched | `package/acceptance-myBMr7/package-verification.json` |
| Exact ASAR real pinned Muse current / legacy | 5 scenarios each, 14 scripted Responses each, confirmed process/socket cleanup | `package/acceptance-myBMr7/native-current/report.json`, `native-legacy/report.json` |
| Exact packaged Electron45 async safeStorage | 6 checks, isolated fake credentials/restart/rotation/crash intent | `package/acceptance-myBMr7/protection/packaged-ESkWQD/report.json` |
| Exact ASAR full shared renderer | 7 OAuth checks, 390/1280, unchecked source plus zero connect/send dispatch | `ui/packaged-X42rN3/report.json` |
| Final immutable aggregation | All 76 package files unchanged; 562 source/build/helper/harness inputs recorded | `package/task3-final-acceptance.json` |

Native scenarios cover approved search/call once, native denial, reconnect with same native session/enrollment and zero new exchange, new enrollment rejecting saved marker through service/store restart, and Forget-latest with no older access revival. Both current 2026-07-28-only and supported legacy 2025-11-25 POST-SSE resources accept only locally flow-minted PKCE tokens. A seeded bearer is explicitly rejected. The fixture has stricter 24 scripted Responses request cap (within the planned32), 60 seconds, 1 MiB body and 2,000 events. Reports declare zero model inference and no personal credentials. Cleanup confirms owned process exit and zero resource sockets; successful disposable roots are removed only after exact resolved-path validation. Failed receipts/roots are preserved.

The real protection test proves ciphertext excludes fake markers; same dataDir decrypts after simulated restart/update; two rotations preserve another grant and marker; supersession persists; pending refresh intent blocks reuse; bad crypto/unknown schema preserve exact bytes. This does not imply a real installer update or personal credential access.

## Frozen package and inputs

Built once after final production verification using:

```
npm.cmd exec electron-builder -- --win --dir --publish never --config.directories.output=artifacts/remote-oauth-package
```

Historical retained package originally at `artifacts/remote-oauth-package/win-unpacked/MuseBench.exe`, now preserved at `artifacts/remote-oauth-package-pre-final-wave-20261030/win-unpacked/MuseBench.exe`. It was never installed. Earlier pre-correction staging package is preserved separately at `artifacts/remote-oauth-package-pre-authority-20261030`.

- Source baseline: `3720b7bed09fcb979ca7b915d8798e015e7bd4db` plus the Task3 commit containing this document. Exact file manifest, rather than a mutable branch name, binds acceptance.
- Final 562-input SHA-256 aggregate: `a4912f8b91ffd27cad9a13841cde26e6ba0944468bf79a1e3d1c3977242e8d16`.
- ASAR SHA-256: `14ae3aec17de91311992bc2adf7935edd465a82ddeb7435aa6ac6be5ed4badfe`.
- Executable SHA-256: `6548a085eab1105e7d3c0f64898f8c220e24783466a917ff3a0c606f1260cb1c`.
- Packaged renderer SHA-256: `53d6db6b5c6609b202b4a6796a5a2313c36a160f0e861e889afd5760f2abc825`.
- Native helper SHA-256: `ded994433f6f9893aa533b0ee234f94708fee4eebc696b8ea40f04347e26d27e`.
- Unchanged lockfile SHA-256: `ae079d7bad104f4234771a5631b0396806919b1ec3897eba566835261afebbf0`.
- Pins unchanged and source/package metadata compared: Muse SDK1.4.14, local MCP SDK1.32.2, remote MCP client/core2.4.0, Electron45.0.0.
- Final focused/full/build/package-build log SHA-256 respectively: `c81b2b293c539cba33951d095571ef7401127f5e4626607642db1211be71abf1`, `ea985b73c8094caaffcc61998a23be436b1cc38ea7bab8b0729a2f9d057d9b2d`, `79d2810de1ce254144689e151fc9774002a61d2ec695df7fc43ca9b4ab6d307f`, `e0732e59903ae5996536d8ae2dc184da6fa89653d836173b6a0747094b03c457`.
- Final aggregate receipt SHA-256: `a84d0bd2f3bd2e7ec13fdb03d664f71c3692dee7ed303f950d438e5776826170`; it retains individual receipt hashes and complete before/after manifests.

The bounded wrapper is `node scripts/discovery-oauth-packaged-contract.mjs --local-fixture` with `MUSEBENCH_EXECUTABLE` explicitly set to this exact task package. Its initial runs retained successful native/protection/verifier receipts but stopped in a new packaged UI fixture: missing Markdown loader, Windows ASAR path normalization, then an overstrict disabled-Connect assertion. Only the affected UI was repeated after correcting those harness assumptions. The final combined receipt compares the retained package manifest before all acceptance with its final manifest; all production/build/helper inputs remain identical. Its only changed source-manifest entry is the final UI harness, with final digest recorded. No package rebuild or passed native/protection rerun followed these UI-only corrections. Future full wrapper runs use the corrected fixture.

## TDD, CI and limits

RED receipts precede implementation: missing integration/private route/token behavior; lazy session binding; durable enrollment supersession; delayed/cross-root source authority; held-resolver terminal/replacement/status/Forget disposition. GREEN service/store supersession57/57, source-authority36/36 and terminal disposition47/47 are retained alongside final260/260. Earlier full1,896 and1,898 receipts are explicitly pre-correction, not final acceptance. Initial failing native and UI receipts remain intact.

The existing sequential native CI group now adds direct browser OAuth UI, Electron OAuth UI and real local Electron fake-credential protection commands, preserving all existing commands once. Exact required-check tests and sanitized UI/protection report upload globs were updated. Actual pinned Muse OAuth acceptance stays an explicit local command; CI does not install a provider/native binary for it. Existing parallel release topology is unchanged.

Build output retains the existing Node SQLite experimental warning and Vite large-chunk warning. Packaging reports missing author, duplicate dependency references and deliberately skipped executable signing under the current configuration. These are disclosed warnings, not failed checks. No grants/accounts/security settings were changed; no personal/native OAuth store was read; no real provider or model request, install, push or merge occurred. Local fixture compatibility cannot prove provider entitlement, provider-specific registration/admin approval, public-client/PKCE support, real model selection or remote effect cancellation. Those remain explicit product/provider acceptance boundaries.
