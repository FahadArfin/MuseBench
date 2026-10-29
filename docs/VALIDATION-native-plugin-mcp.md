# Reviewed plugin tools

Validated against Muse CLI and SDK 1.4.14 on 29 October 2026.

Installed plugin details now inspect executable capabilities on demand. Each supported stdio MCP server shows its command arguments and separate Review access / Revoke access controls. The confirmation binds the selected plugin, package bytes, native definition and settings revision. Installation and inventory review alone never approve a native tool. Unsupported capability kinds and transports remain visible without an approval button. A custom XDG plugin store remains unsupported and is explained before attempting approval.

MuseBench calls the official per-capability `plugins approve` / `plugins reject` command, verifies its single-capability result, rereads the native record and unchanged package/configuration, then stores a separate app grant. Failed or uncertain writes cannot inherit an earlier grant. Changed native hashes, package bytes, inventory identity or settings location invalidate the grant. Explicit native rejections confer no execution permission. Native saved trust and arbitrary managed sources stay outside this feature.

An interactive connection binds the relevant MCP, plugin and hook configuration at startup. A later reviewed change requires reconnecting before another positive operation. Stop/cancel and negative decisions retain their existing behavior. Exec hosts continue to check current configuration when launched.

## Native evidence

The owned fixture used an isolated temporary profile and a generated inert local stdio server. No account credentials, user plugins or model allowance were used.

- Actual CLI inspection, per-server approval and revocation, native settings read-back and app grant all passed.
- MuseBench's real runtime connected to the pinned host with normal configuration and permission verification. The test deliberately selected the local echo provider and verified `session/read.providerId === 'echo'` before every native turn.
- Two direct SDK echo turns on these runtime-owned connections initialized the plugin and requested `tools/list`. Both completed. Both fixture processes exited; host shutdown was confirmed.
- The real configuration revision changed after an explicitly reviewed disabled-server edit, and reconnect accepted the current configuration. The stale-host refusal gate is separately covered by runtime unit tests.
- Revoking the app grant blocked the next configuration check.

The production model selector intentionally accepts only Meta model catalogs. This fixture did not substitute echo for a Meta model in production routing. It proves native loading/discovery, not a model selecting or invoking a plugin tool. The recorded native methods contain no `tools/call`. Actual model acceptance remains a separate, usage-authorized check.

The pinned CLI normalizes its public inspection record: cache paths become absolute, the persisted `muse` manifest family is displayed as `native`, and internal agent-parser metadata is omitted. Its settings writer also canonicalizes the top-level `mcp_servers` key to `mcpServers`. Tests allow exactly those observed representations; package, server values and all other settings stay bound to their original values.

## UI and regression coverage

The shared preview and Electron renderer fixture covers keyboard activation, explicit consent, approve/revoke read-back, unsupported capability states, failed refresh recovery, stable idle details, late inspection results, shared Installed rows and narrow wrapping. Preview actions are visibly simulated and do not modify desktop configuration. The new smoke check runs in CI.

The existing five-category catalog checks still cover compact controls, retained rows and scroll position during refresh, full-directory search, 240-row continuous scrolling, source/category switching and Installed/Discover parity. Native source receipts and UI screenshots remain in ignored `artifacts/native-plugin/` and `artifacts/plugin-tools-ui/`.

The full local suite passed 1,304 tests. The production build, catalog preview, catalog desktop, plugin-tool UI checks and shared preview parity checks passed. The native fixture was repeated after the review fixes and passed with zero model requests.

The independent final review found two command-display problems: a generic diagnostic sanitizer could remove code following a URL, and inline credential flags were not consistently hidden. A command-specific formatter now preserves argument boundaries and non-secret syntax, handles separated and inline credential fields consistently, and refuses ambiguous embedded credentials instead of hiding part of an executable program. Both findings have failing-then-passing regression coverage. Exact-release installation is the remaining delivery check.

Implementation decisions: the user's standing authorization keeps work in the live preview checkout and publishes to main; unrelated work is preserved. Local audit folders remain because an earlier cleanup attempt was rejected. Real model-issued tool use still needs a separately authorized usage run; echo evidence is deliberately limited to native loading and discovery. Custom XDG plugin stores remain explicitly unsupported. Release and installed-package verification are required after the local checks.

## Primary references

- [Muse plugin MCP example](https://meta-models.github.io/muse-code-sdk/next/guides/plugins/examples/mcp-server/)
- [Plugin manifest reference](https://meta-models.github.io/muse-code-sdk/next/guides/plugins/reference/manifest/)
- [Plugins in SDK sessions](https://meta-models.github.io/muse-code-sdk/next/guides/plugins/concepts/plugins-in-sdk-sessions/)

Documentation examples are from an earlier host version; the compatibility claims above come from the pinned 1.4.14 CLI and isolated runtime observations.
