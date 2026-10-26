# Sites frontend-only implementation plan

**Goal:** Finish the local Sites interface while deferring hosting/backend work as explicitly requested by the user.
**Architecture:** Keep existing React/Electron editing, preview and version services. Add per-site browser-local publication preferences and a native sharing/setup panel. Disable hosting controls and automatic hosting polling in the renderer; leave existing backend modules and credentials intact for later integration.
**Tech:** Existing React/TypeScript/CSS; no dependencies.

User scope is explicit: just build the frontend, backend later. No hosting account setup, remote publication, access enforcement or simulated live URLs.

- [x] Add validated local publication preferences with persistence/error handling. Test corruption, isolation, bounds and storage failure.
- [x] Add Share and publishing-setup surfaces, saved-version selection, planned access/domain fields and real local readiness checks. Make frontend mode the default, hide credential setup, pause hosting polling. Preserve existing editing and remote records without claiming to change hosted access.
- [x] Verify type/build, local UI flows, saved preferences across restart, responsive/light/dark styles and zero hosting operations; review, package and reopen the normal app.

Checks: public/share buttons never dispatch provider operations; no false link or live status; preferences do not grant access; no change to login/sandbox; no backend edits.

## Completion evidence

- 83 Sites unit/integration checks passed, including five new local preference cases.
- Eight frontend Electron flows passed in both source and packaged app, with zero hosting/model requests and no renderer errors. Per-site setup and version history survive restart; creating/cancelling a first version preserves setup choices.
- Existing app navigation regression passed 18 flows, including narrow layouts and chat persistence.
- Independent review found the first-version transition issue; its red/green reproduction and final recheck now pass.
- Build/package passed; 57 source/build files and both native helpers match. Thirty-six backend files match the previous release hash report and were not changed.
- Current frontend uses a presentation flag only; future backend integration must implement audience and domain semantics before enabling publication.

Evidence: artifacts/sites-frontend-tests.txt, artifacts/sites-frontend-ui/source-JFring/report.json, artifacts/sites-frontend-ui/packaged-ogfaws/report.json, artifacts/redesign-ui/source-n6ou2f/report.json, artifacts/sites-frontend-package-verification.json.
