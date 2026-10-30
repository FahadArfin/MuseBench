# Reviewed remote MCP discovery

Date: 30 October 2026. Authorized continuation of OC03, building on reviewed local discovery at main `50417385796f52cf92d92ee9a066690391b7a249`.

## Product result

People can select a reviewed, disabled global remote MCP server in the same compact On-demand tools review as a local server. The review shows its exact endpoint and configured header names, never credential values. No network connection starts while browsing or selecting sources. The existing per-connection consent permits lazy connection on an approved search and bounded, separately approved tool invocation. Preview and desktop use the same UI.

This independently useful delivery supports configured private headers or no authentication. The next selected delivery adds explicit app-owned OAuth sign-in and protected persistent credentials. Do not mislabel native CLI sign-in as reusable authorization. A remote 401/403 identifies required setup without starting a browser or replaying a call. OAuth remains explicitly on the roadmap after this feature, not discarded as blocked.

## Supported contract

- Keep Muse SDK 1.4.14 and MCP SDK 1.32.2 pinned. Add stable `@modelcontextprotocol/client@2.4.0` solely in the owned worker's remote adapter; do not migrate local/native transports. Current MCP is 2026-07-28; prove both current-only and supported older peers. Check installed package APIs rather than copying unreleased interfaces.
- Accept canonical existing global `streamable-http` entries (including existing `http`/`streamable_http` aliases), configured headers, tool filters and finite timeouts. The official Muse 1.4.4 changelog confirms URL/header expansion of `${VAR}`, `${VAR:-default}` and `$$` literal dollar; implement those documented forms with bounded existing expansion and synthetic tests. Keep enabled/direct, project and plugin sources excluded to avoid duplicate ownership. Exact source review, filesystem/plugin collision checks, four-source cap and saved-session identity remain authoritative.
- URL rules match existing project review: HTTPS, or explicit loopback HTTP; no user information, query or fragment. Validate URL/headers after expansion; missing variables and unsupported expressions fail explicitly. Bind raw and resolved private values into revision; environment changes invalidate review. Public rows expose referenced environment names only, never header values; for variable URLs display the template and resolved origin/network target without revealing substituted path secrets. Reject contradictory execution fields and unknown fields. Bound configured headers, reject case-insensitive duplicates, CR/LF and transport-owned Host/framing/connection/protocol/session headers. An invalid header is a visible incompatibility, never silently omitted. Never forward cookies or credentials inherited implicitly from the app/browser/model environment.
- Private definitions include exact URL/headers and source revision. Public rows discriminate local/remote and expose endpoint/header names only. Header changes invalidate consent. Keep secrets out of renderer/history/native command arguments/model schemas/error text/logs.
- Modern connection explicitly negotiates with `versionNegotiation:{mode:'auto',probe:{maxRetries:0,...}}`; v2 defaults must not silently leave current-only servers unsupported. Bound one total startup deadline. Legacy POST JSON/SSE and negotiated session identity remain supported. Historical SSE-only fallback is allowed only after a definitive pre-call transport incompatibility, never after auth/TLS/timeout/malformed failures. Its dynamic POST endpoint must be same-origin. Do not invent a native global `sse` configuration field.
- Disable optional input fulfillment, sampling, tasks, roots and elicitation. Current `input_required` or unsupported task results receive an explicit unsupported/unknown receipt as appropriate, never a successful final effect or automatic continuation. No eager catalog compilation, pagination or output-schema cache; existing supported-schema validation applies after bounds and filters.

## Network and lifetime

- All SDK transport requests use one app-owned bounded network adapter, including historical SSE requests. Reject redirects, including same-origin redirects, and explain that the final URL must be configured. No automatic auth retry, scope escalation, stream reconnect/resume, session reinitialization after 404, or effect replay.
- Validate destination at connection time. Normal public hostnames cannot resolve to loopback, link-local or private networks. Explicit configured loopback destinations retain existing support. An intentionally configured private literal HTTPS destination is source-bound consent; do not let remote metadata or dynamic endpoint events broaden it. Preserve TLS validation; ignore unsafe ambient proxy/TLS/Node-hook settings. Test IPv4/IPv6/mapped addresses and DNS changes through injected resolution, with actual loopback HTTP integration separately.
- Count response headers, decompressed body bytes, incomplete SSE frames, comments and total operation bytes before JSON/SSE parsing. Retain 200 tools/512 KiB catalog; 32 KiB/depth 16 schema; eight/64 KiB matches; 64 KiB arguments; 128 KiB returned receipt; startup at most 30 seconds/calls at most 300 seconds. Choose and document finite transport caps large enough for those valid payloads. Keep owner/worker lifetime independent from an operation timeout. Cancellation closes owned requests/readers/sockets and prevents reconnect timers.
- Preserve one downstream client per selected source/connection. Legacy remote session IDs are private memory only. Bound supported DELETE cleanup; 405 is valid. Closing local connections does not prove remote effects were cancelled.
- Once a tool request might have been submitted, lost response, timeout, abort, 401/403, 404, 429/5xx, malformed/oversized wire response or worker failure cannot cause replay. Return the existing explicit unknown outcome and require reconnect/review. A fully received valid oversized result can retain completed/truncated semantics. Catalog failure must close/fail the selection rather than silently rebuild it later.

## Acceptance

Use only disposable profiles/projects and local scripted MCP/Responses fixtures, with no real model inference, personal source changes or account authorization. Prove inspection makes zero network requests; real current-only peer rejects initialize; legacy JSON and POST SSE work; historical SSE is either correctly supported under the precise fallback or reported honestly. Test exact native approval/denial, one call per approved effect, no native direct duplicate and process cleanup. Extend source and exact-ASAR scripted native acceptance and shared browser/Electron narrow/wide review scenarios.

Adversarial regressions cover secret/redirect leaks to a second receiver, DNS changes, invalid/huge headers, gzip and incomplete/comment SSE floods, session loss, cancellation/deadlines, auth errors, effect-before-disconnect, source revision changes and mixed local/remote selections. Run focused tests, full suite and production build. Independent whole-feature review precedes integration/push; exact CI/release/hash/install acceptance remains parent-owned. Do not claim live personal-provider compatibility from fixtures.

## Sources

- https://modelcontextprotocol.io/docs/2026-07-28/learn/versioning
- https://dev.meta.ai/docs/muse-code/changelog (1.4.4 URL/header interpolation)
- https://modelcontextprotocol.io/specification/2026-07-28/changelog
- https://registry.npmjs.org/@modelcontextprotocol%2fclient/2.4.0
- https://ts.sdk.modelcontextprotocol.io/v2/clients/connect.html
- https://ts.sdk.modelcontextprotocol.io/v2/clients/calling.html
- https://ts.sdk.modelcontextprotocol.io/v2/clients/oauth.html
- https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-6prh-2h8m-c8cw
- Existing repository project-MCP, discovery and native ownership contracts; research receipt `artifacts/roadmap-remaining-20261030/remote-discovery-research.md` in the main workspace.
