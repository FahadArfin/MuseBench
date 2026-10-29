# Model settings provenance

Roadmap C04. The composer currently mixes a saved choice with an active native model; `/model` still says selection is unavailable, and `/status` labels a requested effort as active. Use one shared presentation contract in the composer and command dialog.

- A saved model/effort is **Next request**. Selecting it never means it was applied to an active turn.
- Report a model only from native runtime evidence: a verified interactive session read-back, or an accepted exec run with an observed model. Distinguish session model, current run and last run. Hide stale observations while disconnected, reconnecting or uncertain.
- The validated transports send effort but do not expose an independently verified per-turn effort in the current fold. Label it requested; effective effort is **Not reported**. Do not substitute a catalog default or standing session default for per-turn evidence.
- The model menu can be inspected while running, with selection controls disabled. Saved options keep the existing idle-only mutation guard. Explicit model IDs absent from the current catalog remain visibly unavailable; they never silently display a provider default.
- Compact layout shared by browser and desktop. No added model calls, changed provider route, new billing behavior or automatic fallback.

Tests cover requested/observed differences, reconnect, unknown admission, completed and running states, missing catalog rows and read-only active menus. Sources: the public changelog roadmap plus local verified exec `run.model.configured` and interactive `session/read` contracts.
