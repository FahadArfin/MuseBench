# Browser / desktop parity contract

The browser preview and desktop must mount the same App, CSS and native components through `src/ui/bootstrap.tsx`. Preview annotations on MuseBench-owned controls must be implemented in `src/ui`, shared data/renderers, or the desktop controller. Never fix an annotation only with preview CSS or a substitute screen.

## Boundaries

- Native Code, projects, sidebar, search, profile, settings, Customize, Work, Sites and Spaces use shared components. Sample data and disabled system operations do not change their component ownership.
- Embedded Meta AI and Muse websites belong to their providers. Preview shows locally captured desktop screenshots, not a separately recreated UI. They are read-only and timestamped. Website annotations require editing and verifying the desktop presentation/navigation adapter; changing the snapshot does not implement a fix.
- Windows caption controls are OS-owned. Preview reserves the same header space and displays inert reference symbols. Browser cannot minimize/close the desktop application.
- File picking, shell execution, authentication, real scheduling, publishing, microphone and notifications require desktop verification. Browser simulation is not runtime evidence.

## Required delivery checks

1. Implement owned UI changes in shared sources.
2. Run typecheck/build and the preview smoke test.
3. Run `npm.cmd run test:preview-parity` to compare shared DOM/geometry in Chromium and the production renderer inside isolated Electron with the same fixture data. This does not assert parity with arbitrary real account data or native webviews.
4. For website adapter changes, run a relevant real desktop check and refresh snapshots with `npm.cmd run preview:snapshots` when the desktop app is closed. Captures never submit messages or modify tasks.
5. Package and verify source/archive parity before updating the installed desktop application. A hot-reloaded browser is newer than an unchanged installed EXE.

Snapshots and generated evidence are private local artifacts under `artifacts/`; never commit them, account state, browser profiles or credentials. A clean clone displays an explicit missing-snapshot state until the owner captures their desktop.
