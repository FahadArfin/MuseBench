# Portable extension review implementation plan

> **For agentic workers:** Use superpowers:executing-plans. Continue the already authorized remaining-harness roadmap; implement, verify, push, and install the completed release.

**Goal:** Apply the existing reviewed-extension boundary before interactive Muse launches or accepts a new request on every desktop platform.

**Architecture:** Extract `checkConfiguration` from the Windows exec adapter into a shared runtime module. Resolve the platform home and explicit XDG directories, and call the same guard from both actual runtime implementations. Keep the selector responsible only for transport selection. Preserve existing MCP approval digests, project-instruction review, hook overrides, and native permission checks.

**Tech stack:** Node ESM, Electron, native Muse 1.4.14, Node test runner.

**Spec:** `docs/superpowers/plans/2026-10-26-remaining-solutions.md`, delivery step 5: reviewed bounded integrations; no blanket project trust. This is a defect correction within that approved scope.

## Constraints

- No model calls, credentials copied, trust grants, configuration rewrites, or provider changes.
- Guard reads bounded non-credential configuration only; errors do not disclose values.
- Windows keeps the same reviewed-extension behavior. Linux/macOS gain the missing guard.
- Explicit XDG roots are inspected; invalid relative roots fail before launch. Customize still reviews its existing profile store; alternative plugin stores remain unavailable unless the existing review service recognizes the exact file.
- Desktop and preview share the unchanged UI. Work and Sites use the same review service as Code.
- Preserve the existing exec `checkConfiguration` export for callers.

## Review focus

1. Linux/macOS home selection and XDG overrides must not inspect an unused empty directory.
2. Unreviewed project or ancestor configuration must block even with reviewed instructions or Full access.
3. Approved MCP entries must connect and submit; edited entries must block the next request without sending a turn.
4. A disconnect while review is pending must not send a turn or alter a replacement connection.
5. Invalid or oversized settings must fail without leaking settings values; tests must not read the developer's real profile.

## Task 1: Shared configuration boundary and direct-runtime enforcement

**Files:** create `src/runtime/configuration-review.mjs`, `test/configuration-review.test.mjs`; modify `src/runtime/{exec,index,selector}.mjs`, `electron/main.mjs`, `test/{runtime,integration,customize}.test.mjs`.

**Interface:** `checkConfiguration({environment=process.env, platform=process.platform, workspaceRoot, extensionReview}) -> Promise<void>`. Direct runtime receives optional `verifyConfiguration=checkConfiguration` for boundary tests; production always uses the default.

- [x] Add platform table tests through real temporary files for default homes, XDG settings/store, reviewed and changed MCP entries, forbidden ancestor files, malformed settings, and invalid roots.
- [x] Add direct runtime tests proving no host starts on rejected configuration, a reviewed entry can submit, changed configuration sends no turn, and delayed review cannot cross disconnect/reconnect.
- [x] Run focused tests and record the missing-guard failures.
- [x] Extract the guard; validate configuration shapes and path roots; call it before interactive startup and inside new-request preflight. Forward platform in exec calls. Pass review service to Work/Sites on all desktops; remove duplicate selector verification.
- [x] Give fixtures isolated HOME and USERPROFILE values. Run focused tests, then the complete suite and production build.
- [ ] Review the complete patch independently, fix material findings with regression tests, and record evidence.
- [ ] Commit and push the completed feature. Wait for validation and all release targets; verify installer hashes, install, reopen, and inspect the native UI and preview.

## Native evidence

Use only the existing isolated local-echo hook probe to qualify the real native launch path after adding the guard. Provider readback must confirm `echo` before its single local turn. Linux/macOS behavior in this Windows workspace is fixture coverage; CI provides native-OS test/build coverage, not live native-Muse acceptance there.

Official configuration references consulted 29 October 2026:
- https://meta-models.github.io/muse-code-sdk/next/guides/extend/mcp-servers/
- https://meta-models.github.io/muse-code-sdk/next/guides/plugins/reference/cli/
