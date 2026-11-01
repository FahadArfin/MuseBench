# App reliability implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independent tasks and verify integration in this checkout. Preserve the existing uncommitted login and typing fixes. No publish, push, installed-app replacement, or user-profile mutation.

**Goal:** Resolve every finding and observation in `artifacts/app-audit/report.json` with regression evidence.

**Architecture:** Keep ownership until operations are actually terminal. Use deadlines and generation fences for asynchronous native work; separate cancellable repository inspection from the controller action queue. Preserve durable history and checkpoint references while reducing repeated serialization and reclaiming unreachable snapshot objects. Offer an authenticated, loopback-only shared MCP HTTP transport alongside compatible stdio.

**Tech stack:** Electron 45, Node 22, React 19, SQLite, existing MCP SDK, node:test and isolated Electron/Playwright fixtures.

## Constraints and decisions

- The user explicitly requested autonomous implementation of all audit findings and observations. Make routine design decisions without pausing for additional approval.
- Keep CLI 1.4.14, existing profiles/partition names, provider authentication boundaries, and preview/desktop parity.
- No paid model/provider calls, real hosting publication, system installation, profile merging, or termination of active Codex-owned clients.
- Use bounded native deadlines, reject stale late writes, retain blockers for unconfirmed process cleanup, and never expose credentials in diagnostics.
- GC may delete only unreferenced owned CAS objects after a grace period and a complete valid reference inventory. Retained checkpoints/baselines and in-flight captures must remain readable. Fail closed on uncertain references/paths.
- Reduce relay multiplication by supporting shared HTTP MCP in the app; preserve stdio compatibility. Keep loopback binding, bearer authentication, Origin/Host checks, cancellation, and bounded concurrency. A real stdio client necessarily owns a process; do not mislabel legitimate clients as leaks or kill them.
- Dependency remediation must preserve old consumer APIs and packaging behavior; no blind forced downgrade/major override.

## Tasks

- [x] **1. Protected browser login lifecycle.** Own `electron/browser-login-store.mjs` and focused tests. Bound restore/save/close; invalidate late work; preserve logout and device encryption; expose sanitized failure information. Integrate startup/quit in main after module completion.
- [x] **2. Native account and onboarding ownership.** Own billing/account/onboarding modules and tests. Retain child/owner through exit; sticky cleanup failures block retries, source changes, and shutdown/update; bounded confirmation. Test delayed/failed close and recovery.
- [x] **3. Dictation ownership and prompt budget.** Own dictation service/hook and focused tests. Stale starts cannot cancel a newer recording; enforce 16,000 character draft budget without silently discarding recoverable speech. Preserve existing API callers and shared UI.
- [x] **4. Controller scan and close scheduling.** Own controller orchestration. Cancellable background refresh does not hold the mutation queue; commit observations only for the captured project/task generation. Prioritize stop/cancel and block stale queued connects after closing begins. Test slow scans, navigation, close, errors, and unchanged evidence validation.
- [x] **5. Long-history performance.** Same controller owner. Reduce repeated whole-history serialization/indexing/writes on stream updates using dirty/identity/revision gates and transactions while preserving crash durability and complete history. Benchmark against the audit fixture.
- [x] **6. Snapshot reclamation.** Own CAS/GC module and tests; coordinate controller reference inventory contract with task 4 owner. Add bounded, incremental, symlink-safe grace-period cleanup and startup/maintenance integration, including failed scans and retained checkpoints.
- [x] **7. Shared native app control.** Own native-control host/server and App control UI. Add zero-helper shared loopback HTTP MCP option, durable private connection grant/endpoint across restart, disable revocation, and safe stdio lifecycle cleanup. Test multiple clients, restart, authentication, request bounds, no process spawning, and legacy behavior.
- [x] **8. Build-tool dependency remediation.** Research patched versions and consumer contracts. Update dependencies/lockfile with focused compatibility coverage and packaging verification. Reach a clean dependency audit or implement verified equivalent source remediation with exact evidence; do not suppress advisories.
- [x] **9. Integration and review.** Resolve shared main/types/IPC contracts, update validation docs/CI checks as appropriate, run independent review of changes, and fix actionable review findings.
- [x] **10. Final verification.** Full unit suite, build/typecheck and isolated affected desktop/native/mobile flows. Repeat performance and failure probes; record final results and remaining runtime-only limits without claiming live provider proof.

## Research basis

- Electron safeStorage and browser store writes remain asynchronous native operations; caller deadlines do not cancel native work, so commits also need generation fences: https://www.electronjs.org/docs/latest/api/safe-storage
- MCP stateless Streamable HTTP supports shared multi-client service without per-client stdio processes: https://ts.sdk.modelcontextprotocol.io/server and https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- SQLite transactions amortize writes without disabling synchronous durability: https://www.sqlite.org/wal.html and https://www.sqlite.org/lang_transaction.html
- Build-tool advisory to remediate: https://github.com/advisories/GHSA-g3hv-75wg-m249

## Review focus

Late native completion after timeout; logout/relogin while saving; stop/navigation during source scan; checkpoint references created concurrently with GC; reconnect/disable races across transports; legacy dependency API assumptions; teardown with unconfirmed child processes; oversized dictation with existing text and rapid chat switches.
