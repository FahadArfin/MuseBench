# Restart active workflow children

## Intent and current evidence

Finish the remaining native child-control roadmap with the supported Muse contract. The user has authorized continuous implementation, Sol delegation, preview/desktop parity, per-feature commits and pushes, and verified desktop updates. This correction is within that authorization.

Current official [workflow documentation](https://dev.meta.ai/docs/muse-code/workflows) describes restarting a selected running child, rather than retrying a completed or failed child. MuseBench currently does the inverse for `workflowChild`: `childActions` offers `retry` after terminal states and only `skip` while active. The existing native test exercises the terminal target and receives `invalid_target`. That is evidence about that target, not proof that native restart is unavailable.

## Chosen approach and alternatives

Use the existing `workflow/childControl` action `retry`, retaining exact workflow/child/attempt ownership and once-only command receipts. Present it as **Restart attempt**, and expose it only for current active attempts that the pinned host actually accepts. This is the implementation choice for the ongoing authorized roadmap, not a new personal preference.

Keeping a terminal Retry button repeats a known rejected operation. Replacing it with a new app-created child would change native orchestration and history. Neither alternative satisfies the original control requirement.

## Behavior and invariants

- Establish the supported active status using an isolated real Muse 1.4.14 host with a scripted localhost Responses provider before claiming native acceptance. The fixture must observe attempt 1, submit one restart, then observe attempt 2 for the same child and workflow. A command acknowledgment alone is insufficient.
- Offer **Restart attempt** for the proven running/started states only, alongside the already supported Skip control. Never offer it on terminal, unknown, stale, or incomplete attempts. A terminal parent workflow must not authorize a stale active child row.
- Retain the native wire action `retry`. Do not rename saved compatibility identifiers. Update shared UI labels and truthful preview sample transitions to match the same rules.
- Current revision, exact latest attempt and native parent ownership remain authoritative. Reject stale attempt 1 locally after attempt 2 appears; renderer-supplied workflow IDs cannot redirect the command. If testing native stale-attempt rejection, use a clearly separate one-shot direct fixture probe, never a product bypass.
- No automatic retry/replay of the restart action. Pending or uncertain commands keep controls blocked and work owned until authoritative settlement or explicit disconnect. Native acceptance, rejection and observed restart remain distinct receipts.
- Keep Skip, independent Stop, result/activity reads, direct-child ownership rules, draft preservation and saved-session behavior unchanged unless evidence establishes a related defect. Direct follow-up/resume/reopen is separate investigation and must not be enabled from workflow-owned results.
- No personal setting, grant, account, credential or billing changes. No live model requests. Native fixtures use disposable profiles/projects, explicit tool schema checks, bounded request/event/body/time budgets and confirmed cleanup of their own host only.
- Browser preview and desktop share the controls. Test the actual controls, including action selection, pending/uncertain blocking, terminal absence, new attempt display and narrow keyboard access. Do not make a copied implementation test substitute for rendered behavior.

## Acceptance and delivery

Regression RED/GREEN for the reversed eligibility; real pinned-native running restart and attempt 2; stale local attempt rejection; existing native child cases; focused/full test suite; production build; shared browser/Electron controls; independent review; exact-source release/installed acceptance after push. Correct the historical limitation in the roadmap/inventory with new evidence, preserving the earlier result's tested context. If the native running-child probe still rejects, retain the observed failure and do not claim restart implemented or expose a speculative action.
