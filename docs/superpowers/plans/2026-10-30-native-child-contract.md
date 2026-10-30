# Native child contract implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Reproducibly establish actual native workflow Skip, child Stop and child result completion while retaining truthful retry/close/reopen limits.

**Architecture:** An opt-in local scripted endpoint drives actual native advertised tools through the production runtime. Isolated profile/project and exact event receipts establish control eligibility and outcome. No product state or personal login is used.

**Tech Stack:** Pinned Muse CLI/SDK1.4.14, Node HTTP/assertions, existing runtime/native children projection.

**Spec:** `../specs/2026-10-30-native-child-contract-design.md`

## Global constraints

- No inference, credentials, persistent grants, external relay or personal app/profile changes.
- Actual native IDs/revisions/attempts and advertised schemas only; no injected native frames or invented direct-child eligibility.
- Per scenario: 60 seconds, 32 local requests, 2,000 events, 10-second operation limit, bounded bytes/output.
- Confirm shutdown and remove only the canonical owned temp path; preserve evidence/temp path if cleanup is unconfirmed.

## Review focus

- A control admission cannot substitute for its native settlement; Stop must be independently attributable from Skip.
- A late/foreign child or replaced attempt must not receive a control intended for the captured child.
- Parent terminal completion cannot substitute for actual child result or cancellation evidence.
- Unexpected approvals, extra model routes or credentials must fail without being forwarded or granted.
- Timeouts and malformed endpoint requests must settle owned cleanup and retain evidence on uncertainty.

### Task 1: Actual native child-control contract

**Files:** New `scripts/native-child-contract.mjs`, `docs/validation/2026-10-30-native-child-contract.md`, this plan/spec. Parent owns roadmap reconciliation after integration. Core production files require a demonstrated defect and separate scoped agreement.

**Interfaces:** CLI accepts only `--local-fixture`; emits bounded ignored `artifacts/native-child-contract/report.json` with host fingerprint, required case results, exact control admission/settlement distinction, unsupported-state limits, inference count zero and confirmed/unconfirmed cleanup. Nonzero exit for missing required native proof or unconfirmed cleanup.

- [x] Consolidate isolated probes into deterministic bounded cases using production runtime control APIs.
- [x] Run actual pinned-native contract; require separately settled Skip and Stop plus completed child result. Observe retry rejection and close acknowledgment without claiming unavailable states.
- [x] Run focused native-children/runtime regression tests and record exact evidence/source/runtime limitations.
- [x] Commit script and documentation for independent review. Parent integrates/pushes the reviewed feature and validates the exact latest release.
