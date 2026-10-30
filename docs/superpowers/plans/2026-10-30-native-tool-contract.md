# Native tool contract implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admit valid native configured model catalogs and verify the real native workspace-tool loop without model usage.

**Architecture:** Extend the existing catalog source allowlist without changing row validation. An opt-in local script owns a disposable native profile, scripted HTTP response server, real workspace MCP process and production runtime connection. Shared picker tests exercise the configured catalog.

**Tech Stack:** Node.js, pinned Muse SDK/CLI 1.4.14, existing React/Playwright browser and Electron harness.

**Spec:** `../specs/2026-10-30-native-tool-contract-design.md`

## Global constraints

- No paid model calls, personal settings or credential access; fixed loopback endpoint with auth none.
- Native approvals remain exact, one-time and fixture-owned. No silent replay or persistent grants.
- Preserve all source/profile/provider/model/effort filters except adding the supported `configCatalog` source.
- Local scripted responses never count as live model acceptance or third-party deferred schemas.

## Review focus

- Fake or unresolved catalogs must still reject; foreign rows cannot enter through configCatalog.
- Native catalog IDs/efforts must remain intact across the shared picker and send path.
- Unexpected/foreign approval prompts must never be automatically allowed.
- Missing tool receipts and parent-only completion must fail native acceptance.
- Timeout, failed startup or helper exit must close owned processes and preserve evidence if cleanup is unconfirmed.

### Task 1: Native configured catalogs and tool acceptance

**Files:** `src/shared/models.mjs`, `src/shared/workspace-tool-activity.mjs`, corresponding unit tests, `scripts/model-settings-smoke.mjs`, `scripts/workspace-analysis-smoke.mjs`, new `scripts/native-tool-contract.mjs`, roadmap and validation documentation.

**Interfaces:** Retain `normalizeModels(value)`, `modelForOptions(catalog, options)` and the production runtime interface. The opt-in runner accepts only `--local-fixture` and exits nonzero on missing or failed native proof; reports are ignored artifacts.

- [x] Add a regression for configCatalog selection, foreign provider/profile filtering and rejected fake/unresolved/unknown catalogs. Run `node --test test/models.test.mjs` and observe the intended failure.
- [x] Admit configCatalog and rerun model/runtime unit checks.
- [x] Reproduce native rejected-tool activity as an interruption; project the exact native rejected status with a refusal explanation and verify it in both shared UI variants.
- [x] Add the bounded native runner. Run `node scripts/native-tool-contract.mjs --local-fixture`; require search, definition, batch and denied-call evidence plus confirmed cleanup, zero inference and zero credentials.
- [x] Add a configured-catalog case to the shared picker smoke; run browser and Electron variants and the production build.
- [x] Reconcile roadmap delivery labels and record exact native contract evidence and remaining prerequisites.
- [x] Obtain independent branch review, fix material findings, rerun relevant checks, commit and push under standing authorization.
