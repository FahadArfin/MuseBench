# Reviewed hooks: platform and interactive-host acceptance

29 October 2026, native Muse 1.4.14 / SDK 1.4.14.

## Portable command projection

The old serializer emitted only `commandWindows`, including on Linux and macOS.
Muse documents that handlers with only that field are skipped on other platforms.
The controller now supplies its own platform explicitly: Windows retains
`commandWindows`; Linux/macOS use `command`. Saved commands, supported events,
timeouts, disabled flags and project-bound review grants are unchanged. Shared
desktop and preview labels say “Shell command” and “user account”. Users still
write commands suitable for the machine where their project runs.

Three new regressions failed before the fix. All 125 focused hook/preset/runtime
tests passed afterward. The native release matrix also runs the hook and preset
contracts on Windows ARM, Linux and macOS. Those tests prove projection and
review behavior, not execution by Muse on those operating systems.

## Native interactive execution, without model usage

Run `node scripts/interactive-hooks-probe.mjs --native-echo` explicitly with the
pinned official CLI already installed. It uses an isolated profile and workspace,
the production extension-review service and interactive-host construction path,
and Muse's local echo provider. It verifies `providerId: echo` before issuing one
protocol turn; it never passes echo through the production Meta model selector or
loads the user's credentials.

The Windows probe observed:

- Ask me permissions verified before submission.
- `UserPromptSubmit` and `Stop` completed with real native `hookRun` receipts.
- Both recorder outputs carried the expected native session and workspace;
  the prompt recorder also matched the accepted turn and test text.
- Deliberately configured, unreviewed user/managed fixtures produced no output.
- Confirmed host shutdown and removal of the owned temporary workspace.
- Zero model requests.

An earlier recorder command containing a quoted Windows executable path failed
in the native shell, with a corresponding failed `hookRun`. The final diagnostic
uses the current Node executable's directory in a deliberately restricted PATH
and a relative recorder in the disposable workspace. This does not fix arbitrary
native Windows command quoting; production commands are preserved verbatim.

`hook/list` returned the file-based fixture rows even though launch overrides
determined execution. Therefore its listing alone is not evidence of effective
commands or execution. The probe validates actual receipts and output files.

This check does not establish Meta model behavior, native Linux/macOS execution,
arbitrary configuration trust, or hook timeout/descendant behavior. It changes no
provider option or user settings. Existing exec-mode timeout evidence is separate.

## Final review and validation

The independent review found a diagnostic-only failure: a missing terminal
notification could leave polling alive after the deadline. A child-process
regression reproduced that hang. The receipt wait now owns its deadline and
stops polling on timeout or cancellation; the regression and all 1,203 tests
passed. The final native echo probe again passed with confirmed cleanup.
TypeScript/production build, browser navigation, catalog interactions and
preview/desktop geometry checks also passed.

The first release attempt exposed a Windows-only home-directory fixture in
the preset tests newly added to the native matrix. The fixture now supplies
an isolated home on every platform and exercises all three platform branches
locally. Linux/macOS checks remain required; no failing check was removed.

Review scope decisions: the existing authorized main/release workflow is
retained; the echo result covers only the actual Windows diagnostic path.
Meta inference, native non-Windows execution and arbitrary command quoting need
separate evidence. Existing timeout/descendant semantics were not changed.
Package/CI/installed acceptance is checked against the eventual release rather
than inferred from these local results.

Deferred minor: the diagnostic compares resolved workspace paths without
canonicalizing symlinks. A symlinked temporary directory can cause a false
negative. This does not affect production hook execution or the recorded
Windows result.

Primary references: [Muse hook fields and execution](https://meta-models.github.io/muse-code-sdk/next/guides/extend/hooks/),
[hook events and payloads](https://meta-models.github.io/muse-code-sdk/next/guides/plugins/reference/hook-events/).
