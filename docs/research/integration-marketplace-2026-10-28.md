# A larger integration marketplace for MuseBench

Research and local audit dated 28 October 2026. Source baseline: `37729e2`; installed CLI: Muse Code `1.4.13-R6996.1`. Recommendations below are proposed work, not delivered features.

MuseBench can offer substantially more integrations by combining public catalogs with a better installation and connection lifecycle. The highest-value changes are unified discovery, reliable package downloads, guided server setup, and accurate installed/connected status. Adding OpenAI's main plugin catalog, Anthropic's community marketplace, and selected Hermes sources would widen discovery considerably. Their entries still need component-level qualification for Muse and Windows.

## What MuseBench currently exposes

Fresh queries through the existing desktop catalog adapter produced these results. Counts overlap and are not a total of unique working integrations.

| Inventory | Observed count | What it means |
| --- | ---: | --- |
| Bundled recommendation cards | 53 | 25 skills, 5 plugins, 15 MCP entries, 5 connectors, 3 hooks |
| Distinct executable server recipes | 6 | Five HTTPS configurations and one pinned Playwright npm launcher; not six verified connections |
| Community plugins | 319 | 315 Anthropic official entries and 4 OpenAI community entries; downloadable descriptors awaiting validation |
| Community skills | 67 | 19 Anthropic, 9 Vercel, 39 OpenAI; four are explicitly setup-only |
| First MCP Registry result page | 30 | 29 contain HTTP remote definitions and one an npm package definition |
| Guided recipes generated from that registry page | 0 | Current normalization discards the connection and package fields |

The current adapter reads `openai/community-plugins`, **not `openai/plugins`**. It has no Hermes source. Its GitHub source parsing correctly preserves repository, subdirectory, and SHA for today's 319 plugin descriptors. It does not implement every marketplace source format. [Catalog sources and normalization](../../electron/extension-catalog.mjs)

The preview confirms the discoverability problem: Customize opens Skills, then Discover, then Recommended. The first screen puts several control rows and repeated explanations above the cards. Search covers only the selected type and source. Community discovery does not parse upstream SKILL.md frontmatter descriptions; those cards use generic repository text. Preview discovery is simulated and does not prove desktop installation. [Catalog UI](../../src/ui/ExtensionCatalog.tsx)

### Functional gaps that limit useful choice

| Gap | Practical consequence | Recommended correction |
| --- | --- | --- |
| MCP metadata loses remotes, packages and configuration requirements | Community results become documentation links even when a usable setup definition exists | Preserve typed setup metadata and generate reviewed forms for supported transports |
| Connectors repeats the unfiltered MCP Registry | Duplicate concepts without a simpler account connection experience | One provider card with connection methods; keep MCP details in its configuration view |
| Installation receipts are written but not reconciled into discovery | Cards cannot consistently show Installed, Manage or Update available | Store canonical package identity, native installed identity, revision and version; reconcile with native inventory |
| One anonymous GitHub API request per downloaded file | A larger skill can exceed the normal 60-request anonymous quota during preparation | Use bounded immutable archive/subtree retrieval or a content-addressed cache, with explicit retry handling |
| Configuration and OAuth actions have no readiness readback | Saved and signed-in entries can still be unusable | Distinguish configured, authenticated, tools discovered, and runtime usable |
| Incomplete lifecycle controls | Missing skill update/removal, plugin update and MCP editing force manual work | Add these actions with recoverable failure states and version receipts |
| Native compatibility warnings are omitted from preparation results | A partially supported package can lose its component-specific explanation before review | Carry native compatibility declarations and diagnostics into the details/review UI |

The download issue is concrete: current upstream skills include DOCX with 61 files, React best practices with 76, canvas-design with 83, claude-api with 96, and vercel-optimize with 156, before additional metadata requests. [Staging download loop](../../electron/extension-staging.mjs)

Repair several recovery problems before widening the catalog: hook templates currently replace the whole draft despite an additive label; invalid plugin removal can be blocked by an inventory-review loop; idle runtime connections may retain old hook configuration after a save. Disabled unreviewed configuration also needs an explicit supported recovery path. Preserve the existing review boundaries while making these states understandable and recoverable. [Customize service](../../electron/customize.mjs), [hook editor](../../src/ui/ProjectHooks.tsx), [runtime setup](../../src/runtime/index.mjs)

These extensions feed the native Code and Windows Work/Sites generation runtimes. They do not add tools to the embedded Meta AI or Muse website conversation. The menu should identify where an integration is usable; extending the hosted website assistant would require a separate supported integration route. [Runtime and browser wiring](../../electron/main.mjs)

## What the other harnesses do well

### Codex

Codex combines user-facing app discovery with skills, tools and account connections inside a plugin. Its directory separates OpenAI, workspace and personal sources, with an Installed view and connection prompts when needed. The useful pattern for MuseBench is a recognizable service card that leads through installation and account setup. [Codex plugin experience](https://learn.chatgpt.com/docs/plugins)

The current OpenAI public GitHub marketplace contains **65 entries across 10 categories**. This is the count of that manifest, not the entire Codex product directory. It includes developer, productivity, design and research integrations. MuseBench's existing source list omits it. [OpenAI public marketplace](https://github.com/openai/plugins/blob/main/.agents/plugins/marketplace.json)

Codex supports portable root `plugin.json` packages with skills and MCP configuration, alongside OpenAI-specific extensions and legacy packaging. Its local marketplaces can resolve repository paths, Git subdirectories and npm packages. Adopt format-aware import and keep unsupported components visible. [Plugin authoring and marketplaces](https://developers.openai.com/plugins/build/plugins)

Some OpenAI plugins refer to a hosted connector ID in `.app.json`; that identifier is not an independent Gmail or GitHub implementation. Public MCP definitions, such as Notion's endpoint, are more directly reusable with MuseBench-owned authentication. Public availability also does not grant a uniform redistribution license: inspect the individual package. [Gmail connector manifest](https://github.com/openai/plugins/blob/main/plugins/gmail/.app.json), [Notion MCP manifest](https://github.com/openai/plugins/blob/main/plugins/notion/.mcp.json), [OpenAI Developers plugin manifest](https://github.com/openai/plugins/blob/main/plugins/openai-developers/.codex-plugin/plugin.json)

### Claude Code

The two public Anthropic marketplace feeds currently contain **315 official** and **2,283 community** entries. These may overlap and are not compatibility certifications. The official feed is already in MuseBench; the community feed is additional. Its size exceeds MuseBench's current 1,000-entry per-manifest limit, so adding its URL alone would fail. [Official feed](https://github.com/anthropics/claude-plugins-official/blob/main/.claude-plugin/marketplace.json), [Community feed](https://github.com/anthropics/claude-plugins-community/blob/main/.claude-plugin/marketplace.json)

Claude's useful management patterns are Discover, Installed, Marketplaces and Errors; package details before installation; clear user/repository scopes; and separate catalog update, installed-package update and session reload states. These would address several current MuseBench gaps directly. [Discovery and installation](https://code.claude.com/docs/en/discover-plugins)

Marketplace entries support several source types. Today's official/community feeds use relative repository paths, Git URLs and Git subdirectories, making those a sensible initial import target. Retain entry identity and revision; validate entries independently; report unsupported source types without hiding the whole source. [Marketplace schema](https://code.claude.com/docs/en/plugins/marketplace-reference)

Claude Code can inherit claude.ai remote connectors when authenticated with an eligible claude.ai subscription. That does not transfer those connections to MuseBench. Anthropic-hosted Gmail, Calendar and Microsoft 365 use Claude's connection flow; MuseBench needs its own authorized provider route. [Claude account connections](https://code.claude.com/docs/en/mcp#use-mcp-servers-from-claudeai)

For local installation, **MCPB deserves a dedicated adapter**. It is a ZIP-and-manifest bundle format with an open implementation intended for desktop clients, including Windows. It can package a server, dependencies and configuration requirements. MuseBench still needs runtime/platform qualification and bounded extraction; the format does not make every binary portable. [MCPB implementation and format](https://github.com/modelcontextprotocol/mcpb)

### Hermes

Hermes federates skills across multiple sources, keeping origin and revision information and using a cached index with stale-result fallback. This is a good model for searchable abundance without forcing users to know which repository contains a skill. [Skills search implementation](https://github.com/NousResearch/hermes-agent/blob/main/tools/skills_hub_search.py)

Its published plugin feed currently contains **861 catalog entries**, and its repository lists **66 optional MCP entries**. These are discovery sources, not 927 compatible Muse integrations. Plugin metadata includes categories, reviewed revisions, platform requirements and configuration needs. Installed and enabled are separate states. [Plugin feed](https://hermes-agent.nousresearch.com/docs/api/plugin-catalog.json), [MCP manifest directory](https://github.com/NousResearch/hermes-agent/tree/main/optional-mcps), [catalog contract](https://hermes-agent.nousresearch.com/docs/user-guide/features/plugin-catalog)

Hermes's strongest setup pattern is a shared lifecycle for catalog and custom MCP servers: configure, authorize, discover tools, then expose the usable connection. Cancellation preserves previous configuration; authorization success is distinct from discovery failure. Its manager supports testing, reauthorization and tool selection. [Hermes MCP lifecycle](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp)

Hermes-native Python plugins require the Hermes host API. Its portable Agent Plugins subset provides a more promising import route for skills and MCP. Catalog entries should disclose supported and unsupported components rather than presenting every native plugin as installable. [Hermes plugin formats](https://hermes-agent.nousresearch.com/docs/developer-guide/plugins#portable-agent-plugins-v1-packages)

## Sources worth adding

| Source | Recommended use in MuseBench | Qualification needed |
| --- | --- | --- |
| OpenAI main public plugins | Add as a default searchable source | Separate portable content from OpenAI connector IDs and host-specific tools |
| Anthropic community marketplace | Add as a community source with publisher filters | Replace current whole-source size/count rejection with bounded ingestion; qualify components |
| Hermes skills index | Optional aggregated discovery source | Preserve original publisher and fetch content from its original pinned source |
| Hermes optional MCP manifests | Adapt individual setup recipes | Translate runtime, platform, auth and bootstrap assumptions |
| Official MCP Registry | Improve the existing adapter | Preserve remote/package metadata, versions and status; generate supported setup forms |
| User Git repository or marketplace URL | Add Source action | Support explicit source schemas, immutable revisions and clear failures |
| MCPB bundles | Import local server bundles | Windows runtime support, configuration, dependency and update handling |
| Docker MCP catalog | Optional route for local servers | Docker Desktop availability and user-selected profiles |

The official MCP Registry is a paginated, unauthenticated discovery API with version and update information. Cache it and process withdrawal/deprecation status. Its search is primarily name-based; a local capability/category index would improve searches such as “email” or “database.” [Registry aggregator guidance](https://modelcontextprotocol.io/registry/registry-aggregators), [registry API schema](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/api/openapi.yaml)

Docker documents a catalog of **300+ servers** and a gateway/profile approach. It is useful as an optional installation backend for users already running Docker. Docker Desktop must remain a visible prerequisite; profile selection is not account isolation because OAuth credentials can be shared across profiles. [Docker catalog](https://docs.docker.com/ai/mcp-catalog-and-toolkit/), [profile behavior](https://docs.docker.com/ai/mcp-catalog-and-toolkit/profiles/)

Avoid making an undocumented search endpoint a core dependency. Hermes's skills.sh adapter uses web search, sitemaps and page parsing. The separately documented skills.sh API requires Vercel OIDC. Start with explicit public repositories and cached source adapters; treat scraping as best effort. [Hermes adapter](https://github.com/NousResearch/hermes-agent/blob/main/tools/skills_hub_skillssh.py), [skills.sh API](https://www.skills.sh/docs/api)

Managed connector infrastructure is a later option. Smithery documents OAuth connection lifecycle and credential handling that could reduce per-provider work, but adopting it introduces an external service/account and data-flow decision. A first release can use direct provider MCP connections without requiring a new hosted backend. [Smithery connections](https://smithery.ai/docs/use/connect)

## Proposed compact menu

Keep Customize as the entry point and make **Discover** the default destination. Use one search across sources and types, with compact filters. Do not require choosing Skills, then Community, before a search can find a plugin.

| Primary view | Contents |
| --- | --- |
| Discover | Search, task categories, source/publisher filters, type filters, Windows support and readiness |
| Installed | Installed packages, enabled state, version, scope, configure, update, remove |
| Connections | Connected accounts and local servers, available tools, test/reconnect and recent errors |
| Updates | Package changes, version comparison, apply and recovery |

Put source management and hook configuration behind compact secondary controls. Show a problem badge only when action is required. A card needs a name/icon, publisher, one useful sentence, component badges and one appropriate action: Install, Connect, Configure or Manage. Put technical requirements and compatibility details in the detail sheet. A provider should have one recognizable card with alternative connection methods, rather than duplicate MCP and Connector cards for the same service.

Suggested task categories: **Coding**, **Work and documents**, **Research**, **Design**, **Data**, **Deployment**, and **Automation**. Useful searches should match tasks and tool capabilities as well as package names. Examples: “review a PR,” “create slides,” “search my notes,” and “inspect a database.” Parse skill frontmatter and package descriptions into cached metadata; do not download every skill's full contents while browsing.

Show installation state separately from connection state. For example, a plugin can be Installed while its Notion connection Needs sign-in. A package with one supported skill and one unsupported hook should show Partial support, with both components listed.

## Implementation sequence and acceptance criteria

| Priority | Deliverable | Acceptance evidence |
| --- | --- | --- |
| 1 | Repair hook draft replacement, invalid-plugin recovery and stale runtime configuration; reconcile installation receipts | Existing configuration survives failed actions; invalid packages can be removed; discovery and installed inventory agree |
| 2 | Unified search, compact cards and task/source/platform filters | Search finds the same integration regardless of the previously selected type/source; aliases do not duplicate installations |
| 3 | Reliable source ingestion and package retrieval; add OpenAI main and Anthropic community catalogs | Large feeds remain bounded and browsable; a 100-file fixture stages within a reasonable request budget; SHA/hash integrity remains enforced |
| 4 | Registry-derived HTTP/stdio setup, credential fields, authentication and readiness checks | A real qualified server authenticates, lists tools and passes a harmless explicit tool invocation; failures remain visible and recoverable |
| 5 | Portable plugin and MCPB qualification; selected Hermes recipe/skill sources | Per-component validation on the pinned CLI and Windows; unsupported components are shown; no execution during browse/inspection |
| 6 | Updates, project-specific enablement, connection repair and starter collections | Updates preserve configuration, expose capability changes, and have a tested rollback/recovery path |
| 7 | Broader hook support and scalable tool loading | Event-specific fixture tests, lifecycle receipts and measured model-visible behavior |

For the first qualified collection, prioritize integrations already represented in publisher catalogs: GitHub, GitLab, Context7, Playwright, Linear, Atlassian, Notion, Figma, Supabase, Firebase, Vercel, Cloudflare, Sentry and Stripe, plus frontend/design/document skills. This is a qualification shortlist; provider accounts, plans and client restrictions still determine availability. [Anthropic official catalog](https://github.com/anthropics/claude-plugins-official/blob/main/.claude-plugin/marketplace.json)

Gmail, Google Drive/Calendar, Outlook, Teams and Slack are high-value follow-ons. Their user-facing cards need working provider authentication and permission handling. Copying a host-specific connector declaration is insufficient.

### Backend design choices

Use separate records for catalog entries, installed packages, package components, connection instances and runtime activation. One package may contain several skills and servers; one provider may have multiple connected accounts. Preserve upstream identity while giving equivalent listings a shared canonical identity. Credentials belong in the protected desktop credential store, referenced by configuration rather than copied into catalog caches or project files.

Generate setup forms from supported typed metadata: URL, transport, required fields, secret fields, runtime, arguments and platform. HTTP does not imply OAuth; determine whether a connection uses no authentication, a token/header, OAuth, or provider-specific registration. Support cancellation, expired authorization and refresh failures. [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)

A connection test should identify the stage reached: transport reachable, MCP initialized, authentication accepted, tools discovered, and selected tool usable. The current native session interface does not supply all of these observations. An app-owned probe can test the configured server independently, but that is different from proving a particular Muse session can call it. Maintain that distinction in diagnostics.

MuseBench already has a two-tool search/call gateway for TypeScript workspace navigation. Generalizing that pattern to selected integrations is possible, but it currently covers only four semantic operations. Installing hundreds of packages should not automatically expose every tool schema on every turn. Start with project-specific activation and lazy skill loading; measure any broader discovery gateway before claiming context or quality gains. [Existing gateway contract](../WORKSPACE-MCP.md)

### Hook handling

Keep common templates approachable: format/check after work, show a diff summary, or validate a task. Provide event, command, origin, enabled state, test result and recent failures in an advanced view. Append templates to an existing draft rather than silently replacing it.

Claude supports several handler kinds and event-specific control behavior; Hermes also distinguishes several hook systems. MuseBench's app-owned hook editor supports only `UserPromptSubmit` and `Stop`; native plugin hook capabilities are a separate path. Importing an unfamiliar hook file must not imply those extra events run. Add adapters only where input/output, timeout, blocking and Windows shell semantics can be tested. [Claude hooks](https://code.claude.com/docs/en/hooks), [Hermes hooks](https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks), [MuseBench hook validator](../../src/shared/native-hooks.mjs)

## Native compatibility evidence

The vendor-neutral Agent Plugins format is a useful common target for skills and MCP, with client-specific extensions kept separate. It does not standardize every host's account services or hook runtime. [Agent Plugins standard](https://agent-plugins.org/), [client implementation guidance](https://agent-plugins.org/client-implementers/implement-an-agent-plugins-client)

There is a material documentation/runtime disagreement. The current Muse `next` compatibility page says Agent Plugins root MCP declarations remain inactive, while skills are imported. Its Claude/Codex adapters also have documented component restrictions. [Muse compatibility documentation](https://meta-models.github.io/muse-code-sdk/next/guides/plugins/concepts/compatibility/)

A fresh isolated `muse plugins validate --json` probe on installed `1.4.13-R6996.1` returned:

| Fixture | Result |
| --- | --- |
| Root Agent Plugins 1.0 manifest and one skill | Exit 0; `valid: true`; family `agent-plugins`; compatibility `full` |
| Same package plus exact-schema root MCP definition with an inert stdio command | Exit 0; `valid: true`; compatibility `full`; MCP declaration classified `supported`; no diagnostics |
| Same package plus exact-schema root Streamable HTTP MCP definition | Exit 0; `valid: true`; compatibility `full`; MCP declaration classified `supported`; normalized transport `http`; no diagnostics |

The inert command was deliberately nonexistent; the HTTP fixture used `https://example.invalid/mcp`. Neither was executed or connected. This establishes parser acceptance, not installation, authentication, server startup or model invocation. Qualification should be version-specific and include those later stages before assigning a Ready badge. A next-docs restriction alone is not sufficient to declare the installed host incapable, and validator success alone is not sufficient to declare a catalog integration working. [Sanitized validation evidence and fixture inputs](evidence/agent-plugins-validation-2026-10-28.json)

## Release and measurement

Keep the shared renderer and its simulated preview states aligned with desktop state transitions: available, preparing, configured, needs sign-in, connected, tools ready, partial support, failed, update available and reload required. Desktop acceptance needs real provider or inert protocol receipts; a simulated preview click is visual evidence only.

Track useful coverage separately: discoverable listings, qualified packages, supported setup recipes, connected accounts and successful tool calls. A large listing count is useful for discovery, while successful setup rate, time to first tool use and recoverable failure rate describe usability. Start with local diagnostics; collecting centralized user telemetry would be a separate product decision.

The recommended first milestone is **unified discovery plus reliable install/setup state**, followed by broader sources and qualified connection recipes. This builds on MuseBench's existing catalog and review machinery and gives users both more choices and a clearer path to using them.
