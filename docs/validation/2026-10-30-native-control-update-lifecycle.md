# Native control during Windows updates

The installed 0.2.189 update exposed an actual installer failure: an idle, externally owned MCP process used the installed MuseBench.exe and ASAR. Closing the app window did not release that executable. The same verified installer succeeded after closing only the confirmed idle helper. See [installed acceptance](2026-10-30-desktop-0.2.189.md).

The correction returns a Windows MCP configuration backed by verified, immutable files in the existing private profile cache. It bundles the existing SDK relay and copies the shipped Electron executable, ICU data, V8 snapshots and notices outside the installation folder. It does not add a runtime download, new permissions, tool capabilities or model calls. Non-Windows configurations are unchanged. Existing clients need one configuration refresh; retained clients keep their previous schema until refreshed.

## Evidence

- Initial focused tests failed on missing cache implementation and a synchronous function being returned as configuration. All nine focused filesystem/host cases passed after implementation.
- A standalone real-runtime test initially failed with `Error loading V8 startup snapshot file`. Adding the shipped snapshot assets made actual MCP negotiation pass; a version-only executable probe was insufficient evidence.
- Full offline suite: **1,561 passed, one existing optional replay test skipped**, no failures. Production TypeScript/Vite/native-relay build passed.
- Native control smoke: **16 checks passed**, including real Electron shell navigation, visible screenshot pixels, cancellation behind a stalled renderer, immediate revocation, normal app shutdown and shared browser preview. The four lifecycle checks use an isolated app-service fixture with actual Windows runtime/filesystem locks and the real MCP SDK transport.
- Lifecycle proof keeps the client alive while removing and replacing disposable original executable, ICU, snapshot and relay files. Calls while the host is closed fail without replay; the same client reads a reopened host using a rotated token. Revocation still blocks it.
- Windows directory package, package integrity check and actual packaged UI smoke passed. The packaged app generated the cached command itself; that command negotiated MCP and inspected/navigated the actual ASAR-backed app. No handwritten alternate connection configuration was substituted.

Local evidence is retained under `.superpowers/sdd/2026-10-30-native-control-update-lifecycle/` and `artifacts/native-control/`, `artifacts/portable-desktop/`. These are isolated fixtures. Personal installed acceptance, client migration and exact-source published release checks remain separate delivery gates. Independent review follows the completed implementation.

## Tradeoffs

The private cache adds local disk use, not a second downloaded executable. Identical runtime bytes are reused; a newly stamped executable can require another version. Old versions are retained because external clients may still use them. A corrupted or linked cache fails closed instead of overwriting a running file. The app remains usable and the grant is unchanged when preparing a connection fails. No idle connection is treated as permission to interrupt model work during an update.
