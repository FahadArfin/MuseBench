# Sandboxed Shell Implementation Plan

**Goal:** Let Muse execute project commands directly through MuseBench with the native Windows sandbox retained.

**Architecture:** Extend the existing exec runtime; retain Ask me and all review gates. Represent native tool results separately from model claims. Use the native managed shell only after current-machine proof.

**Tech Stack:** Electron, React, Node, Muse Code 1.4.13 JSONL.

**Spec:** ../specs/2026-10-25-sandboxed-shell-design.md

- [x] Establish actual managed shell behavior, sandbox account, working directory, project tests and write confinement in a disposable native probe.
- [x] Add failing regression tests for shell flags, fresh sandbox readiness, structured result attribution, approval handling and bounded cancellation; implement the proven native route.
- [x] Display native command results and update runtime copy/types while preserving independent check evidence.
- [x] Review and verify tests/build, full packaged shell workflow and cancellation. Record exact artifact hashes and proof limits, then open the updated app.

Review focus: command-output spoofing; outside writes; native process lifetime; headless approval semantics; stale task attribution; credentials in diagnostics. No unrelated native/global configuration changes or dependency installation.

Validated outcome: managed shell works outside the Windows profile with PATHEXT and plain cwd normalization. New tutorial/working-copy storage uses a separate root. Per-run Job supervision owns native descendants and requires cleanup receipts. Profile projects retain file tools with an explicit copy choice. Final verification: 204 tests, 9 packaged live workflow checks, 4 cancellation checks and 3 copy-flow checks passed; see docs/VALIDATION.md.
