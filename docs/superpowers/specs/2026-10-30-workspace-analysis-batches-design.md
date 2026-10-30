# Searchable workspace analysis and bounded batches

OC03 implementation slice, 30 October 2026. Continual implementation and the existing OpenCode additions placement are authorized. The implementation choices below are builder decisions, not new user approvals.

## Outcome and boundary

An optional **Analysis + batches** workspace tool set adds workspace symbol search, file outlines and syntax diagnostics to the existing four navigation operations. The model can discover these seven operations through the fixed search gateway and request up to eight independent reads in a single batch. One bounded source snapshot and TypeScript language service serve the entire batch. Each call returns a named success or failure receipt. This reduces repeated indexing work, without claiming measured model-token savings.

The connection dialog keeps its compact workspace-tools disclosure. Existing enabled sessions remain on **Navigation**; the broader tool set requires explicit selection when connecting. Saved sessions retain their exact selection. Preview simulates the same controls. Batch receipts appear inside ordinary tool activity, with the existing native Stop flow; there is no separate dashboard or claim of individually stopping a call inside a batch.

## Approaches

1. Use native deferred discovery across all installed extensions. Preferred long-term, but the pinned MSP contract only exposes server configuration/auth inventory, not callable tool schemas or a public deferred-registration control. Code Mode receipt types are observation-only. Meta's API tool-search feature is a different provider loop. Do not invent an MSP setting or replace Muse with that loop.
2. Proxy third-party MCP servers outside Muse. Rejected: duplicate process/auth ownership would require a new permission boundary and could bypass native per-call review.
3. Expand the app-owned read-only gateway and share analysis within batches. Selected now because its source, workspace binding, worker bounds and exact operations are controlled and directly testable. Provider-wide discovery remains an explicit OC03 prerequisite, not silently marked complete.

## Contract

- `navigation-v1` remains the default, exposing the existing two tools and four operations unchanged. `analysis-v1` exposes search, call and batch. Its additional operations are `workspace_symbols({query})`, `document_symbols({path})`, and `syntax_diagnostics({path})`.
- Search returns ordinary tool content containing matching descriptions and argument schemas. It never claims native dynamic tool registration.
- `workspace_tool_batch({calls})`: 1–8 unique caller IDs (1–40 ASCII letters/digits/underscore/hyphen), each paired with exactly one valid operation request. Reject an invalid batch before starting a worker. Results preserve order and IDs. A position/file error may fail one call while the others finish. Snapshot, worker, time or cancellation failure ends the whole request. No writes, shell, network or third-party plugins.
- Existing snapshot limits remain: 500 source files, 8 MiB source, 5 seconds and one worker per service (two globally). Batches share these limits, not multiply them. Each response remains bounded by the 128 KiB transport result limit; oversized individual results become explicit bounded failure receipts. Diagnostics are syntax-only with fixed compiler settings, not project build/typecheck results.
- A real `AbortSignal` terminates the active analysis worker. Valid MCP `notifications/cancelled` can remove queued work or abort the running request without waiting behind it. Never cancel initialization or an unrelated request; distinguish numeric/string IDs. Suppress cancelled responses, tolerate completion races, and preserve output backpressure, queue/frame limits, clean EOF and owned-pipe shutdown.
- Workspace root and tool-set choice are trusted launch inputs. Tool arguments cannot widen them. Preserve existing session MCP capability negotiation, project/configuration review and permission checks. Unknown tool-set values fail before native host start; old saved sessions never upgrade implicitly.
- User-visible receipts are parsed only for the exact owned batch tool and validated bounded receipt format; native output remains available. Untrusted result text remains text. No renderer execution or fresh model submission from reading receipts.

## Evidence and remaining work

Direct real TypeScript/Node/Electron subprocess tests, shared browser/desktop controls, bounded cancellation tests and immutable whole-branch review establish local behavior. A production ASAR probe and exact release install establish delivery. Real model tool-use acceptance needs a new bounded allowance; none is consumed here. All third-party schema discovery remains open until Muse exposes an appropriate contract or a separately reviewed permission-preserving integration exists.

Primary references checked 30 October: [Muse changelog](https://dev.meta.ai/docs/muse-code/changelog), [server inventory](https://meta-models.github.io/muse-code-sdk/next/generated/msp/methods/mcpserver-list/), [MCP cancellation](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/cancellation), [Meta API tool search](https://dev.meta.ai/docs/tool-search), pinned SDK 1.4.14 declarations. Native read-only tools already support parallel execution; this slice reduces repeated workspace indexing and adds cancellation/receipts.
