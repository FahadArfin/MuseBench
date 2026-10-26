# Windows exec runtime review

Reviewed on 2026-10-25. No outstanding blocking finding remains in this bounded source review. One minor diagnostic race remains below. This is not an exhaustive security audit or proof of native sandbox enforcement.

## Scope and method

Reviewed `src/runtime/exec-events.mjs`, `src/runtime/exec.mjs`, their focused tests, and the runtime completion/message integration in `src/controller/index.mjs` and `test/exec-controller.test.mjs` against the Windows exec design and plan. Focus: authoritative stream completion, argv separation, configuration and sandbox arguments, bounded output, cancellation, cleanup ownership, stale events, and checkpoint attribution.

The reviewer did not modify application source, launch native Muse, invoke a model, or read authentication files. Reproductions used captured non-authentication output and injected process boundaries. Implementers made the fixes; the reviewer independently reran verification. This report was the only reviewer-authored workspace file.

## Strengths

- Separate exec transport preserves the existing MSP adapter and identifies independent requests explicitly.
- Shell-free argv uses a positional separator, fixed Ask me profile, restricted tool flags, disabled hooks, and a curated environment.
- Completion requires correlated and contiguous records, a durable authoritative run terminal, successful process close, and Meta model identity. Task completion and assistant prose cannot substitute for run authority.
- Configuration checks reject unsupported extension, saved-trust, plugin, and managed-policy sources. Failed cleanup blocks reconnect rather than silently abandoning ownership.
- Controller tests check failure attribution, continued access to Disconnect, stale output, empty final responses, and journal persistence.

## Findings fixed during review

1. **P1: malformed or ephemeral records could establish completion.** The original fold accepted a captured completion after changing its terminal to `durability: ephemeral` and `record_type: status`; it also accepted removal of required envelope fields. The fold now validates required raw-envelope metadata and requires a durable event terminal. Regression tests reject both reproductions while retaining captured-format compatibility.

2. **P1: a parent close could override failed process-tree cleanup.** With an injected stop boundary that emitted close and then returned a deferred false result, Disconnect reported cleanup confirmed because `release` checked the closed flag before the existing stop promise. It now prioritizes that promise. The regression retains unconfirmed cleanup and refuses reconnect.

3. **P2: synchronous spawn rejection left the runtime running indefinitely.** `begin` originally swallowed the synchronous exception into a result promise ignored by `send`, without installing an owner or timeout. Startup failure now rejects the send promptly and invalidates permission readiness without exposing native exception details.

4. **P2: an empty final response left provisional assistant text in the journal.** The runtime removed the message instead of sending its empty replacement, while the controller only merged present messages. Existing messages now receive the authoritative empty text. The integration regression verifies that provisional claims stay cleared after persistence and restart.

5. **P2: classified stderr could escape diagnostic suppression.** A broad authentication/billing classifier passed text to a narrower redactor. Injected stderr containing `authentication trace:` plus an invented private marker was reproduced verbatim in the snapshot. Classified stderr now maps directly to fixed account-error messages, and all other stderr maps to a generic diagnostic. Regressions cover both authentication and billing keyword variants, quoted credential keys, and environment-style credential fields.

## Remaining nonblocking issue

**P3: a failed Connect can replace the Disconnect explanation with its older error.** In the `connect` catch in `src/runtime/exec.mjs`, the epoch is checked before awaiting `release(owner)` but not after it. Reproduced by making the echo probe malformed, delaying confirmed cleanup, and disconnecting during that delay: the final state remained unavailable with confirmed cleanup, but the reason was the old malformed-output error instead of the Disconnect explanation. No new-run or completion authority bypass was demonstrated; ownership and closing guards prevent reconnect until cleanup settles. A post-await epoch check would preserve the newer explanation. Left unchanged under the final source freeze.

## Verification

Final independent command:

```text
node --test test/exec-events.test.mjs test/exec-runtime.test.mjs test/exec-controller.test.mjs
```

**51/51 passed:** 25 fold tests, 18 runtime tests, and 8 exec/controller integration tests. Earlier in this review, the existing `test/controller.test.mjs` suite also passed 19/19. SQLite emitted its existing experimental-feature warning; no test failed.

Reviewed source SHA-256 values:

| File | SHA-256 |
| --- | --- |
| `src/runtime/exec-events.mjs` | `3f251870b238ceb78c6448596a56c8fd63b2ddc41bd45b389b2c7ec3498ca007` |
| `src/runtime/exec.mjs` | `2185863d802f14d51ab8777ec897333ffe449744b3ee837164f1a1100332eacb` |
| `test/exec-events.test.mjs` | `56c755b6ce1e2e820199f36a733d3c228c5c6cea7c8e099992c4692388b59060` |
| `test/exec-runtime.test.mjs` | `e34143d3c2829e66c4ccb053d47188722f0eaa533582dd3da968a8c0d976715a` |
| `test/exec-controller.test.mjs` | `0c73cf32f96ba10561965a58175567e08b037e8c1a2f5b4ed09ba7e8c13e23dc` |

## Not independently judged

- Actual Windows sandbox confinement and native descendant-process behavior: these require controlled native execution; injected tests establish how the application honors the process boundary, not OS enforcement.
- Native file-editing success, live provider/account availability, exact packaged artifact behavior, visual preview, and project check/checkpoint workflow: owned by the main task's live verification, not this source review.
- Arbitrary future native tool-event schemas: the review validates the pinned observed envelope and control events, not undocumented per-tool success fields.

The code is ready for the main task's artifact and live-workflow validation within these limits.
