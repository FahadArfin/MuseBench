# Native sandboxed PowerShell on Windows

Fresh local probes on 1 November 2026 Eastern time (2 November, 02:15–02:17 UTC) support retaining the user-profile workspace restriction for sandboxed managed PowerShell. Installed Muse Code `1.4.14 (1.4.14-R7309.1)` still failed to return the same trivial command inside both a temporary profile directory and this project's OneDrive directory. The command succeeded outside the profile under the already existing `C:\MuseBenchWorkspaces` directory. This reproduces the practical restriction; it does not identify the native implementation's root cause or prove that every profile directory fails.

The binary came from `discoverMuseBinaries()`. Each probe used the real native executable and `muse.powershell`, with a loopback HTTP provider returning a deterministic SSE function call. The only shell command changed into its disposable fixture workspace and printed `MUSEBENCH_SANDBOX_OK`. A second fixture model response merely acknowledged completion; success was assessed from the native tool result and process ownership receipts, not that acknowledgement.

| Fixture context | Result |
| --- | --- |
| Real `USERPROFILE`, isolated XDG config/data/cache, workspace under profile Temp | Shell launch failed immediately: sandbox deny-read state admission rejected a metadata ancestor whose ACL/owner mutation could not be proved safe. Native outer exit 0 did not establish shell success; the app fold rejected the malformed error-only shell result. |
| Real `USERPROFILE` and existing native sandbox data, isolated XDG config, workspace under profile Temp | Managed shell produced no result before the 18-second bound. Owned Job was stopped; native exit 130 and confirmed cleanup. |
| Same retained sandbox context, fixture under this project's `artifacts/runtime-parity` directory | Managed shell produced no result before the 18-second bound. Owned Job was stopped; native exit 130 and confirmed cleanup. Workspace remained untrusted; inherited project instructions were explicitly skipped by the CLI. |
| Same retained sandbox context, fixture under existing `C:\MuseBenchWorkspaces` | Native tool returned `exit_code: 0`, `terminal_status: completed`, and exactly `MUSEBENCH_SANDBOX_OK` plus a line ending. Native run exited 0, app fold accepted the shell receipt and completion, and Job cleanup was confirmed. |

Retaining the actual profile and native sandbox data matters: fully redirected data introduces a distinct sandbox metadata-admission failure and cannot independently establish whether the profile-workspace stall persists. The two retained-data profile runs and the successful outside-profile run provide the useful comparison.

The advertised `powershell` function schema requires `command` and `description`. Optional fields are `workdir`, `shell`, `login`, `tty`, `yield_time_ms`, `timeout_ms`, `max_output_tokens`, and `sandbox_permissions`. The fixture supplied only `command` and a short `description` in the three retained-data comparisons. It requested no escalation. This validates the installed native tool's current schema and one successful real PowerShell execution, rather than a mocked shell receipt.

All probes kept the filesystem sandbox enabled and used `--permission-profile :ask-me`. Shell was enabled, native write/web/reminder/user-input tools were disabled, session logging and foreign personal context were disabled, startup hooks were replaced with `hooks={}`, and `managed_hooks_path=null` excluded managed hooks. No project trust, permission grant, settings edit, external provider request or paid model call was performed. Real credential contents were neither inspected nor logged. A fake API key supplied over stdin and an explicit loopback base URL handled every model request. Each process ran in the existing Windows Job supervisor with an 18-second stop bound and confirmed descendant cleanup. The installed app and its profile were untouched. Outside-root write denial was not tested.

Local reproducible evidence is retained in ignored artifacts:

- `artifacts/runtime-parity/native-shell-probe.mjs`
- `artifacts/runtime-parity/native-shell-profile.json`
- `artifacts/runtime-parity/native-shell-profile-context.json`
- `artifacts/runtime-parity/native-shell-project-context.json`
- `artifacts/runtime-parity/native-shell-outside.json`

This evidence supports keeping sandboxed profile workspaces in file-editing/search mode and pointing users who need managed commands to an outside-profile working copy. It does not justify enabling Full access automatically or silently bypassing the sandbox.
