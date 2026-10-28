# Signed-in account profile — 28 October 2026

The profile menu previously accepted `PersonalState.profile`, but the desktop controller never populated it. Consequently, signed-in users saw the local fallback, "Your account".

## Behavior

- Read the signed-in account handle from the official Meta AI sidebar. Read its display name only from the matching own-profile page, with its matching heading and Edit profile control. The DOM structure was verified against a signed-in Meta AI page; fixture accounts in automated checks are fictional.
- A temporary hidden, sandboxed document uses the existing official session to read the full name. It has no preload or Node access, denies popups, and is destroyed after the bounded lookup. The current chat, draft and scroll position are not navigated.
- The sidebar and profile default to this name. Profile → Edit profile saves an optional local name; Use account name restores automatic updates. These edits do not change the user's Facebook or Meta profile.
- Local preferences are scoped to an opaque hash of the official account handle. Existing local customization is migrated once, with its original data retained. The key remains stable through display-name and avatar changes, but a change to the provider handle creates a new account key; no immutable Facebook account identifier is exposed by this DOM integration.
- Logout, authentication transitions, account switching and late reads cannot restore the preceding account's local profile. Missing or changed provider markup fails without inventing an identity.

No credentials, cookies, messages, or provider image URLs are read into the local profile. The browser preview continues to use fictional account data.

## Verification

Automated coverage includes real Chromium DOM fixtures, account lifecycle cancellation and stale-page handling, controller integration, storage migration, browser profile editing, and real Electron reader → IPC → renderer flows. Desktop checks use isolated app data and local official-host protocol fixtures with external DNS disabled; they do not open the installed user's profile or consume model usage.

Reports are written under `artifacts/profile-identity`, `artifacts/profile-account-desktop`, and `artifacts/preview-parity`. `npm run test:profile-identity` runs the browser and source Electron checks in both validation and release CI. `MUSEBENCH_EXECUTABLE` selects an unpacked release for the same desktop check.

Final local results: 1,033 unit/integration tests passed; production build passed; six browser profile flows passed; six source and six packaged Electron account flows passed; 92 preview/desktop comparisons passed. All 188 packaged source/build files and both native helpers match the checked source. Independent review verified stale account and stale signed-out documents cannot replace the current account.

The real provider's DOM was inspected, but the updated application has not been installed into the user's running desktop session as part of this change. Live account synchronization there requires the released update.
