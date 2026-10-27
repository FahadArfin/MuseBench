# Harness roadmap delivery — 26 October 2026

Implementation is delivered through `661f4fd`. The roadmap is **not fully complete**: Windows interactive-host and native web execution blockers remain. The first four features (screenshots, skill discovery, worktree creation and persistent sessions) preceded this batch.

## Delivered and pushed feature by feature

| Commit | Delivered behavior |
| --- | --- |
| `6b318ef` | Capability status distinguishes implemented, disconnected, simulated and unavailable operations. |
| `8e7f2b1` | Per-chat and queued time/step budgets, with bounded cancellation. |
| `e4bf5f0` | Independent background chats, task-bound output/queues/stops, and overlapping-checkout protection. |
| `3542ac6` | Attributed, bounded context handoffs to another chat's queue, with duplicate protection. |
| `737ac8d` | Editable workflow templates with ordered phases, budgets, scope instructions and completion checks. |
| `33e2248` | Reported native token/call usage and explicit context omission information. |
| `c6a6aa8` | Worktree setup, retained archives, unarchive and recovery into a separate checkout. |
| `66ea161` | Native skill-load receipts, import previews/provenance and three optional MuseBench skills. |
| `5720cc7` | Observed native workflow details, without inventing child identities or controls. |
| `a34b18f` | Installed native model catalog and compatible reasoning selection. |
| `35aa2a3` | Content-bound project instruction/skill trust with review and revocation. |
| `1aab461` | Independent-review fixes for model IPC, workspace binding, retained chat metadata, deletion subscriptions and single-tier reasoning. |
| `661f4fd` | Reviewed app-owned project hooks, with revision checks, explicit host-access consent and native process ownership. |

## Verification and its limits

- 656 regression tests passed. After the final diagnostics-only adjustment, all 38 exec-runtime tests passed again.
- Production TypeScript/Vite build and browser interaction smoke passed.
- 31 browser-preview/production-Electron renderer scenes matched control structure, styles and geometry within one pixel. These checks use the same simulated bridge; they prove shared presentation, not native backend execution. Model, workflow, instruction-trust and hook controls are included.
- Independent whole-change review found four important and one minor issue; all were corrected. A focused hook review found two minor issues, also corrected. Reviewer follow-ups found no further actionable issue.
- Real native requests verified background-session routing, selected-model execution, bundled skill loading and reviewed project skill loading. Actual native usage reports and workflow events were checked separately.
- Isolated native echo-provider hook probes verified Before prompt/Before finish execution and exclusion of an unreviewed global hook. A one-second native hook timeout prevented the later command, but descendant cleanup took about 5.6 seconds. Explicit whole-job cancellation of a long hook confirmed cleanup in about 1.05 seconds. These hook probes made no model request.
- Local diagnostic files under ignored `artifacts/` retain native receipts and screenshots. They are not committed as user data or substitutes for portable tests.

Useful local evidence: `hooks-all.txt`, `hooks-exec-final.txt`, `hooks-build.txt`, `hooks-browser.txt`, `preview-parity/report.json`, `native-model-only-proof.json`, `native-project-trust-proof.json`, `native-skill-proof.json`, and `native-hook-override-proof.json` under `artifacts/`.

## Desktop delivery

The production package for code commit `661f4fdaad0544a4d804775bc5a3e86fb4e0d284` passed source verification for 88 packaged files and both native helpers. All 76 distribution files were hash-checked while staging the installed update. The installed `resources/app.asar` was checked again and matches SHA-256 `90a52ea8302e09df065508dccc19411b1fbd7b53549756e39f7e8bab23938530`.

The update retains the previous installation in the sibling `MuseBench-backup-20261026-200739` directory and leaves profile data intact. Normal installed-app startup remains unverified: automatic approval review rejected launching MuseBench as “blocked by policy.” The isolated production-Electron parity run passed, but is not a substitute for opening the normal installation from its shortcut.

Local package/install receipts are `artifacts/personal-package-verification.json` and `artifacts/roadmap-desktop-install.json`.

## Unfinished native-dependent work

| Item | Current evidence | Required next proof |
| --- | --- | --- |
| True live steering, concurrent questions/approvals, native compaction | Installed CLI `1.4.13-R6996.1` reports Windows sandbox readiness, but MSP initialize still returns `sandboxAvailability: unavailable` without a reason. The sessionless probe confirmed host shutdown. | A supported interactive host must report sandbox availability, then exact-turn/request identity, retries and reconnect must pass real execution tests. |
| Full child-agent controls | Exec exposes observed workflow activity but not the validated attempt-specific control path. The installed native workflow execution commands are QA-only. | Real child/attempt identities, messaging, cancellation, descendants and recovery through a supported interactive API. |
| Native web tools | Two bounded `web_fetch` probes, inside and outside the Windows user profile, stalled after native network approval; process cleanup was confirmed. | Successful native fetch under the preserved permission/sandbox configuration, including cancellation and failure behavior. |

No sandbox bypass, QA-only workflow execution, invented child controls or fake completion receipt is enabled. App workflow queues and context handoffs remain useful but do not claim to be native parallel orchestration or peer messaging. Broad native saved trust and arbitrary managed/project hook configuration remain excluded; the delivered project trust and app-owned hooks are explicit, narrower paths.

Relevant upstream references: [Windows interactive-host issue 107](https://github.com/meta-models/muse-code-sdk/issues/107), [hook execution rules](https://meta-models.github.io/muse-code-sdk/next/guides/extend/hooks/), and [workflow child controls](https://meta-models.github.io/muse-code-sdk/next/generated/msp/methods/workflow-childcontrol/).
