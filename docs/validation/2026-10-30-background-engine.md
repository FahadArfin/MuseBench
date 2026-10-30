# OC04 background engine verification

Source base: 80cceaa052cd757a34db1cc62c6211006661547d (installed 0.2.199). Work is isolated on codex/background-engine.

Local evidence lives in `.superpowers/sdd/2026-10-30-background-engine/` and `artifacts/background-engine/`. No provider/model request is included in this work.

- Lifecycle/native tests cover default off, explicit persistence, tray/write rollback, serialized settings, configuration/active work quit guards and read-only native access with no window.
- Real Electron smoke uses a disposable desktop profile, blocked remote DNS, a local saved Muse chat and a separately paired fixture TLS client. It destroys all BrowserWindows three times; checks the same engine PID, native host and saved chat; reads that chat and the paired mobile inventory without a window; reopens through concurrent second-instance/activation events; and checks one replacement shell. A full process restart restores the preference. Disabling then closing exits cleanly.
- Shared React settings run in browser preview and the actual Electron shell, with narrow-width layout and explicit preview labeling. These are fixture checks, not proof of a live provider model continuing to execute.
- The initial close smoke identified a dropped close during startup/read-only app operations. Close requests now wait for initialization/IPC completion, then rerun active-work guards. The personal browser retains its original pre-destruction cleanup and skips it for prevented close events; a regression pins both behaviors.
- The smoke originally selected an embedded browser's Playwright page on reopen. It now selects the shell by its local document URL. A fixture certificate read used unsupported VM dynamic import; the test now passes the isolated encrypted bytes to Electron's keyring without logging them.
- Git Bash shadows Windows whoami with GNU whoami. Ledger verification uses a scoped System32-first runner; direct PowerShell tests use native Windows tools. No ACL behavior was changed to accommodate the runner.

Full suite/build, independent review and exact released/installed acceptance are recorded below when completed. Personal profile background settings remain unchanged; fixture opt-in is not a user setting change.

Task 2 final checks: 1,611 passed, 0 failed, 1 pre-existing optional skip (1,612 tests); build passed with the existing Vite chunk warning. Shared background smoke and existing complete native-control smoke passed. The narrow preview screenshot was visually inspected.

Final independent review covered 80cceaa..c48ce43. No Critical findings. Both Important findings were reproduced and fixed in one correction pass: updater listeners now survive service shutdown until Electron's final quit, and synchronous installer failure requires a fresh reopen; personal sign-in contributes authoritative activity until its account window closes. Regression tests cover shutdown rejection, installer throw/event, late errors, and personal sign-in after its opening command has settled. RED: `review-red.log`; focused GREEN: 108 tests in `review-green.log`.

The Minor coverage gap was also resolved: the real desktop smoke holds a replacement window's load promise, requests close, then releases it and verifies one deferred disposal. Its sign-in fixture never navigates to a provider and verifies both close and quit preserve the account window. Shared preview and desktop checks passed (`review-smoke.log`, `desktop-8Nfm2j/report.json`). Full correction suite: 1,613 passed, 0 failed, one existing optional skip (`review-full.log`). Build passed (`review-build.log`). The lifecycle smoke also supports an explicit installed executable for separate exact-package fixture proof.

The existing native-control regression smoke also passed after correction, including revocation, real window-close exit, cached relay portability and reconnect (`review-native.log`).
