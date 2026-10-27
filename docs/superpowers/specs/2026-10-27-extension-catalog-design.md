# MuseBench extension catalog

Status: approved for implementation by the user on 27 October 2026, including curated plus community search. This document includes current research and the concrete implementation scope.

## Outcome

Expand Customize into a searchable directory of plugins, skills, MCP servers, connectors, and hook templates. People should discover useful additions and install or connect them without finding folders or writing JSON. Preserve the existing installed-item controls, project review, and shared desktop/browser-preview renderer.

The catalog ships by default; third-party tools are not automatically installed or activated. A large discoverable selection is distinct from a tested or authenticated selection. Do not advertise every upstream listing as working in MuseBench.

## Approaches

1. A tested-only catalog is predictable but too small for the requested breadth.
2. A curated catalog plus public community discovery provides useful defaults and a growing selection while showing compatibility. The user selected this approach.
3. Blindly importing another client's entire marketplace would be broad but would misrepresent host-specific features and break current permission boundaries. Reject this approach.

## Current implementation

- `electron/customize.mjs` already validates/installs local skills and plugins through the pinned Muse CLI, adds stdio/HTTPS MCP entries, invokes OAuth, and manages enabled/removed entries.
- `src/runtime/extension-review.mjs` binds review to hashes of the exact configuration/package. Runs block unreviewed configuration. Preserve this enforcement.
- `src/ui/CustomizeDialog.tsx` has Skills, Connectors, Plugins, MCP servers, Hooks. Skills have three optional MuseBench examples, plugins require a local folder, servers require manual configuration, and connectors mostly route to existing account surfaces.
- Hook presets already exist, but there is no starter-template gallery. App-owned hooks support only UserPromptSubmit and Stop, with current command/count/timeout bounds.
- Preview uses the same renderer and a separate simulated bridge. Installation in browser preview must stay explicitly simulated and never alter desktop configuration.

## Fresh research and constraints

The installed CLI advertises marketplace add/list/update/remove, `plugins list --available`, validation, installation, capability approve/reject, and skill validation/install/update/uninstall. Help was read without changing settings or using a model.

Sources checked on 27 October 2026:

| Source | Evidence | Use |
| --- | --- | --- |
| [Official MCP Registry](https://modelcontextprotocol.io/registry/registry-aggregators) | Unauthenticated REST metadata, cursor pagination, versioned entries, status changes; preview API with no uptime guarantee. A live first page returned 100 entries and a next cursor. | Search and paginated discovery, cached locally; not a quality certification or package host. |
| [Anthropic plugin marketplace](https://github.com/anthropics/claude-plugins-official/blob/main/.claude-plugin/marketplace.json) | Live manifest had 315 entries: 53 local paths, 98 git-subdir sources, 164 URL sources. These counts are discovery metadata, not compatibility results. | Broad plugin discovery with source identity and warnings; fetch only a selected package. |
| [OpenAI community plugins](https://github.com/openai/community-plugins/blob/main/.agents/plugins/marketplace.json) | Four entries in the current manifest; it lives under `.agents/plugins`, not `.codex-plugin`. | Additional public plugin source, without claiming access to the account-gated OpenAI directory. |
| [Anthropic skills](https://github.com/anthropics/skills) | Live directory had 19 skill folders. Some include executable helpers and different licensing terms. | Metadata discovery and explicit, pinned, per-skill import; preserve license files. |
| [Vercel agent skills](https://github.com/vercel-labs/agent-skills) | Source includes React, React Native, composition, design and writing skills; ZIP artifacts are not separate skills. | Discover actual SKILL.md directories, exclude duplicate release ZIPs. |
| [Agent Skills specification](https://agentskills.io/specification) | SKILL.md plus optional scripts/references/assets, compatibility and license metadata. | Portable package format, not a promise that host-specific tools exist. |
| [skills.sh API](https://www.skills.sh/docs/api) | Documented v1 API requires Vercel OIDC; anonymous failure is documented. | Link to its directory; do not scrape private endpoints, embed a shared token, or make desktop discovery depend on it. |
| [Muse marketplace docs](https://meta-models.github.io/muse-code-sdk/next/guides/plugins/concepts/marketplaces-and-updates/) | Native catalog snapshots and explicit refresh; foreign catalogs may skip unsupported sources. Documentation examples are from 1.3.0. | Use pinned-host validation and app-owned selected-package staging; do not eagerly materialize hundreds of repositories. |
| [Muse compatibility docs](https://meta-models.github.io/muse-code-sdk/next/guides/plugins/concepts/compatibility/) | Foreign package adapters support only subsets. Unsupported agents, LSP, hooks or formats need diagnostics. | Validate actual staged contents; never silently strip unsupported functionality and call the plugin compatible. |
| [OpenAI portable developer plugin](https://developers.openai.com/learn/developers-codex-plugin) | Portable skills/docs MCP are distinct from Codex-specific Platform connector. | Offer portable public components only, not copied account credentials or proprietary host tools. |

### Actual compatibility probes

Two unmodified public plugin manifest/MCP-file pairs were downloaded to ignored `artifacts/catalog-research/` and validated with the installed Muse CLI. No installation, hook execution, authentication or model call occurred:

- Context7: rejected with `unsupported-capability`, `non-stdio-transport`.
- GitHub: rejected with `invalid-manifest-schema`, because the conventional foreign MCP file lacked the required `mcpServers` wrapper.

These small packages contain their manifest and MCP definition; this proves rejection of those exact inputs, not rejection of every version or alternate integration. The correct alternative is an explicitly separate standalone server recipe, not a silently rewritten third-party plugin.

## Product experience

Keep the existing Customize categories. Add Discover / Installed within each relevant category and a shared search field. Start Discover with Recommended, then Community results and Load more. Provide category/source filters and a compact card layout consistent with MuseBench.

Each item shows name, publisher/source, purpose, type, compatibility state, and setup requirement. Detail view shows source link, version/commit, capabilities, installation destination, dependency requirements, licensing link/files, validation diagnostics, and the operation to be performed.

Primary actions are honest:

- Review and install: supported staged skills/plugins.
- Add server: a supported configuration recipe; adding does not prove server readiness.
- Connect account: uses the existing official Muse OAuth path for a configured server.
- Configure: required parameters or prerequisites are missing.
- Open setup instructions: unsupported packaging, transport, host capabilities or authentication.
- Add to project: hook template loads an editable, unapproved draft; existing review/save applies.

Separate statuses: Discovered, Downloaded, Validated, Installed, Needs review, Needs sign-in, Ready, Unsupported. Mark Ready only after observed appropriate verification; do not infer it from saving a JSON entry. Show precise failures and keep the prior installed version if a preparation step fails.

## Starter candidates

These are a researched shortlist for qualification, not a claim of successful installation. Final source revisions and support badges are determined during implementation.

| Group | Candidates | Expected route |
| --- | --- | --- |
| Documentation | Context7, OpenAI Docs MCP | Direct documented HTTPS recipe; connection limits/sign-in shown. |
| Browser testing | Microsoft Playwright MCP | Version-pinned local server; explicit runtime/browser prerequisite detection. |
| Developer collaboration | GitHub, Linear, Sentry | Direct provider MCP; prefer supported OAuth, distinguish API-key-only recipes. |
| Design and knowledge | Figma, Notion | Provider remote MCP/OAuth; provider plan and tool availability can differ. |
| Deployment and data | Vercel, Cloudflare, Supabase, Stripe | Qualify current official endpoints/recipes, expose required account setup. |
| Coding skills | frontend-design, webapp-testing, mcp-builder, React best practices, composition patterns, React Native skills, web design guidelines | Pin public source and validate SKILL.md plus referenced resources. |
| Documents and communication | doc-coauthoring, PDF, DOCX, PPTX, XLSX, internal-comms, writing guidelines | Preserve upstream licensing and dependencies; special terms or unsupported helpers remain visible, not bundled indiscriminately. |
| Workflow plugins | code-review, commit-commands, feature-dev, plugin-dev, superpowers | Validate whole bundles, show host-specific commands/agent requirements; no blanket compatibility claim. |
| User-relevant specialist entries | Unreal Engine, Unity, Autodesk Fusion | Discoverable with explicit application/version/bridge prerequisites; not presented as ready without a live integration. |
| MuseBench hook templates | Run project checks after a turn, inspect Git changes after a turn, prompt context check | Reviewed editable command templates, no global activation. |

Built-in Muse skills remain sourced from the installed CLI and are shown separately; do not duplicate them or label them downloadable third-party packages.

## Architecture and installation contract

### Discovery

Add a main-process catalog service and shared normalized types. Source adapters cover the official MCP Registry, approved public plugin manifests, and SKILL.md directories in selected public repositories. Initial sources are bundled; no website/account credentials are needed to browse them.

Catalog records contain stable source-qualified IDs, upstream location, type, title/description, tags, fetched timestamp, supported recipe metadata and compatibility evidence. Treat all remote strings as plain data. Limit responses, entries and string sizes; do not render remote HTML or execute README commands. Reject malformed URLs and credentials in links. Remote links go through existing external-link policy.

Cache successful snapshots and query pages. Use conditional requests where available, refresh no more often than hourly, expose manual refresh and show stale/offline state. Load pages on demand rather than collecting the entire registry at launch. Explicit community searches disclose the destination and send only the search text, never project/chat contents. Rate-limit errors retain cached results. Search supported source metadata locally when the upstream provides no search endpoint.

Implementation choices left to the builder: module split, exact visual spacing, cache schema and bounded limits, pagination sizes, and icons. Bounds must be explicit and tested. No new hosted backend, paid registry, or Vercel credentials in this phase.

### Download and review

Resolve the selected Git source to an immutable commit. Download only the selected package/skill and required license/resources into an app-owned staging folder. Do not run its installation scripts while browsing or preparing it. Validate path containment, byte/file/count limits, symlinks, submodules, archive traversal and Windows path collisions. If a package cannot be fetched within bounds, leave it as setup-required with its source link.

Prepare a content hash, source/commit receipt, file list, permission/capability summary and Muse validation diagnostics. An expiring main-process review token binds this content to the install action. Recheck it immediately before installation. Renderer-supplied paths, URLs and command strings cannot replace the selected source through an ID-only action.

Use the existing native skill/plugin install commands and app review service. Review native executable plugin capabilities separately: installing instructions must not automatically approve all MCP/hook capabilities. Surface unsupported features instead of deleting them. Account-bound OpenAI/Claude connectors are not portable merely because their names appear in a manifest.

No automatic installation of new packages when catalog metadata refreshes. Package updates are explicit, download/review the new revision first, and retain the old installation until the replacement route is proven. If the pinned CLI has no recoverable update route for a source, show manual update instructions rather than remove-first automation.

### MCP and authentication

First implement direct HTTPS recipes compatible with the existing reviewed server configuration and OAuth login. Provider docs govern endpoint and read-only option (Linear documents `/mcp/readonly`). A catalog record is not proof that OAuth succeeded.

For supported local npm recipes, pin a version and use a reviewed Windows-safe launcher with explicit prerequisites; do not silently use floating `@latest` or concatenate shell strings. Browsing does not install npm/Python/Docker dependencies. Package-manager launches and tool execution occur only after the user chooses the reviewed installation/activation flow.

API-key/header/environment requirements are shown as setup-required in the first implementation, with provider instructions; do not store secrets in catalog metadata, preview data, logs or Git. A future encrypted-secret flow is a distinct feature. Do not borrow Codex/Claude connector tokens. Unsupported SSE, Docker, PyPI, arbitrary remote install scripts and custom registry sources remain discoverable with manual setup until adapters are qualified.

### Preview and desktop

Use the same UI, normalized catalog records and action-state transitions. Preview provides deterministic catalog fixtures, installed examples, validation failures, missing prerequisites and mock OAuth/setup states. It clearly labels simulated operations; it does not install or sign in. Desktop uses real adapters. External Meta/Muse pages remain the previously selected read-only snapshots.

## Delivery slices

1. Discovery foundation: normalized catalog, curated metadata, paginated MCP/public plugin/skill discovery, caching, search/filter UI and matching preview fixtures.
2. Install path: bounded pinned download, whole-package validation, review, install receipts, installed-state reconciliation, and removal/activation using existing controls.
3. Connection/templates: direct provider recipes and OAuth handoff, qualified local launch recipes, hook starter drafts, compatibility/setup details.
4. Validation and release: unit/integration negative cases, real no-model isolated plugin/skill fixture installation, browser smoke, desktop/preview parity, production build and packaged helper checks. Push each complete feature and wait for final GitHub validation/release.

Each slice must be usable and truthful on its own. Do not claim a catalog count is a count of verified working integrations. Do not consume additional model runs or use personal provider accounts for acceptance without explicit authorization. Keep the user's running desktop/profile intact.

## Acceptance

- Browse and search a substantial live upstream selection without configuration mutation or eager cloning.
- Clear source identity, compatibility, setup requirements and offline errors.
- At least one real pinned skill and one inert plugin can prepare/install/list/remove in an isolated profile without a model call; user settings remain unchanged.
- MCP recipe saves only the reviewed exact entry; OAuth success is distinguished from readiness; failed authentication does not claim connection.
- Content changes after review, traversal, unsupported capability, stale selection, duplicate ID and active-run mutation are covered by tests.
- A hook starter becomes an unapproved project draft, not an executing global hook.
- Shared preview/desktop controls, styles and geometry pass parity for discovery, detail, review, installed, setup-required and failure states.
- A clean build, relevant/full tests, package verification and green GitHub workflows accompany delivery.
