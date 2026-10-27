# Bounded native navigation-context comparison

This study compares the same native Meta model with and without app-prepared semantic context. It is a small harness-aid experiment, not a general model benchmark or proof of automatic model-tool discovery. The owner authorized at most 12 short native Muse runs, at most 20 minutes from the first model submission, using the existing Muse login. No separate provider or API credential is used.

## Frozen design

Two hand-authored TypeScript navigation tasks, three repetitions, and two arms produce 12 scheduled runs. Seed `20261027` shuffles task order within repetitions; seeded SHA256 ranking counterbalances arm order so three pairs begin with each arm. Every run gets a fresh owned temporary fixture directory and a fresh native session ID.

- **Alias definition and calls:** follow an aliased re-export to its original function, then identify its two call sites while excluding an identically named function in a different module.
- **Interface implementations and return type:** identify two classes implementing the selected interface, exclude a same-named legacy interface, and report a factory's declared return type.

Both arms receive identical fully supplied, numbered source files and the same question. `baseline` receives that ordinary source question. `semantic` appends actual `createSemanticNavigation` definition/references or implementation/hover results. The semantic results are collected once before any model call and frozen with their workspace snapshot and TypeScript engine identity. No expected answer is included in the extra context.

The fixture source, expected answer, exact prompts, prompt/source hashes, schedule, native model catalog, selected model, CLI version/binary hash, source revision, adapter hash and relevant runtime source hashes are persisted in `frozen-study.json` before the first call. That file is created exclusively and cannot be overwritten by a repeat invocation using the same output directory.

The model is selected once from the current native catalog and explicitly reused for every arm: provider `meta`, reasoning `low`, one model step, built-in `empty` preset, Ask me profile, sandbox retained, shell/write/web disabled, no configured user MCP servers, no reminders, no user-input tools, no foreign personal context, and no app hooks. The study refuses configured user MCP servers; the existing runtime separately checks managed and project configuration. The underlying Windows Job owner provides cleanup receipts. No user repository or saved profile settings are edited. Native session logs and owned temporary fixture files are retained for audit.

This deliberately isolates supplied navigation evidence. It does not measure autonomous file discovery or a tool-calling workflow; both arms already receive the entire tiny corpus. Semantic context adds prompt material and need not reduce tokens.

## Independent scoring and accounting

Expected locations and types were written independently of model responses, before any calls. A deterministic scorer parses the entire final response as JSON, with one optional surrounding JSON code fence. Object-key and array order do not matter. Wrong values fail their top-level field; extra top-level keys or non-JSON prose fail the response. Each task has two equally weighted fields, so a result scores 0, 0.5 or 1. Native process completion is separate from task correctness. This follows the official distinction that a successful [headless run](https://dev.meta.ai/docs/muse-code/extending) does not prove that the work is correct.

Every result records exact requested/observed model and session identities, native status, final output, activity, usage coverage and shutdown. Provider token counters are used only when all reported native runs have usage. Input, cached, output and reasoning tokens are reported separately; cached tokens are not subtracted from input totals. Missing usage remains unknown. Monetary cost remains unknown because native usage does not provide a verified price or billed amount. No token total is called a bill.

Each run has a 90-second wall-clock stop covering connection and submission, with separately bounded cleanup. The next run starts only if a full 90 seconds remain in the overall 20-minute budget. A failure, unknown result or unconfirmed cleanup stops the study without retry. The model step cap and invocation cap bound this experiment, but are not monetary billing controls.

## Reproduction and tests

```powershell
node --test test/harness-eval-muse.test.mjs
node scripts/harness-eval-muse.mjs --prepare-only --out artifacts/native-comparison/prepared
# Run only with explicit authorization for the native experiment:
node scripts/harness-eval-muse.mjs --execute-native --out artifacts/native-comparison/approved-run
```

The native study is never invoked by the test suite. Preparation and seven tests verify the real semantic worker results, frozen paired schedule, canonical scoring, usage coverage, execution opt-in, tool-disable flags, and run/time admission bounds without model calls.

## Results

Completed **12 of 12 native runs** from `2026-10-27T04:14:04.021Z` to `04:15:19.686Z`: **75.665 seconds** from first submission, versus the 20-minute bound. All 12 used `muse-spark-1.3-contributor`, provider `meta`, low reasoning and one model step. All 12 fresh native session identities matched their requested IDs, all six pairs completed, all native shutdowns were confirmed, and no request was retried. Native token usage covered all 12 runs. The installed host was Muse Code `1.4.13 (1.4.13-R6996.1)`.

| Measure | Baseline, six runs | Semantic context, six runs | Semantic minus baseline |
| --- | ---: | ---: | ---: |
| Fully correct outputs | 6 / 6 | 6 / 6 | 0 |
| Mean rubric score | 1.0 | 1.0 | 0 |
| Reported input tokens | 94,223 | 97,113 | +2,890 (+3.07%) |
| Reported output tokens | 2,099 | 1,929 | −170 (−8.10%) |
| Input plus output tokens | 96,322 | 99,042 | +2,720 (+2.82%) |
| Cached tokens, separately reported | 9,713 | 0 | −9,713 |
| Reasoning tokens, separately reported | 1,753 | 1,597 | −156 |
| Native model calls | 6 | 6 | 0 |
| Monetary cost | Unknown | Unknown | Unknown |

Every task/arm/repetition received both rubric points. Thus every paired score difference is zero. This study demonstrates **no accuracy gain and no token savings**. The semantic arm used fewer output tokens in aggregate, but added more input tokens than it saved in output. Cached and reasoning counters are reported separately and are not added again to the input-plus-output row. No price or monetary savings is inferred.

The two complete corpora contain six small files each. Baseline prompts are 1,498 and 1,689 characters; semantic prompts are 3,391 and 3,027 characters. Their small size and perfect baseline performance create a ceiling effect: these results cannot establish the aid's value for larger or harder repositories. The additional context also retains navigation metadata; a more concise representation is a distinct future experiment, not a demonstrated improvement.

The seeded schedule happened to place the interface task first in every repetition, semantic first for all three interface pairs, and baseline first for all three alias pairs. Arm-first counts are balanced overall, but order is confounded with task. One baseline alias run reported the entire 9,713 cached-token count. Native context/bootstrap differences also cause small input-token variation despite identical app prompts. These limitations, stochastic outputs, the tiny task sample and uncontrolled service/machine load rule out an accuracy, latency or cost generalization. No inference-speed claim is made from the elapsed values, which include local preflight and shutdown.

### Evidence and verification

The successful immutable study and raw evidence are under `artifacts/native-comparison/approved-2026-10-27-v2/`:

- `frozen-study.json`: complete source, independent rubric, prompts, semantic results, schedule and configuration. SHA256 `9d37fccbe7e8247d41c9e1ecd73b76713635ff47afb55beae095daeba4e072e9` was independently rechecked against the report.
- `report.json`: ordered outcomes, usage coverage, complete pairs and limits.
- Twelve `run-*` directories: exact prompt, unmodified native JSONL events, and per-run result.
- `independent-audit.json`: separate readback of native input/usage records, saved prompt equality, native call counts and unchanged fixture source files.

The frozen source revision was `f704548ff86ea3966985f88ebd28d5fc86b0b9c8`, with concurrent uncommitted feature work recorded through individual implementation hashes. Native binary SHA256 is `239c993cedc3768a99103a90b2f7e3d560375036104980e30227ffebf9de0303`; executed adapter SHA256 is `bb77db3c2fcd2ff299905d250e36d76a8f8e353b5f079deead10d9a26d407de5`; semantic-worker SHA256 is `ee542a376bb88c6bfe725a91151bf796b2a461a3e47505e8c08d624a2320b95b`. Source hashes take precedence over the dirty checkout's commit label.

An earlier attempt in `artifacts/native-comparison/approved-2026-10-27/` stopped during the inert **echo** preflight: the native CLI refused a whole-map `-c mcp_servers={}` override. It made **zero Meta submissions**, had no started model budget, and confirmed shutdown. The adapter was corrected to verify that user MCP configuration is absent and use the existing runtime's managed/project configuration guards. A separate echo-only check completed before the successful study began. This was a known local startup failure, not an unknown model run replay; total actual Meta calls across the comparison work remained exactly 12.

Seven adapter tests pass without model calls. Final model outputs were inspected against the frozen locations and types, and all were correct. Further native experiments require a new explicit budget; this study's 12-run authorization is exhausted.
