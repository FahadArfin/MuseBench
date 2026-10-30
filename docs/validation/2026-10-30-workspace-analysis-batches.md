# Workspace analysis and bounded batches

30 October 2026. Base: `eea018bc4ada455145e94dfd93b7701af37738d6`. OC03 local workspace slice; full third-party discovery is not complete.

## Delivered source behavior

- Explicit versioned tool sets preserve the four-operation Navigation default. Analysis + batches adds workspace symbols, document symbols and syntax diagnostics, plus batches of one to eight independently identified reads.
- A batch shares one bounded source snapshot and one TypeScript language service. Invalid batches fail before a worker starts. Position/path errors retain ordered per-call failure receipts; snapshot, worker, cancellation and timeout failures end the whole request.
- MCP cancellation handles active and queued requests without waiting behind the running request. Numeric and string request IDs remain distinct. Replies to cancelled requests are suppressed. Result limits produce explicit per-call output-limit receipts.
- Shared desktop/preview controls retain the chosen tool set through reconnects and show searchable operation descriptions. Observed native workspace-tool activity retains compact validated batch summaries alongside ordinary bounded output. Partial activity updates preserve earlier receipts.
- No project compiler configuration, project plugins, shell, network, file writes, implicit tool-set upgrades or native permission changes were introduced.

## Checks

- Service/catalog: 21 tests; transport/factory: 24 tests. Both passed, with failures observed before implementation.
- Final full unit suite: 1,597 passed, zero failed, one pre-existing optional skip. The stricter service validation exposed a controller compatibility regression; the controller now removes its verified project selector before sending operation arguments, retaining rejection of arbitrary extra fields. Its regression and CI coverage checks passed 33/33.
- Shared browser and Electron scenarios each passed four checks: explicit selection/search, saved connection mode, individual result rows, and narrow-screen disconnect/reconnect. Screenshots at 390 pixels were inspected. These are fixture scenarios, not provider acceptance.
- Build/typecheck passed. Vite retains its existing large-chunk advisory.
- Direct real subprocess probe passed seven-operation discovery and a three-call shared-snapshot batch. A separate isolated native session retained `analysis-v1`, listed the session MCP server and closed with confirmed cleanup. Zero model turns; no personal profile or grants changed. Server inventory does not prove provider tool-schema discovery or model use.
- The new shared UI scenarios run in the existing parallel Windows native validation group. Publication still waits for all six validation groups and x64 packaging.

Ignored local evidence is retained under `.superpowers/sdd/2026-10-30-workspace-analysis-batches/` and `artifacts/workspace-analysis/`. Final independent review and exact release/installed acceptance remain separate gates.

## Research and prerequisites

The [Muse changelog](https://dev.meta.ai/docs/muse-code/changelog) describes native parallel execution of read-only tools. This implementation reduces repeated local indexing; no model-token or end-to-end speed improvement is claimed without measurement. The pinned SDK 1.4.14 [server inventory contract](https://meta-models.github.io/muse-code-sdk/next/generated/msp/methods/mcpserver-list/) exposes configured servers and authentication facts, not callable third-party schemas. [Meta API tool search](https://dev.meta.ai/docs/tool-search) belongs to a separate provider loop and is not substituted for Muse CLI. Cancellation follows the [MCP cancellation contract](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/cancellation).

Provider-wide deferred schemas need a supported native contract or a separately reviewed integration preserving permissions. Real model acceptance needs fresh bounded authorization; no allowance remains from earlier tests. Both prerequisites remain open in OC03.
