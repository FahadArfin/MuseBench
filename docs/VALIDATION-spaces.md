# Shared Spaces validation — 2026-10-26

Added native Spaces under Meta AI > Work > All spaces. Spaces contains Markdown pages, explicitly published Work artifacts, comments, revision history, members and invitations. The architecture uses a separate authenticated SQLite/HTTP hub and an Electron main-process client with encrypted membership credentials.

## Verified

- Full unit regression: **439/439 passed**, `artifacts/spaces-unit.log`. Includes real HTTP/SQLite tests for server roles, cross-space access, invite and owner-claim replay/races, revocation, conflicts, revisions, caps, restart and transport restrictions; client credential protection and atomic private Work copying are also covered.
- Final Windows build and package passed, `artifacts/spaces-package.log`. Existing large Vite chunk, missing package author and unsigned executable warnings remain; no build errors.
- **14 packaged Spaces UI checks** passed with two independent Electron profiles: `artifacts/spaces-ui/packaged-jLYv8H/report.json`. Create/join, copied invitation, page editing, comments, conflict recovery, history, publication, isolated preview, private copy, revocation, light/dark/narrow layout, credential encryption and restart all passed. No renderer errors or model requests.
- **15 packaged private Work regression checks** passed: `artifacts/work-ui/packaged-pKIbWu/report.json`. Includes all four artifact previews, source picker, validated edits, actual export/cancel, local drafts, runtime reset, appearance, private Code isolation and restart. No model requests.
- Exact package comparison: **45 source/build files and both native helpers** match, `artifacts/spaces-package-verification.json`.
- **19 runtime, controller, personal-session and security modules** match the saved pre-Spaces package byte-for-byte, `artifacts/spaces-boundaries.json`. Electron sandbox/context isolation, the narrow preload boundary and the existing native Muse sandbox controls are retained. This feature does not execute model requests or modify browser authentication storage.
- Existing default profile passed navigation to Work > All spaces and retained its Code selection, project count and private Work count: `artifacts/spaces-profile-check.json`. Live provider authentication was not re-tested; no cookies or credentials were read or cleared.

Source UI checks also passed at `artifacts/spaces-ui/source-AKedpw/report.json`. Final packaged dark page and light overview were visually inspected. Source narrow and artifact previews were inspected; equivalent packaged layout checks pass. A low-contrast light-mode Chat/Work selection was corrected to use the shared theme token and verified in the final package.

The rebuilt app was reopened with the existing default profile and a visible main window: `artifacts/spaces-normal-launch.json`. Evidence index: `artifacts/spaces-validation.json`.

## Review fixes

Independent review identified credential-storage failure before consuming invitations, delayed startup after close, shared-preview revision identity, invitation state across spaces and private-copy interleaving. Fixes include encrypted-storage preflight before remote mutations, lifecycle guards, timestamp-based preview validation, clearing previous invitation state and atomic queued private artifact copying. The reviewer rechecked these fixes with no remaining blockers. Error messages redact bearer/invitation values; comment resolution uses immutable member identity rather than display names.

## Sharing boundaries

Built-in spaces run on loopback while the owning desktop app is open. They support multiple profiles on this computer. Sharing across computers requires an operator-managed HTTPS server. The standalone server and [hosting guide](SPACES-SERVER.md) are included, but no domain, hosting service, external deployment or cross-computer connection was provisioned or tested.

Invitations grant editor, commenter or viewer access, expire after 48 hours and work once. Members can read every page in the space. Display names are self-declared rather than verified account identities. Removal revokes future access but cannot erase previous copies. Owner provisioning for hosted spaces is a separate one-use setup flow. The CLI and personal website logins are not used as collaboration credentials.

Only explicitly published validated artifacts are copied from private Work; source annotations inside an artifact become shared, while private chat history, attached source bytes and provider credentials do not. Copy to Work creates a separate private item and does not start Muse. Editing uses exact revision checks and five-second refresh while active, not simultaneous character-by-character coediting. Local drafts stay in the current desktop session until saved or explicitly discarded. Latest 30 page revisions are retained. Binary attachments, email invitations and a hosted cloud account service are outside this release.

Previous live Muse generation and sandbox evidence remains in [Work validation](VALIDATION-work.md); those billable requests were not repeated for this collaboration-only change.
