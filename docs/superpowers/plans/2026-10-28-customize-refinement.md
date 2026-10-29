# Customize directory refinement

Continuation of the approved extension catalog design and compact directory. The user's current instructions authorize implementation, publication and the established desktop release workflow.

## Intended experience

- One compact filter/search row: Curated, Community, Installed and search. Categories filter the full curated collection. Skill context, instructions and optional packs live behind one Skill tools control.
- One icon/name/description row component in every listing. Installed rows open management details; approval, revision, OAuth and activation flows remain intact.
- Five primary navigation items only. No duplicate Installed sidebar.
- Community is a single-column directory with automatic next-page loading, bounded rendering, cursor guards and search independent of loaded rows.
- Expand from verified public GitHub catalogs and the official MCP Registry. Describe compatibility honestly; browsing never installs, runs, authorizes or connects anything.
- Preserve results during refresh, restore focus/scroll when returning from details, and reuse results across directory views. Source changes intentionally start at the top. Diagnose idle refresh separately from intentional reloads.

## Task 1: Stable compact browser

Reproduce idle behavior and list clearing; add a behavioral regression for pending refresh, unified toolbar, Installed row parity, continuous scrolling, unseen-result search and stale response cancellation. Implement shared rows/toolbar and compact skill tools. Update existing preview and desktop flow checks for the new navigation. Keep preparation and approval checks.

Expected: preview/desktop checks pass at 375, 820 and 1440px; no duplicate navigation, no Load more; refresh retains old rows; idle polling does not remount the modal.

## Task 2: Broader searchable sources

Verify primary GitHub manifests/trees, expand community sources, add useful curated skills/plugins/connectors/MCP entries and hook templates. Add new categories and metadata. Cover full-collection search, pagination, partial upstream errors and unsafe metadata with service tests. Avoid hundreds of per-item HTTP requests during browsing.

Expected: live inventory evidence records actual counts and source revisions; community skills/plugins exceed 200 when sources are available; registry remains cursor-paginated and server-side searched; no fake popularity or installability claims.

## Task 3: Validate and publish

Run targeted tests, shared preview/desktop smoke checks, build and full unit suite. Perform one independent final review. Push feature commits, await terminal release CI, verify installer hashes, install/reopen preserving profile, and inspect the actual installed app via native MCP.

## Review focus

Stale responses, intersection-observer duplicate requests and retry loops; scroll/focus retention; hidden control keyboard access; install consent/revision integrity; upstream tree size and cache bounds; licensing/provenance; loaded-row search versus full-directory search; preview/desktop parity.

## Evidence / decisions

- Baseline 7225e01, installed 0.2.136. Native screenshots cover all five Discover pages; preview captures Installed. Idle preview over 29 seconds produced no customize calls/remounts or unsolicited animations. Refresh currently clears page synchronously; tab/view remount discards directory state.
- Use the existing live checkout to keep preview aligned, consistent with this project's approved workflow. Implementation is inline; only final review is delegated as required by executing-plans.
- Do not claim 200 hook templates or verified-working services. Expand useful verified sources and retain reviewed setup, rather than synthetic filler.
- Completed: shared compact filters and listing rows, no Installed sidebar, one Skill tools popup, automatic Community pagination, and query-before-pagination search. Installed skills start approximately 225px higher in the audited preview.
- Confirmed refresh defects: lists cleared while requests were pending; completed refresh dropped already loaded Community pages; switching to a cached source during a pending request left loading stuck. Regression checks failed on these cases and pass after repair. Refresh now reloads the previously loaded extent with bounded requests, keeps prior rows on failure, and preserves the browsing anchor. Idle preview did not reproduce an unsolicited timer/remount loop. Vite source edits intentionally reload the development preview.
- Independent final review found the two refresh edge cases above and an inventory approval regression. All Important findings are fixed: plugin review is accessible from Installed and displays every plugin/capability covered by the captured revision, regardless of filters. Backend revision validation remains intact. No second review was requested.
- Curated inventory: 147 entries (53 skills, 27 plugins, 28 MCP servers, 30 connectors, 9 hook drafts). Added Quality & accessibility, Cloud & operations, and AI & agents categories.
- Public discovery verified on 2026-10-28: 967 skills, 733 plugin entries, at least 1,086 MCP Registry entries, and 14 hook-related setup guides. These are listings, not popularity rankings or compatibility certifications. Browsing renders at most 1,000 per query with an explicit bound; searches still query the full source. The preview includes 1,000 registry entries and discloses its metadata snapshot; desktop uses live registry search.
- Primary sources: [GitHub Awesome Copilot](https://github.com/github/awesome-copilot), [wshobson agents](https://github.com/wshobson/agents), [Anthropic knowledge work plugins](https://github.com/anthropics/knowledge-work-plugins), [Claude plugins](https://github.com/anthropics/claude-plugins-official), [OpenAI community plugins](https://github.com/openai/community-plugins), [OpenAI skills](https://github.com/openai/skills), [Anthropic skills](https://github.com/anthropics/skills), [Vercel agent skills](https://github.com/vercel-labs/agent-skills), and the [official MCP Registry API](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/api/official-registry-api.md).
- Preview metadata generation now fetches GitHub sources at exact commits and records all eight source revisions in `src/preview/community-catalog.json`. Desktop package preparation separately resolves and inspects immutable source revisions before consent; no packages were installed during research.
- Local validation: 1,170 unit tests passed; TypeScript/production build passed; catalog preview and desktop suites passed, including preparation consent and revision flows; new 240-entry refresh/cache/scroll/search/inventory regression passed; general browser navigation and preview/desktop geometry parity passed. Existing bundle size warning remains. Desktop tests use an isolated profile with deterministic upstream fixtures; published-package inspection is the final release step.
