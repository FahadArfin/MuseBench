# Windows release procedure

Publish, install, and restart only after the user authorizes the batch. Preserve existing edits and the installed profile.

## Catch known release blockers early

On the final local candidate, run `npm.cmd run release:preflight` once. It builds the current renderer and native helpers, checks types, then checks bounded source garbage collection, Windows process cleanup, HTTP app-control startup and private ACL restoration, bundled font rendering, isolated child-restart controls on preview and Electron, and offline Meta chat-history updates. Fixtures use disposable profiles and make no real provider requests.

The command stops at the first failure; it does not retry a failed test into a pass. Per-check timings, the base commit and whether local edits existed are saved in `artifacts/ci-timings/release-preflight.json`. A dirty-checkout result is local evidence, not proof for a later commit. Reuse passing checks while their relevant code is unchanged.

These checks catch previously observed timing regressions before spending a full GitHub release cycle. Keep all six required CI suites, package checks, exact-commit validation and artifact hash verification. The preflight does not replace them or authorize publication. Do not rerun the whole local suite merely because CI is still running.

Keep fixture synchronization tied to observable completion: drain bounded GC slices, wait for rendered rows to detach, confirm owned process exit before retrying transient directory removal, and retain the explicit Electron fixture lifetime until its zero-window assertion finishes. Do not replace these with arbitrary sleeps or automatic whole-test retries.

Font checks must supply and then remove unsent fixture text when inspecting an intentionally empty composer; an empty field has no rendered glyphs to identify. Windows private-directory setup has a separate 30-second startup budget for cold PowerShell/.NET initialization; authenticated HTTP requests retain their 10-second deadline. Startup must fail closed if ACL preparation fails.

## Install and reopen safely

Wait for the exact candidate's successful CI and published artifacts. Verify the installer against the release manifest and updater hashes. Check for active work, close gracefully, back up the complete profile privately and verify the backup, then install the verified artifact. Never reset or replace the profile as routine release cleanup.

When automation reopens the installed app from a short-lived PowerShell command, give it independent stdout/stderr files. Inheriting the command's pipes previously produced an `EPIPE` exception after the command exited. Use a private directory under the existing release backup for these logs; do not print their contents or upload them.

After installation and graceful shutdown, run the following in a clean PowerShell process. `$privateReleaseLogDirectory` must already refer to that private release backup directory. Abort if app-specific `MUSEBENCH_DATA_DIR`, `MUSEBENCH_PROJECTS_DIR`, `MUSEBENCH_DEV`, or `ELECTRON_RUN_AS_NODE` overrides are set; start a clean shell instead of changing the user's profile destination.

```powershell
$exe = Join-Path $env:LOCALAPPDATA 'Programs\MuseBench\MuseBench.exe'
$stamp = [guid]::NewGuid().ToString('N')
Start-Process -FilePath $exe -WorkingDirectory (Split-Path -Parent $exe) `
  -RedirectStandardOutput (Join-Path $privateReleaseLogDirectory "desktop-$stamp.stdout.log") `
  -RedirectStandardError (Join-Path $privateReleaseLogDirectory "desktop-$stamp.stderr.log")
```

Prefer the native MuseBench tools to verify the reopened version, health and changed controls. Stop once the exact artifact, requested UI and retained work are confirmed. No model request or microphone capture is needed for a cosmetic release.
