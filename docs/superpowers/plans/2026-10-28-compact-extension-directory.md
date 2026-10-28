# Compact extension directory implementation plan

> Implement with the existing approved curated-plus-community catalog design and the user's selected Codex screenshot.

**Goal:** Make Customize feel like a compact, abundant tool directory while adding useful, sourced integrations that MuseBench can support.

**Architecture:** Preserve the five extension kinds and current reviewed installation/configuration pipeline. Use a narrow navigation rail and installed shortcuts, compact two-column icon rows, curated Popular and subject sections, one-sentence purposes, search, community discovery and a detailed setup view. Share all rendering/data with browser preview. No copying private Codex connectors or credentials.

**Spec:** `docs/superpowers/specs/2026-10-27-extension-catalog-design.md` plus the user's 28 October screenshot and explicit implementation request.

## Tasks

- [x] Research current Codex public directory, plugin packaging and publisher-supported MCP equivalents; write a sourced compatibility matrix. Distinguish public recipes, portable packages and setup-only/account-bound services.
- [x] Expand `src/shared/extension-catalog.mjs` with qualified additions, concise purposes, category/icon/popular metadata. Keep IDs stable, every recipe backed by primary documentation, known host restrictions intact. Test discovery and installation routing.
- [x] Refine `ExtensionCatalog.tsx` and `extension-catalog.css` into compact grouped rows with icons, section filtering, search and details. Preserve review consent, pagination, async race guards and honest unsupported states.
- [x] Refine `CustomizeDialog.tsx` and `customize.css` with left navigation, installed shortcuts and compact controls. Preserve installed management, hooks, initial deep links and keyboard navigation.
- [x] Add behavioral coverage for curated sections, category/search pagination, setup-only entries, reviewed install, responsive layout and shared preview/desktop rendering. Inspect screenshots and test real Electron in an isolated profile.
- [x] Run relevant unit checks, build and parity; review, commit and push completed work. Show the verified updated preview.

## Review focus

- Popular means curated selection, not measured download rankings or compatibility certification.
- Browsing never installs packages, activates hooks or authorizes accounts.
- Data and auth capability differences stay explicit in details, without repeating long warnings on every row.
- Category filtering must not silently hide later pages; search and pagination stay bound to the submitted query.
- Icon rendering is local/bundled with a safe generic fallback; no per-row third-party tracking requests.
- Small viewports, long names, missing descriptions, offline cache and pending requests remain usable.
- Existing project/account IDs, revisions, runtime review gates and package provenance stay intact.

## Delivered and verified

- 106 curated entries: 38 skills, 17 plugins, 23 MCP servers, 25 connectors, and 3 hook starters. Includes 16 distinct server recipes and 50 public package descriptors. Setup-only entries remain explicit; browsing does not connect an account or install software.
- Compact five-section rail with exact installed-item shortcuts, category drilldown, Popular selections, short descriptions, and 30 locally bundled brand icons with provenance.
- 1,061 unit tests passed; final catalog/Customize regression run passed 50 tests. Build and all 92 preview/desktop parity scenes passed.
- Browser behavior checks cover responsive layouts at 375/820/1440px, async races, repeated cursors, terminal-page overflow, reviewed package/server actions, setup-only entries, and hook drafts.
- Real Electron renderer/preload checks use an isolated catalog IPC fixture. They cover native labels, exact installed shortcuts, normalized/wrong server endpoints, consent and visible SVG rendering. These are renderer tests, not authenticated provider acceptance.
- Windows package integrity matched 190 source/build files and both native helpers. New desktop smoke is wired into validation and release workflows.
- The official Muse CLI fixture validated existing skill/plugin lifecycle and local MCP handshake without accessing user accounts. Public documentation endpoints completed read-only initialize/tools-list probes; no provider tools were invoked.
- Research sources and host-specific restrictions are recorded in `docs/research/2026-10-28-codex-catalog-parity.md`.
