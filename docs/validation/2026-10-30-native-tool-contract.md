# Native workspace tool loop and configured model catalogs

This continues OC03 verification without consuming Muse usage. It does not finish broader third-party deferred schemas or prove that a real model chooses the gateway.

## Fresh contract investigation

The installed Muse 1.4.14 binary exported stable fingerprint `sha256:c94c3d1f2f51e6424074b9ec43eac3eedcf532d3dcd77351ec1383a87d3049c6` and experimental fingerprint `sha256:159e01dd32c37f5ad711225aa1840dbca653e346fd83bed7f3b2b9ea49b40aa7`. An isolated sessionless `settings/readSchema` request returned nine exposed settings and closed cleanly, with no model turn. The exported method set has MCP inventory/OAuth, but no tool-schema discovery or general MCP invocation method. `session/start.config` admits MCP server declarations; `session/compact` has session/turn identity, without recent-context retention or advance-summary parameters. The current npm SDK version remains 1.4.14.

[Meta's direct tool-search API](https://dev.meta.ai/docs/tool-search) supports deferred definitions; that does not establish a corresponding pinned CLI option. [Muse's MCP guide](https://meta-models.github.io/muse-code-sdk/next/guides/extend/mcp-servers/) describes startup registration and ordinary tool approvals. A separate broad tool gateway would need its own reviewed execution/permission contract. Native retention tuning and speculative background summaries remain open rather than receiving invented settings.

## Concrete corrections

- `configCatalog` is a supported value in the pinned SDK's `ModelCatalogSource`. A real native response using this source was rejected by MuseBench's allowlist. It now retains that source and passes the same provider, profile, identifier and effort checks. Fake/unresolved/unknown sources remain rejected. No settings or credentials are changed, and the simple picker layout is unchanged.
- A rejected native workspace tool uses `status: rejected`. The activity projection previously fell through to Interrupted. It now says “Tool request was not approved,” based on that explicit native status, without treating parent completion or output text as successful execution.

## Reproducible native acceptance

Run `node scripts/native-tool-contract.mjs --local-fixture` explicitly with the pinned official binary installed. This is an opt-in local validation command, not a CI dependency or production routing feature.

The runner owns a disposable profile/project, exact configured fixture model, loopback Responses endpoint with `auth: none`, actual Muse process and actual Electron/ASAR-compatible workspace MCP worker. It sends through the production MuseBench runtime and validates current session/call/tool/arguments before choosing each one-time fixture approval. It makes no model inference request and copies no personal credentials or settings. The endpoint implements no upstream forwarding. Shell and file writes are disabled in the native session.

Observed result: the native host completed search, resolved `value` from `main.ts` to `lib.ts`, and returned three analysis results sharing one snapshot. All three actual tool receipts and their app activity projections matched. A second turn rejected an exact fixture search; the native item was rejected, the matching provider-bound output reported denial, and the shared app activity reported not approved. Three one-time allows and one one-time rejection were observed. Sixteen local scripted HTTP requests included observer decisions; these are fixture requests, not inference or subscription usage. Host cleanup was confirmed and the temporary workspace removed.

The pinned host currently resolves qualified function names such as `mcp__musebench_workspace.workspace_tool_search`. The approval/item receipts use the registered double-underscore form. The runner uses each observed form in its proper place. A preliminary spike with a bare function name failed; parent completion alone did not pass the final acceptance checks. Externally submitted raw turns also correctly tripped MuseBench's ownership guard, so the final runner uses production `runtime.send` throughout.

Evidence is retained locally in `artifacts/native-tool-contract/report.json` and `artifacts/roadmap-contract-refresh/`. Shared browser and Electron model-picker checks passed 17 each; workspace-analysis checks passed six each, including the new refusal presentation. Production TypeScript/Vite/native-helper build passed. The full unit suite passed 1,683 tests with one existing optional skip and no failures. Initial UI refusal inspection was corrected to open the collapsed tool detail before asserting visibility; no product check was removed.

This proves the real pinned native host's tool/approval path driven by scripted responses. It does not prove live Meta model selection, provider billing, arbitrary third-party execution, dynamic schema reload or native deferred schema savings. Live model acceptance still requires a fresh bounded authorization. Installed release acceptance follows publication separately.

Independent review of `0b897ec..f88f76d` found no critical, important or minor findings. The reviewer independently passed all seven focused catalog/activity tests, checked production ownership and shutdown paths, and left the working tree unchanged. Timeout/unconfirmed-cleanup branches were reviewed statically rather than fault-injected in this run; broader failure-path validation is a future improvement, not claimed coverage.
