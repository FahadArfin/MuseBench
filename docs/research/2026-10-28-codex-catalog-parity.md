# Codex directory research and MuseBench compatibility

Researched 28 October 2026. This is a source and compatibility audit, not a claim that every listed account has been authenticated or that its tools have run in MuseBench.

## What can be shared

ChatGPT and Codex now share a universal plugin directory. That hosted directory is distinct from public Git repositories and local marketplaces. A plugin can combine instructions, MCP connections, optional UI, and lifecycle hooks. The current portable packaging standard uses root `plugin.json`; OpenAI-specific presentation and registered app mappings belong in a namespaced extension. Legacy `.codex-plugin/plugin.json` remains supported by OpenAI. A manifest's presence does not supply the registered hosted service or credentials. [Directory quickstart](https://developers.openai.com/plugins/quickstart), [packaging specification](https://developers.openai.com/plugins/build/plugins).

The current task's directory search returned a useful, nonexhaustive selection including Google services, Outlook, Slack, GitHub, Figma, Notion, Linear, Canva, Stripe, HubSpot, Dropbox, Todoist, Vercel, iCloud Calendar, Windsor, Otter, and Calendly. A further five live capability searches below returned 100 unique names. This is not a complete export of the universal directory. Public documentation does not establish an anonymous feed containing every account-visible listing.

Nineteen installed local Codex plugin manifests were inspected for names, purpose, declared license, and whether they reference apps/MCP/skills. No credentials, application identifiers, proprietary source, or private package assets were imported. Several useful-looking integrations are app mappings rather than standalone public servers. Pages, Sites, Work Pets, Product Design, Codex Security, and template/runtime integrations also depend on OpenAI services or proprietary components. Their installed packages are not a redistribution source for MuseBench.

## Recommended direct server recipes

Each row has a provider-documented HTTPS route fitting MuseBench's existing reviewed configuration and OAuth flow. “Recipe” means the documented setup can be offered; it does not mean authentication or runtime readiness was tested. Hosted service terms, account permissions, and provider limits continue to apply. No provider account was connected for this audit.

| Integration / short purpose | Endpoint and authentication | Qualification and primary source |
| --- | --- | --- |
| Stripe — work with payments, customers, and Stripe documentation | `https://mcp.stripe.com`; browser OAuth | Official HTTP and OAuth setup. Review account permissions before using financial operations. [Stripe MCP](https://docs.stripe.com/mcp) |
| Atlassian — search and update Jira, Confluence, and connected work | `https://mcp.atlassian.com/v2/mcp`; OAuth | Current guide uses v2, supports any MCP client, and describes Rovo credit consumption. Do not introduce the superseded v1 endpoint. [Atlassian setup](https://support.atlassian.com/atlassian-ai-gateway/docs/get-started-with-the-atlassian-remote-mcp-server/) |
| Todoist — organize tasks and projects | `https://ai.todoist.net/mcp`; OAuth | Official Doist source documents Streamable HTTP and browser sign-in. Public repository is MIT; optional MCP App widgets are separate from basic tool access. [Doist server](https://github.com/Doist/todoist-mcp) |
| Intercom — retrieve conversations, contacts, and help content | `https://mcp.intercom.com/mcp`; OAuth | Official docs support OAuth and Streamable HTTP. Currently restricted to US-hosted workspaces. [Intercom guide](https://developers.intercom.com/docs/guides/mcp) |
| Neon — develop and inspect Postgres projects | `https://mcp.neon.tech/mcp`; OAuth | Provider specifically scopes the server to development and testing. No local API-key creation is needed for the documented remote OAuth route. [Neon clients](https://neon.com/docs/ai/connect-mcp-clients-to-neon) |
| Cloudflare — manage Cloudflare services | `https://mcp.cloudflare.com/mcp`; OAuth | Current recommended broad API server; public implementation Apache-2.0. Its code-execution approach offers broad account operations, so the granted scope belongs in setup details. [Provider server inventory](https://github.com/cloudflare/mcp-server-cloudflare), [API server](https://github.com/cloudflare/mcp) |
| Cloudflare Docs — search Cloudflare reference documentation | `https://docs.mcp.cloudflare.com/mcp`; public documentation | Separate narrow documentation server. Current upstream inventory marks older Workers Bindings, Builds, GraphQL, Radar, and Observability servers deprecated; do not fill the catalog with those old routes. [Provider inventory](https://github.com/cloudflare/mcp-server-cloudflare) |
| Microsoft Learn — find Microsoft documentation and code examples | `https://learn.microsoft.com/api/mcp`; no authentication | Official public Streamable HTTP service, not access to Microsoft account files or Outlook. [Learn overview](https://learn.microsoft.com/en-us/training/support/mcp) |
| Airtable — read and update bases, records, and app structure | `https://mcp.airtable.com/mcp`; OAuth | All plans; organization policy may require allowlisting. Permissions mirror the connected user. Automation activation remains a separate action in Airtable. [Airtable setup](https://support.airtable.com/articles/9897799762-using-the-airtable-mcp-server) |
| Webflow — work with sites, layouts, and CMS content | `https://mcp.webflow.com/mcp`; OAuth | Requires an existing accessible site. OAuth also installs Webflow's MCP Bridge App; live Designer actions require that app to be open. Most data operations do not. [Setup](https://developers.webflow.com/mcp/reference/getting-started), [architecture](https://developers.webflow.com/mcp/reference/how-it-works) |

These complement the existing OpenAI Docs, Context7, Linear read-only, Notion, Sentry, and pinned local Playwright routes. Newly listed recipes still need real account-level acceptance before displaying “Ready.”

## Popular services that need additional setup

These should remain discoverable with useful descriptions and a setup action. An enabled `+` that simply saves an unusable server would be misleading.

| Service | Public route | Current blocker or required work |
| --- | --- | --- |
| Gmail, Drive, Docs, Sheets, Slides, Calendar, Google Chat, Contacts | [Official Workspace MCP setup](https://developers.google.com/workspace/guides/configure-mcp-servers) | Official remote servers now exist in Developer Preview, but require enrollment, a Cloud project, enabled APIs, and a registered OAuth client ID/secret. MuseBench currently has no form or protected store for custom OAuth credentials. |
| GitHub | [Official host integration](https://github.com/github/github-mcp-server/blob/main/docs/host-integration.md) | Remote OAuth requires the host's registered GitHub/OAuth app, or an explicit token header. Generic `muse mcp login` alone is not proven sufficient. The [local stdio server now has its own OAuth path](https://github.com/github/github-mcp-server/blob/main/docs/oauth-login.md), but downloading and qualifying that executable is a separate adapter. |
| Slack | `https://mcp.slack.com/mcp`; [official guide](https://docs.slack.dev/ai/slack-mcp-server/) | No dynamic client registration. Requires a registered Slack app, confidential OAuth credentials, appropriate scopes, and workspace approval. Only internal or directory-published apps may use it. |
| Outlook Email, Outlook Calendar, Teams, SharePoint | [Microsoft Agent 365 server overview](https://learn.microsoft.com/en-us/microsoft-agent-365/tooling-servers-overview) | Microsoft's governed agent tooling is not a drop-in copy of an OpenAI connector. No unrestricted general desktop OAuth endpoint was qualified here. Tenant registration/consent and supported agent access require separate integration work. |
| Canva | `https://api.canva.com/connect/v1/mcp`; [27 October GA announcement](https://www.canva.dev/blog/developers/canva-mcp-ga/) | New self-service access requires a developer app and client ID/secret. Client-ID Metadata Document clients still require redirect registration through a waitlist. Each user authenticates individually; no service-account route. |
| HubSpot | `https://mcp.hubspot.com`; [official integration guide](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server) | Create a HubSpot MCP connector and configure its client ID, client secret, redirect URL, and PKCE. Some sensitive-data-enabled accounts restrict available data. |
| Asana | `https://mcp.asana.com/v2/mcp`; [official integration guide](https://developers.asana.com/docs/integrating-with-asanas-mcp-server) | Requires a preregistered MCP app and OAuth client credentials. The former `/sse` route is deprecated. Command MCP additionally requires its own license. |
| Vercel | `https://mcp.vercel.com`; [official guide](https://vercel.com/docs/agent-resources/vercel-mcp) | Supports reviewed/approved clients. MuseBench approval is unverified, so preserve setup-required. |
| Figma | [Official MCP documentation](https://developers.figma.com/docs/figma-mcp-server/) | Existing catalog restriction remains: do not equate Codex's hosted Figma tools with MuseBench eligibility or all public server capabilities. |
| Supabase | [Official MCP guide](https://supabase.com/docs/ai-tools/mcp) | Browser OAuth exists, but project scoping/read-only options use URL query parameters rejected by the current MuseBench configuration validator. An unscoped route grants access to all projects in the authorized scope; retain setup instructions instead of silently widening access. |
| Hugging Face | [Official MCP guide](https://huggingface.co/docs/hub/agents-mcp) | Provider recommends account-generated configuration from MCP settings. Public discovery and account-selected tools differ; qualify that configuration separately rather than borrow Codex credentials. |
| Dropbox, Box, iCloud, Expedia, Calendly, Otter, Windsor, Sonos, Hevy, Tripsy, QuickBooks, Gusto | Provider/API setup or directory listing | Appearance in a screenshot or hosted directory does not establish a public portable endpoint, redistribution rights, or Muse-compatible authentication. Do not label them installable until those are verified. |

The open-source [Google Workspace CLI](https://github.com/googleworkspace/cli) is a possible future alternative for Google integrations: Apache-2.0, local OAuth configuration, structured output, and bundled agent skills. Its own README says it is **not an officially supported Google product**. It still needs a Cloud project and credentials; installing its skill alone does not connect an account.

## Live directory coverage

Read-only Plugin Management searches against the current [ChatGPT/Codex directory](https://chatgpt.com/plugins), with a requested maximum of 50 results per query, returned:

| Query | Results |
| --- | ---: |
| `email calendar messaging contacts` | 29 |
| `developer coding security databases` | 34 |
| `design creative media documents` | 35 |
| `business CRM finance analytics` | 37 |
| `travel lifestyle fitness productivity` | 26 |

There were 100 unique plugin names across these five overlapping searches. Results may depend on account, workspace, platform, and policy; some returned entries were unavailable under the current account's policy. Search is explicitly nonexhaustive. These names are an inventory for prioritization, not 100 integrations installed in MuseBench:

AWS Data Analytics, Actively, Adobe, Adobe Acrobat, Ahrefs, Airtable, Alation, Amplitude, Apollo.io, Attio, Azure Cosmos DB, BigQuery, Box, Calendly, Canva, ChatGPT Ads Manager, Clay, ClickHouse, Close, Context7, Data, Datadog, Datadog Experiments, Docusign, Figma, Finances, Firebase, Firecrawl, Fireflies, G2 MCP, GitHub, Gmail, Google Calendar, Google Contacts, Google Drive, HG Insights - RGI, Higgsfield, Hostinger Mail, HubSpot, Instacart, Klaviyo, Linear, Lovable, MagicPath, Meticulate, Metricool, Microsoft Power BI, Mixpanel, MongoDB Atlas, MotherDuck, Neon, Notion, Omni, OpenAI Developers, Outlook Calendar, Outlook Email, Outreach, PostHog, Product Design, Railway, Redis, Render, Replit, Rox, Runway, Salesforce, SharePoint, Shop, Shopify, Sigma, Similarweb, Sites, Slack, Snowflake, Statsig, Stripe, Supabase, Superhuman Mail, Superpowers, Tableau, Teams, ThoughtSpot SpotterCode, TickTick:To-Do List & Calendar, Todoist, Tripsy, Vercel, VillageSQL Skills, Webflow, Windsor.ai, WisdomAI, Wix, WordPress.com, Zoho CRM, Zoom, ZoomInfo, dbt, iCloud Calendar, iCloud Mail, monday.com, and vidIQ.

## Public plugin and skill sources

Live GitHub trees and manifests were checked without installing packages or executing helpers. File presence establishes provenance, not runtime portability.

| Source | Confirmed useful paths | Packaging / dependency limits |
| --- | --- | --- |
| [OpenAI community plugins](https://github.com/openai/community-plugins) | `plugins/grafana-observability`, `plugins/reviewops-auditor-benchmark`, `plugins/react-native-to-swiftui`, `plugins/autodesk-fusion` | Current manifest has four entries. Apache-2.0 root license; review exact package and tool dependencies. SwiftUI needs Apple's toolchain; Fusion needs its application/bridge; Grafana needs account/server configuration. |
| [OpenAI Developers for Claude](https://github.com/openai/openai-developers-for-claude) | `plugins/openai-developers`; six skill folders | Apache-2.0. The [official product page](https://developers.openai.com/learn/developers-codex-plugin) explicitly distinguishes public developer guidance/Docs MCP from the account-bound OpenAI Platform connector. Validate the public package; do not copy the locally installed proprietary variant. |
| [OpenAI public skills](https://github.com/openai/skills/tree/main/skills/.curated) | Existing security/GitHub/PDF/Windows skills; also `jupyter-notebook`, `cli-creator`, `screenshot`, `speech`, `transcribe`, provider deployment skills | Current tree has 39 curated skill folders. Old `doc`, `spreadsheet`, and `develop-web-game` names are absent. Inspect per-skill license and helpers. Jupyter hardcodes a Codex helper path and Bash setup. Speech/transcribe require Python, OpenAI SDK, and a user-provided paid API key. Figma/Notion/host-dependent instructions are not self-contained capabilities. |
| [Anthropic skills](https://github.com/anthropics/skills) | `skills/skill-creator`, `brand-guidelines`, `canvas-design`, `theme-factory`, `algorithmic-art`, `slack-gif-creator`, plus existing document/frontend skills | Current tree has 19 skills. Preserve each package's license. Brand Guidelines specifically applies **Anthropic** branding; art uses bundled templates/fonts; GIF helpers need Python. Skill Creator's automated evaluator expects Claude. `web-artifacts-builder` uses Bash scripts, Node, and Claude artifact delivery, requiring adaptation on Windows. |
| [Anthropic public plugins](https://github.com/anthropics/claude-plugins-official) | `plugins/frontend-design`, `code-simplifier`, `pr-review-toolkit`, `claude-md-management`, `skill-creator`, `mcp-server-dev`, `playground`, plus existing workflow entries | Paths verified. Agent declarations, hooks, commands, provider assumptions, and licenses must pass exact-package review. Do not remove unsupported capabilities and call the modified bundle an unchanged upstream plugin. |
| [Superpowers](https://github.com/obra/superpowers) | `skills/systematic-debugging`, `test-driven-development`, `writing-plans`, `verification-before-completion`, and other existing workflows | MIT. These instruction-oriented workflows are good candidates for review. Parallel-agent and subagent workflows additionally require host tool mappings. |
| [Neon agent skills](https://github.com/neondatabase/agent-skills) | `skills/neon-postgres`, `neon-auth`, `neon-postgres-branches`, plus `plugins/neon-postgres` | Source paths verified; review current licensing and account/tool prerequisites. Prefer narrowly selected skill packages over all repository artifacts. |
| [Hugging Face skills](https://github.com/huggingface/skills) | `skills/hf-cli`, `huggingface-datasets`, `huggingface-gradio`, `huggingface-local-models`, `huggingface-papers`, training and deployment workflows | Valid discovery candidates. Environment, model, compute, credentials, and payment requirements differ; do not activate training/jobs during browsing or installation. |

### Reproducible public source snapshot

These counts were checked against the exact public commit trees/manifests below. They measure discovery, not successful installation. Trees were not truncated.

| Source | Commit | Eligible inventory |
| --- | --- | --- |
| OpenAI community plugins | [`62844ca1cd865b76c7fed7180fc1ffef16e9167b`](https://github.com/openai/community-plugins/tree/62844ca1cd865b76c7fed7180fc1ffef16e9167b) | 4 marketplace entries; 22 skills distributed inside those packages |
| OpenAI skills | [`49f948faa9258a0c61caceaf225e179651397431`](https://github.com/openai/skills/tree/49f948faa9258a0c61caceaf225e179651397431) | 39 `.curated` skill folders; other system helpers excluded |
| Anthropic skills | [`dbd4588f9e1033efb41dad4bef2f7947c8993d44`](https://github.com/anthropics/skills/tree/dbd4588f9e1033efb41dad4bef2f7947c8993d44) | 19 `skills/<name>/SKILL.md` packages; template outside that directory excluded |
| Anthropic official marketplace | [`f8c5e7a1dcb71b10cb74586224b5401f3de5db28`](https://github.com/anthropics/claude-plugins-official/tree/f8c5e7a1dcb71b10cb74586224b5401f3de5db28) | 315 manifest entries; mixed local and external sources |
| Vercel agent skills | [`1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62`](https://github.com/vercel-labs/agent-skills/tree/1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62) | 9 `skills/<name>/SKILL.md` packages |

The two existing public marketplace adapters therefore expose 319 source records before overlap or compatibility filtering, plus 67 directly discoverable skill packages across the three existing skill repositories. The MCP Registry provides a separate paginated and changing selection; no global total was inferred from one page.

## Compact information design

Use a narrow Customize rail for the five types and installed items, with a shared compact search/action header. Show “Popular (curated)” first, then purposeful groups: Productivity, Developer tools, Design & content, Knowledge & research, Data & infrastructure, and Business. Popular is an editorial shortlist, not fabricated usage telemetry. Cards need one recognizable icon, title, one sentence, and an action; move provenance, prerequisites, capabilities, and license details into the selected item's panel.

Keep browser preview and desktop on the same normalized records. A small “Setup needed” label should survive the compact layout. Never hide an important capability limitation solely inside an install error. Search should match names, purpose, publisher, and categories. Installed state should come from observed inventory, not from visiting a detail page.

## Current implementation boundaries and next work

MuseBench already has reviewed HTTPS/stdio server addition, CLI OAuth, pinned public-package staging, native validation, install receipts, community discovery, and project hook drafts. Its configuration UI intentionally accepts neither arbitrary secret headers/environment values nor custom OAuth client credentials; HTTPS URLs also reject query strings. App-owned hook events are `UserPromptSubmit` and `Stop`, at most six hooks with bounded timeouts. A foreign marketplace cannot expand these runtime capabilities just by adding metadata.

The first useful delivery is compact discovery plus the verified direct server recipes and more public skills. Subsequent integration work should add a protected custom-OAuth/secret workflow, explicit provider client registration, scoped server URL configuration, and actual read-only connection checks. Only then can Google, Slack, HubSpot, Canva, Asana, GitHub, and tenant-bound Microsoft routes move from setup instructions to a reliable connect experience. The present release should not claim to clone every Codex connector.
