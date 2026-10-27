# MuseBench desktop updates

User requested Settings checks, a 30-minute background check, a green toolbar action, download/install/reopen, releases on main, and explicitly authorized making FahadArfin/MuseBench public. Existing authorization covers per-feature GitHub pushes. Use writing-plans, test-driven-development and executing-plans inline, with one final independent review.

## Design

Public GitHub Releases plus electron-updater and per-user NSIS installers. No client GitHub credential. Keep appId and userData identity. Source remains version 0.2.0; CI stamps 0.2.<main commit count> into its checkout and locks the release to the tested SHA. Release workflow validates tests/build/preview parity before publication. One bootstrap NSIS installation is needed for older folder-copy installs. Existing global credentials and private browser snapshots must not enter the public repository/release.

Updates check shortly after launch and every 30 minutes while the installed app is running. Background checks only discover; click downloads with progress. Download readiness offers explicit Restart to update. No install on ordinary quit, downgrade, active tasks, approvals, uncertain cleanup, validation, armed goal, Customize, Work/Sites operation, dictation or app mutation. Main process rechecks and locks mutation admission, waits for controller/service closure before handing off to installer. No arbitrary URL/path accepted from renderer. Errors are recoverable, offline checks do not erase a ready download. Shared React controls and labeled preview simulation.

## Implementation

- [x] Audit tracked history, make repository public as requested, configure public release feed.
- [x] Tests first: timer, duplicate check/download, offline recovery, progress, manual install only, busy shutdown guard and action validation. Implement updater service and trusted IPC.
- [x] Shared Settings Updates panel and green toolbar icon across workspaces, preview fixtures and UI parity.
- [x] NSIS package, monotonic version stamping, validated main release workflow, initial release/bootstrap documentation.
- [ ] Full tests/build/parity, independent review, package verification, push. Verify actual release/download if CI permits; distinguish test adapter evidence from real installer/restart.

## Review focus

Stale events and concurrent requests; loss of drafts or interrupted agents on restart; user profile/package identity; untrusted release URLs/credentials; release/source/version mismatch and public-repository exposure. Preserve current installed app until a concrete safe bootstrap is ready; do not silently kill active work.

## Decisions and evidence

No public-feed account decision remains: user chose public repository. NSIS is the supported Windows auto-update target. Checks use the public release feed and updater checksum validation. A Windows signing identity is not configured; do not claim a signed installer. Official reference: https://www.electron.build/v26/docs/features/auto-update/.

## Verification before publication

760 tests passed; TypeScript/Vite build passed; browser navigation/isolation/settings/responsive smoke passed; 75 shared-renderer parity scenes passed, including all four updater scenes. Independent review found no remaining material issues after dictation and shutdown admission fixes. Local NSIS build and 111-file package verification passed; final shared-UI polish is included in the CI build. Actual Electron main/preload startup and invalid-command rejection passed with an isolated profile. Release publication, real public-feed download and bootstrap installation are separate checks still pending.
