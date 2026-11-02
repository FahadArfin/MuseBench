# Windows release procedure

Publish only after the user authorizes the batch. A routine release ends when the exact candidate passes GitHub CI and its validated installer and updater files are publicly available. Report the release link; the user handles updating their app. Do not install, close, restart, or manipulate the installed profile unless separately requested.

## Catch known release blockers early

On the final local candidate, run `npm.cmd run release:preflight` once. It builds the current renderer and native helpers, checks types, then checks bounded source garbage collection, Windows process cleanup, HTTP app-control startup and private ACL restoration, bundled font rendering, isolated child-restart controls on preview and Electron, and offline Meta chat-history updates. Fixtures use disposable profiles and make no real provider requests.

The command builds current outputs, then reuses recent passing local checks when their exact command, content fingerprint and runtime match. The fingerprint includes tracked and untracked non-documentation inputs, lockfile and installed dependency metadata, generated renderer/native output, Node/OS identity and relevant runtime flags. Source edits, renames, deletions, test/tooling changes and dependency changes invalidate it. Commit/staging changes and documentation-only edits do not. This deliberately covers all product code rather than guessing an incomplete import graph.

Receipts live under ignored `artifacts/check-evidence/`, expire after 24 hours, and store only passing checks with stable inputs before and after execution. Failed checks stop immediately without automatic retries. Corrupt/missing/expired receipts cause a fresh check. CI and any `MUSEBENCH_*`, `PLAYWRIGHT_*` or Electron distribution override bypass reuse: an installed app, live input or custom fixture can change outside this checkout. `npm.cmd run release:preflight -- --force` bypasses prior passes and invalidates them if the rerun fails. Use a forced check after any new concern about external state; receipts assume dependencies are managed by the lockfile, not manually edited inside `node_modules`.

Per-check timings, reuse status, fingerprint, base commit and checkout state are saved in `artifacts/ci-timings/release-preflight.json`. For other local groups, build current UI/native outputs when needed, then use `node scripts/run-ci-suite.mjs <suite> --reuse` (`--force` reruns). A dirty-checkout receipt is local evidence, not exact-commit release proof. Do not repeat the same checks just because a commit was made or CI is running.

These checks catch previously observed timing regressions before spending a full GitHub release cycle. GitHub ignores local receipts and runs all seven required CI groups, package checks, exact-commit validation and artifact hash verification. The preflight does not replace them or authorize publication. Do not rerun the whole local suite merely because CI is still running.

Chat checks run as `chats-a` and `chats-b` on separate Windows runners. Their contents preserve all previous checks exactly once, with sequential execution inside each runner to protect fixed-port and Electron fixtures. Based on release run 41352072866, their measured workloads were approximately 226 and 220 seconds, versus 446 seconds together. Actual CI speed depends on runner availability and the other validation groups.

Keep fixture synchronization tied to observable completion: drain bounded GC slices, wait for rendered rows to detach, confirm owned process exit before retrying transient directory removal, and retain the explicit Electron fixture lifetime until its zero-window assertion finishes. Do not replace these with arbitrary sleeps or automatic whole-test retries.

Font checks must supply and then remove unsent fixture text when inspecting an intentionally empty composer; an empty field has no rendered glyphs to identify. Windows private-directory setup has a separate 30-second startup budget for cold PowerShell/.NET initialization; authenticated HTTP requests retain their 10-second deadline. Startup must fail closed if ACL preparation fails.

## Optional installation, only when separately requested

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
