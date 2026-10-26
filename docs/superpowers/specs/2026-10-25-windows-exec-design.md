# Windows Muse compatibility mode

The user requested a sandbox-preserving workaround and a complete real edit → diff → preview → check → checkpoint workflow. Native Muse 1.4.13 `serve` reports its sandbox unavailable despite ready Windows setup. The installed binary rejects socket hosting on Windows. No newer supported host was found. WSL has only Docker's internal distribution.

## Approach

Use the official native `muse exec --json` entry point on Windows. Keep the existing SDK adapter for supported non-Windows hosts; never reinterpret an unavailable MSP sandbox as available. This is an implementation choice within the requested workaround, not a new user preference. A real exec probe reached Meta's API with `:ask-me` and the sandbox enabled but was refused with HTTP402 billing; no edit occurred.

Windows compatibility mode supports independent file-editing runs. Explicitly choose `:ask-me`, withhold agent shell/web/reminder/input tools, exclude foreign personal context, disable hooks per run, and leave workspace untrusted. Do not combine profile selection with approval/network override flags: the official CLI rejects those combinations. Do not disable sandbox or approval. Surface unsupported approval/input and stop the owned process. Each request is independent; no native conversation-resume claim.

Connect validates canonical native binary/workspace, pinned version, and native sandbox readiness, then performs an inert echo contract probe. This establishes readiness, not real model or OS boundary success. A real completion requires valid schema1 JSONL, contiguous stream sequences, consistent session/command/run identifiers, authoritative run terminal completed, and exit0. Never turn an agent claim into test evidence. Account errors remain actionable unavailable/failed states; no automatic retry or billing changes.

Read no auth files. Use curated child environment, bounded output/run time, shell:false, hidden helper processes, and confirmed owned process-tree cleanup. Suppress persistent diagnostic tool arguments. Show mode and limits in the runtime UI. Reject configured third-party MCP/plugin execution in the restricted mode if it cannot be excluded reliably.

## Validation

Test event folding, malformed/gapped/contradictory events, failure terminals, billing failure, process cancellation, startup rejection, and stale completions through injected process boundaries. Run existing app tests. Use a real bounded model request only after billing is resolved, verify exact edited bytes and inventory, inspect real preview, run project tests, save checkpoint, restart, and verify persistence. Verify native confinement with a harmless disposable boundary probe before claiming sandbox enforcement. Native echo alone is never a live workflow pass.
