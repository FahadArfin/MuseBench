# Harness feature validation — 26 October 2026

All seven recommendations in [FEATURE-GAP-RESEARCH.md](FEATURE-GAP-RESEARCH.md) are implemented in the local Windows build. This is a local unsigned release, not a published installer or a claim of provider feature parity.

## Fresh checks

| Check | Result | Evidence |
| --- | --- | --- |
| Complete unit/regression suite | 558 passed, 0 failed | [test output](../artifacts/harness-gaps-all-tests.txt) |
| New controller behavior and shutdown regressions | 21 passed | [focused output](../artifacts/queue-runtime-preflight-green.txt) |
| TypeScript, native helper checks and Vite build | Passed; existing large-bundle advisory remains | [build output](../artifacts/harness-gaps-build.txt) |
| Existing navigation, keyboard, responsive and persistence paths | 18 passed; no renderer errors | [source UI report](../artifacts/redesign-ui/source-gQYb3M/report.json) |
| Slash command regression | 14 passed; no renderer errors | [slash report](../artifacts/slash/source-7z1wxI/report.json) |
| Packaged feature UI | 7 passed; no renderer errors | [packaged report](../artifacts/harness-gaps-ui/packaged-oIa5Hw/report.json) |
| Official Muse end-to-end request | Two completed native exec turns; cleanup confirmed | [live source report](../artifacts/harness-gaps-ui/source-enmL6V/report.json) |
| Windows packaging | Passed | [package output](../artifacts/harness-gaps-package.txt) |
| Exact packaged content | 57 files and both native helpers match | [hash verification](../artifacts/harness-gaps-package-verification.json) |

The live test used a disposable project and app profile. A source file larger than the short positional-prompt threshold contained a known code word; the first turn acknowledged it, and a queued second turn recalled that word from the retained file snapshot. Both turns used the official installed Muse CLI with sandbox verification and Ask for approval. No source files were edited by the model. This live test preceded the final shutdown-edge-case fixes; those later changes passed focused regressions and the packaged UI check. No additional paid model requests were needed to verify the unchanged context transport.

Screenshots of context inspection, branching, chat search and the 430px layout are saved alongside the packaged report. Visual inspection confirmed native dark-theme styling and usable modal layouts. The existing responsive regression also checks 390px, 1280px and 1440px layouts.

## Review and preservation

Independent review identified and verified fixes for per-chat draft targeting, failed/cancelled outcome retention, persistent queue holds and shutdown/preflight races. Red/green reproductions cover a pending enqueue, an already scheduled source read, delayed connection, and runtime preflight cancellation. The final bounded review reported no remaining findings.

Official Meta/Muse website partitions and account storage were not modified. Test runs used isolated app profiles. The normal app was reopened with its existing profile. No credentials were collected or reconfigured, and no sandbox-disable flags were introduced.

## Practical limits

- Conversation continuity is bounded replay (64,000 characters), not native session resume. Hidden reasoning/tool state is not retained; omitted/shortened history is shown in the inspector.
- File context is explicit and capped at eight snapshots / 24,000 combined characters. Historical snapshots are not refreshed silently.
- Queues are serialized, limited to five entries and require explicit resumption after pauses, failure or restart.
- Branching copies conversation context and an editable draft; it does not roll back files.
- Non-Node folders open normally; built-in npm checks/previews still require appropriate npm scripts. Other commands use Muse's existing sandboxed shell.
- Cross-account live personal-chat login was not re-tested in this feature batch; the relevant integration code and saved profiles were preserved.

Archive SHA-256: `f901e874578bdc4c817a20bec1b8f1cf8ea46ed4f3e435b72eaae3161191e1aa`.

Executable SHA-256: `3109f868f95472f93bed590055eb65ae37abfe7a7de5cb511e8373ed08fdcfee`.
