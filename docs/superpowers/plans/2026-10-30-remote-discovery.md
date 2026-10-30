# Reviewed remote MCP discovery implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Let the reviewed on-demand gateway use current and supported older remote MCP servers with configured headers, preserving exact consent and no-replay behavior.

**Architecture:** Keep the native-facing gateway and stdio client unchanged in responsibility. Add a remote-only v2 client adapter and bounded network boundary in the owned worker. Extend trusted source inspection and the shared compact review with remote facts.

**Tech Stack:** Node/Electron, React/TypeScript, Muse SDK 1.4.14, MCP SDK 1.32.2 and separate MCP client 2.4.0, real disposable loopback fixtures.

**Spec:** `docs/superpowers/specs/2026-10-30-remote-discovery-design.md`.

## Global constraints

All spec constraints apply. No personal configuration/credential access, provider requests, billing or permission changes. Current-protocol support is required, not legacy-only substitution. Explicit OAuth is the next separate feature, not silently claimed by static-header support. No push/merge/install from an implementer; parent owns those after review. Keep evidence and worktree.

## Review focus

1. A normal public hostname resolving to a private or mapped address must not bypass exact network consent.
2. An effect followed by a missing/unauthorized receipt must occur once, with unknown status and no replay.
3. Large or partial compressed/SSE payloads must be bounded before parsing, without starving the main loop.
4. Source/header/session changes must invalidate existing review without leaking values or silently reconnecting.
5. Current-only and older servers must negotiate correctly in the actual installed dependency graph, with optional interactions neither fulfilled nor counted as completion.

## Task 1: Complete remote source path and acceptance

This is one coupled feature/review unit: a remote adapter without consent/UI/owned native acceptance is not useful on its own. Keep internal modules focused; do not refactor unrelated code.

**Files:**
- Create `src/runtime/discovery-remote-network.mjs` for bounded, redirect-refusing, connection-time destination-validated requests.
- Create `src/runtime/discovery-remote.mjs` for the pinned v2 client adapter, protocol classification and owned cleanup.
- Modify `src/runtime/discovery-sources.mjs`, `src/runtime/discovery-gateway.mjs`, and only necessary broker/worker wiring in `electron/discovery-mcp-config.mjs` / `src/runtime/discovery-mcp.mjs`.
- Modify `src/shared/tool-discovery.d.mts`, `src/ui/DiscoveryTools.tsx`, `src/preview/bridge.ts`, and minimal shared styles if required.
- Modify `package.json` / lockfile to pin the stable remote-only dependency; retain existing pins.
- Create focused `test/discovery-remote*.test.mjs` and fixture helpers; extend source/gateway/privacy/controller tests where contracts change.
- Extend `scripts/discovery-tools-smoke.mjs`, `scripts/native-discovery-contract.mjs`, `scripts/discovery-packaged-contract.mjs` (or small focused remote siblings if separation is clearer).
- Update `docs/TOOL-DISCOVERY.md`, `docs/VALIDATION-tool-discovery.md`, remaining-feature/roadmap entries that claim all remote discovery unavailable; add dated remote validation evidence with exact limitations.

**Interfaces:**
- Preserve exported `inspectDiscoverySources`, `resolveDiscoverySelection`, `createDiscoveryGateway` and controller bridge contracts. Public rows gain a transport discriminant plus `headerKeys` without credential values; existing local rows stay compatible.
- Remote private definitions carry canonical expanded URL, validated headers, filters and existing startup/call budgets. Their digest binds raw and resolved values in the source revision. Official Muse 1.4.4 URL/header `${VAR}`, `${VAR:-default}`, `$$` support is required; public rows expose variable names and safe endpoint review only, never resolved header values or substituted path secrets.
- Remote adapter exposes bounded connect/catalog/call/close to the gateway. Choose a small exact interface and record it in the report before wiring it; do not pass v1 schema instances into v2 request methods. v1 stdio remains untouched in protocol behavior.

- [x] Write RED regressions for configured remote eligibility/privacy, current-only connection and once-only unknown receipt. Record failures before implementation.
- [x] Install the exact stable v2 client dependency and inspect its real published exports/defaults; implement source validation and private/public separation with mixed-source tests.
- [x] Implement bounded network and v2 adapter. Prove modern and legacy HTTP behavior against actual loopback servers. Include the five review-focus regressions above plus auth/redirect/decompression/cancellation tests from the spec.
- [x] Wire the owned gateway and shared UI, keeping lazy startup and exact revision consent; add preview and Electron scenarios with readable narrow layout and no leaked fixture secrets.
- [x] Extend scripted real-Muse native acceptance and exact-ASAR acceptance, no provider inference, with approved and denied remote calls and confirmed process/socket cleanup. Keep fixture budget bounded (at most 60 seconds per scenario, 32 scripted Responses requests, 1 MiB Responses body, 2,000 native notifications); do not spend real model allowance.
- [x] Run focused relevant tests; run full suite and production build once after focused checks pass. Run shared UI/source/package acceptance. Record exact commands, source hashes, reports and limitations. Do not loop broad checks without a changed concern.
- [x] Update docs/roadmap truthfully, commit focused feature including spec/plan, and report immutable commit plus evidence to parent. Parent dispatches final independent review, handles any single consolidated correction wave, integrates/pushes and verifies the release separately.

## Next selected feature

Explicit app-owned OAuth discovery sign-in follows this delivery: PKCE/state/issuer/resource binding, trusted browser callback, persistent OS-protected credential store, separate explicit registration/scope review and no automatic effect replay. Do not read the native CLI private OAuth store. Exact public client registration depends on each provider and must be surfaced honestly.

Implementation and exact directory-package acceptance are complete in the isolated feature range; final whole-feature review/integration/release remain parent-owned. See docs/validation/2026-10-30-remote-discovery.md and the retained task-1-report.md.
