# Fresh runtime status implementation plan

> For agentic workers: use superpowers:executing-plans inline. Standing implementation, publication and installation authorization applies.

Goal: make lifecycle/status checks independent of retained runtime messages without stale busy or shutdown decisions.

Architecture: a small projection/reader module supplies fresh status to exec, interactive and selector runtimes. The controller uses a single observation for each summary and live guards; existing fallback adapters need no new method.

Tech stack: existing JavaScript, Node, SQLite, Electron and React; no dependency changes.

Spec: docs/superpowers/specs/2026-10-29-runtime-status-design.md

## Global constraints

- Preserve the exact existing busy conditions, local pending work, queue/goal/update gates and native reasons.
- Compact reads use current state on every call; never cache across events or asynchronous actions.
- Keep full snapshot and renderer/IPC contracts unchanged; legacy runtime fallback reads once per summary context.
- No model requests, real-chat modifications, user configuration changes or audit-folder cleanup.

## Review focus

- A transition without a delivered event must immediately block mutations, restart and billing changes.
- Label and busy state must come from the same observation, including legacy runtimes.
- A pending controller operation must stay busy when native flags are idle.
- Selector mode changes must never retain the former adapter's metadata.
- Missing optional flags preserve legacy behavior; an invalid declared metadata response must not be treated as idle.

## Task 1: Compact status and controller integration

Files: create src/runtime/status.mjs, test/runtime-status.test.mjs, test/controller-runtime-status.test.mjs and scripts/runtime-status-benchmark.mjs; modify src/runtime/index.mjs, src/runtime/exec.mjs, src/runtime/selector.mjs, src/controller/index.mjs, test/runtime.test.mjs, test/exec-runtime.test.mjs and test/runtime-selector.test.mjs.

Interfaces: `projectRuntimeStatus(state)` projects five primitive fields. `readRuntimeStatus(runtime)` uses `statusSnapshot()` or one legacy `snapshot()`. `runtimeStatusBusy(status)` evaluates the existing native busy conditions. Runtime `statusSnapshot()` always returns a fresh projection.

- [ ] Capture the baseline with 20 and 100 retained synthetic runtimes, 20 state reads and 10 ordinary clear-error dispatches; count full/compact reads, verify status output, and record timings.
- [ ] Add failing tests for one coherent summary observation, zero full snapshots on compact reads, fresh guards without events, local pending work, malformed responses, detached primitive projection and selector replacement.
- [ ] Add runtime lifecycle tests comparing compact flags with full snapshots across connect, send, pending approval, child work, disconnect and unconfirmed cleanup using existing injected native boundaries.
- [ ] Implement the projection and accessors; update summary and guard reads without changing event publication or broad persistence.
- [ ] Run focused runtime/background/controller tests, then npm test, npm run build and npm run test:code-responsiveness; expect no failures.
- [ ] Record after measurements and limitations, update the research follow-up, and commit the verified feature.

## Task 2: Review and desktop delivery

- [ ] Obtain one fresh final review of the immutable feature range; fix Important/Critical findings once with RED/GREEN regressions and a passing full suite; record all scope rulings.
- [ ] Push main, await exact-commit validation and release success, download and verify installer metadata and hashes.
- [ ] Install normally while idle, reopen with the existing profile, verify packaged source identity and fresh native Codex control, and run isolated status/controller tests against installed modules.
- [ ] Verify the shared preview and installed shell, record the receipt, and retain the audit workspace.
