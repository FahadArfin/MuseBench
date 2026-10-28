# Child inspection implementation plan

> Execute inline with superpowers:executing-plans; one fresh-context review before delivery.

**Spec:** `docs/superpowers/specs/2026-10-28-child-inspection-design.md`

**Goal:** Read native child activity and reported worktree/usage facts without changing child lifecycle or slowing the parent chat.

**Global constraints:** No model calls, new login, payment, trust grant or subscription mutation. Use existing clean main checkout to keep the running preview synchronized; standing user authorization covers feature-by-feature pushes. Keep private native payloads ignored. No inferred usage, successful execution or worktree existence. Preserve existing child control admission semantics.

### Task 1: Implement and deliver child inspection

**Interfaces:** `inspectChild({taskId,sessionId,itemId,revision})` routes from the shared renderer through IPC validation/controller/runtime. Runtime resolves the child ID and publishes bounded `childInspections` keyed by item ID. The pure projector accepts a `SessionReadResult` and observed identity. Preview fixtures use the same typed UI contract.

1. Add failing tests for observed target binding, native result projection, read-only runtime behavior, stale ownership and limits. Run focused tests and observe failures for the missing feature.
2. Implement the projector, tracker resolver, runtime read lifecycle, selector forwarding, controller action, IPC validation and shared types. Run focused tests. Expected: all pass, no mutation command caused by inspection.
3. Add the activity disclosure UI and preview fixtures. Add renderer checks for content, unknown/partial data, earlier items, collapse/focus, refresh failure and reduced motion; extend parity scenes.
4. Run the existing zero-model diagnostic through the production projector. Expected: correct child identity and four native activity items; no session attach/resume/turn command.
5. Run `npm.cmd test`, `npm.cmd run build`, child inspection preview/desktop checks and `npm.cmd run test:preview-parity`. Expected: no failures; distinguish native evidence from fixture coverage.
6. Obtain fresh-context whole-feature review; address real findings with regression checks. Record validation and current roadmap status. Commit the completed feature, push main, and wait for exact-head validation and release workflows.
7. Hash-verify the release installer, install/reopen using existing authorization, verify installed version/source identity and the named UI. Record limitations without claiming unobserved live child execution.

**Completion:** tests, native read proof, independent review, commit/push and exact-artifact delivery all documented. Full native child lifecycle acceptance remains a separate roadmap gap.
