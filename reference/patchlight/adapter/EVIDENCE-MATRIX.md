# Evidence matrix

Date: 25 October 2026. Status: credential-free adapter development; live Muse unavailable.

Final validation: **38/38 Node contract tests passed**, **17/17 original UI regression checks passed**. Raw Node evidence: `evidence/adapter-tests.tap`; UI evidence: `evidence/ui-regression-results.json`. A fresh read-only review found three Important issues and two smaller code failures; all five were fixed with six failing-then-passing regression tests. Plan bookkeeping was also completed. No deferred code findings.

| Claim | Evidence | Limit |
|---|---|---|
| Muse CLI has a supported programmatic surface | [Official overview](https://dev.meta.ai/docs/muse-code): `muse serve`, `muse schema`, SDK link | Documentation, not account/runtime verification |
| SDK exports `spawnMspConnection` and Connection methods used here | Pinned `index.ts`, `spawn.ts`, `connection.ts`, cookbook `host.ts` in `evidence` | Source read; SDK not imported/executed |
| Pin rejects mismatch | `test/compatibility.test.mjs` tests host/SDK/schema/sandbox and rejects the unchanged recorded handshake | Exact candidate allowlist, not a supported-version range |
| Session/turn mapping uses documented shapes | `test/session.test.mjs`, official schema and recorded messages | Injected Connection seam; no real host |
| Deltas and authoritative completion work | Official unchanged item events folded by adapter; duplicate/conflict and final-text assertions | Not full SDK fold/replay conformance |
| Turn acknowledgements are not final outcomes | Test omits `turn/completed` and remains running | No runtime timing/latency measurement |
| Failures/cancellation/unknown states are honest | Explicit event, disconnect, timeout and late-response tests | No cancellation RPC or reconnect implementation |
| Closed sessions and transcript gaps cannot look ready | Matching `session/closed` disables sends; `view/gap` before or after completion marks reconciliation required | No automatic recovery is attempted |
| Observer disconnect prevents dispatch | Regression tests disconnect during startup/submission callbacks and assert no command is issued | Does not cancel an already dispatched backend action |
| No auto-approval | Server request test yields a receipt and blocked state; no `approval/decide` command | Approval UI absent; cannot complete approval-dependent live tasks |
| Review binds to revision | `test/review.test.mjs` invalidates stale/failed/missing evidence | Hash acquisition and real trusted test runner absent |
| Safe default startup behavior | `test/bridge.test.mjs` refuses without explicit flag, rejects SDK mismatch before fake spawn, checks cleanup outcomes | `allowHostStart` is a caller intent guard, not a security boundary |
| Native CLI unavailable here | `node doctor.mjs` output and initial PATH discovery | Only PATH inspected; no global filesystem crawl |
| Original visual spike preserved | Original HTML hash retained; separate adapter directory and v2 ZIP | UI is not wired to this adapter |

The official transcript contains an agent sentence about 214 tests. That is historical fixture content, not a result of this project. The adapter reports `tests:'not-run'` despite that sentence. Only local Node and browser test outputs are validation evidence for this work.

The production modules use ordinary Node built-ins. Credential-free tests use an in-process fixture object, not a child executable. The downloaded TypeScript sources are never compiled or imported. The original runtime's installed Playwright is used only for the existing UI regression test.

Exact source revision: [3dce908f556bd8b3dfc9cd7f28f442b0504d74a4](https://github.com/meta-models/muse-code-sdk/tree/3dce908f556bd8b3dfc9cd7f28f442b0504d74a4).

Remaining live blocker: starting and exercising a real Muse session is **not attempted**, because no trusted installed `muse` was found on PATH and this task prohibits installing/executing unknown packages and changing auth or making paid calls. No authorization denial occurred for a live call because none was requested. No outcome is being claimed for one.
