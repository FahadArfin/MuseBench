# Remaining-feature implementation and evidence

This audit supersedes the status table in [26 October's inventory](REMAINING-FEATURES-2026-10-26.md). Earlier reports remain historical evidence. The shared MuseBench renderer is used by desktop and browser preview; external Meta/Muse pages remain labeled read-only desktop snapshots, as requested.

## Delivered in this pass

29 October follow-up: [portable extension review](VALIDATION-portable-extension-review.md) closes the direct interactive-runtime gap on macOS/Linux and checks custom XDG configuration roots. The real Windows local-echo path passed with zero model requests; native Muse execution on other operating systems is not implied.

| Area | Implementation and evidence | Practical limit |
| --- | --- | --- |
| Concurrent questions and approvals | Bounded request collection, individual selection/revisions, independent settlement and one-attempt receipts. Restored request pointers wait for full payloads; early settlement and delayed reissue have regression coverage. | Fixtures exercise concurrent/reconnect ordering. A missing payload stays blocked; unknown answers are not resent. |
| Native interactive session persistence | Saved chats store the actual native session ID, transport and access/tool settings. Exact `session/resume` reconstructs state and reconciles only matching existing run receipts. A real reconnect recalled prior information without injecting app history. | Unsupported snapshot versions, oversized history, gaps, foreign ownership and unconfirmed shutdown fail closed. This does not promise an external tool survives host death. |
| Interactive models, screenshots and reviewed hooks | Native model catalog, exact selection/readback, Provider default across reconnects, and up to four PNG/JPEG/WebP images totaling 7 MiB. App-reviewed project hooks use the existing review service. A real 512px image was interpreted correctly. | A 32px image was misclassified despite a correct native attachment receipt. Ask me approvals remain required. MSP model-step/token budgets and native execution of reviewed hooks were not established by this pass. |
| Semantic code navigation | Definition, references, implementation and hover in a bounded TypeScript language-service worker. Shared UI opens results in the chosen editor. Alias/reference tests exclude unrelated same-name matches. | TypeScript/JavaScript only, fresh disk snapshot, fixed compiler configuration, no project plugins, dependency traversal or project configuration execution. Not a general multi-language LSP client. |
| Model tool gateway | Optional session-scoped MCP exposes two fixed tools: search the four semantic operations and invoke one in the bound workspace. Trusted executable/script/environment, bounded JSONL, required startup and owned shutdown. Source Electron navigation and native session configuration admission passed without a model call. | Search returns schemas for a fixed gateway; it does not register deferred native schemas. Native model invocation and dynamic schema reload are not established by configuration admission. See [MCP contract and receipts](WORKSPACE-MCP.md). |
| Child control eligibility | Completed children no longer offer Resume; workflow-owned children no longer offer direct follow-up/reopen. Observed lifecycle and exact attempt ownership govern controls. | Installed host still rejected tested workflow retry/skip; direct-child generation was unavailable; a close acknowledgment did not produce an eligible closed projection. No fabricated success or replay. |
| Reusable hook presets | Local named templates with bounded storage, revision hashes, atomic writes and concurrent-save protection. Shared UI supports create/update/delete and loading a draft. | Loading does not grant execution. Project review/save is still required; changing or deleting a preset does not change existing project grants. Native global/managed hook files remain excluded. |
| Paired evaluation tooling and experiment | Offline-first bounded runner plus an explicitly authorized 12-run native comparison. All runs completed with confirmed shutdown in 75.665 seconds. Independent scoring and usage audit are recorded. | Both arms scored 6/6. Semantic context increased input-plus-output tokens by 2.82%; there was no measured quality gain or token saving. Two tiny tasks have a ceiling effect and task/order/cache confounds. Further model experiments need a new budget. |
| Renderer measurement | Source-identified browser and production Electron measurements on synthetic long transcripts. Production DOM-update medians: 17.3/65.2/166.6 ms at 40/200/600 messages; 36 traced Paint observations and zero page errors. Sampled JavaScript heap and owned-renderer working set are recorded. | Hidden-window Paint scheduling was about one second and is not foreground/presented-pixel latency. Measurements are not native inference performance or peak process memory. |

## Boundaries that still require a different supported contract or further proof

**29 October reviewed-hook follow-up:** Linux/macOS command projection no longer
uses a Windows-only field. A real interactive Muse 1.4.14 host executed both
reviewed events through its local echo provider, excluded unreviewed user/managed
fixtures, and shut down with confirmed cleanup and zero model requests. This
closes the earlier interactive hook-execution gap for the Windows echo path;
Meta inference and native non-Windows execution remain distinct. See
[scope and acceptance](VALIDATION-reviewed-hooks.md).

**29 October follow-up:** The Session dialog now offers an on-demand native MCP inventory. Muse 1.4.14 returned the actual session-scoped gateway configuration and authorization facts in an isolated zero-model probe with confirmed shutdown. This corrects the earlier inventory-query limitation; it does not establish model tool invocation, tool health or dynamic schema reload. See [MCP contract and receipts](WORKSPACE-MCP.md).

**29 October failure handling:** Seven isolated local-echo cases now establish native required/optional MCP startup behavior, initialization errors, timeout and name-collision rejection. The adapter no longer discards the native terminal explanation, so failed requests retain a bounded, filtered reason in saved activity. Model-issued tool use and dynamic schema reload remain separate acceptance work. See [failure handling evidence](VALIDATION-native-failure-reasons.md).

**28 October follow-up:** Native child activity inspection now uses the observed child's `session/read` identity. Messages, tool output, and reported worktree/token facts appear in a bounded, on-demand disclosure. A read-only Muse 1.4.14 probe returned four real child items without loading the child or starting a model turn. [Implementation and validation](VALIDATION-child-inspection.md). This does not establish the remaining lifecycle operations below.

- **Native peer messaging:** the official Muse contract excludes Windows/headless sessions. Existing explicit MuseBench context handoffs remain available; they are not native peer sessions.
- **MSP budgets:** no supported per-turn model-step/token member was found in the pinned schema. Ignored configuration keys are not a valid workaround. Exec budget controls remain separate.
- **Full child lifecycle acceptance:** eligibility corrections are delivered, but the host must expose a supported direct/recoverable/closed child before follow-up/resume/reopen can be proven. Attempt-specific workflow rejections are retained in the report.
- **Muse-native read aloud:** the documented voice API transcribes speech. No supported synthesis endpoint or voice/auth contract was found. Local system read aloud remains available; no unrelated provider was substituted.
- **Arbitrary managed extensions:** reviewed project MCP configuration is now supported through a source-bound approval in Customize, including repository layers and worktrees; native 1.4.14 loading was verified with local echo, without model calls. See [project MCP evidence](VALIDATION-project-mcp.md). This does not authorize arbitrary managed MCP/plugin/hook sources, and model-issued tool execution remains a separate acceptance gate.
- **Installed plugin MCP approval:** Customize now inspects and explicitly approves/revokes individual supported plugin MCP servers through the official CLI. Separate app grants bind the exact package and native approval, and relevant tool changes require reconnecting. Native 1.4.14 loading/discovery passed with isolated echo; model-issued tool use, other capability kinds and custom XDG plugin stores are not claimed. See [plugin tool evidence](VALIDATION-native-plugin-mcp.md).
- **Pi/Linux alternative runtime:** this remains a conditional integration requiring a chosen provider, credentials, permission/session conformance and a verified host. Existing Muse login is not assumed transferable. Windows Full access is not a sandbox repair.

## Detailed research and receipts

- [Protocol, restoration, model, image and hook research](research/protocol-remaining-2026-10-26.md)
- [Semantic navigation scope and tests](research/semantic-navigation-2026-10-26.md)
- [Native child lifecycle retries](research/child-lifecycle-2026-10-26.md)
- [Voice, extension and alternate-host source research](research/extensions-voice-remaining-2026-10-26.md)
- [Native comparison design, raw-evidence hashes and results](research/native-comparison-2026-10-27.md)
- [Renderer performance and evaluation tools](research/performance-evaluations-2026-10-26.md)

Feature commits are pushed individually to `main`. The desktop updater receives only a release built from a stable Git commit. Local test/preview/native receipts and GitHub CI/release results are distinct; the final delivery report records the final checked revision and validation state. The user's running installation and profile are not replaced during this work.

Local integration validation: **862 tests passed**, production TypeScript/Vite build passed, browser smoke passed, and **84 browser/production-Electron UI scenes** matched controls/styles/geometry within one pixel. A clean Windows package matched all **115 source/build files and both native helpers**. Its packaged Electron/ASAR MCP process resolved a real definition and exited cleanly; separate native session configuration admission passed with zero model calls and confirmed shutdown. Direct gateway execution remains distinct from an actual model-issued MCP invocation.

An initial local archive built while sources were changing failed byte verification. It was discarded and rebuilt after all packaged sources were frozen; no installer from that failed archive was published. Two earlier CI failures came from test fixtures that predated required native model discovery and the new capability row; those fixtures were corrected. Check the latest workflow results rather than interpreting an earlier failed or superseded run as the final release state.

Fresh CI also exposed Electron 45's first-import binary download: parallel helper tests both initialized the same missing distribution, causing `spawn EBUSY` during extraction. The sequential `pretest` phase now resolves Electron before starting parallel tests. Real Electron subprocess checks remain enabled; no retry or skip masks a startup failure.
