# MuseBench updates

The Windows application checks public GitHub Releases 15 seconds after launch and every 30 minutes while it remains open. Settings → Updates offers a manual check. A green download icon in the active workspace toolbar appears when a newer version is available. Click it to download; then choose **Restart to update**. Downloading does not interrupt work. Ordinary app exit does not install updates.

Restart is refused while app-managed tasks, child agents, questions/approvals, validation, armed goals, eligible queued work, Work/Sites operations, Customize or dictation are active, or process cleanup is uncertain. New IPC mutations are locked during shutdown. Saved Code drafts and chats are flushed before the installer starts. Unsaved form edits and external website state are not promised to survive a restart.

## First installation

Older copies were installed by copying an unpacked folder. They cannot gain update support without a one-time **MuseBench-Setup-<version>.exe** installation. Close the old app and run the installer from [GitHub Releases](https://github.com/FahadArfin/MuseBench/releases/latest). It is a per-user installation and keeps the existing app identity and profile. Subsequent updates use the in-app flow. The installer is currently unsigned; Windows may show its normal unknown-publisher warning.

Development/unpacked copies show installation guidance and do not download or install updates. Browser preview uses the same controls with labeled simulated availability/download/restart; it never runs an installer.

## Release process

Every push to main triggers `.github/workflows/release.yml`. It requires a full Git history, derives the version as `0.2.<commit count>`, records the source SHA in the packaged manifest, runs tests/build/browser smoke/renderer parity, builds NSIS, and verifies package contents before uploading an artifact. A separate job with repository write permission publishes the installer, blockmap and `latest.yml`. Superseded builds do not become the latest release. An existing published version is immutable; a matching abandoned draft can be resumed.

The source package version stays `0.2.0`, avoiding CI version-bump commits and release loops. Keep main history append-only: do not rewrite it or reset the version sequence below an existing release. Changes to the major/minor version require updating `scripts/stamp-release.mjs` as well.

The updater uses `electron-updater` with a fixed public repository feed, checksum validation, no prereleases/downgrades, no embedded credentials, and manual download/install. A download or installer error remains visible and can be retried. If shutdown has already closed services, reopen the app before retrying. A successful workflow/release is required; pushing source alone cannot make an installer available when GitHub Actions is unavailable.

## Local checks

`npm test`, `npm run build`, `npm run test:browser-preview`, `npm run test:preview-parity`, `npm run package:installer`, and `node scripts/verify-personal-package.mjs` cover the application and package. Unit tests inject the updater; parity fixtures simulate it. Real download and installer/restart verification must be reported separately, with the exact release version and source commit.

## Availability diagnostics (27 October 2026)

A live Electron updater probe against the public feed detected 0.2.91 when the probe's current version was 0.2.90, and reported current for 0.2.91. This verifies release discovery, not download/install. The exact cause of an earlier missed update was not captured; a build or draft release is not yet available to the updater.

Only the updater's explicit update-not-available event establishes that the app is current. A check that resolves without an availability event, or emits an error, stays a failure instead of being presented as up to date. Error details from remote responses are not displayed verbatim.
