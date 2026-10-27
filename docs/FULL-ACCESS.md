# Optional Windows Full access

Open the composer's permissions menu (normally **Ask for approval**) and toggle **Full access**. The composer chip shows **Full access** while selected. In an idle chat this reconnects Muse with the selected sandbox scope; in a new chat it applies before the first message. Access cannot change during active or unresolved work. New chats default to sandboxed access.

The connection dialog still offers Full access and transport selection under Settings > Muse connection > Open Muse connection. Turning Full access off in the composer returns an interactive connection to sandboxed native exec. Enabling it retains an existing interactive transport; otherwise it uses native exec.

Sandboxed is the default. Full access is selected for one connection and is not saved as a global preference. Disconnecting or creating a fresh runtime returns to the sandboxed default. Other chats do not inherit it. Approval selection remains separate: Ask for approval, Auto-review, and No prompts retain their existing meanings. The Windows exec transport still stops when an interactive approval is required.

Full access uses the official `--disable-sandbox` flag. Direct shell commands run with the Windows account's filesystem and network access. This does not enable disabled web/input tools, automatically trust project extensions, or replace the existing exec transport with MSP.

## Verified behavior

On Muse Code 1.4.13 (1.4.13-R6996.1), Windows 10.0.26300 x64:

- At 2026-10-27 01:29 UTC, an ephemeral echo-provider MSP host accepted the same fixed `session/userShell` command in both modes. The sandboxed host failed; the host launched with `--disable-sandbox` completed. Both reported sandboxAvailability unavailable, retained onRequest approval, and shut down cleanly. No model call was involved.
- At 01:35 UTC, MuseBench's actual exec runtime connected using Ask me plus `--disable-sandbox`. A real model invoked managed PowerShell in a temporary workspace inside the Windows user profile, printed `MUSEBENCH_FULL_ACCESS_OK`, and returned exit code 0. The request completed and process cleanup was confirmed.
- Shared browser preview controls were checked through selection, connection, the active badge, disabled access changes while connected, and reset to the sandboxed default on disconnect. Preview connections are simulated and execute no commands.

This is an opt-in workaround for [issue #107](https://github.com/meta-models/muse-code-sdk/issues/107), not a repair of native sandbox enforcement. Do not label the upstream issue fixed on the strength of these results.

References: [permissions](https://dev.meta.ai/docs/muse-code/permissions), [host operations](https://meta-models.github.io/muse-code-sdk/next/guides/host-operations/), and the installed `muse serve --help`.
