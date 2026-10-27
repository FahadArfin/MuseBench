# Startup and account access

MuseBench opens directly to Meta AI Chat. There is no mandatory MuseBench login, subscription selection, display-name or avatar setup screen. The old `?setup=1` preview URL also opens the normal workspace.

Meta AI handles any required sign-in in its official embedded surface. Code uses the configured official Muse CLI; Meta continues to enforce authentication, subscription and API billing when requests run. Removing the startup UI does not grant provider access or mark an account authenticated. The native sign-in adapter remains available through the bridge, but startup no longer polls it or changes the selected service based on an authentication check.

## Profile pictures

Profile editing remains optional in the profile page. Twelve mascot background colors and staged image uploads remain available. Existing names, avatars and saved data are preserved.

## Verification

`npm run test:onboarding-preview` checks direct Meta AI Chat startup even with the logged-out preview fixture, switching to Code without a setup gate, reload and mobile layout. Preview parity includes the direct-startup scene in both browser and production Electron renderers. Real Meta authentication is separate from preview fixtures.
