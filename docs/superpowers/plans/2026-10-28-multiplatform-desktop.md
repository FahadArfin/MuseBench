# Multi-platform Desktop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Publish verified Windows, Linux and macOS x64/ARM64 downloads for every main release.
**Architecture:** Reuse Electron and the existing native Muse runtime. Native runner jobs package the same stamped version; one collector verifies and assembles release assets and updater metadata.
**Tech Stack:** Electron 45, electron-builder 26, Node 22.14, GitHub Actions.
**Spec:** `docs/superpowers/specs/2026-10-28-multiplatform-design.md`

## Global Constraints

- x64 and ARM64 only; retain Windows x64 installer name and update channel.
- Do not relax native Muse permissions, schema or version checks.
- macOS ad-hoc signing and manual updates until Apple credentials exist.
- Every published asset comes from the same commit/version and has verified hashes.

## Review Focus

- GUI launches without a shell PATH must find the user's official Muse installation.
- Windows ARM helpers must run without silently reusing an old x64 build.
- An update manifest must never send an ARM client the x64 installer.
- Missing platform artifacts must prevent publication, not yield a partial release.
- Fresh POSIX startup must work without Windows environment variables.

### Task 1: Portable desktop startup and native CLI services

**Files:** runtime/index.mjs, shared platform helpers, electron main/customize/onboarding/command-info/file-editor, build-native script, native helper scripts, platform tests.
**Interfaces:** OS profile and native executable validation are shared; existing public runtime/controller interfaces stay unchanged.
- [ ] Add failing tests for HOME preservation, native POSIX executable sign-in, skills and profile paths; verify failures.
- [ ] Implement platform-aware validation/discovery and conditional native helper compilation; use AnyCPU Windows helpers with fresh-build provenance.
- [ ] Run focused tests and existing runtime/customize/onboarding/editor tests, then the full suite and build.

### Task 2: Native packages, update manifests and release CI

**Files:** package.json, .github/workflows/release.yml, package integrity/boot scripts, release collector and tests, updater UI.
**Interfaces:** each job uploads a versioned manifest plus its package files; collector emits one validated release folder and SHA256SUMS.
- [ ] Add failing collector tests for mixed versions, missing architectures, corrupt assets and correct dual-architecture Windows selection.
- [ ] Configure platform targets, native runner matrix and per-job integrity/boot checks; collect manifests without filename collisions.
- [ ] Keep Windows/AppImage auto updates and show release downloads elsewhere.
- [ ] Run focused tests, full Windows tests, build, native package verification and fresh review; commit/push completed desktop feature.
- [ ] Inspect all native CI results and final release assets; fix any actual platform failures before claiming completion.

Android companion work follows in a separate implementation plan using the same design and release collector.
