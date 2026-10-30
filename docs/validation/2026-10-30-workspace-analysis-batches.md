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
- Final full unit suite after review fixes: 1,604 passed, zero failed, one pre-existing optional skip. The stricter service validation exposed a controller compatibility regression; the controller now removes its verified project selector before sending operation arguments, retaining rejection of arbitrary extra fields. Its regression and CI coverage checks passed 33/33.
- Shared browser and Electron scenarios each passed five checks: explicit selection/search, saved connection mode, individual result rows, narrow-screen disconnect/reconnect, and explicit recovery of an unsupported saved tool set. Screenshots at 390 pixels were inspected. These are fixture scenarios, not provider acceptance.
- Build/typecheck passed. Vite retains its existing large-chunk advisory.
- Direct real subprocess probe passed seven-operation discovery and a three-call shared-snapshot batch. A separate isolated native session retained `analysis-v1`, listed the session MCP server and closed with confirmed cleanup. Zero model turns; no personal profile or grants changed. Server inventory does not prove provider tool-schema discovery or model use.
- The new shared UI scenarios run in the existing parallel Windows native validation group. Publication still waits for all six validation groups and x64 packaging.

Ignored local evidence is retained under `.superpowers/sdd/2026-10-30-workspace-analysis-batches/` and `artifacts/workspace-analysis/`. Independent review found three material issues, all covered by the correction pass below. Exact release/installed acceptance remains a separate gate.

## Research and prerequisites

The [Muse changelog](https://dev.meta.ai/docs/muse-code/changelog) describes native parallel execution of read-only tools. This implementation reduces repeated local indexing; no model-token or end-to-end speed improvement is claimed without measurement. The pinned SDK 1.4.14 [server inventory contract](https://meta-models.github.io/muse-code-sdk/next/generated/msp/methods/mcpserver-list/) exposes configured servers and authentication facts, not callable third-party schemas. [Meta API tool search](https://dev.meta.ai/docs/tool-search) belongs to a separate provider loop and is not substituted for Muse CLI. Cancellation follows the [MCP cancellation contract](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/cancellation).

Provider-wide deferred schemas need a supported native contract or a separately reviewed integration preserving permissions. Real model acceptance needs fresh bounded authorization; no allowance remains from earlier tests. Both prerequisites remain open in OC03.

## Independent review and correction pass

A fresh read-only review covered eea018b..2a28cc4. Three material findings were reproduced and fixed in one pass:

1. The final JSONL response now fits after MCP text escaping. An eight-outline real-engine regression retains fitting rows, emits bounded output-limit rows and proves the next ping succeeds. A heavily escaped single result now returns a limit error while retaining the connection.
2. Unsupported/malformed saved selections retain their native session identity, access settings and bounded unsupported selection marker across database reloads. Connection is rejected before runtime startup; the shared Session dialog exposes an explicit fresh-session choice. A later supported selection can recover through normal restoration.
3. Workspace receipt observation now follows adapter admission, including pre-ack buffered notifications and active-turn resume history. Foreign turns, missing cursors, superseded revisions and old connections cannot project valid-looking receipts into another run.

Each regression failed before its fix. The first wire-size test initially failed due to a missing test service; it was corrected and then reproduced the actual connection closure against the reviewed revision before validating the fix.

One minor display issue is deferred: a successful hover can show zero results in the compact count, while its original native output remains available.

Decisions: existing continuous authorization covered this optional local slice without another design approval (risk: UI/scope may need revision); native third-party schemas remain unimplemented until supported (risk: capability remains limited); evidence is retained (cost: local disk); owned-tool observation is added without control authority (risk: display correctness); model acceptance and native cancellation remain unverified without a fresh bounded model allowance; exact release and installed proof are still required, independently of source review.
