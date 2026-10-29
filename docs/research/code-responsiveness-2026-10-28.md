# Muse Code responsiveness audit

Measured locally on 28 October 2026 against baseline commit `7bac58eedc279685fedb0271a74ccd04e443321d`. All workloads used fictional chats and temporary projects. No saved user conversations, microphone, or model requests were used.

## Changes implemented

- **Settled responses no longer reparse on every update.** `App.tsx` memoizes Markdown by its text and keeps Markdown component definitions stable. Previously each parent update replaced code-block components, also resetting their Copy state. Response actions use primitive props and a stable branch callback. Chat-specific keys isolate feedback and activity disclosure state when message IDs repeat across chats.
- **Collapsed tool output mounts when opened.** `WorkActivity.tsx` avoids building hidden activity trees. The disclosure container stays mounted for its accessibility relationship, and opening it renders the current output.
- **Chat switching captures project files once.** `selectProject` reads a fresh snapshot after navigation cleanup, then uses it for revision invalidation and diffs. This still detects external edits and writes completed during runtime shutdown. Canonical-path, baseline, symlink, and size checks remain. Git metadata is read after cleanup too.
- **Scrolling checks fewer prompt positions.** The shared prompt timeline uses binary search over live DOM positions and a bottom fast path. It updates only the previous and next active markers. It does not cache coordinates that could become stale when content grows.
- **Typing keeps one dictation subscription.** A stable subscription reads the latest draft callback. Capture identity, context, and active-state guards reject speech from a previous chat, including the interval before passive effect cleanup. Device availability/language updates still reach the composer while recording is inactive. Immediate draft saves remain unchanged.

The navigation change has an explicit failure-path tradeoff: an unreadable target can now be discovered after stopping the previous preview/check or pausing continuation. The selected chat/project stays unchanged on that error. An extra full preflight scan would restore the earlier ordering but also restore the duplicated source reads.

## Measurements

### Streaming renderer

The same probe ran six updates per scenario in headless Chromium 156, using the real shared React preview under Vite development mode, at 1440 by 960. Each fixture contained four chats; the selected chat had alternating user/assistant messages with Markdown and code. Each update published a structured-cloned snapshot and changed the last answer. Probe hashes match before/after, source hashes were stable during each run, and every sample had a matching trace Paint event.

| Turns in selected chat | Event to DOM, median before / after | Event to Paint, median before / after |
| --- | --- | --- |
| 20 | 37.0 / 9.0 ms | 48.9 / 15.4 ms |
| 100 | 146.9 / 11.0 ms | 157.5 / 15.8 ms |
| 300 | 458.6 / 23.3 ms | 479.4 / 28.4 ms |

At 300 turns, sampled peak V8 heap was 123.7 MiB before and 52.2 MiB after. This is a sampled high-water mark, not total app memory or proof of a memory leak fix. DOM count stayed at 13,421: this change avoids repeated work rather than removing transcript rows.

These are small synthetic samples, not end-to-end native latency or a scrolling frame-rate guarantee. The table uses a final run after the availability-refresh correction. An earlier after-change run had a 300-turn event-to-DOM median of 18.6 ms but a maximum of 184.4 ms, illustrating timing variance. The controller currently retains up to 150 messages in its active task snapshot, so 100/300-turn fixtures deliberately exceed normal retained transcript size. The probe also places full synthetic chats in its task list, whereas native state uses summaries. Do not extrapolate these measurements to provider inference speed.

Local reports: `artifacts/renderer-performance/2026-10-28-code-audit-v2/report.json`, `artifacts/renderer-performance/2026-10-28-code-final/report.json`, and the earlier after-change run at `artifacts/renderer-performance/2026-10-28-code-after/report.json`.

### Chat selection

Real controller, filesystem, and SQLite; two synthetic chats; five switches per case on Node 22.14.0 and Windows. The final after measurement includes the reviewed Git metadata ordering fix.

| Project source files | Median before | Median after | Source opens per switch |
| --- | --- | --- | --- |
| 0 | 55.17 ms | 42.53 ms | 0 / 0 |
| 100 | 401.88 ms | 214.44 ms | 200 / 100 |
| 500 | 1,860.95 ms | 981.44 ms | 1,000 / 500 |

The halved source reads explain the improvement in populated projects. Empty-project timing variation should not be attributed to this optimization. Disk, antivirus, project contents, and retained runtime state will affect actual switching latency.

Local reports: `artifacts/controller-navigation-benchmark/before.json` and `after-final.json` in the same directory.

### Scroll indicator and typing

The real-DOM 500-prompt regression counts operations per positioning pass:

| Operation | Before | After |
| --- | --- | --- |
| Middle prompt geometry reads | 252 | 9 |
| Near-end prompt geometry reads | 498 | 9 |
| Bottom prompt geometry reads | 499 | 0 |
| Marker attribute writes when selection changes | 500 | 2 |

Top-of-chat lookup increases from two to nine prompt reads; hover-preview class updates still traverse the buttons. These counts are not frame timings. Mutation refresh still scans the transcript.

Twenty typed characters previously caused twenty additional dictation status requests and twenty subscription replacements. They now cause zero of either after mount, while retaining all twenty draft saves.

## Further opportunities found, not implemented in this pass

29 October follow-up: the dedicated durable draft route now addresses item 2 below. See [draft save evidence](../validation/2026-10-29-durable-draft-saves.md) for migration, operation counts and before/after measurements. The original observations below remain the historical baseline.

29 October runtime follow-up: fresh compact lifecycle reads now address item 3 without caching state across events. See [runtime status evidence](../validation/2026-10-29-runtime-status.md) for safety regressions, compatible fallback behavior and isolated measurements.

1. **Bound or isolate large sidebar lists.** The actual sidebar in a development React fixture took median 2.3 / 17.5 / 52.8 ms per typed character with 100 / 1,000 / 3,000 saved chats. Every keystroke rerendered the sidebar; collapsed sections retained their DOM. Memoized grouping, stable navigation callbacks, and eventual windowed lists could help. Drag ordering, keyboard navigation, menu anchors, and selected-row visibility need to survive any windowing.
2. **Reduce whole-state persistence for lightweight actions.** Synthetic long active messages increased draft-save dispatch from 3.21 to 23.02 ms. Quiet draft actions still persist broader state and build a return snapshot that the draft IPC handler discards. A dedicated durable draft path would avoid this without relying on a timer that could lose text on immediate send, navigation, or shutdown.
3. **Reuse runtime status metadata.** With 100 retained idle runtimes, one `getState` made 600 runtime snapshot calls; a normal dispatch made 3,000. Larger native payload cost is an inference; the measured tiny-payload `getState` took 1.18 ms. Read status from observed metadata or one snapshot per context rather than repeatedly cloning runtime messages.
4. **Index and incrementally update durable history.** An isolated SQL index experiment reduced a 20-row page from a 10,000-message chat from 9.15 to 0.30 ms. A task index reduced an execution receipt lookup among 100,000 receipts from 2.85 to 0.03 ms. Unchanged 150-message history sync still performs 301 SQL calls. Streaming term-index rebuilds reached 236 ms with a synthetic 1 MiB distinct-token response. Index/query changes should preserve ordering, text search, canonical text, and transactional durability.
5. **Coalesce context preview and chat search.** Context attachment changes rescan the project, and search starts for every character. Coalescing can reduce wasted work while keeping explicit Refresh and fresh send-time source validation.
6. **Window the transcript only after defining navigation behavior.** The current find tool, prompt timeline, and subagent jump targets depend on mounted DOM. Full virtualization needs an indexed message-navigation layer so search and jumps can mount their target and preserve reading position.

## Repeatable checks

- `npm run test:code-responsiveness`: shared renderer actions and node retention, dictation transition races, and serialized timeline behavior/operation budgets. Included in validation and release CI.
- `node --test test/controller-navigation-performance.test.mjs`: one source capture, external/cleanup-time edits, invalid-target selection, and post-cleanup Git branch metadata.
- `node scripts/renderer-performance.mjs --samples 6 --turns 20,100,300 --out artifacts/renderer-performance/recheck`: isolated renderer timing.
- `node scripts/controller-navigation-benchmark.mjs recheck`: isolated controller timing.

Desktop and browser preview use the same changed UI components. Preview/desktop parity is checked separately; shared source and a successful renderer build alone do not prove an installed app has been updated.

Final local validation: 981 unit/controller tests, 37 responsiveness browser checks, 92 preview/desktop parity checks, and 16 chat-organization browser/Electron checks passed. The production renderer build and independent review also completed. Review caught the dictation availability-refresh regression; its fix was reproduced and verified before publication.
