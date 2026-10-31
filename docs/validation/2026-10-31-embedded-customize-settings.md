# Embedded Customize pages in Settings — 2026-10-31

Corrects the previous launcher-only integration. Settings now lists Skills, Connectors, Plugins, MCP servers, Hooks and Connections directly under Customize. The five catalogs render their full content in the same Settings dialog, including filters, Installed views, setup forms and project hooks. The separate coding Skills shortcut is removed. Existing standalone catalog entry points reuse the same implementation.

## Validation

- Search/native navigation regression failed on the old launcher design and passes with direct categories. Legacy `settings/customize` opens Skills.
- 14 focused settings/native-control/CI tests passed.
- Build passed with the existing large-chunk advisory.
- Full shared-app browser and Electron smoke passed after the review correction: `artifacts/settings-connections/preview-tQpbT5/report.json` and `artifacts/settings-connections/desktop-Ybx3B0/report.json`.
- Tests retain the same Settings element across all five catalogs, require only one dialog and no duplicate catalog sidebar, exercise Installed/search, MCP setup/back, and delayed setup navigation/close protection.
- All six new/grouped destinations fit a 390px viewport. Dark/light theme and reduced motion covered. Desktop screenshots preserve the same blue selections, compact rows and opaque reading surfaces.
- Full actual-controller Settings smoke passed all 11 groups: `artifacts/settings-ui/source-h0CUTj/report.json`, including settings persistence after restart and existing-chat defaults.
- Existing catalog refinement checks passed: refresh/cache/scroll, Installed parity and 240-row continuous browsing/search.

Screenshots inspected: preview-HCY04p/skills-dark.png and preview-61pcBr/skills-narrow.png. One visual difference was corrected: embedded catalog selections now inherit the existing blue selected-state rule. No unresolved layout or behavior issue identified. These checks use isolated fixtures and make no provider/model request or account permission change.

Independent review identified a busy-state navigation bypass through Setup status → Muse connection. All outward embedded routes now respect the busy guard, and unmount cleanup releases the parent lock. A delayed plugin preparation regression reproduces that route and verifies recovery. Independent re-review confirmed the fix with no remaining actionable P1/P2 findings. Final build passed.

final result: passed
