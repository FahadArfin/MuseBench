# Sandboxed project commands on Windows

MuseBench uses the official Muse 1.4.13 managed PowerShell tool with the composer’s selected approval setting: Ask me by default, Auto-review, or No prompts inside the sandbox. It never runs a model-generated command through MuseBench's ordinary host command launcher, disables the sandbox, or silently switches to an unsandboxed method. The preview and explicit Check buttons retain their existing, separate user-initiated execution behavior.

## Using it

Create or open a compatible project, create a Muse task and approve its plan, connect Muse, then ask it to edit files and run a project command. A request is independent of earlier requests. Native command cards show the command, output, tool status and signed Windows exit code. They remain part of the task journal after restart. A command exit of zero can still contain errors from a shell command list; inspect its output. Only the explicit Check action supplies the revision-check evidence needed for acceptance.

New tutorials and working copies live outside the user profile, under the application-data drive's `MuseBenchWorkspaces` directory with a separate identifier for each MuseBench data profile. Existing project locations are preserved. Profile-based projects keep working with file tools; their connection panel explains the shell limitation and offers **Create working copy**. That action copies the bounded, reviewed source, including binary source files, into a unique folder. It excludes dependencies, Git metadata and local secrets, preserves the original, and starts a new task requiring plan approval. It is not a full repository backup or an automatic two-way sync.

## What the workaround changes

- Retains Windows `PATHEXT` in the curated environment, alongside PATH and other OS essentials. Missing PATHEXT was independently reproduced as the cause of failed `node`/`whoami` resolution. Unrelated API keys and Node hooks are still excluded.
- Guides Muse to start project commands with plain `Set-Location -LiteralPath '<workspace>'`. The native tool otherwise supplies an extended `\\?\` working directory that causes `npm.cmd`/CMD to fall back to the Windows directory. This is command guidance, not an additional permission boundary.
- Launches native Muse atomically inside a Windows Job Object before its first instruction. Muse still supplies the OS sandbox. The Job Object supplies process lifetime control: completion, Disconnect, timeout, owner EOF and helper death terminate owned descendants. It does not terminate other Muse sessions by process name.
- Requires a separate helper receipt confirming zero owned processes before reporting completion. The helper is built in advance and packaged with a source/binary hash manifest. Native output travels in framed byte records and cannot impersonate the cleanup receipt.
- Checks native sandbox readiness before each real request, and retains version, configuration, sandbox, hooks and output/time limits. Interactive approvals have no supported reply channel here. Emitted approval requests stop without approval; native holds that emit no request are bounded by the run timeout. Muse’s documented reviewer handles eligible decisions only when Auto-review is selected. No prompts uses approval-mode never without disabling the sandbox. MuseBench never synthesizes approval replies or retries failed requests.

## Native evidence

The tested binary is `muse-bin-1.4.13-R6996.1.exe`. Its default sandbox was enabled for every probe. No native configuration, sandbox ACL or sandbox policy was weakened.

- `artifacts/shell-discovery/2026-10-25T23-20-13-821Z-normalized-test`: actual npm test, sandbox account `muse-sbx-r1`, correct cwd, inside write, outside sentinel write denied with `EPERM`.
- `artifacts/shell-discovery/2026-10-25T23-23-59-087Z-job-normal`: actual sandboxed Node and PowerShell belonged to the exact per-run Job Object; source and outside sentinel were unchanged; native exit zero followed by zero owned processes.
- `artifacts/shell-discovery/2026-10-25T23-26-12-409Z-job-cancel`: shell, Node and an intentionally detached inert test child all belonged to that job; cancellation reached zero processes and the delayed marker was absent.
- Profile-based runs still stalled after native `sandbox.prepare` and were stopped at the timeout. An owned native read-maintenance worker from an earlier completed probe also blocked a later command until scoped cleanup. The Job Object prevents that worker from outliving its run.

These are local runtime observations, not an exhaustive sandbox security audit. Outside reads remain possible under the native policy. Native readiness/proxy-only configuration is not a separate network-escape test. See [validation](VALIDATION.md) for the final packaged workflow results and artifact hashes.
