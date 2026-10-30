# Compact model picker

The composer follows the supplied Codex reference: a compact card with a blue effort label, reset, clickable model name and discrete slider. Selecting the model name opens a plain checkmarked list with Default first. Back returns to effort controls. Model discovery lives in the list header; the everyday card has no diagnostics or explanatory footer. The existing `/model` and `/status` views retain reported-versus-requested details.

Only the actual Muse catalog supplies selectable models. Default removes the explicit override. Switching models preserves compatible effort, otherwise uses the model's declared default or first supported level. Missing models stay visibly unavailable; no silent substitution or invented effective effort. Active, pending, child and restoration work retain their existing locks. Refresh waits for the existing controller action, prevents overlapping clicks, and exposes a retry after failure. Nothing sends a model request.

## Verification

- Baseline browser and Electron model settings checks passed before edits.
- A direct-list selection interaction failed before implementation because the new list-opening control was absent, then passed after implementation.
- Shared browser and source Electron: 16 checks each covering selection, supported-effort fallback, clearing an override, keyboard navigation, reset, active/pending locks, unconfirmed startup, missing models, narrow/upper-screen placement, discovery error/retry/in-flight locking, 200-row scrolling, reduced motion and unsent-draft preservation.
- Full unit suite: 1,681 passed, one existing optional skip, no failures.
- Production TypeScript/native bridge/Vite build passed; existing bundle-size warning remains.
- Full browser-preview smoke passed with no external requests. Dark, light and narrow picker layouts were inspected. All 100 desktop/preview parity comparisons passed, including the compact card and model list.

Fixtures demonstrate interface behavior, not live model acceptance. No paid model request or account/permission change was made.

## Independent review

One independent reviewer reproduced a keyboard discovery defect: disabling Refresh could strand focus on the page or retain it on the button, leaving the new list inaccessible by arrows. The regression failed locally before correction. The picker now restores refresh-owned focus to the selected/fallback model after discovery, retains a Tab entry point, and preserves deliberate focus changes to the draft or Back view. Both keyboard recovery and no-focus-steal regressions pass.

The same reviewer verified the correction, independently passed all 16 browser and 16 Electron checks plus eight focused unit tests, and cleared the final code with no remaining findings. Final build and full unit suite also passed after correction. The reviewer did not claim live provider acceptance, installed-release acceptance, exact reference-image similarity or revalidation of historical release records. Reference-image comparison was performed by the implementing agent; live acceptance remains outside this UI task, and exact installed-release checks follow the release gates. Historical delivery is documented separately with its retained receipt.
