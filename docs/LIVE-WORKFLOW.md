# Live Muse workflow

`scripts/live-smoke.mjs` exercises the real Electron application and its selected native Muse runtime. Windows compatibility mode uses the official `muse exec --json` entry point; supported non-Windows hosts retain the SDK adapter. By default, invoking the harness explicitly starts one real request through your Muse account, which may consume account usage. `--connect-only` checks connection readiness without a model request, and `--help` only displays help. A successful demo, echo probe, or local UI test is not evidence that the full live workflow passed.

## Prerequisites and launch

Supply an already installed, official native `muse.exe` by absolute path. Complete any sign-in directly in the official CLI using [Meta's instructions](https://dev.meta.ai/docs/muse-code). Do not paste credentials into chat. The harness does not install Muse, collect credentials, change account settings, or change global CLI configuration.

From the repository root, after installing the application dependencies and building its source:

```powershell
$env:MUSEBENCH_MUSE_BIN = 'C:\absolute\path\to\muse.exe'
node scripts/live-smoke.mjs
```

The equivalent explicit argument is:

```powershell
node scripts/live-smoke.mjs --muse-bin 'C:\absolute\path\to\muse.exe'
```

To exercise a packaged application, also set `MUSEBENCH_EXECUTABLE` to the absolute path of `MuseBench.exe` before launching the script. Keep the packaged application files beside that executable. Without this option, the harness launches the source application with Electron. The npm alias is `npm.cmd run test:live -- --muse-bin C:\absolute\path\to\muse.exe`.

To check readiness without sending a model request:

```powershell
node scripts/live-smoke.mjs --connect-only
node scripts/live-smoke.mjs --connect-only --muse-bin 'C:\absolute\path\to\muse.exe'
```

`--connect-only` and `--muse-bin` may appear in either order. It uses the same source or packaged application selection. Success is `connection_ready` with exit code `0`, `modelCallAttempted: false`, and `endToEndVerified: false`; it is distinct from a full workflow `passed` result.

The connection/readiness operation has a 60-second bound, followed by explicit native shutdown confirmation. Connection-only mode also checks that the copied project inventory and file contents remain unchanged.

The default overall wait for the model operation, including any supported permission approval wait, is `180000` milliseconds. Set `MUSEBENCH_LIVE_TIMEOUT_MS` to an integer from `30000` through `600000` to adjust that bound before starting a run.

## Windows compatibility mode and verified workflow

On 25 October 2026, installed Muse `1.4.13-R6996.1` matched the SDK and stable schema. Browser sign-in completed and the native sandbox check reported ready, but the same binary's SDK `initialize` reported `sandboxAvailability: unavailable`. Independent initialization reproduced that mismatch, matching the symptom in [Meta SDK issue #107](https://github.com/meta-models/muse-code-sdk/issues/107). The SDK connection remains blocked; compatibility mode does not reinterpret that result as available.

Windows compatibility mode uses independent native exec runs with `:ask-me` by default and no sandbox-disabling flags. Choose `--reasoning xhigh --approval auto` to exercise another supported configuration. Approval options are `ask`, `auto`, and `never`; all preserve the sandbox. Compatible workspaces support managed sandboxed PowerShell; profile workspaces keep file tools. Web/reminder/input tools remain withheld. Unsupported approval or input requests stop the owned process; MuseBench never fabricates approval replies. With Auto-review selected, Muse’s own reviewer may approve eligible actions. Each request starts an independent run, with no conversation-resume claim.

Connect checks the canonical native executable and workspace, pinned Muse version, native sandbox readiness, and an inert echo contract. These checks and the fixed Ask me arguments establish connection readiness only. They are neither MSP dynamic host permission verification nor proof that the operating-system sandbox enforces confinement. A separate harmless file-tool probe verified an inside edit and an outside-workspace write rejection while the sentinel remained unchanged. Outside reads were allowed. This is mediated file-tool evidence, not an OS shell-enforcement claim; see `artifacts/sandbox-probe/run-1nLnY2/report.json`.

An earlier native exec model probe reached Meta's API but was rejected with **HTTP 402 billing failure**; that attempt made no edit. The user subsequently resolved billing, and an explicitly authorized packaged run completed the full workflow on 25 October 2026 at 22:36:07 UTC. The harness made no billing changes or automatic retries.

The [packaged live report](../artifacts/live-workflow/2026-10-25T22-35-50-202Z/report.json) records `status: passed`, `appMode: packaged`, `actualElectron: true`, `modelCallAttempted: true`, and `endToEndVerified: true`. Native exec produced an authoritative completed event and a successful process exit. The exact requested `app.js` edit was verified against the full project inventory; the preview filtered to two herbal teas and restored four products; all three project tests passed with exit code `0`. One checkpoint saved revision `25f5c1e7887bc45c7ff6ea31cc271678651df4bfc1687937d17b93218467aebf`, and restart restored that task and checkpoint with preview and Muse stopped. The report contains no renderer errors and confirms native shutdown.

This result verifies the packaged application workflow. It does not prove OS sandbox confinement or dynamic MSP permissions. The historical report above identifies the file-tool-only build. The subsequent shell-enabled package and its exact hashes are recorded in VALIDATION.md and artifacts/validation.json.

`npm.cmd run doctor:host` remains a no-model host diagnostic, writing `artifacts/muse-install/verification.json`. Use the live harness's `--connect-only` mode for the actual Electron compatibility connection check.

## What a full run verifies

Each run creates its own application data directory at `artifacts/live-workflow/<ISO-with-colons-replaced>/data` and copies the tea-store sample into a separately isolated command-compatible project folder. The timestamp has its colons replaced for Windows-compatible paths. The harness creates and approves a new Muse task on that copy; it does not apply the deterministic demo edit.

The single request asks Muse to change only the two filter declarations in the copied `app.js`:

```diff
-/* MUSEBENCH_FILTER: false */
-const FILTER_ENABLED = false;
+/* MUSEBENCH_FILTER: true */
+const FILTER_ENABLED = true;
```

Keep the application visible during the run. For the SDK runtime, inspect any supported permission request and make a one-time choice yourself in MuseBench's runtime dialog; an unanswered dialog can exhaust the configured timeout. Windows exec compatibility mode stops on unsupported approvals or input. The harness never answers human approval requests. The selected Auto-review mode can use Muse’s own documented reviewer.

After authoritative completion of the real request, the harness verifies the exact edited bytes and project inventory, opens the local preview, asserts that the caffeine-free filter works, records preview inspection, and runs the sample project's `npm test` through MuseBench. It then accepts the reviewed revision as a checkpoint, restarts the application with the same isolated data directory, and verifies that the saved task and checkpoint persist. `--connect-only` stops after readiness checks and does not perform this edit-to-checkpoint sequence.

## Reading the result

The harness saves each run's report at `artifacts/live-workflow/<ISO-with-colons-replaced>/report.json` and updates `artifacts/live-workflow/latest.json`. The run directory also contains `data/` and `screenshots/`. Check the recorded status and evidence before claiming that the live workflow passed.

| Status | Meaning | Exit code |
| --- | --- | --- |
| `passed` | All live workflow checks completed successfully. | `0` |
| `connection_ready` | Connection-only checks completed; no model request or full workflow verification. | `0` |
| `failed` | A workflow verification failed. | `1` |
| `unavailable` | A required runtime, authentication, connection, or account billing prerequisite is unavailable. | `2` |
| `waiting_user_approval` | An intermediate SDK-runtime state awaiting your runtime-dialog decision. | No final exit yet |

A missing or incompatible native runtime, unavailable authentication, a blocked connection, or billing action required is **unavailable**, never a passing result. Check `endToEndVerified` as well as status: `connection_ready`, an intermediate state, or an unfinished run does not establish live completion.

If native or Electron shutdown cannot be confirmed, the final status is `failed` with exit code `1`. An earlier billing or authentication blocker is retained as `unavailableCause` when applicable.

The checkpoint is MuseBench's record of the reviewed content, not a Git commit or deployment. Run artifacts and the copied sample remain separate from normal application data so the result can be inspected later.

## Reproduce the file-tool boundary probe

`node scripts/sandbox-smoke.mjs --muse-bin C:\absolute\path\to\muse.exe` makes one real bounded request in disposable sibling folders. It preserves the runtime flags and verifies native path-bound write rejection, exact file hashes and cleanup. It saves redacted native events for offline evidence review. Its `--help` option is inert.

## Sandboxed commands

Add --shell to the live command to request the exact two-line edit plus one native managed PowerShell npm test. It cannot be combined with --connect-only. The harness verifies actual structured command/output, all three tests, a visible command card, an empty app Check before the explicit Check action, and exact command-journal persistence after restart.

Final packaged --shell proof: [9 passing checks](../artifacts/live-workflow/2026-10-25T23-35-39-231Z/report.json).

Run node scripts/shell-cancel-smoke.mjs --muse-bin C:\absolute\path\to\muse.exe with MUSEBENCH_EXECUTABLE set for a separate real cancellation request. This creates an inert local delayed-marker fixture, observes two live native-sandbox processes, disconnects through the app, and requires cleanup plus no marker for 13 seconds. [Final packaged cancellation report](../artifacts/shell-cancel/2026-10-25T23-36-08-564Z/report.json).

The executable and Job helper must come from the same packaged build; native commands are never rerouted to a host shell. See SANDBOXED-COMMANDS.md for compatibility and proof limits.

## Composer settings validation

The packaged [26 October 03:34 UTC run](../artifacts/live-workflow/2026-10-26T03-34-16-567Z/report.json) used Extra high reasoning and Auto-review for one real edit and sandboxed PowerShell test. It passed the entire edit, native command, preview, independent check, acceptance and restart sequence. The report records the selected settings, exact approval arguments, native terminal/exit evidence and confirmed process cleanup. This is 25 October local time.
