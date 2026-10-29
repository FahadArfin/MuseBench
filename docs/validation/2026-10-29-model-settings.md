# Model settings validation

29 October 2026. Roadmap C04. Baseline `5498fa102019fe0d73499e1ca5fbd643fbb4be4c`; unrelated headless-audio validation follow-up retained.

The composer and `/model` / `/status` distinguish Next request choices from a reported session/current/last-run model. Effective effort stays Not reported; the submitted effort is separately labeled Requested. Missing catalog entries stay visible as unavailable. Model and effort controls are inspectable but disabled while native work, a question, approval, child operation or restoration is pending.

Native evidence remains limited to the existing validated contracts: exec `run.model.configured` and interactive session model read-back. No model request is made to inspect settings. A setModel read-back failure now clears the old model ID before blocking, so uncertainty cannot be shown as a confirmed choice.

## Evidence

- Four shared provenance tests plus a real interactive-runtime boundary regression for failed model read-back.
- Focused runtime and provenance suite: 103 passed.
- Full unit suite: 1,411 passed, zero failures. Production build passed with the existing bundle-size advisory.
- Production composer smoke: 7 browser + 7 Electron checks. Running and question-waiting states disable mutation; stale/reconnecting state cannot claim an active model; missing model remains selected; narrow menu and Escape focus pass.
- Full browser preview smoke passed, including `/model` and `/status` on a new-chat Low-effort draft. Draft settings are passed through explicitly rather than read from a previous task.
- Browser/Electron structural, style and geometry parity passed, including model catalog and reasoning menus. Final refinements (new-chat command options and waiting-question lock) have targeted browser/Electron coverage.
- Fresh review found stale read-back, new-chat draft settings and waiting-question locking issues; all were corrected and regression checked.

Ignored evidence: `artifacts/changelog-roadmap-2026-10-29/model-settings-*.log`, `artifacts/model-settings/preview-x77ezt`, `artifacts/model-settings/desktop-ajF11s`.

Source and offline host behavior are verified. Published/installed acceptance is separate. No new provider/model usage was consumed, and no effective-effort telemetry is invented.
