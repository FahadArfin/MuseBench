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
