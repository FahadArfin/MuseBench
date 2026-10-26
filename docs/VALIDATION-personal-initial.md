# MuseBench validation

25 October 2026, Windows x64. Local build only; no publication or deployment.

## Current result

The Meta AI integration and shutdown repair passed **232/232 unit tests**, TypeScript/Vite build, Windows packaging, **14/14 packaged personal-workspace checks**, and **4/4 real official service-entry checks**. The coding redesign regression passed **16/16** after the shutdown repair; the final package's additional changes only admit the verified Instagram and Meta authentication origins.

The user-reported `TypeError: Object has been destroyed` came from cleanup after Electron destroyed the BrowserWindow. Cleanup now runs before destruction and retains safe contents references. The final packaged test closes the actual BrowserWindow, waits for process exit and drained stderr, and reports exit code 0 with no main-process exceptions, error dialogs, or renderer errors.

## Evidence

- [Unit tests](../artifacts/personal-unit-tests.tap): 232 passed, 0 failed/skipped.
- [Final packaged personal workflow](../artifacts/personal-ui/packaged-9gcJAU/report.json): 14 passed, including native close, hierarchy, destinations, drafts, permissions, overlays, zoom, resize, and restart.
- [Source personal workflow](../artifacts/personal-ui/source-UbEqEi/report.json): 14 passed.
- [Packaged coding regression](../artifacts/redesign-ui/packaged-3pY1wN/report.json): 16 passed.
- [Real official website entry pages](../artifacts/personal-live/packaged-dsBqdj/report.json): Chat, bot, Ideas, and Goals reached official signed-out entry pages in the packaged application, with no remote Node or MuseBench bridge.
- [Package/source verification](../artifacts/personal-package-verification.json): 19 packaged application/build files and the native helper match their source/build bytes.
- [Integration design and limitations](PERSONAL-MUSE.md).

The live web probe used a fresh isolated profile, submitted no messages, and did not sign in. Ideas/Goals routes were separately verified in the user's signed-in research browser. Authentication and account actions inside the normal MuseBench profile require the user's website sign-in; those are not claimed as automated verification.

## Prior coding proof

The previous real Muse CLI sandboxed shell workflow, preview, revision checks, and checkpoint evidence are preserved in [the prior redesign validation](VALIDATION-redesign.md) and [its machine-readable record](../artifacts/validation.redesign.json). No CLI request was sent for this web integration. The official native sandbox and helper remain unchanged.

The prior app archive is retained at `artifacts/personal-baseline/app.asar`. No saved user projects, chats, or credentials were removed or copied into the web sessions.
