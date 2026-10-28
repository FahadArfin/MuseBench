# MuseBench validation — 26 October 2026

## Profile menu

Customize was removed from Muse Code's main sidebar and activity rail. The bottom profile button now opens Settings, Usage & billing, Muse connection, Prompt starters and Help & commands. The sidebar-collapsed layout exposes the same menu from the rail's profile icon. Narrow windows use the navigation drawer. Ctrl+, continues to open Settings. The header identifies the app's local profile, not a fabricated Meta account name or subscription tier.

- **49 final packaged desktop checks passed:** navigation/profile menu 17, composer 7, slash commands 14, and full local review workflow 11. No renderer errors. Exact reports: `artifacts/validation.json`.
- Profile keyboard navigation, Escape/focus return, Settings routing, prompt insertion, connection routing, collapsed navigation, dark/light themes, narrow layouts and saved chat restoration were checked in actual Electron windows.
- The existing local speech check transcribed synthetic audio; physical microphone input was not tested.
- Production build and Windows packaging passed. **32 packaged source/build files and both native helpers** match the source.
- **23 Electron, controller, runtime and shared modules** are byte-identical to the prior package. Login/session handling, native sandbox policy and credentials were untouched. No model request was needed for this UI-only change.
- Reference screenshots and final implementation were inspected together. `design-qa.md` records the visual comparison.

Recovery: `artifacts/profile-menu-baseline/app.asar`. Normal existing-profile launch: `artifacts/profile-normal-launch.json`. Previous slash-command/runtime validation, including 316 unit tests and live sandboxed replies, remains in [VALIDATION-slash-commands.md](VALIDATION-slash-commands.md); those unit/live checks were not repeated for this navigation-only change.


## Compact account menu follow-up (2026-10-26)

The profile popover now contains avatar and display name, followed by Usage, Settings, and Help. Removed Muse connection, Prompt starters, Checkpoints, and the profile subtitle from this menu. Existing connection and project tools retain their other entry points. Name syncing remains an auth-backend integration; the frontend accepts PersonalState.profile, with a neutral fallback and an explicitly fictional preview account.

Production build, browser preview navigation/menu contents, source and packaged product-toggle checks, and package source parity passed. Verified expanded/collapsed profile access, keyboard focus, menu dismissal, account-name clearing, mobile layout, and dark/light themes. Evidence: artifacts/profile-menu-simple-preview.txt, artifacts/profile-menu-simple-packaged.txt, artifacts/profile-menu-simple-parity.txt. Screenshot: artifacts/browser-preview/profile-menu.png.

The previously pending account-name backend was implemented on 28 October 2026. See [signed-in profile synchronization](VALIDATION-account-profile-sync.md) for the source, local overrides, account boundaries, and validation.
