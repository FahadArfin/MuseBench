# Patchlight — Muse-first adapter delivery

Saved for later review. Independent concept; no Meta affiliation. The original visual prototype is preserved. This continuation delivers a tested application boundary, not a live Muse integration.

The product recommendation remains: validate one novice workflow — plan → inspect changes → preview → run checks → review — before investing in a general agent workspace. A cosmetic wrapper alone is weak differentiation.

# Patchlight Muse adapter — 0.2

This adds an actual application adapter boundary targeting Muse CLI's documented session protocol. **It is fixture-tested, not live-integrated.** The original visual prototype is preserved and remains mocked; this boundary is not silently connected to it.

Validation: **38 adapter contract tests and 17 original UI regression checks passed.** A fresh read-only code review was completed and its code findings were fixed. Exact evidence and limitations are in `EVIDENCE-MATRIX.md`.

## Smallest steps at home

1. Extract `Patchlight-Muse-Adapter-v2.zip`.
2. With Node 20 or later already installed, open a terminal in `patchlight/adapter`.
3. Run `node --test test/*.test.mjs` and `node demo.mjs`. These need no package installation, network, account or keys.
4. Optionally run `node doctor.mjs`. It only discovers `muse` candidates on PATH; it executes none and reads no credentials.
5. To view the preserved UI, serve the parent `patchlight` directory with `python3 -m http.server 4318 --bind 127.0.0.1`, then open `http://127.0.0.1:4318`.

No live start command is included in the demo. There is no need to log in or purchase anything to review this work.

If you already have a trusted official Muse installation, the smallest *manual* compatibility checks are `muse --version` and `muse schema`. Do not run a similarly named third-party package. Save their outputs for review; do not paste credentials. Missing Muse is a valid unavailable state, not a reason this package auto-installs it.

## What exists

- `compatibility.mjs`: fails closed unless SDK version, host version, schema version/fingerprint and sandbox availability match the pinned candidate.
- `session-adapter.mjs`: exclusively owns an official SDK `Connection`; creates one session, submits chat/plan turns, renders message events, and distinguishes acknowledgements, completion, failure, cancellation, blocked and uncertain states.
- `sdk-bridge.mjs`: takes an explicitly supplied SDK module and absolute binary/workspace paths; uses the documented `spawnMspConnection` → `initialize` → `connection` interface. Startup is off unless the caller explicitly enables it. Environment is supplied explicitly, never copied from this process. Actual use of this entry point can start a process; it was not used with a real SDK here.
- `review.mjs`: controller-only acceptance rules require the approved plan, current revision, inspected preview, completed runtime turn and passing runner evidence for that revision.
- `test/fixture-port.mjs`: synthetic Connection seam for tests/demo. It is not an MSP server or a replacement SDK.

No dependencies were installed. Downloaded official source/schema/transcript files under `evidence` were read as data only and carry their upstream MIT license.

## Compatibility: candidate versus verified

Exact research target: SDK **1.4.13**, native host **1.4.13**, schema version **1**, fingerprint **sha256:7fddaf646dbc317e5fcac0785e135eb04df14fbb0db1863089dfd6da21730e5b**, from source commit **3dce908f556bd8b3dfc9cd7f28f442b0504d74a4**.

**No live-supported version is established.** Those values are a strict candidate allowlist derived from the official package/host anchor and stable manifest. A matching handshake is eligibility only. All results deliberately keep `liveVerified:false`.

Two upstream inconsistencies remain unresolved:

- The SDK README describes a pre-1.0 developer preview while its package/host anchor says 1.4.13.
- The unchanged official recorded transcript's initialization frame uses host `0.0.0-fixture` and fingerprint `sha256:c8d1a2a1866814e220fd396d382a9a75861412feee884b5021b2ee359bd3dc59`, unlike the stable manifest above. The tests reject that recorded handshake. Event normalization is tested separately using its unchanged event records and an explicitly synthetic matching descriptor. This is not complete official transcript conformance.

Official entry point: https://dev.meta.ai/docs/muse-code

Pinned sources and hashes: `evidence/provenance.json`. See `EVIDENCE-MATRIX.md` for what each test establishes and what it cannot establish.

## Important scope limits

The plan mode adds a planning instruction; **it does not enforce read-only execution**. Never advertise that prompt as a sandbox. The bridge requires a reported available sandbox but that alone does not establish a particular permission profile. A real controller must verify the project, trusted configuration and chosen permission profile before sending turns.

Approval and user-input requests are exposed as blocked states; a protocol receipt is not approval. This version cannot allow, deny or answer those requests through UI. Close the host through its owning controller; do not enable approval bypass flags to make the demo work.

Single-turn event normalization is bounded. No automatic reconnect, resume, replay/gap fill, concurrent sessions, cancellation command, model switching, plugin installation, file writes, test execution, preview server or git integration is implemented. Unknown outcomes prevent further sends. The controller must reconcile an uncertain result before considering a new session/turn; this adapter never retries automatically.

The review object accepts only controller-shaped runner records, but a `source:'runner'` field is not cryptographic proof. Its caller is a trusted local controller, not the agent or renderer. Real command execution, log authenticity and revision hashing remain to implement. Agent text is never parsed to mark tests passed.

## Before a live connection can be claimed

Review and pin the installed official SDK and binary; confirm the real version/schema, auth availability and sandbox/permission behavior in a disposable project; wire a permission UI and explicit failure recovery; validate the exact SDK seam with a real process; separately authorize any model call and its cost. Do not substitute OpenCode if any of those checks fail.

The initial `docs/HANDOFF.md` remains the broader design proposal. This package implements only the narrow boundary described here.


---

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


---

# Final review and resolutions

A separate read-only reviewer inspected the new adapter, pinned schema/source, tests and docs. It ran 32 tests successfully and verified all 14 upstream provenance hashes before the fix pass. It did not modify files or exercise a live integration.

| Finding | Resolution | Regression evidence |
|---|---|---|
| Important: `session/closed` ignored | Matching closure makes runtime unavailable, including a null final cursor | Send is rejected and command count does not increase |
| Important: `view/gap` ignored | Gap becomes explicit reconciliation-required unavailability, even after terminal event | Both early and late gap cases stay unavailable |
| Important: observer disconnect before dispatch | Epoch/state rechecked immediately after observers | Neither startup nor turn command is sent |
| Initially minor: conflicting terminal | Regraded Important; conflicting outcome makes runtime unavailable | Failed cannot be changed to completed by a second terminal |
| Initially minor: command-id minter throws | Regraded Important; no turn sent and explicit unavailable state | No indefinitely submitting state |
| Minor: plan checkboxes stale | Completed bookkeeping after verification | `PLAN.md` and `PROGRESS.md` updated |

All six new regression tests were observed failing, then the complete suite passed 38/38. See `evidence/test-red-review-findings.txt` and `evidence/adapter-tests.tap`. No second review was claimed; the fixes are verified by regression tests.

Boundaries retained after review:

- Live SDK/host operation, authorization, sandbox behavior and cleanup timing remain unverified. Fixture success does not authorize or prove a live call.
- Revision hashes and runner logs come from a trusted controller. A `source` string is not authentication.
- Runtime completion is not itself revision evidence. Review requires current revision preview/check records, and changing revision clears those plus acceptance. Correct hash acquisition and event wiring are future controller work.
- Original deliverable preservation was checked separately against the recorded SHA-256 manifest; all three match. The existing UI suite passed 17/17 with outputs directed to a temporary directory.
- The strict version/schema gate intentionally refuses unknown versions. The cost is reduced compatibility until a new candidate is researched and tested; it avoids inventing support.

No deferred code findings. No production-readiness or merge claim is made; this is an isolated delivered source package, not a repository change.


## Delivery and earlier browser limitation

The source ZIP includes the preserved UI, original research/design handoff, new adapter modules, tests, pinned official evidence and MIT notice. No secrets, dependencies, browser screenshots or installed binaries are included.

Direct navigation to the standalone HTML through `file://` was denied by Chromium with `net::ERR_BLOCKED_BY_ADMINISTRATOR`. It was not retried. The same standalone HTML passed checks through localhost. Direct file opening remains unverified. This did not block the delivered local HTTP preview.
