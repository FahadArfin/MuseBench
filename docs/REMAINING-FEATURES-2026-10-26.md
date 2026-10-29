# Remaining features and retry results

Audited 26 October 2026 (local time). This inventory supersedes the earlier delivery notes' blocker summaries; their dated test evidence remains historical. Scope: the Muse CLI and Pi/OpenCode/Hermes/DeepSeek recommendations, plus the earlier native voice request.

**29 October extension update:** installed native plugin MCP tools and hooks now have independent inspection, approval and revocation in the shared Customize UI. Hook source manifests are checked alongside native projections; broader imported/global/managed semantics remain excluded. See [plugin MCP validation](VALIDATION-native-plugin-mcp.md) and [native hook acceptance](VALIDATION-native-plugin-hooks.md) for exact execution evidence and remaining limits. The table below is the historical 26 October baseline, not a claim that subsequently delivered features are still entirely missing.

## Retried and delivered

| Feature | Result |
| --- | --- |
| Native web search and fetch | `4fe710b`: enabled for explicitly Full-access exec connections. Separate real native fetch and search completed with tool receipts and confirmed shutdown. Sandboxed web is not claimed repaired. |
| Answer native agent questions | `e0db3f3`: shared single/multiple selection, typed answer, decline, and engagement UI. Exact request binding, stale-event protection, one-attempt delivery, unknown receipts, and durable confirmed answers. Real native question, answer, continuation, terminal completion and shutdown passed. |

Native steering (`2e5e11d`), compaction (`d1f88af`), and child messaging/interruption (`596e96c`) were already implemented and tested before this retry. They should no longer be described as entirely blocked. The first four features and the twelve app-owned open-source-harness improvements are also delivered; see their individual ledgers.

## Still incomplete or not verified

| Feature | Current boundary and retry result | What remains |
| --- | --- | --- |
| Full native child-control coverage | Child messages and interruption have real success evidence. Generated workflow-child follow-up was retried and again rejected by the installed host with `subagent_state_ineligible`. Other attempt-specific operations have implementation/fixture coverage, not universal live proof. | Supported eligible child lifecycle and real end-to-end follow-up/restart/resume/reopen acceptance tests. No automatic replay after unknown results. |
| Concurrent native questions and approvals | One request is handled. Overlapping distinct pending requests still close the connection without deciding either. New ordering tests cover early questions and previously settled IDs, not simultaneous independent requests. | Request collection, per-request identity/revision, independent settlement and reconnect reconciliation. |
| Interactive session restoration | Exec sessions persist and have native recall evidence. Interactive MSP currently owns a new session and replays bounded app history, including newly persisted confirmed answers. | Restore the native MSP session itself, reconcile interrupted operations, and reattach pending work without duplicate execution. |
| Feature parity between exec and interactive mode | Screenshots, saved native sessions, explicit model selection, execution budgets and reviewed hooks are implemented on exec. Interactive mode currently requires the default model, Ask for approval and no exec budget preset; screenshot transport is exec-only. | Extend and verify those controls in MSP rather than imply that every connection supports every feature. Exec does not answer interactive questions/approvals or perform true live steering. |
| Native peer-to-peer session messaging | MuseBench context handoffs work. Official native peer messaging still excludes Windows and headless sessions; this is separate from working parent-to-child messaging. | Supported host/transport or a separately evaluated adapter. [Current official scope](https://dev.meta.ai/docs/muse-code/session-messaging). |
| Semantic code navigation | Compiler/linter diagnostics and the Workspace tools directory are delivered. Definition/reference/implementation/hover model tools are not. | One bounded language-server integration, reviewed startup, workspace binding and a measured navigation benefit. This is integration work, not a demonstrated upstream impossibility. |
| Dynamic model-tool discovery | The app's searchable tool directory is implemented. It does not dynamically expose/defer model-visible native tool schemas. | Supported native/MCP protocol proof, lifecycle limits, permission checks and evaluation. |
| Broad native extension configuration | Reviewed user MCP/plugin configuration, project instruction/skill trust, and bounded app-owned hooks exist. Arbitrary project/managed MCP, global hook configuration and blanket native trust remain excluded. | Explicit review/provenance and native execution coverage for each additional configuration surface. Do not remove guards to call this complete. |
| Muse-native read-aloud voice | Read aloud uses local system speech synthesis; Windows dictation is a separate existing feature. No Muse synthesis API integration is implemented or verified. | A supported text-to-speech endpoint/SDK, voice/auth requirements and playback testing. [Muse Voice Transcribe](https://dev.meta.ai/docs/speech-to-text) is speech-to-text, not read aloud. Official [interactive docs](https://dev.meta.ai/docs/muse-code/interactive) and [changelog](https://dev.meta.ai/docs/muse-code/changelog) conflict on Windows voice-input availability, so the old blanket Windows-voice blocker is not reliable. |
| Comparative model evaluations | Regression suites and synthetic controller throughput measurements exist. Paired model-quality/token-cost experiments have not run. | Agreed bounded experiment budget, comparable task sets, repeated arms and independent scoring. No measured model-quality or native token-savings claim. |
| Broader performance acceptance | Progress coalescing and controller timing were measured. Peak renderer memory, event-to-paint latency and native inference speed were not established by that benchmark. | Browser/Electron profiling under representative long transcripts and concurrent native workloads. |
| Optional Pi adapter / alternative Linux host | These were conditional research experiments, not shipped alternate runtimes. The Windows Full access workaround is implemented; it is not a sandbox repair. | Separate provider/auth/session/permission conformance and host validation if an alternate runtime is chosen. |

## Verification and delivery

- 750 automated tests passed; production TypeScript/Vite build passed.
- 71 browser-preview/production-Electron scenes matched shared controls, styles and geometry within one pixel. These use fixtures and prove UI parity, not native backend execution.
- Separate real native runs proved web search, fetch and question answering. One question probe could not send after connection; a subsequent isolated retry completed. Host startup is not claimed infallible.
- Independent review identified early-input ordering, unseen settlement and answer persistence issues; all were fixed with regressions. Follow-up review reported no remaining material finding.
- Windows package verified: 110 source/build files and both native helpers match the current source. The installed running desktop was not replaced during this task; the updated package is ready at `release/win-unpacked`.
- Feature commits were pushed separately to `origin/main`. The last checked GitHub Actions run could not start because of account billing/spending limits; local validation is not a green remote CI claim.
- Ignored local evidence: `artifacts/roadmap-revalidation/`, `artifacts/native-children-followup-retry.json`, `artifacts/remaining-retry-full-tests.txt`, `artifacts/input-parity.txt`, and `artifacts/remaining-retry-package.txt`.

The embedded Meta/Muse website remains a labeled read-only desktop snapshot in browser preview, per the chosen preview design. Shared MuseBench controls are live; a snapshot is not an interactive replica of the external site.
