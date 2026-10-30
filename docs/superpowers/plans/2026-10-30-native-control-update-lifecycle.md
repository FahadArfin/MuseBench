# Native control update lifecycle implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline; one independent whole-feature review after implementation.

**Goal:** Keep idle MCP clients connected without locking Windows desktop update files.
**Architecture:** Bundle the existing MCP SDK server, cache a verified Electron Node runtime independently of the app installation, and return that configuration from the existing private host. No second protocol implementation or new privileges.
**Tech Stack:** Existing Node/Electron, esbuild, MCP SDK, React and Windows x64.
**Spec:** docs/superpowers/specs/2026-10-30-native-control-update-lifecycle-design.md
**Base:** 98f83423c4be721f65027c425cd4ebfec6d5dfe5 in the reused attached worktree, branch codex/native-control-update-lifecycle.

## Global constraints

No paid calls, no new grants, no killing model work, no profile/session resets. Immutable verified cache outside the installation tree; runtime and bridge versions stored separately. Retain old caches referenced by other clients. No system Node requirement or added release job. Carry 0.2.189 installed evidence into this feature's commit.

## Review focus

1. Partial, corrupted or linked caches must never become executable configuration (Task 1).
2. Concurrent configuration reads must publish complete identical files without replacing a running executable (Task 1).
3. Off/revoked control and cache errors must not enable permissions or stop normal app startup (Task 2).
4. Closing/replacing/reopening the desktop while a client stays alive must preserve its transport and never replay a tool request (Tasks 1–2).
5. Packaged ASAR paths, paths with spaces, old client migration and stale schemas must not be mistaken for verified client reconnection (Task 2).

## Task 1: Verified update-safe runtime and bundled relay

Files: electron/native-mcp-cache.mjs; scripts/build-native-mcp.mjs; package.json; test/native-mcp-cache.test.mjs; existing MCP server.
Interfaces: buildNativeMcp({outfile}) produces a standalone ESM SDK bundle; prepareNativeMcpConfig({dataDir,executable,appRoot,platform}) returns command/args/env, with the original configuration on non-Windows.

- [x] Write failing tests for immutable copies, corrupted/linked cache refusal, concurrent publication, separate bundle/runtime reuse and complete standalone MCP execution.
- [x] Implement minimal cache and build integration; real filesystem and protocol tests pass.

## Task 2: Host/UI integration and delivery

Files: electron/native-control-host.mjs, electron/main.mjs, src/shared/native-control-types.ts, src/ui/NativeAppControl.tsx, docs/native-app-mcp.md, scripts/native-control-smoke.mjs, scripts/portable-desktop-smoke.mjs, validation/roadmap docs.
Interfaces: host connectionConfig accepts an async provider; state reports connectionError with null config on preparation failure. One preparation promise per app lifetime, retryable after failure.

- [x] Add failing host and real-MCP lifecycle coverage, then return the cached configuration on Windows while preserving revocation and recovery.
- [x] Shared Settings and preview remain aligned; packaged smoke uses actual generated config. Verify original desktop source files replaceable while cached stdio stays alive and serves a reopened host.
- [x] Full offline suite, build, native/browser UI checks and packaged artifact checks pass.
- [x] Independent review and one TDD correction pass for the hard-link finding; complete focused, full-suite and packaged checks.
- [x] Commit/push the reviewed correction (0.2.191).
- [x] Reproduce and correct the actual Windows Store child-directory alias failure found during installed acceptance; retain link rejection and verify the actual profile with the published runtime.
- [ ] Verify exact release, idle work and profile backup; install/reopen; migrate the existing Codex command without changing grants and verify actual installed cached-client lifecycle. Record actual proof versus isolated evidence.
