# Compact model picker

The composer follows the supplied Codex reference: a compact card with a blue effort label, reset, clickable model name and discrete slider. Selecting the model name opens a plain checkmarked list with Default first. Back returns to effort controls. Model discovery lives in the list header; the everyday card has no diagnostics or explanatory footer. The existing `/model` and `/status` views retain reported-versus-requested details.

Only the actual Muse catalog supplies selectable models. Default removes the explicit override. Switching models preserves compatible effort, otherwise uses the model's declared default or first supported level. Missing models stay visibly unavailable; no silent substitution or invented effective effort. Active, pending, child and restoration work retain their existing locks. Refresh waits for the existing controller action, prevents overlapping clicks, and exposes a retry after failure. Nothing sends a model request.

## Verification

- Baseline browser and Electron model settings checks passed before edits.
- A direct-list selection interaction failed before implementation because the model selector was absent, then passed after implementation.
- Shared browser and source Electron: 15 checks each covering selection, supported-effort fallback, clearing an override, keyboard navigation, reset, active/pending locks, unconfirmed startup, missing models, narrow/upper-screen placement, discovery error/retry/in-flight locking, 200-row scrolling, reduced motion and unsent-draft preservation.
- Full unit suite: 1,681 passed, one existing optional skip, no failures.
- Production TypeScript/native bridge/Vite build passed; existing bundle-size warning remains.
- Full browser-preview smoke passed with no external requests. Dark, light and narrow picker layouts were inspected. Desktop/preview parity and final independent review are recorded below before publication.

Fixtures demonstrate interface behavior, not live model acceptance. No paid model request or account/permission change was made.
