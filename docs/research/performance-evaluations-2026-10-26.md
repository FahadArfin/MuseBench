# Paired evaluations and renderer profiling

26–27 October 2026, local Windows development checkout. This delivers reproducible developer tools and a renderer baseline. It does **not** establish improved native model quality, token savings, native inference speed, production Electron performance, or a memory upper bound. No external model requests were made. No running desktop or user profile was opened or modified.

## Run the tools

From the repository root:

```powershell
node --test test/harness-eval*.test.mjs
node scripts/harness-eval-fixture.mjs
node scripts/harness-eval.mjs artifacts/harness-eval/fixture/manifest.json --out artifacts/harness-eval/fixture/replayed-report.json
node scripts/renderer-performance.mjs --samples 12 --turns 20,100,300 --out artifacts/renderer-performance/my-run
```

These use existing Node, Vite and Playwright dependencies. No package manifest changes are required. Chromium must already be available to the installed Playwright package. Reports, traces, allocation profiles, screenshots, and fixture inputs are written below the already ignored `artifacts/` directory. The renderer tool starts its own loopback server on an automatically assigned port, uses fresh ephemeral browser contexts, blocks page requests outside that server's origin, and closes the server/browser it owns.

## Paired experiment contract

`scripts/harness-eval.mjs` accepts versioned JSON. There are exactly two arms; the first is the baseline. Tasks have stable IDs, inputs and independently authored expected assertions. Repetitions must be 2–100, task count 1–100, and the explicit unsigned seed fixes the order. Each repetition shuffles tasks and independently shuffles the two arms for each task. Both arms receive the same task input. The scorer performs case-sensitive exact/contains/excludes checks; it ignores adapter-supplied scores and does not send expected answers to command adapters.

Example offline manifest:

```json
{
  "version": 1,
  "seed": 42,
  "repetitions": 2,
  "tasks": [
    {"id": "sum", "input": "Return only the sum of 2 and 2.", "expected": {"exact": "4"}}
  ],
  "arms": [
    {"id": "baseline", "artifacts": {"sum": ["baseline-0.json", "baseline-1.json"]}},
    {"id": "candidate", "artifacts": {"sum": ["candidate-0.json", "candidate-1.json"]}}
  ]
}
```

Each artifact is UTF-8 JSON:

```json
{"output":"4","usage":{"inputTokens":12,"outputTokens":1,"costUsd":0.0001},"latencyMs":800}
```

The numbers above illustrate the schema; they are not measured provider pricing or usage. Only `output` is required. Absent or null counters are `null` in results. Negative, nonfinite or fractional token counts fail that run. Totals remain unknown when any constituent run is unknown; `knownSubtotal` and its coverage are reported separately. `reportedLatencyMs` comes from the artifact, while `runnerElapsedMs` measures local read/parse/command time. Offline processing time is never presented as inference latency.

Artifact paths are relative to the manifest directory and must be distinct within each arm. This prevents accidentally treating the same path as several repetitions. Distinct paths cannot prove independent acquisitions: experiment owners must retain session/model/revision/seed provenance and avoid copied outputs. Randomizing offline analysis order does not retroactively randomize model generation. Use exported `scheduleRuns(manifest)` to plan acquisition, or use command arms to execute in that order.

The report records ordered runs, task/repetition pairs, output/artifact SHA256, manifest SHA256, deterministic checks, per-arm completion and usage coverage, and mean candidate-minus-baseline score over complete pairs. Failed acquisition/invalid JSON/timeouts are reported as failed runs and excluded from paired score differences. Always inspect `completePairs` and failed runs before comparing means; the tool does not silently convert failures into quality scores. CLI exits nonzero when any run fails. A scored answer that fails assertions remains a valid measured result, so an imperfect quality score alone does not make execution fail.

Literal checks are a bounded objective scorer, not an independent general-purpose code review. Freeze the corpus and rubric before acquisition. For code-quality experiments, retain independent test/reviewer evidence separately; an adapter reporting that its own tests passed is not independent validation. The scorer has no access to private provider reasoning and makes no assumptions about hidden/cached token accounting.

### Explicit command execution

Replace an arm's `artifacts` with a `command` object:

```json
{"id":"candidate","command":{"file":"C:/Program Files/nodejs/node.exe","args":["C:/experiments/adapter.mjs"],"cwd":"C:/experiments/candidate-workspace"}}
```

Commands require both `--execute` and an explicit budget JSON file:

```json
{"maxRuns":4,"timeoutMs":60000,"maxOutputBytes":1048576}
```

```powershell
node scripts/harness-eval.mjs artifacts/harness-eval/experiment/manifest.json --execute --budget artifacts/harness-eval/experiment/budget.json --out artifacts/harness-eval/experiment/report.json
```

`maxRuns` covers command invocations, not offline artifact reads. Timeout is per invocation and bounds must be valid before any command starts. All artifact paths are checked for existence before execution begins. The executable and argument array are launched without a shell, with an explicit working directory. stdin receives one JSON object containing `version`, `taskId`, `input`, zero-based `repeat`, and `seed`. stdout must contain exactly one result JSON object. stderr and stdout share the output byte bound; stderr content is not copied into reports. Command outputs are hashed/scored but not stored verbatim by the runner, so adapters should retain raw evidence in an approved local artifact directory when needed.

Timeout/output overflow stops the owned subprocess tree on Windows and records an unknown execution outcome without replay. This is not a sandbox or transactional cancellation. Commands inherit the calling environment, may change their explicit workspace, and must be reviewed. Adapters must not detach processes or reuse a dirty workspace between arms/repetitions. A local timeout cannot guarantee that a remote provider stopped work, and Unix child-tree containment is not implemented. Never automatically retry an unknown result.

Before any real provider experiment, the owner must choose the task corpus and success rubric, model/configuration for each arm, repeat count, approved authentication, isolated workspaces/session reset strategy, provider-enforced token limits and maximum spend. The local process budget is **not** a provider billing cap. No paid/native comparison was run in this task; that remains a budget and provider-adapter prerequisite.

### Fixture verification

`harness-eval-fixture.mjs` emits deliberately artificial arithmetic/constraint answers. It creates 12 rows, six complete pairs, and no token/cost observations. The expected mean paired score delta is 1/3 because the synthetic candidate satisfies two additional literal constraints on one of two tasks. This demonstrates calculation only. It is not evidence of one model outperforming another.

The focused tests cover repeated randomized pairing, invalid experiment bounds, independent scoring, artifact hashes, unknown usage propagation, opt-in execution, invocation budgets, real local command stdin/output, malformed usage, timeouts, output caps, missing-artifact preflight, missing paint samples, trace thread/timestamp correlation and renderer workload bounds. All 13 focused tests passed. A full `npm.cmd test` snapshot also passed 795/795; its raw log is `artifacts/performance-evaluations-full-tests.txt`. Other feature work was in progress in the shared checkout, so the integration owner should run the final combined suite after all feature edits settle.

## Shared renderer workload and measurement

`renderer-performance.mjs` loads the real preview entrypoint and shared React renderer. A browser initialization hook wraps the sample bridge's state subscription; it injects four tasks with the same transcript length. Each task has alternating user/assistant messages, headings, lists and code blocks. Only the selected task is displayed. Every sample updates the last assistant message in all four tasks and publishes a full structured-cloned snapshot to the real React subscription. It does not replace the rendered DOM with a separate synthetic page.

Each scenario uses a fresh browser context, waits for the expected assistant count, scrolls to the streaming tail, performs a warm-up update, and forces garbage collection outside the timed samples. The timer starts immediately before the fixture mutation and full-state clone/publication. A MutationObserver marks when the selected transcript contains the new marker. Double `requestAnimationFrame` records a subsequent frame opportunity. Chromium tracing records user-timing marks and main-thread `Paint` events. Reported event-to-paint is the first Paint on that same process/thread after the DOM observation and before the second animation frame. Missing Paint events remain null; they are not replaced with frame-proxy times.

This captures clone/publication, React work and a browser paint event. It excludes native inference, controller/disk delivery and Electron IPC. A Paint event is not a GPU presentation timestamp or a guarantee that one particular node has finished rasterizing. The second animation callback is separately named `eventToFrameOpportunityMs`, because animation callbacks run before repaint. A final screenshot confirmed the streaming marker was visible in the selected transcript.

The tool samples `Runtime.getHeapUsage` before/after each workload and after each update, writes a sampled allocation stack profile, and records post-GC retained heap before/after. `observedMaxUsedBytes` is the largest sampled V8 used heap value. It is not peak renderer memory/RSS, off-heap DOM storage, GPU memory or proof of a leak. Tracing, allocation profiling, Vite development React and other local workloads affect absolute timings.

Environment for the measured runs: Windows 10.0.26300 x64, Node 22.14.0, headless Chromium 156.0.8078.4, AMD Ryzen 7 9800X3D, 16 logical CPUs, 33,914,454,016 bytes system RAM, 1440×960 viewport. Each run contains 12 measured updates per scenario. The first run's source revision was `cdc7b2481324c81a9d4aaedcaa571b7cc8cfba0a` with ongoing uncommitted feature work; revision alone is not the exact source identity. The finalized tool records SHA256 for the preview/shared UI sources and checks that they remain unchanged through the run.

| Visible messages / tasks | Snapshot bytes before updates | Run 1 paint p50 / p95 | Run 2 paint p50 / p95 | Run 1 / 2 sampled max used heap |
| --- | ---: | ---: | ---: | ---: |
| 40 / 4 | 133,869 | 50.96 / 115.61 ms | 49.79 / 101.27 ms | 36.42 / 37.40 MiB |
| 200 / 4 | 641,769 | 170.72 / 268.72 ms | 156.39 / 244.20 ms | 79.03 / 78.66 MiB |
| 600 / 4 | 1,913,769 | 568.17 / 766.62 ms | 574.31 / 709.36 ms | 155.52 / 148.64 MiB |

All 72 samples across these two runs had trace-observed Paint events. All scenarios rendered the expected message counts without page errors. Run 1 had 1,901 / 5,181 / 13,381 DOM elements; post-GC retained V8 heap increased by 0.51 / 0.79 / 2.85 MiB across 12 updates. That short retained delta is not a leak verdict. Raw reports and traces are under `artifacts/renderer-performance/2026-10-26-run1/` and `2026-10-26-run2/`; these first two exploratory runs predate the explicit source stability check.

A final run with source hashing and stability enforcement also completed with zero page errors and all 36 Paint observations. Its report at `artifacts/renderer-performance/2026-10-26-run3/report.json` records revision `4b2bcac3152965e788316f172bea723029ebca50`, a dirty working tree, exact source hashes and `sourceChangedDuringRun: false`. At 40 / 200 / 600 visible messages, paint p50 was 65.92 / 240.37 / 676.89 ms, p95 was 126.12 / 394.63 / 755.01 ms, and sampled maximum used heap was 41.06 / 87.14 / 173.33 MiB. The machine was not reserved exclusively for profiling; the between-run variation is another reason to retain all runs and avoid a precise production performance claim.

The observed scaling justifies investigating repeated long-transcript React/Markdown work. It does not by itself identify a bottleneck, prove that virtualization is the right change, or establish a production regression. Next acceptance work should profile the packaged Electron renderer, keep equivalent task/message/cadence fixtures, measure real concurrent native delivery separately, include OS process memory and a longer retention test, and agree thresholds before comparing changes.

## Primary API references

- [Playwright CDPSession](https://playwright.dev/docs/api/class-cdpsession): CDP transport and session commands used by the probe.
- [Chrome DevTools Runtime.getHeapUsage](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-getHeapUsage): V8 heap metrics, distinct from process RSS.
- [Chrome DevTools HeapProfiler](https://chromedevtools.github.io/devtools-protocol/tot/HeapProfiler/): sampling and garbage-collection commands.
- [Chrome DevTools Tracing](https://chromedevtools.github.io/devtools-protocol/tot/Tracing/): bounded trace stream capture.
- [requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame): callbacks occur before repaint, which is why frame opportunities and trace-observed paints are separate metrics.
