# Native plugin hook controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Let people inspect, approve and revoke hooks supplied by installed Muse plugins, alongside their existing MCP controls.

**Architecture:** Extend the exact per-capability native approval path from the installed-plugin MCP feature. Keep existing MCP grants and IPC names compatible; add separate hook grants bound to package, native record and settings identity. Use the shared desktop/preview details and the existing execution-configuration reconnect guard.

**Tech Stack:** Electron/Node, React/TypeScript, pinned Muse CLI/SDK 1.4.14, Node tests and Playwright.

**Spec:** `docs/superpowers/specs/2026-10-27-extension-catalog-design.md`, approved by the user; standing instructions authorize completing native extension integrations and publishing each finished feature without another approval round.

## Global Constraints

- Browsing, inspection and installation do not approve executable capabilities.
- Use exact official per-capability approval/rejection, never approve an entire plugin implicitly.
- Preserve installed-package source identity, native hashes, all unrelated configuration, revocation and reconnect checks.
- Native hook commands use argv. Show event, timeout, foreground/background behavior and matcher restrictions. Unsupported or unrepresented behavior cannot be approved.
- Keep the compact directory and on-demand inspection; no new polling or sidebar sections.
- No paid/model requests. Native acceptance uses isolated local echo after checking actual provider identity; retain audit folders after the previous cleanup rejection.
- Continue the authorized live checkout/main release workflow; keep unrelated state and existing profile data.

## Contract evidence and approach

The 29 October isolated native probe used `plugins install`, exact `plugins approve/reject`, and three verified echo sessions. UserPromptSubmit/Stop produced zero receipts before approval, two completed receipts after approval, and zero after revocation. Native startup retained plugin hooks while excluding user/managed hooks via the existing launch overrides. All owned hosts closed; no model request or user credential was used. Receipts: `artifacts/native-plugin-hooks/contract-report.json`.

Use the native hook path, rather than copying hooks into project presets: copying would change their source, argv semantics and review identity. Do not enable native hooks by weakening the generic configuration guard. Native loaded-session hooks keep their startup configuration, so revoke/change still requires reconnect before more positive operations.

## Review Focus

- Hook versus MCP identity confusion: identical capability names must retain independent grants and actions.
- Native projections that omit execution-affecting fields: never approve hidden matcher/shell/output semantics.
- Package, settings or definition changes during approval: no stale or unrelated grant may survive.
- Automatic hooks versus manual tools: event/timeout/async behavior must appear before consent, and discovery must never execute them.
- Current host versus new configuration: explicit revocation must block further positive work until a reconnect; stopping remains possible.

### Task 1: Separate exact hook grants

**Files:** `src/runtime/plugin-capabilities.mjs`, `src/runtime/extension-review.mjs`, `src/runtime/configuration-review.mjs`, `test/plugin-capabilities.test.mjs`.

**Interfaces:** Add generic `pluginCapabilityId` / `nativePluginDecision` for `mcp_server` and `hook`; preserve MCP-only exports. Add `approvePluginHook`, `revokePluginHook`, `reviewedPluginCapabilities` while retaining existing MCP methods/storage. Generic configuration review consumes the combined check.

- [x] Add failing tests: approved hook is independent of same-name MCP; installation alone is insufficient; revoke/changed package/changed native hash/changed settings location deny execution; disabled known hooks confer no execution; unknown kinds stay blocked.
- [x] Run `node --test test/plugin-capabilities.test.mjs test/configuration-review.test.mjs test/runtime.test.mjs`. Expected initially: hook acceptance fails.
- [x] Implement the narrowly typed grant paths and combined guard, preserving current MCP grants.
- [x] Repeat command. Expected: all pass.

### Task 2: Native hook inspection and decisions

**Files:** `electron/plugin-capabilities.mjs`, new `electron/plugin-hook-definition.mjs`, `test/plugin-capabilities.test.mjs`.

**Interfaces:** Existing `inspect`/`decide` result remains `PluginMcpReview`; each supported hook row adds `hook:{event,timeoutMs,async,matcher,compatibilityName}`. Source identities and native definition hashes remain in the same observed revision. Existing MCP rows unchanged. Hook normalization is in a focused module.

- [x] Add service tests for native hook metadata, exact kind-qualified approval/revoke, unsupported shell/unknown fields/events, ambiguous matchers, stale event/timeout/async definitions, package races and unrelated settings mutation.
- [x] Run `node --test test/plugin-capabilities.test.mjs test/customize.test.mjs`. Expected initially: hook inspection unsupported.
- [x] Validate the complete observed hook shape, bounded argv and source containment; route exact grant/revoke by kind. Show unsupported known rows with reasons, never downgrade them to ordinary supported MCP tools.
- [x] Repeat command. Expected: all pass.

### Task 3: Shared compact hook controls

**Files:** `src/shared/customize-types.ts`, `src/ui/PluginTools.tsx`, `src/preview/bridge.ts`, `scripts/plugin-tools-smoke.mjs`.

**Interfaces:** Consume `hook` row metadata; preserve current IPC names and revision-bound confirmation. Preview stores simulated grants by stable capability ID so hooks and MCP are independent.

- [x] Add failing preview/Electron checks for visible event/timeout/async description, explicit hook consent, independent approval/revoke, unsupported rows, keyboard and narrow layout.
- [x] Run `npm.cmd run test:plugin-tools`. Expected initially: hook controls absent.
- [x] Add a compact hook description and event-specific confirmation in plugin details; use “Tools & hooks” where appropriate. Retain the shared Installed row and no idle refresh.
- [x] Run build and `npm.cmd run test:plugin-tools`. Expected: all pass.

### Task 4: Native production-path acceptance and review

- [ ] Extend the isolated probe through the production Customize service, extension grants and runtime connection. Verify actual echo provider before turns. Require native hookRun receipts and owned recorder outputs only after both approvals; revoke app/native grants and prove exclusion after reconnect. No user profile modification.
- [ ] Run full suite/build/catalog preview/catalog desktop/shared parity. Expected: all green; zero model requests.
- [ ] Write validation/roadmap evidence. Commit the complete feature, then obtain one independent review of the immutable base-to-head range; fix Important/Critical findings with failing-then-passing regressions and full suite. No second review.

### Task 5: Publish and installed acceptance

- [ ] Push completed feature to main. Await exact-head Validate and seven-target Release success.
- [ ] Verify manifest/SHA256SUMS/latest.yml against the downloaded installer. Install/reopen only when idle, retain profile, verify installed commit/modules.
- [ ] Inspect all five Customize pages through native control and verify matching live preview source. Record exact delivery receipts.

Commits: implementation and any final review fix remain local until Task 4 passes; then push the completed feature. The ledger records each task's tests and eventual immutable commit range.
