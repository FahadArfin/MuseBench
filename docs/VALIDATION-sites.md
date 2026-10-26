# Sites validation — 2026-10-26

Added native Sites under **Meta AI → Work → All sites**, using React/Electron and the existing native Muse runtime. The library/studio provides starters, static-folder import, Work conversion, per-site Muse conversations, responsive preview, source editing, immutable versions, explicit public publication, link sharing, rollback and hosting settings.

## Verified

- Full regression suite: **517/517 passed**, no skipped tests, `artifacts/sites-unit.log`. Includes file/link/path limits, exact-byte snapshots, encrypted credential handling, deployment recovery, account/team binding, cancellation and provider protocol tests.
- Windows build and package passed, `artifacts/sites-package.log`. Existing Vite chunk, package-author and unsigned-executable warnings remain.
- **16 packaged Sites UI checks** passed: `artifacts/sites-ui/packaged-2oexNE/report.json`. Real Electron preview, source editing, save, connection protection, explicit publish, unknown-operation recovery, clipboard sharing, rollback, import/replacement, Work conversion, appearance, narrow layout, private Code isolation and restart. Hosting uses a mocked transport through the real provider adapter; no external deployment occurred.
- **29 packaged regression checks** passed: private Work (15), `artifacts/work-ui/packaged-hndopO/report.json`; Spaces (14), `artifacts/spaces-ui/packaged-hJGIVp/report.json`. No renderer errors or model requests.
- **Two actual native Muse requests** created and revised an interactive static page: `artifacts/sites-live/run-BNLOAd/report.json`. The preview button worked before and after the edit. Both requests verified the `exec` transport, `:ask-me` permission profile, Windows elevated sandbox readiness and confirmed process cleanup. No sandbox-disable flags were used. A saved version remained a local draft with no hosting connection.
- Source Sites checks passed: `artifacts/sites-ui/source-jttCId/report.json`. Source Work and Spaces regressions passed in `source-kFjXQk` and `source-LCSYqT` respectively.
- **52 packaged source/build files and both native helpers** match the validated source, `artifacts/sites-package-verification.json`. **19 existing runtime, controller, personal login and security modules** remain byte-identical to the pre-Sites package, `artifacts/sites-boundaries.json`.
- Existing-profile navigation passed and preserved Code selection, project count and private Work count, `artifacts/sites-profile-check.json`. No cookies, credential values or personal conversation contents were read for this check. Live Muse/Meta website sign-in was not re-tested.
- The packaged app was reopened with the existing default profile and a visible main window, `artifacts/sites-normal-launch.json`. Consolidated evidence is in `artifacts/sites-validation.json`.

Dark library/studio/version history, light Settings and 430px layout were visually inspected. Preview resources use unique site/revision origins with an opaque sandbox; module imports work without granting the app bridge or parent DOM access. An independent Electron probe reproduced a preview navigation escape to the Code loopback preview and then verified its fix: no loopback requests, same-site links allowed, cross-revision navigation blocked, host-driven revision replacement allowed.

## Review and recovery

Independent review found and verified fixes for a team ID/slug mismatch, same-version duplicate deployment, ambiguous-operation recovery, pending OAuth replacing an explicit token connection, wrong-site adoption by name, and the preview navigation escape. The final review reported no remaining actionable P1/P2 findings in the reviewed paths.

Creation recovery now requires preflight absence plus persisted account/team identity, a creation timestamp within the attempt window and no production deployment. An existing site name alone is insufficient. Every deployment attempt has a unique persisted marker. Unknown outcomes remain pending until checked; negative discovery enables an explicit provider-check confirmation before local reset. Immutable snapshot hashes are rechecked before any publishing mutation. Ready status requires the production deployment ID to match the selected version.

The packaged import smoke initially advanced to a direct API save before the asynchronous import had finished. Its failure was a test synchronization issue: the UI correctly blocked overlapping actions. The smoke now waits for both idle state and the actual studio tab before the next action; it passes on the exact same package.

## External prerequisites and limits

**No live Netlify account connection or internet deployment has been verified in this release.** The hosting flow was tested with deterministic API fixtures. A real publish and unauthenticated public-page fetch remain dependent on the user's in-app hosting connection. Tokens belong only in MuseBench, never in chat.

Browser OAuth requires a registered MuseBench public client ID. Personal token setup is available in the current build and encrypted by Windows safeStorage. Hosting is separate from Muse/Meta login. Netlify's documented API does not provide an unpublish endpoint; site availability, domains and analytics open the official provider dashboard, with no fabricated metrics or takedown success.

Static HTML/CSS/browser JavaScript only; no server runtime, databases, visitor authentication, private-site access or simultaneous site editing. Preview blocks external requests and forms, so network-dependent behavior requires published-site testing. Publishing Work includes artifact source annotations, but excludes private conversations and source attachment bytes. Limits and setup are in [SITES.md](SITES.md).
