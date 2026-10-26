# Patchlight: Muse CLI workspace feasibility

Research date: 25 October 2026. Independent concept. Working name only.

## Decision

**Build a small validation prototype; do not invest in a general-purpose wrapper yet.** A polished Muse CLI workspace is technically plausible. The strongest initial product is a guided change-review experience for novice web builders: define one outcome, approve the plan, inspect the actual change, try the preview, see test evidence, and accept a specific revision.

The latest user preference is authoritative: **Muse CLI is the intended backend. OpenCode is comparison-only.** The delivered visual prototype uses a deterministic local mock and makes no real integration claim. No user credentials, existing app configuration, subscriptions, or model endpoints were used.

This is worth building only if people understand and safely evaluate changes better than they do in existing tools. Chat, folders, model selection, and an attractive theme are table stakes. A “Muse Codex” clone has weak differentiation and a name that suggests affiliation with two existing products.

## What is verified

| Question | Evidence and conclusion | What remains untested |
|---|---|---|
| Does Meta have Muse Code CLI? | Yes. Meta documents a native `muse` binary, terminal/CI operation, and macOS/Linux/Windows support. [Official CLI overview](https://dev.meta.ai/docs/muse-code) | Installation and runtime behavior in this environment. |
| Is there a supported embedding interface? | Meta documents `muse serve`, `muse schema`, and a TypeScript session client, `@muse-code/sdk`. The SDK controls the CLI host; it is not the model API. [CLI programmatic access](https://dev.meta.ai/docs/muse-code) | Real handshake, platform capabilities, session recovery, and installed version compatibility. |
| What authentication exists? | Browser sign-in and API key authentication are documented. CLI precedence is environment `META_API_KEY`, stored key, then browser session. Billing setup is separate from simply finding public docs. [Authentication](https://dev.meta.ai/docs/muse-code/auth) | Whether the user has eligible access or a subscription. No sign-in attempted. |
| Is there a model API? | Yes: `https://api.meta.ai/v1`, bearer credentials conventionally named `MODEL_API_KEY` in the API docs. The docs list Muse Wonder and Muse Spark models and compatible request surfaces. [Model API overview](https://dev.meta.ai/docs/overview) | Entitlement, quota, latency, tool fidelity and live availability. No API call made. |
| Which models? | The model page lists `muse-wonder-1.0` in Model API and Muse Code, and `muse-wonder-full-1.0` by Muse Code subscription. Spark variants also exist. Availability must be discovered at runtime, not assumed from a consumer app account. [Model availability](https://dev.meta.ai/products/meta-model-api) | Specific account availability and future catalog changes. |
| Is the SDK open? | Its official source repository declares MIT and Node 20+. The SDK is distinct from the separately installed native host. [SDK repository](https://github.com/meta-models/muse-code-sdk) | Native CLI redistribution and commercial product terms have not been cleared. SDK MIT does not establish rights to bundle the CLI or Meta branding. |
| Can Muse be extended? | Meta documents skills, hooks, MCP, subagents and headless execution. [Extension docs](https://dev.meta.ai/docs/muse-code/extending) | A stable third-party marketplace API is not established by those docs. No plugins installed. |

Official pages are documentation evidence, not evidence of working credentials. Muse personal-agent availability also does not prove CLI/API entitlement. [Muse personal-agent announcement](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/) describes a different product surface.

### A meaningful compatibility caveat

The official SDK README still describes a pre-1.0 developer preview with no stability promise. At the inspected source commit, its package manifest and publish anchor identify **1.4.13**. The CLI overview calls the session protocol stable and versioned. Treat these as documentation drift, not proof of universal compatibility. Pin the binary, SDK, and schema together and run contract tests before any integration claim.

Inspected source commit: `3dce908f556bd8b3dfc9cd7f28f442b0504d74a4` (24 October 2026). [Package manifest](https://github.com/meta-models/muse-code-sdk/blob/3dce908f556bd8b3dfc9cd7f28f442b0504d74a4/clients/sdk-ts/package.json), [publish anchor](https://github.com/meta-models/muse-code-sdk/blob/3dce908f556bd8b3dfc9cd7f28f442b0504d74a4/publish-anchor.json).

The SDK documentation site's quickstart did not load in the research browser. The official source repository and its executable cookbook were readable, so protocol details below are grounded there. This is not a claim that the SDK is unavailable.

## Why a generic wrapper is not enough

| Existing product or surface | Verified overlap | Implication |
|---|---|---|
| Muse Code itself | Multi-agent execution, auditable work and computer-use are already promoted. [Muse Code product page](https://dev.meta.ai/products/muse-code) | “Muse, but agentic” is not a differentiator. |
| Claude Code desktop | Chat, files, terminal, diff, browser preview and plugins are documented. [Desktop quickstart](https://code.claude.com/docs/en/desktop-quickstart) | The requested feature inventory already exists elsewhere. |
| Codex | Parallel worktrees and review workflows are established. [Worktrees](https://developers.openai.com/codex/environments/git-worktrees), [code review](https://developers.openai.com/codex/code-review) | Compete on a focused novice outcome, not parallel-agent count. |
| OpenCode Web | A native browser interface already manages OpenCode sessions. [Web docs](https://opencode.ai/docs/web/) | An OpenCode web skin is a particularly weak starting proposition. |
| OpenChamber / CodeNomad | OpenCode's ecosystem lists existing desktop/web clients. It also lists Plannotator and sandbox/live-preview extensions. [Ecosystem](https://opencode.ai/docs/ecosystem/) | Even “plan + preview around an open agent” has close substitutes. Listing is evidence of existence, not an independent quality audit. |
| Lovable | Structured plans can be reviewed, edited and approved before building. [Plan mode](https://docs.lovable.dev/features/plan-mode) | A plan approval button alone is insufficient differentiation. |

No competitors were signed into or comprehensively audited. This is a documented feature-overlap assessment, not a benchmark or claim that competitors lack evidence-linked review.

### OpenCode feasibility, retained as comparison

OpenCode has a documented headless HTTP server, OpenAPI description, session and event APIs, a JS/TS SDK, custom provider configuration, and plugins that hook events or add tools. Its repository license is MIT, requiring preservation of copyright and permission notices in distributed copies or substantial portions. This is separate from model-provider billing and terms. [Server](https://opencode.ai/docs/server/), [SDK](https://opencode.ai/docs/sdk/), [providers](https://opencode.ai/docs/providers/), [plugins](https://opencode.ai/docs/plugins/), [license](https://github.com/anomalyco/opencode/blob/dev/LICENSE).

Meta even provides an OpenCode coding-agent setup and a GitHub agent recipe, so “OpenCode can run on Muse models” is documented, not a unique discovery. [Coding agents](https://dev.meta.ai/docs/coding-agents), [GitHub recipe](https://dev.meta.ai/docs/cookbook/github-agent). The prototype does **not** use that path, and the future implementation should not silently switch to it.

## Focused product proposition

**Patchlight — make a change, see the proof.**

Target a person with a small local web project who can describe a change but cannot confidently interpret a terminal log or raw diff. Start with one repository, one active task, one dev server, and one test command. Make the review understandable without hiding the technical evidence.

Each requested outcome becomes a reviewable change package:

1. **Plan:** desired behavior, touched areas, acceptance criteria and exclusions. Plain-language permission requests explain the exact action.
2. **Changes:** a summary linked to real files and diff hunks; include unexpected changes and deletions.
3. **Preview:** before/after views tied to the exact revisions, plus a short manual interaction checklist.
4. **Checks:** real commands, timestamps, exits, logs and revision hashes. Distinguish passed, failed, not run, cancelled and stale.
5. **Review:** explicitly accept the current package. In the first real MVP, acceptance records a local checkpoint only. Commit, merge and deployment are separate actions.

The potentially defensible part is the quality and reliability of those links: a user can select “the filter works” and see its UI interaction, changed code and test result from the same revision. It is a **hypothesis**, not a proven moat. Muse or existing IDEs could add this. Differentiation would come from novice comprehension, supported project recipes, and robust evidence handling.

### Approaches considered

- **Muse-specific desktop workspace (recommended by the latest brief):** host Muse CLI through its SDK/session protocol. Strong fit to the user's preference; version and platform coupling are the main technical risks.
- **OpenCode frontend:** good documented APIs and provider portability, but crowded and contrary to the later explicit backend preference. Comparison only.
- **New agent engine calling Model API directly:** highest control, but duplicates execution, permissions, context management and recovery. Too much engineering for the initial question.

## Naming candidates

| Working name | Why it fits | Concern |
|---|---|---|
| **Patchlight** — selected for this prototype | Suggests clarity around small changes; independent of the underlying model. | Brand, domain and trademark clearance have not been done. |
| Prooflane | Emphasizes the guided path from intent to evidence. | May sound like a compliance product. |
| Kindling Studio | Friendly and suited to people starting projects. | Less specific; likely crowded wording. |
| Threadwell | Suggests connected context and thoughtful work. | Meaning is less immediately obvious. |

These are creative candidates, not cleared commercial identities. Avoid Meta logos, “official”, “Muse Codex”, or endorsement language. “Something Meta would ship” is a quality aspiration. This work does not establish a hiring, acquisition or outreach opportunity.

## UI direction

Three directions were considered: a dense dark command center, a visual canvas of agent activity, and a quiet review desk. The prototype selects the **quiet review desk** to reduce novice decision load. It uses an original forest-green project rail, warm white surfaces, restrained blue actions, serif task headings and a large embedded sample preview. No screenshots or proprietary assets were copied. CSS creates the sample tea illustrations; there are no external fonts or assets.

The page has three clear regions: project context, conversation, and the current review stage. One primary action advances each stage. Raw evidence is progressively disclosed; the default language describes user outcomes. The persistent mock badge, runtime dialog, simulated check labels, and acceptance wording prevent the visual polish from implying real execution.

## Bounded validation plan

Do not commission a broad build yet. First test this workflow with 5–8 novice web builders using the same small task and a comparison tool. Obtain separate permission before recruiting or contacting anyone; none were contacted here.

Proposed success criteria (targets, not measured results): at least 4 of 5 can explain the changed behavior, identify a deliberately failing check, and avoid accepting an unverified change without coaching; most prefer returning to this workflow for a second task. Observe review time, misunderstandings, abandonment, and whether evidence improves correctness rather than simply confidence.

Then run a narrowly authorized technical spike against a pinned Muse runtime: start/resume a session, stream a turn, deny an action, recover from a disconnect, and bind a test result to a workspace revision. Proceed only if those work reliably. Stop or reduce scope if the product offers mainly cosmetic preference, if the integration cannot preserve permissions, or if support costs exceed the value users report.

No revenue, acquisition likelihood, employment outcome, model-quality advantage or willingness to pay has been established.

## Deliverable status

The local prototype is implemented and browser-tested. Its 17 checks cover interaction and state transitions; the app's displayed “3/3 fixture checks” are separate simulated content. It does not implement a real agent, file system browser, plugin installer, git operation, dev-server runner, persistent history, or Muse handshake. See `VALIDATION.md` and `HANDOFF.md` for evidence and next work.
