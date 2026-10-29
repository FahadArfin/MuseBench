# Recoverable queue validation

29 October 2026. Roadmap C03. Baseline `954c0f593a37ae07aadca1d416b1a86dcb0e92a6` (independent clipboard-smoke follow-up `1b485b3` also retained).

Queued prompts have an inline editor, pause/run controls and a per-request Send now action. Edits retain files, screenshots, reasoning, permission settings, workflow checks and handoff provenance. Cancel leaves both the queued request and composer draft intact. Sending one request keeps the rest paused.

## Delivery contract

Each edit or send binds the original chat, queue item and revision. The controller persists `sending` before dispatch. The item leaves the queue only after owned native acceptance or confirmed completion. Explicit preflight rejection remains ready and paused; ambiguous dispatch or restart becomes unknown and cannot replay automatically. The newer task record wins over a stale app-selection snapshot during recovery.

Native-process startup is not acceptance. The review found and corrected that distinction, plus classification of known preflight rejections. Exec, interactive runtime and the preserved adapter attach a not-sent/unknown admission result. The composer draft is never a recovery target for queued requests.

## Evidence

- Ten queue recovery regressions: stale bindings, attachments/options, draft preservation, isolated send, delayed acceptance, asynchronous rejection, uncertain acknowledgments and restart.
- 187 focused runtime/adapter/controller tests passed. Independent narrow re-review found both original blockers resolved.
- 115 queue/workflow/exec regressions passed. Older test doubles now emit the same input-acceptance signal as the actual runtimes.
- Full unit suite: 1,406 passed, zero failures.
- Production build passed. Existing main-bundle-size advisory remains.
- Browser preview smoke passed, including edit/cancel preserving the composer and screenshot queue. Shared browser/Electron parity passed, including `queued-message-editor` and `queue-edit-cancelled`. Evidence: `artifacts/changelog-roadmap-2026-10-29/queue-*.log`.

No provider/model run was made. Native outcomes were injected at their real process/protocol boundary. Published/installed acceptance remains separate.
