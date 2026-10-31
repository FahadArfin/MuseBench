# CI UI fixture validation — 2026-10-30

Corrects the startup-font and chat-relationship smoke fixtures after Windows CI run `41149237282` at `99e186fc94326f18e988f2556469443b3abce951`. Validation used the isolated source at reviewed CS04 baseline `36ea88d`, rebuilt before execution. Production code and its 400 ms font-readiness gate remain unchanged.

## Fixture contracts

- Cold real-font integration observes the actual readiness race result. A readiness win requires the full typing, cursor, flight and landing contract; budget loss requires no fallback-font flourish, overlay removal and working controls. Cold status, eventual actual-face resolution and no-page-error checks remain mandatory.
- Separate prepared-real-font cases require successful readiness within 400 ms, delayed readiness beyond the budget, and rejected readiness. Warm native-readiness browser integration still requires full motion. Controlled readiness is fixture timing, not a cold-network latency guarantee.
- `/side` and `/branch` await the main task identity, rendered source, restored draft and editable composer before submitting the verified command. They capture existing IDs and require a fresh selected task and settled operation before asserting every relationship, context and independence contract.
- A bounded source-navigation hold records the preceding side, restored source, submitted action source and returned child ID. Existing private IPC reply envelopes are forwarded unchanged.

## Local execution evidence

| Command | Result |
| --- | --- |
| `npm.cmd run build` | Passed |
| `node scripts/startup-animation-smoke.mjs --browser-only --fault-cold-budget` | Passed after correction: 19 checks, no page errors; approximately 667 ms actual cold readiness, observed budget loss, no visible flourish |
| `node scripts/code-chat-relations-smoke.mjs` | Passed: 17 checks, no page errors |
| `node scripts/code-chat-relations-smoke.mjs --desktop` | Passed: 16 checks, no page errors |
| `node scripts/run-ci-suite.mjs appearance` | Passed once: startup animation 36.390 s, preview/Electron motion 63.670 s, typography 12.801 s; 112.861 s total |

The complete appearance run passed 23 startup checks and 14 typography scenes. Its ordinary cold-font scene observed a readiness win at approximately 119 ms, while all mandatory controlled outcomes and warm full motion also passed. Retained local evidence therefore covers both observed cold integration outcomes.

Before the assertion correction, the forced 650 ms cold-font hold failed the original unconditional under-400 ms assertion despite safe product fallback. The retained `--fault-stale-navigation` negative control fails the required source-identity assertion while the old inequality already accepts the preceding selected side; no relation command is submitted. This demonstrates the wait defect, without claiming to reproduce the historical CI interleaving.

One development iteration used an incorrect restored draft expectation after `/side`; the fixture now independently expects the consumed command prefix to leave the main draft empty. An overlapping rerun stopped before assertions because the appearance fixture owned port 5173. After appearance released the port, both amended relationship cases passed sequentially.

## Boundaries

Logs, compact observations, failure diagnostics, full fixture reports and renderer/font SHA-256 hashes are retained locally. Internal scratch records and fixture profiles are excluded from the published change. The build emitted the existing Vite bundle-size advisory; relationship runs emitted Node's existing experimental SQLite warning.

No production instrumentation, timeout increases, blanket retries, skipped assertions, personal profile changes, provider/model calls, installs or pushes were performed. No whole unit-suite rerun or unrelated settings/billing changes were made. This is local scoped fixture validation; independent review, fresh GitHub CI, live Muse acceptance and release remain separate steps. The historical delay after route release is not attributed to decoding, scheduling or a specific product cause.
