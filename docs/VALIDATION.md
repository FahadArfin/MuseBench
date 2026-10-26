# MuseBench validation

Latest release: [Simplified sidebar validation](VALIDATION-sidebar.md), including packaged Code, personal, Work, Sites and Spaces flows and 517 serial unit tests. [Blue accent validation](VALIDATION-blue-accent.md) retains light/dark contrast measurements. [Sites validation](VALIDATION-sites.md) retains earlier actual sandboxed Muse site requests. [Shared Spaces validation](VALIDATION-spaces.md) retains collaboration hosting and role details. Earlier [Chat / Work validation](VALIDATION-work.md) retains actual native Muse generation/editing and PDF/MP4 export evidence. Settings evidence below is retained from its original release.

## Settings validation — 2026-10-26

Implemented the profile-accessible Settings dialog with 12 searchable sections in a Claude-style modal. Reviewed the installed Claude General and Code settings read-only, the supplied Claude/Codex screenshots, and official documentation linked in the implementation plan.

## Verified

- `npm.cmd test`: 361/361 tests pass. Includes old-preference migration, invalid permission defaults, exact-label search, notification transition/deduplication/failure isolation, and speech refresh recovery/stale-result suppression.
- `npm.cmd run package`: builds the Windows desktop application successfully.
- 80 checks pass against the exact packaged executable: settings (11), navigation (17), composer (7), activity (11), project overview (9), slash commands (14), and full local review workflow (11).
- Actual Windows notification accepted by Electron with a native `show` event from the packaged notification module. Silent generic status, no prompt/project/account data. OS notification settings may still suppress visible toasts.
- 36 packaged source/build files and both native helpers match validated sources.
- 18 protected runtime, controller, personal-session and security modules match the prior packaged version byte-for-byte. Native approval arguments and sandbox execution unchanged. No auth files, cookies, browser partitions or service account preferences were changed.
- Normal app restarted using the existing default profile; saved projects/chat history visible and the new Settings dialog opened. See `artifacts/settings-normal-launch.json`.

## Behavior checks

Search includes setting labels and synonyms; keyboard arrows/Home/End work, focus remains trapped in the modal, Escape closes it. Appearance, width, notification choices, default reasoning/access and explicit instructions survive restart. Existing chats keep their own run options. Pending approvals and active runs disable memory saves. Memory saves display normalized stored instructions. Export writes the selected chat through the real save picker and handles cancellation. Voice status refresh does not start microphone capture. Installed skills and allowance use the existing CLI bridge, with honest unavailable states. Desktop and 390px layouts were inspected, including light/dark themes and independent scrolling; mobile category overlap was fixed and regression-tested.

## Scope and limitations

New chat defaults and transcript width apply to Muse Code. Global instructions are explicit local Code instructions, not automatic personal-bot memory. Skills are an enabled CLI catalog; provider account/billing pages own their account controls. No fake password, cloud, parental control, worktree or plugin switches were added. No billable model requests were needed for this settings-only change. Existing live sandbox workflow evidence is retained in `docs/VALIDATION-activity.md` and `artifacts/activity-validation.json`; it was not rerun here.

Independent review findings were fixed and rechecked. Evidence index: `artifacts/validation.json`. Packaged screenshots: `artifacts/settings-ui/packaged-cxzLOo/`.

