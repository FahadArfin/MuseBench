# Native control during Windows updates

The installed 0.2.189 update exposed an actual installer failure: an idle, externally owned MCP process used the installed MuseBench.exe and ASAR. Closing the app window did not release that executable. The same verified installer succeeded after closing only the confirmed idle helper. See [installed acceptance](2026-10-30-desktop-0.2.189.md).

The correction returns a Windows MCP configuration backed by verified, immutable files in the existing private profile cache. It bundles the existing SDK relay and copies the shipped Electron executable, ICU data, V8 snapshots and notices outside the installation folder. It does not add a runtime download, new permissions, tool capabilities or model calls. Non-Windows configurations are unchanged. Existing clients need one configuration refresh; retained clients keep their previous schema until refreshed.

## Evidence

- Initial focused tests failed on missing cache implementation and a synchronous function being returned as configuration. All nine focused filesystem/host cases passed after implementation.
- A standalone real-runtime test initially failed with `Error loading V8 startup snapshot file`. Adding the shipped snapshot assets made actual MCP negotiation pass; a version-only executable probe was insufficient evidence.
- Full offline suite after review corrections: **1,563 passed, one existing optional replay test skipped**, no failures. Production TypeScript/Vite/native-relay build passed.
- Native control smoke: **16 checks passed**, including real Electron shell navigation, visible screenshot pixels, cancellation behind a stalled renderer, immediate revocation, normal app shutdown and shared browser preview. The four lifecycle checks use an isolated app-service fixture with actual Windows runtime/filesystem locks and the real MCP SDK transport.
- Lifecycle proof keeps the client alive while removing and replacing disposable original executable, ICU, snapshot and relay files. Calls while the host is closed fail without replay; the same client reads a reopened host using a rotated token. Revocation still blocks it.
- Windows directory package, package integrity check and actual packaged UI smoke passed. The packaged app generated the cached command itself; that command negotiated MCP and inspected/navigated the actual ASAR-backed app. No handwritten alternate connection configuration was substituted.

Local evidence is retained under `.superpowers/sdd/2026-10-30-native-control-update-lifecycle/` and `artifacts/native-control/`, `artifacts/portable-desktop/`. These are isolated fixtures. Personal installed acceptance, client migration and exact-source published release checks remain separate delivery gates.

## Independent review

One fresh read-only review covered `98f8342..c404cd18e32e1f0967df0bbb727f58b0912b9b0c`. It reproduced an Important issue: hard links can pass regular-file and symbolic-link checks while allowing an external pathname to mutate the advertised cache. Separate runtime and relay regression tests both failed before correction. Published files now require a single link; concurrent publication waits briefly for the publisher to remove its temporary link, without changing or repairing external files. All 11 focused tests, the standalone lifecycle check, full suite and packaged cache/UI checks passed after the correction. No second review substituted for these regression checks.

Deferred minor: the generic preparation-error text does not distinguish integrity failures from temporary filesystem errors. Repeated integrity failures require the specific manual repair in the [App control guide](../native-app-mcp.md), rather than merely refreshing. No automatic cache deletion or repair was added.

Review rulings: real installed release/client migration remains a required delivery gate, not inferred from fixtures; old cache versions remain to avoid disrupting clients (local disk cost); non-Windows update lifecycle stays outside this Windows-focused correction (those clients retain the prior behavior).

## Tradeoffs

The private cache adds local disk use, not a second downloaded executable. Identical runtime bytes are reused; a newly stamped executable can require another version. Old versions are retained because external clients may still use them. A corrupted or linked cache fails closed instead of overwriting a running file. The app remains usable and the grant is unchanged when preparing a connection fails. No idle connection is treated as permission to interrupt model work during an update.
