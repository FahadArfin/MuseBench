# MuseBench validation

25 October 2026. Local Windows build; no publication or deployment.

## Current result

**204/204 automated tests**, TypeScript/Vite build, Windows packaging, **11/11 source UI checks**, **11/11 packaged UI checks**, **9/9 real packaged shell workflow checks**, **4/4 packaged cancellation checks**, and **3/3 working-copy UI checks** passed. Code review has no outstanding actionable findings. Screenshots of command output and the copy flow were visually inspected.

Exact hashes and reports: [artifacts/validation.json](../artifacts/validation.json). The 17 packaged Electron/runtime/controller/template/frontend files match the inspected build files byte-for-byte. The packaged helper and build manifest match the compiled source artifact. The previous file-tool-only evidence is preserved in [VALIDATION-file-tools.md](VALIDATION-file-tools.md) and [validation.file-tools.json](../artifacts/validation.file-tools.json).

| Artifact | SHA-256 |
| --- | --- |
| MuseBench.exe | b67dd7ac0afa31ab0bf4cf838af058bf16303b5b239b6fba007730e22994b6e5 |
| resources/app.asar | d6201d07414a2a2f2ab98feb3780939dee541a36aa1f24d253a5ecf0ee526947 |
| resources/native/MuseBenchJob.exe | aef238d75e2244fb532d779bde0ecaa534e17878063a406a18cf3d0b7c49dfae |
| native/windows-job.cs | 36d1c8ee5f5c1bfe77fc04dc2da1aa0632965718949da51052317b815b98957f |

## Actual runtime proof

The [packaged live run](../artifacts/live-workflow/2026-10-25T23-35-39-231Z/report.json) made one real Muse request. Muse changed exactly two lines in app.js and ran the existing three project tests through its native managed PowerShell tool. The actual command/output appeared in a dedicated card while the app Check remained empty. The app then exercised both preview filter states, ran its independent revision check, accepted the exact revision and preserved the checkpoint and command evidence after restart. Cleanup was confirmed and there were no renderer errors.

The [packaged cancellation run](../artifacts/shell-cancel/2026-10-25T23-36-08-564Z/report.json) made one real request in a separate disposable project. It observed the live sandboxed Node command and its detached test child, dispatched Disconnect through MuseBench, confirmed cleanup without completion/check evidence, and observed both PIDs gone with no delayed marker throughout 13 seconds.

The [working-copy flow](../artifacts/command-copy/2026-10-25T23-37-56-503Z/report.json) used real packaged UI and native readiness checks without a model call. A profile project connected in file-tool mode; Create working copy preserved supported source bytes, excluded synthetic local-secret/Git fixtures, left the original unchanged, required fresh plan approval and connected with sandboxed commands enabled. Its initial observer incorrectly required confirmed rather than the documented not-started shutdown of an idle connection; the standard shutdown verifier confirmed the correct result in a continuation. The initial report is retained. An earlier copy observation compared differently normalized path strings before the queued action settled; final verification uses project identity. Neither observer correction changed application code or sent a model request.

Separate [native confinement proof](../artifacts/shell-discovery/2026-10-25T23-23-59-087Z-job-normal/report.json) observed account muse-sbx-r1, the correct working directory, an inside write and an outside write refused with EPERM. The outside sentinel and fixture source remained unchanged. PowerShell and Node were members of the exact run Job Object and normal completion left zero owned processes. The [native cancellation probe](../artifacts/shell-discovery/2026-10-25T23-26-12-409Z-job-cancel/report.json) confirmed the detached child was also owned and stopped. These earlier probes used the prototype supervisor; the final production supervisor adds explicitly tested startup-stop and timeout-result handling.

## Scope and limitations

- Official Muse 1.4.13-R6996.1 remains sandboxed with Ask me. The native serve host remains unavailable on this machine; Windows uses independent exec runs. No sandbox-disable flag, ACL weakening, saved broad approval or unsandboxed model command bridge was introduced. Native version, configuration, sandbox readiness and event authority remain checked.
- Profile-directory shell launch still stalls in the native CLI. Such projects retain file tools; the explicit working-copy option places supported source outside the profile. Existing paths/data remain intact. New copies exclude dependencies, Git metadata and local secrets and may need dependency setup.
- Headless exec cannot answer interactive approval. Reported requests stop without approval; holds without an event time out. Failed requests are never automatically retried.
- Native shell outcomes are kept separate from assistant text and task.check. Raw exit zero can contain shell errors; it is not an automatic acceptance claim. Explicit preview inspection and an exact-revision Check are still required.
- These positive runtime probes are not an exhaustive sandbox security audit. Outside reads remain possible under native policy. Native proxy-only configuration was observed, but no network-escape test was performed.
- Preview and Check buttons remain separate user-initiated host processes with the existing cancellation limits. The new Job supervisor controls Muse and its descendants, not unrelated applications.
- Source snapshots remain bounded to 4,000 files, 2 MiB per file and 24 MiB total; unsupported links are rejected. Checkpoints are local acceptance records, not Git commits or full backups.
- The package is unsigned and needs its companion files. Node/npm and the official Muse CLI remain external prerequisites. Credentials were not read, copied or embedded.

See [sandboxed command behavior](SANDBOXED-COMMANDS.md), [review record](shell-review.md), and [live harness](LIVE-WORKFLOW.md).
