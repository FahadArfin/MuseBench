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
