# Windows Muse compatibility implementation plan

> Implement within the user's requested workaround. Preserve original reference files and the existing MSP adapter. No Git repository is present.

**Goal:** Run the complete MuseBench review workflow using official native Muse without disabling its sandbox.

**Architecture:** A separate Windows exec runtime implements the controller's existing runtime API. The desktop selects it on Windows and identifies it in the UI. The existing adapter continues to own MSP on other platforms.

**Spec:** ../specs/2026-10-25-windows-exec-design.md

- [x] Add `src/runtime/exec-events.mjs` and tests for bounded JSONL folding, per-stream sequences, session/command/run correlation, authoritative text replacement and terminal+exit completion.
- [x] Add `src/runtime/exec.mjs` and injected-boundary tests for native readiness, safe flags, independent runs, curated environment, billing/approval failures, cancellation and confirmed process cleanup. Fixed version 1.4.13; no unsafe fallback.
- [x] Wire Windows runtime selection in Electron; update runtime labels/types to describe file-editing compatibility mode and independent requests. Keep all review gates intact.
- [x] Extend live harness metadata/error handling for exec mode and billing, without accepting mock/echo as model proof. Add controller integration regression tests.
- [x] Review, run the complete unit/build/desktop checks, then perform bounded live sandbox/edit tests after the account blocker is resolved. Package and verify the exact artifact, update validation with actual evidence and unresolved limitations.

Review focus: partial JSON/exit races; cross-run late events; cancellation failing to stop children; side-effecting extensions outside sandbox; billing/auth failures accidentally marked completed.
