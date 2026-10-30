# Reviewed remote discovery, 30 October 2026

Base: `50417385796f52cf92d92ee9a066690391b7a249`; isolated branch `codex/remote-discovery`. This implements configured-header/no-auth remote sources through the same disabled-global source review, connection consent, native approvals and owned worker as local discovery. Explicit app-owned OAuth is selected next. No personal settings, credentials, account authorization, model inference, installation, push or merge was performed.

The separate remote client is pinned to `@modelcontextprotocol/client@2.4.0`; its core dependency resolves to 2.4.0. Muse SDK 1.4.14 and the local/native MCP SDK 1.32.2 remain pinned. Installed published code confirmed that v2 defaults to legacy negotiation and automatic input fulfillment; the adapter explicitly selects automatic version probing with zero retries and disables automatic input fulfillment. It uses raw requests with its own bounded result policy, not high-level catalog compilation/cache helpers, OAuth middleware or a v1 result-schema instance.

## Source and transport evidence

Initial feature regressions failed seven of seven before implementation. Later reproductions caught and corrected an EventSource reconnect timer installed after its error callback, invalid catalogs remaining open, prototype-named headers being silently dropped, pending DNS lookup cancellation, lost safe setup diagnostics, and shared background/operation byte accounting. RED logs and their covering green checks are retained in `artifacts/remote-discovery/`.

- `node --test test/discovery-*.test.mjs`: 68 focused tests passed. Remote-specific tests cover current-only peers that reject initialize, older JSON and POST SSE, historical SSE fallback and same-origin endpoints, session identity/DELETE 405, source revisions/environment rotation, exact private header handling and mixed local/remote ownership.
- Once-only effect counters cover disconnect after effect, timeout, 401/403, session 404, 429, 500, malformed/oversized responses, modern protocol -32022, input_required and unsupported task results. Each returns unknown, closes its selection and adds no retry/reinitialization. A valid fully received large result retains completed/truncated semantics.
- Network tests cover redirect refusal (including same-origin), a second receiver with zero leaked requests, historical cross-origin endpoint rejection, IPv4/IPv6/mapped DNS classification and rebinding, pending resolver cancellation, gzip expansion, oversized headers, incomplete/comment SSE floods, total operation bytes and no EventSource timer surviving EOF.
- URL/header expansion uses established `${VAR}`, `${VAR:-default}` and `$$` forms. Synthetic token rotation invalidates connection consent. Public rows retain URL templates, resolved origin, header names and referenced variable names without substituted private path/header values. Missing/invalid/oversized expansion fails explicitly.

Transport caps: 16 KiB response headers; 4 MiB wire and 2 MiB decompressed bytes per response; 1 MiB incomplete SSE frame; 4 MiB aggregate bytes per operation; separate 16 MiB background-stream lifetime budget. The existing 200 tools/512 KiB catalog, 32 KiB/depth 16 schemas, eight/64 KiB matches, 64 KiB arguments and 128 KiB receipt limits still apply. Startup uses one total deadline; calls retain their configured finite deadline. Optional DELETE cleanup is separately bounded to 500 ms. Explicit private literal HTTPS destinations are consent-bound; link-local/special addresses and public DNS resolution into private networks are rejected.

## Shared UI and native acceptance

`scripts/discovery-tools-smoke.mjs` exercises shared production renderer controls in browser and source Electron with mixed local/remote selection, fresh reconnect consent, safe endpoint/header/variable display, error recovery and narrow/wide screenshots. Each has eight checks; it performs no source connections or model calls. Reports and screenshots are retained in `artifacts/discovery-tools-ui/`.

The actual Muse current-only remote source contract uses disposable configuration and scripted loopback Responses, with `MUSEBENCH_DISCOVERY_REMOTE=1 node scripts/native-discovery-contract.mjs --local-fixture`. It proves native approved search/call, native denial with zero additional downstream calls, one remote connection/effect, no initialize/direct-original duplicate, exact configured authorization, confirmed runtime worker ownership cleanup, zero remaining fixture sockets and temporary workspace removal. Each successful run used 14 Responses requests and zero inference. The exact-ASAR sibling is `scripts/discovery-packaged-contract.mjs --local-fixture` with the same environment flag.

Final source checks: 1,776 passed, zero failed, one unchanged optional skip; production build passed. Package receipts are appended after immutable-source verification. No release or installed version is claimed here. Fixtures establish these tested contracts, not live personal-provider compatibility, real-model tool selection or native deferred-schema registration.


## Frozen source/package receipts

Implementation commit: `9659ed5d4cb11a97e7c19697b16d2520479a25fe`; tree `3c4701a5e8480760030d60c214047b980596e2f0`. All packaged source/dependency/renderer inputs were frozen before the final package build. The byte verifier matched 304 source/build/runtime files, pinned v2 client/core identity/exports/dependencies, both Windows native helpers, and an identical complete pre/post file manifest. Both source and exact-ASAR local and remote native allow/deny contracts passed: 14 scripted Responses requests each, zero inference, one downstream call, no direct-original duplicate, denial with zero extra calls and confirmed cleanup. The remote receipt also confirms zero initialize requests and zero remaining fixture sockets.

The shared mixed-source renderer passed eight checks each in browser, source Electron and the exact directory package. Final reports/screenshots: `artifacts/discovery-tools-ui/browser-source-EpFdBp`, `desktop-source-661E2f`, and `installed-qVsyV6`. The last directory name is the smoke script's existing override label; its target was the isolated directory package, not an installed release. Narrow/wide screenshots were inspected. All fixture profiles/processes/listeners were cleaned up; no persistent personal state was used.

ASAR SHA-256: `078e1cd98620d6edd3a6729b6631a54059ee6fd8470e82b9223c6aec10b10619`.

Source remote native receipt SHA-256: `424a41f7bfa872d558528646748898c4419a26e0abb18409c966fce2ae650ea1`.

Exact-ASAR remote native receipt SHA-256: `2943560a192ebd5c08282224dc98d9fb5a0bb78e54c3b130eb257da1bd848402`.

`artifacts/remote-discovery/final-evidence.json` records the implementation commit/tree, executable/archive hashes, source/package manifest equality and all four native receipt hashes. Full logs, RED reproductions and manifests are retained in that directory. A rejected intermediate archive was produced while a source-length edit overlapped packaging; its verifier failure and corrupt extracted payloads are retained in `rejected-package-receipt.md`. That archive was replaced before the final immutable-source build and was never accepted, published or installed. Vite's existing large-chunk warning and electron-builder's existing author/duplicate-reference notices remain warnings, not failed checks.

Independent whole-feature review and any consolidated correction wave remain parent-owned before integration/push. Release CI, installer hash verification, actual installation and live-provider/model acceptance remain separate from these source/directory-package receipts.
