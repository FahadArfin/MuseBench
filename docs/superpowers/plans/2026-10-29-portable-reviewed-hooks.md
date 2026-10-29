# Portable reviewed hooks

Follow-up to the approved remaining-harness and multiplatform delivery plans.
Baseline: e1e3a9af72b926e82bd5af8846343e737c658509.

## Evidence and scope

The shared hook serializer emits only `commandWindows`; the official Muse hook
contract says such handlers are skipped on other platforms. The project editor
also labels every host as Windows. Fix the native projection at the controller
boundary without changing saved commands, events, grants, limits or permissions.

1. Add failing coverage for Windows/Linux/macOS native hook projection and the
   project-review service's platform binding. Require an explicit supported
   platform in the pure serializer. Preserve Windows behavior; use `command` on
   Linux/macOS. Run these tests on the native release matrix.
2. Make shared editor wording platform neutral, update the existing interaction
   check, and run focused tests, build, preview and desktop parity checks.
3. Use an isolated profile and the official local echo provider to verify
   reviewed-hook execution in an interactive host without model usage. Record
   exact scope and cleanup. Do not make echo a product provider or claim this
   proves Meta inference, arbitrary native hook sources, or non-Windows runtime
   acceptance.
4. Review, test, commit/push, verify release and installed artifact, and reopen.

Expected: supported platforms receive the documented command field, disabled
hooks remain absent, grants stay project-bound, and invalid platforms fail before
launch. The live probe must verify the echo provider before submitting any turn,
never read account credentials, and clean up only its owned temporary workspace.

Review focus: native command selection, all serializer callers, grant scope,
cross-platform test execution, and honest separation of native echo evidence
from production Meta model execution.
