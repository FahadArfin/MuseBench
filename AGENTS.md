# Release and verification policy

- Keep changes local until the user explicitly requests publication of the batch.
- A normal release ends when the exact source candidate passes required GitHub CI and its validated installer and updater files are published. Report the release link and stop. The user updates the installed app themselves.
- Do not install, close, restart, or back up/repair the installed profile as part of publishing. Those actions require a separate user request.
- For a release, run `npm.cmd run release:preflight` once. It reuses recent passing local checks only when their content fingerprint and runtime match. `npm.cmd run release:preflight -- --force` deliberately reruns them after a failure or new concern.
- For additional local CI groups use `node scripts/run-ci-suite.mjs <suite> --reuse` after building current UI/native outputs when needed. Available groups are `unit`, `appearance`, `navigation`, `extensions`, `chats-a`, `chats-b`, and `native`. Use targeted checks appropriate to the edit instead of automatically running every group locally.
- Read the timing report's `reused`, `fingerprint`, and `evidenceStable` fields before relying on local evidence. Reuse is content-based, not a claim that an earlier commit or installed artifact validates a new release. Failures, missing/expired evidence, changed input, or a new concern require fresh checks.
- Do not repeat passed local checks just because HEAD changed, CI is still running, or a documentation-only edit was made. Do not repeat desktop and preview inspections without a relevant change or failure.
- GitHub always runs every required check on the exact release candidate. Local reuse never skips CI, package launch verification, or release asset/commit verification. Follow `docs/RELEASING.md`.
