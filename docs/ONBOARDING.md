# Sign-in and profile setup

MuseBench requires sign-in for the selected workspace and a profile picture before showing its workspace UI. Muse AI uses an isolated official-site account window with the existing browser session. Code uses the installed official `muse login` device flow, or `muse auth set --api-key-stdin` for an API key. Keys never enter command arguments, renderer persistence, diagnostics, or model prompts.

## Provider access

Meta enforces subscription/API billing on requests. This is the user-approved alternative to independently blocking on billing verification. Links use the official [subscription guidance](https://dev.meta.ai/docs/muse-code/subscriptions), [Accounts Center](https://accountscenter.meta.com/), and [API billing](https://dev.meta.ai/billing). Prices are not copied into the app.

CLI 1.4.13 has no reliable authentication-status command: `muse usage --json` rejects the existing credential even though prior live model runs succeeded. Accordingly, Code requests confirmation through the official CLI after each application launch. It retains the successful result only for that process lifetime, and an observed runtime authentication failure gates Code again. A stored API key is labelled configured, not independently verified. No paid model probe is performed.

Muse AI checks rendered official-site account indicators without reading cookies. An unknown/loading document does not count as a successful login. This adapter can need updating if the official site changes its markup. Live user-interactive sign-in cannot be completed by fixture tests.

## Profile pictures

Twelve color variants use an app-rendered cream mascot illustration with a white outline. Uploaded PNG/JPEG/WebP images (up to 8 MB) can be staged, zoomed, and positioned before use. A 256px PNG crop is saved only when the profile is confirmed, in the existing local profile store. Cancel leaves the saved photo unchanged. Profile selection is separate from authentication and cannot unlock sign-in.

## Preview and verification

Open `preview.html?setup=1` to annotate the shared setup screen. Its clearly labelled login is simulated and never installs credentials. The ordinary preview remains a signed-in sample.

`npm run test:onboarding-preview` covers the mandatory gate, picture selection, upload staging/crop, persistence, and mobile layout. Native process tests cover failed/cancelled login, secret transport, allowed device URLs, and reauthentication after a runtime rejection. Preview parity also covers the login, Code plan choices, and avatar setup in the production Electron renderer.
