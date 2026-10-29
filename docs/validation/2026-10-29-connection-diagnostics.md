# Connection diagnostics validation

29 October 2026. Roadmap C06. Baseline a239b2f; platform-label-only commit a60ac57 intervened.

Connection settings now explain selected executable, current connection and permission evidence, pending input, uncertain cleanup and previous model completion separately. Copy report includes only allowlisted observations and versions. Customize's Installed view offers a collapsed configuration summary; configured tools are never presented as signed in or healthy.

Session MCP inventory retains the same rows through a pending or failed refresh and labels sign-in facts as a last successful snapshot. A changed task, session, connection or availability invalidates previous rows and late responses. Reads remain explicit and duplicate-locked.

## Evidence

- Nine projection tests passed, including copied-report privacy, unavailable/uncertain/simulated state, blocked questions, failed/cancelled requests and a configured but missing executable. Review findings were reproduced with failing tests before correction.
- 82 focused controller/customize/projector/capability tests passed before three additional projection regressions; 120 native runtime/controller regressions passed separately.
- Seven browser and seven Electron diagnostic checks passed. Six browser and six Electron session MCP checks passed, including stable rows through failure. No provider request was made.
- All 100 shared browser/Electron preview parity checks passed with no errors; final TypeScript and production build passed. Existing bundle-size advisories remain.
- Independent final review found no remaining actionable findings after correcting pending/failed/cancelled connection classification and executable-existence wording.

Ignored evidence: `.superpowers/sdd/2026-10-29-connection-diagnostics/`, `artifacts/connection-diagnostics/`, `artifacts/session-mcp-ui/` and `artifacts/preview-parity/report.json`.

Exact published and installed acceptance remains pending. Fixture evidence does not verify provider availability, authentication or billing.

CI follow-up: the installed-list compactness check caught the initial summary adding 33.5px beyond the allowed header budget. Reproduced locally, then moved Setup status into the existing toolbar as a disclosure. The unchanged compactness threshold now passes; a new assertion verifies opening the details does not move installed rows. Setup status, Skill tools and Add now close one another so their panels cannot overlap; the overlap was reproduced with a failing test before the fix. Catalog refresh, scrolling and filtering regressions remain covered by the same passing smoke. The final build passed, and independent review verified disclosure switching and keyboard focus in Chromium with no remaining findings.
