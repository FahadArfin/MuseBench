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


---

# Codex handoff: Patchlight with Muse CLI

## Task and boundaries

Build a novice-oriented local workspace around **Muse CLI**, using its documented Muse Session Protocol and TypeScript SDK where supported. OpenCode remains research/comparison only. Preserve the independently branded plan → changes → preview → checks → review experience.

The current deliverable is a disposable visual spike. All providers, patches, test outcomes, folders and checkpoints are mock data. Do not claim SDK conformance from the UI's mock class. Production implementation is a separate authorization step; the present task authorized only research and a bounded mock.

Existing boundaries to preserve: separate side project; never modify the existing yoru app or read its secrets; no push, publication, public repository creation, new subscriptions, API keys, persistent grants, paid calls, or contacting people. No Meta affiliation or promises of hiring/sale. Use only the independently created files in this project for the next phase. The saved runtime supplies tooling, not product context or credentials.

## Current project

- `index.html`: workspace structure and accessible native dialog.
- `styles.css`: responsive original visual system.
- `app.js`: deterministic `MockMuseAdapter` and product UI state; no imports, fetch, filesystem calls or real commands.
- `bundle.mjs`: builds a single HTML containing all scripts and styles.
- `tests/ui.cjs`: Playwright workflow checks using available runtime tooling; no new dependency installed.
- `artifacts/Patchlight-Interactive-Demo.html`: portable output; verified via local HTTP.
- `artifacts/test-results.json`: actual prototype test results and limitations.

Run `npm start`, then open `http://127.0.0.1:4318`. Run `npm run bundle` after edits. With that server running, run `npm test`. The test script uses the installed runtime Playwright module by default; on another machine set `PLAYWRIGHT_MODULE` to an existing absolute module path and `CHROMIUM_PATH` to its Chromium binary. It does not auto-install software.

## Architecture for a real MVP — proposed, not implemented

```text
Local desktop shell (React/TypeScript UI, isolated renderer)
  projects · chat · plan · diff · preview · checks · review
                         │ narrow typed IPC
Local controller (Node/TypeScript; owns all child processes)
  workspace registry       session journal       evidence store
  git/worktree manager     test/preview runner   permission broker
                         │ version-pinned adapter
                 @muse-code/sdk client
                         │ MSP transport
                    muse serve host
                         │ user-authorized provider access
                    Meta models
```

Prefer a desktop shell with a separate local controller over a publicly hosted web service. It keeps folder selection and process control explicit and avoids a cloud agent farm before the workflow is validated. Electron is a practical first choice because the controller and SDK are TypeScript/Node; Tauri plus a sidecar is a viable later tradeoff. This is an engineering recommendation, not a user-selected packaging decision.

The UI should never access the CLI credential store, spawn arbitrary programs, or call the model API directly. Let the official runtime own its authentication. A mock adapter remains the default in demos; if a real runtime is unavailable or incompatible, show a named disconnected state, not a silent provider substitution.

### Data ownership

Use SQLite in application-owned data for local project metadata, event journal and evidence indexes. Keep large logs/captures as bounded files with hashes. Never store API keys in the UI or journal. Each work item records:

```ts
// Proposed product types, NOT Meta SDK declarations.
type EvidenceStatus = 'not-run' | 'running' | 'passed' | 'failed'
  | 'cancelled' | 'stale' | 'unavailable';
type ChangePackage = {
  id: string; projectId: string; sessionId: string;
  baseRevision: string; workingRevision: string; planVersion: number;
  criteria: { id: string; text: string; evidenceIds: string[] }[];
  diffArtifactIds: string[]; previewArtifactIds: string[];
  checks: { commandId: string; revision: string; status: EvidenceStatus;
    exitCode: number | null; startedAt: string; endedAt?: string;
    logArtifactId?: string }[];
  acceptedRevision?: string;
};
```

An agent statement must never set a check to passed. The runner's exit status and parsed result determine it. Any file change after testing marks affected evidence stale and invalidates acceptance. Even exit zero from an agent turn is not a test result.

## Muse interface evidence and limits

Official entry point: https://dev.meta.ai/docs/muse-code

Official SDK repository: https://github.com/meta-models/muse-code-sdk

Inspect commit `3dce908f556bd8b3dfc9cd7f28f442b0504d74a4`, rather than assuming moving `main` still matches this report. Its SDK package and host anchor say `1.4.13`; stable manifest is schema version `1` and fingerprint `sha256:7fddaf646dbc317e5fcac0785e135eb04df14fbb0db1863089dfd6da21730e5b`.

Sources: [package](https://github.com/meta-models/muse-code-sdk/blob/3dce908f556bd8b3dfc9cd7f28f442b0504d74a4/clients/sdk-ts/package.json), [manifest](https://github.com/meta-models/muse-code-sdk/blob/3dce908f556bd8b3dfc9cd7f28f442b0504d74a4/schema/msp/stable/manifest.json), [host anchor](https://github.com/meta-models/muse-code-sdk/blob/3dce908f556bd8b3dfc9cd7f28f442b0504d74a4/publish-anchor.json).

The documentation uses both “stable, versioned” for the session protocol and “Developer Preview” for the SDK. Do not conflate wire stability, SDK package version, runtime version and enabled capabilities. Detect them at startup. The public SDK source does not include the native `muse` binary. Installation, auth, runtime schema inspection, and live model behavior were deliberately not attempted here.

### Verified concepts to map, not an invented API

The official stream cookbook demonstrates `session/start`, `model/list`, `turn/start`, `item/delta`, `item/completed`, and `turn/completed`. Its advice is to key deltas by item identity, replace accumulated text with the authoritative completed item, retain message phases, and wait for turn completion. Acknowledgement is not completion. [Stream recipe](https://github.com/meta-models/muse-code-sdk/blob/3dce908f556bd8b3dfc9cd7f28f442b0504d74a4/clients/sdk-cookbook/src/recipes/stream-a-turn.ts).

The approval recipe distinguishes the UI notification from the request the SDK must answer. It uses `approval/requested`, `approval/request`, `approval/decide` and `approval/resolved`; choose a host-offered choice ID, never invent one. An acknowledgement does not establish the policy outcome. [Approval recipe](https://github.com/meta-models/muse-code-sdk/blob/3dce908f556bd8b3dfc9cd7f28f442b0504d74a4/clients/sdk-cookbook/src/recipes/approve-or-deny.ts).

These names are verified at that source revision. Read the generated types and exact client facade before writing integration code. The UI fixture does not emit wire-compatible MSP records or implement these methods; its `build`, `check`, and `accept` methods are application-level demonstrations. Do not import them as an SDK adapter.

| Product operation | Intended backend responsibility |
|---|---|
| Open project/session | Controller validates folder, establishes host/client handshake, creates or resumes a real session using the pinned supported SDK. |
| Send chat / plan request | Adapter maps application intent into a real turn; renders authoritative item/turn events. A planning label alone must not imply read-only enforcement. |
| Request an edit or command | Runtime permission event becomes a concrete UI decision; preserve offered choices, target, scope and policy result. |
| Cancel | Use supported cancellation, continue observing until confirmed; never claim instant rollback. |
| Diff | Controller computes actual git/workspace differences, including deletions and untracked files, linked to the working revision. |
| Preview and tests | Controller-owned processes, approved commands and bounded ports; results tied to revision and process exit. |
| Review and accept | Product-owned record over the exact reviewed revision; not a model response and not an automatic commit. |

### Authentication and model boundaries

Muse CLI documents browser sign-in or `META_API_KEY`; Model API examples conventionally use `MODEL_API_KEY`. They are distinct interface conventions. Do not copy one into the other or scrape stored credentials. Reconfirm account access, terms and user authorization before any future live test. Model discovery should reflect what the authenticated host actually offers; do not assume Muse Wonder Full is a generic API model or that a consumer Muse account includes CLI/API use.

### Extensions

The real MVP can expose read-only inventory and project-level settings for supported skills/MCP tools, with capability detection. Do not build a marketplace. Do not silently import global skills, hooks, servers or tokens from Codex, Claude Code, yoru or personal folders. Each extension should show source, execution ability, paths/network access, and how to disable it. The current modal is a product concept only; its labels are not real plugins.

## Implementation sequence

1. **Contract spike, after separate authorization.** Pin a specific SDK and CLI artifact; inspect `muse --version` and `muse schema` without exposing credentials. Capture schema fingerprint and runtime capabilities. Establish startup, session and shutdown against a disposable project. If unavailable, stop the real adapter; retain mock. Pass: clear diagnostics for missing host, mismatch, missing auth and unsupported capability.
2. **Session lifecycle.** Journal normalized events with session/turn/item IDs and monotonically ordered cursors where supported. Make send/retry idempotent according to the actual contract. Handle duplicate events, reconnect, lost cursors and host exit. Pass: one user action never becomes two turns after a timeout; interrupted and uncertain states remain visible.
3. **Permissions and workspace isolation.** Canonicalize selected paths, reject root escapes/symlink surprises, snapshot dirty state, use isolated worktrees when appropriate, preserve user changes. Surface runtime approvals exactly and honor denial. Pass: denying a write leaves target unchanged; an unknown result is reconciled before retry. No global approvals or sandbox disablement.
4. **Evidence package.** Implement plan versioning, acceptance criteria, actual diff capture, and content/revision hashing. Pass: evidence from an old revision cannot make a newer revision ready for acceptance.
5. **Preview and checks.** Run one approved dev command and one approved test command. Bind server to loopback, validate origins, separate generated app origin from control UI, retain logs with limits, and terminate child processes on session end. Pass: failed/stale/cancelled checks never show green; preview crash has a useful recovery path; arbitrary external navigation cannot access controller privileges.
6. **Review and checkpoint.** Provide change explanation with source links, file-level drilldown, manual preview checklist, test details, outstanding concerns, and acceptance of the exact revision. Pass: race between review and a new edit invalidates acceptance. No push, merge or deploy in this phase.
7. **Usability validation.** Evaluate comprehension with novices and compare with their existing tool. Expand projects, extensions or parallel sessions only if they improve that outcome.

Do not build all of Codex and Claude Code before testing the narrow benefit. Multi-agent orchestration, team sync, mobile remote control, plugin commerce and publishing are explicit non-goals for the first real MVP.

## Required test matrix for a real adapter

Test with official source fixtures where their licensing and runtime prerequisites permit, then with a separately authorized real disposable workspace. Do not describe fixture success as live integration success.

- Handshake: missing binary, mismatched schema, unexpected version, unsupported capability, missing authentication.
- Streaming: deltas, completed replacement, multiple message phases, duplicate/out-of-order events, terminal completion.
- Approval: allow, deny, unavailable choice, expired request, lost acknowledgement, resolved policy denial.
- Lifecycle: cancel, restart, resume, disconnect while editing, idempotent retry and uncertain outcome reconciliation.
- Files: dirty checkout, untracked files, deletion, binary changes, symlink boundary, stale base, concurrent user edit.
- Evidence: no tests, failed test, exit zero with no expected report, timeout, stale revision and preview mismatch.
- UI: keyboard-only flow, focus restoration, screen-reader announcements, 200% zoom, narrow screens, reduced motion, contrast, empty/error/loading states.
- Isolation: no renderer filesystem/credential access; preview cannot reach privileged IPC; local API requires bounded origin/auth protection.

## Definition of done for this visual spike

The plan, illustrative change, interactive sample preview, scripted pass/fail paths, acceptance gate, undo and reset work. Runtime provenance remains visible. No external requests occur during the tested UI flow. The downloadable HTML is self-contained and works through localhost. Browser screenshots have been inspected; test evidence is in `VALIDATION.md` and `artifacts/test-results.json`. These claims do not extend to a real Muse runtime.


---

# Prototype validation

Validated 25 October 2026 with Chromium 154.0.8037.57 and the installed Playwright tooling. `node tests/ui.cjs` exited 0 and recorded **17 passing checks**, zero browser JavaScript errors, and zero external requests in the tested UI flow. `node --check app.js` and the standalone bundle build succeeded.

These are tests of the visual prototype. The three checks displayed inside the product are deliberately scripted fixture outcomes; they do not execute a user's project tests.

## Behavior verified

1. Later workflow stages are disabled before plan approval.
2. Runtime provenance is explicit and the native modal closes with Escape.
3. Approving the plan creates a labeled simulated diff.
4. Acceptance is unavailable before preview inspection and passing checks.
5. The caffeine-free filter removes the caffeinated sample product.
6. Before view restores the original collection and removes the new filter.
7. A failing simulated check blocks acceptance even after preview inspection.
8. Passing checks plus an inspected preview allow demo acceptance.
9. Demo acceptance can be undone while retaining the change for review.
10. Chat escapes markup and explains that it does not generate a new plan/code.
11. Extension concepts cannot install anything or grant access.
12. Reset clears the fixture workflow and custom local messages.
13. The preview width switch works.
14. There is no horizontal page overflow at 390, 768, 1024 and 1440 CSS pixels.
15. Filter controls work with keyboard focus, Tab and Enter.
16. The tested flow emits no browser errors or external network requests.
17. The standalone HTML works through the local HTTP server.

Full machine-readable evidence: `artifacts/test-results.json`. Reproducible browser code: `tests/ui.cjs`.

## Visual review

Saved captures were opened and inspected, not merely generated. They are local QA evidence, not Library uploads.

| Step | Capture | Observed health |
|---|---|---|
| 1. Plan | `artifacts/01-plan.png` | Clear three-step plan and one primary action; subsequent workflow steps visibly gated. |
| 2. Changes | `artifacts/02-changes.png` | Readable illustrative additions/removal, scope and mock wording present. Intended check coverage is explicitly distinguished from executed results. |
| 3. Preview | `artifacts/03-preview.png` | Before/after and width controls visible; filtered sample shows two teas, no clipping at desktop size. |
| 4. Failed checks | `artifacts/04-failed-check.png` | Amber failure message, failing row, and disabled review action agree. |
| 5. Review | `artifacts/05-review.png` | Evidence status and acceptance meaning are visible. No commit or deployment claim. |
| 6. Narrow layout | `artifacts/06-mobile.png` | Single-column content and sample products; primary action reachable with scrolling; no horizontal overflow. |

The dark rail, conversation and light workspace remain distinct without excessive card nesting. The sample preview uses original CSS illustrations and typography rather than copied application assets.

Remaining design limitations: compact metadata is small and needs a real contrast/zoom audit before production; at narrow widths the project rail and earlier chat bubbles are hidden to prioritize the current task, so a production mobile design needs explicit drawers/history controls. Only the filter control's keyboard path and native dialog Escape behavior were exercised, not a full screen-reader audit. One ordinary page scroll is used rather than an IDE's independent panes. The prototype intentionally lacks project switching, a real file explorer and an extension installer.

## Exact blocked action

- Action: navigate the test browser directly to the standalone HTML file.
- Target: `file:///workspace/muse-workspace-spike/artifacts/Patchlight-Interactive-Demo.html`.
- Status: **denied**, with Chromium `net::ERR_BLOCKED_BY_ADMINISTRATOR`.
- Completed independently: the same standalone HTML was served normally by localhost and passed its workflow smoke test.
- Unresolved: opening the file directly from disk remains unverified. No retry or browser-policy change was attempted. This was a browser policy restriction, not an automatic approval-review rejection.

## Not tested or claimed

No Muse installation, SDK handshake, model call, authentication, real file edit, test runner, git checkpoint, persistent storage, plugin grant, publishing, cross-browser compatibility, or commercial license clearance. Mock acceptance survives only within the current page lifetime. The future architecture in the handoff is a proposal, not implemented infrastructure.

All product files were created under `/workspace/muse-workspace-spike`. The existing yoru application and its secrets/configuration were not used; only its preinstalled Playwright package was used as execution tooling. No dependency installation, paid call, subscription, push, public repository or outreach occurred.
