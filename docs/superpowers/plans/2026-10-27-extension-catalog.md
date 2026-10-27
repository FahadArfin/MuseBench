# Extension catalog implementation plan

> Agentic workers: execute the approved spec with scoped parallel modules and an integration review. User approved implementation and per-feature pushes on 27 October 2026.

**Goal:** Discover, review and install useful extensions from curated and community sources in the shared desktop/preview Customize interface.

**Architecture:** A main-process catalog owns trusted records and cached public metadata. A separate bounded GitHub stager pins selected packages before existing native validation and hash-bound review. The renderer only submits catalog IDs and displays results; preview simulates the same interface.

**Tech Stack:** Electron, Node ESM, React/TypeScript, node:test, Playwright, Muse CLI 1.4.13.

**Spec:** docs/superpowers/specs/2026-10-27-extension-catalog-design.md

## Global constraints
- No automatic third-party installation, execution, sign-in or capability grants.
- Preserve current configuration review, active-run blocking and exact-content installation checks.
- Keep desktop and preview on the same renderer; label preview operations simulated.
- Do not modify the running desktop profile or consume model usage during validation.
- Push each completed feature; preserve unsupported integrations as setup-required.

## Review focus
- Offline or malformed community responses: bounded parsing and useful stale data.
- Hostile package paths and symlinks: reject before writing outside staging.
- Changed packages between review and installation: reject hash mismatch.
- Search races and category switches: stale results cannot replace current results.
- Missing credentials or prerequisites: honest setup state, no misleading success.

## 1. Discovery and shared interface
- [x] Add failing discovery tests for pagination, cache fallback, malformed payloads, source IDs and search bounds.
- [x] Implement `createExtensionCatalog({dataDir,fetch})` with `search({kind,query,source,cursor,refresh})` and `resolve(id)` in electron/extension-catalog.mjs; shared entries/types in src/shared/extension-catalog*.
- [x] Add Customize `catalogSearch` dispatch before mutation blocking. It returns `{catalog}` without spawning Muse.
- [x] Implement src/ui/ExtensionCatalog.tsx and Discover/Installed navigation in CustomizeDialog, deterministic preview fixtures and matching result types.
- [x] Run focused node tests, TypeScript/build and browser smoke; commit/push usable discovery.

## 2. Pinned installation
- [x] Add failing tests for immutable revision resolution, selected subtree staging, traversal/collision/link rejection and bounded downloads.
- [x] Implement `stageCatalogPackage(descriptor,{dataDir,fetch})` in electron/extension-staging.mjs returning folder, revision, source, file hashes and licenses.
- [x] Add `prepareCatalog` dispatch: resolve ID, stage trusted descriptor, native validate, issue existing expiring token and expose provenance/diagnostics. Reuse install's unchanged-tree check and native capability review.
- [x] Test rejected validation, forged IDs, changed trees and receipts with isolated fixture profiles. Never remove old installs as an update shortcut.
- [x] Run focused tests/build; commit/push reviewed installation.

## 3. Connection recipes and hook drafts
- [x] Test catalog HTTPS additions require review and reject unsupported/forged recipes.
- [x] Implement `catalogServer` using ID-resolved recipes and existing settings/OAuth controls. Verify provider endpoints from primary sources. Qualify version-pinned local launcher separately; unsupported runtimes stay setup-required.
- [x] Add starter hooks as editable, unapproved drafts; preserve six-hook and 1–30 second bounds.
- [x] Run focused tests/build/browser checks; commit/push recipes and templates.

## 4. Release verification
- [x] Review integration and add regressions for findings.
- [x] Run full tests, browser smoke, preview parity, package and packaged-source verification.
- [x] Exercise an isolated no-model native fixture install/list/remove where supported.
- [x] Push final fixes/docs and verify latest GitHub validation/release outcomes. Report exact limits and release.

## Delivery evidence

Implemented in c708627 and released as v0.2.79. Discovery, package preparation and recipes were integrated as one usable feature before pushing; they share a single reviewed install flow.

- 918/918 Node tests passed; build and catalog/browser smoke passed.
- 84 preview/production-Electron fixture scenes matched within 1 px.
- 119 packaged files and both native helpers matched source.
- Public OpenAI PDF skill at commit 49f948faa9258a0c61caceaf225e179651397431 downloaded, validated, installed, listed and uninstalled in an isolated profile. No model calls or real-profile writes.
- Live OpenAI skill, plugin marketplace and MCP Registry discovery returned paginated results without errors.
- Independent review findings (hook draft reuse and staging retention) fixed and re-reviewed.
- GitHub validation and Windows release workflows succeeded for c708627.

Limits: catalog listings are not compatibility certification; OAuth/account readiness and local Playwright server execution remain unverified. Figma client eligibility, Codex-only tools, secret/header-based integrations and unsupported transports remain setup-required. Preview uses explicitly simulated operations. Existing installations are not silently replaced.
