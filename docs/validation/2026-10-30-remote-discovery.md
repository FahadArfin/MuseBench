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


## Consolidated independent-review corrections

The whole-feature Astra review identified three correctness gaps; one correction wave fixes them together. Exact [IANA IPv4 prefixes](https://www.iana.org/assignments/iana-ipv4-special-registry) replace broad /16 checks, with positive neighboring ranges and dotted/hex mapped IPv6 controls. The remote-only parser rejects unsupported/malformed input templates while preserving escaped/environment-supplied literals and existing stdio behavior. Native1.4.14 parent evidence additionally confirms unset/empty fallback, nonempty precedence, bare empty values and dollar escaping; its unchanged report copy SHA-256 is `5a7f9f9249553c2af6c94c27516cee172a01b3a9892b1eed7c6b272e15fc5f6b` under the separate correction artifacts. This supplements the [documented Muse forms](https://dev.meta.ai/docs/muse-code/changelog) without another native probe or model turn.

Search setup diagnostics now survive the actual owned worker, broker and native wrapper. Only app-created branded authorization/redirect classifications cross that error boundary; bounded exact enum records recreate fixed text. Remote bodies, redirect targets, unknown/forged classifications and private extra fields are not forwarded. Startup/catalog401/403/redirect scenarios pass through the real processes, generic500 remains generic, and a submitted auth-failure effect remains unknown with exactly one invocation.

Review regressions were first reproduced RED. Final focused checks:81 passed/0failed. Full suite:1,789 passed/0failed/1 unchanged optional skip. Production build passed with the existing Vite chunk warning. Original accepted archive/executable, receipts and manifests remain unchanged; refreshed logs and package acceptance use `artifacts/remote-discovery-fix/` and a distinct package directory. Frozen correction/package receipts follow after byte verification. No model inference, personal settings/account authorization, real OAuth, push/merge/install or external catalog request was performed by this worker.


### Frozen correction artifact

Correction implementation `a76f4d80066966ac73cef1368d5ba2befe20c52c`; tree `4197bf9a704621cd87263c6ac7aea89647e80cab`. Exact package `artifacts/remote-discovery-fix/package/win-unpacked` was built only after that commit froze. The verifier matched305source/build/runtime files, pinned client/core metadata and both Windows helpers before and after acceptance; the manifests are identical. All56original evidence/archive files remain hash-identical, including the original accepted ASAR.

Source and exact-ASAR local/remote native allow/deny contracts each passed with14scripted Responses requests,0inference,1effect,denial0extra,confirmed worker ownership/socket cleanup and removed temporary profiles. Shared browser/source-Electron/exact-package renderer checks each passed8/8; retained paths under `artifacts/remote-discovery-fix/discovery-tools-ui/` are `browser-source-0CSbcf`, `desktop-source-uM5XAe` and `installed-ohTajo`. The last label is the existing directory-package override, not installation proof. The exact-package narrow screenshot was inspected.

Correction ASAR SHA-256: `c793a928c140f73d21479964f0bfe5a92fc06a9a213933112a4af5e565be7350`.

Correction source remote receipt SHA-256: `7160882d0a47b1ed0798641ef5a93de4e91868359d0f6e4254b6bf3de0c8f295`.

Correction ASAR remote receipt SHA-256: `67562768f934f2c9739bdea6f50d68fb2a33e869efa790d80395f2d27b774385`.

Full correction provenance and preserved-original count are in `artifacts/remote-discovery-fix/frozen-r1-r3-evidence.json`; RED/GREEN logs, source/package reports and pre/post manifests are separate from original acceptance. The parent independently attempted one public read-only documentation catalog against the frozen correction and reported an unsupported content-encoding failure before catalog/tools. That attempt is not a public-provider pass. Its actual response-header diagnosis and final scoped review remain parent-owned; this worker kept frozen source/archive stable and made no additional external request.


### R4 identity encoding correction

A separate parent-owned production-adapter header capture confirmed the public documentation endpoint returned200/SSE with `Content-Encoding: identity` and160encoded bytes. That actual response exposed a missing unencoded identity branch; it was not a DNS/TLS/auth hypothesis. Parent diagnostic report SHA-256: `411de0dd03d2e4c5e21346ea51492aada9b732f4234c709218cc1e91a0ea3050`, retained unchanged under `artifacts/remote-discovery-fix/r4/parent-public-remote-headers.json` beside the earlier failed catalog receipt. This worker made no additional external request.

Five actual HTTP regressions now cover identity JSON and POST-SSE negotiation/catalog/once-only invocation, identity oversized JSON/SSE unknown/no-replay outcomes, and continued unsupported-coding refusal. Four failed RED before the minimal correction; the unsupported-coding control already passed. Identity now uses the existing unencoded body path with all decoded-byte/frame/operation bounds intact. Focused discovery checks:86 passed/0failed. Fresh full suite after this production change:1,794 passed/0failed/1 unchanged skip. Production build passed with the existing warning.

R4 joins the same consolidated correction wave before scoped review. Both earlier accepted archives and317prior evidence/archive files are preserved. Refreshed R4 source/package receipts use a separate `artifacts/remote-discovery-fix/r4/` output, with a new immutable freeze before package construction. Parent alone owns one distinct bounded public catalog recheck; public success is not inferred from local identity fixtures.
