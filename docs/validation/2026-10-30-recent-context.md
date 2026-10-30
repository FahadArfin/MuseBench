# Recent local excerpts validation — 2026-10-30

Scope: the app-managed local continuity alternative for OC06; SDK 1.4.14/native retention behavior is unchanged. All runs used the isolated `codex/recent-context-excerpts` worktree. No provider/model requests, personal profiles, account/grant changes, release publication or installation were performed.

## Regressions and observed red/green evidence

The initial seven selector/controller tests failed before implementation and passed afterward. Expanded coverage verifies bounded escaped/Unicode formatting, role/outcome provenance, excluded attachments, exact context-inspection/native-boundary prompt and receipt-hash parity, stale/foreign binding rejection, asynchronous reconnect/inspection revalidation, queue edit/restart/unknown behavior, unrelated later messages, and default-off local preparation with no implicit stage/send.

Additional failing regressions exposed and verified fixes for:

- An older selected snapshot overriding authoritative durable source records after source mutation.
- Damaged staged persistence silently disappearing rather than requiring explicit removal/review.
- SQLite abort before provider dispatch consuming the reviewed selection. Dispatch persistence now uses a savepoint and restores in-memory preparation on failure.
- Late native pre-admission rejection failing to recover local excerpts, including the guarded case where a newer unrelated draft already exists.

The focused suite has 20 passing tests. It also covers generated workflow and goal requests leaving staged user context untouched, queue reorder/edit-cancel/removal ownership, and deletion without selected-snapshot resurrection.

## UI and build checks

Browser preview and built-source Electron smoke pass keyboard disclosure, default-off preparation, separate draft/review state, explicit include/remove, narrow 520px layout, reduced motion, and new-chat isolation. Browser smoke also verifies a stale compaction error and fresh review. Screenshots were inspected visually. The existing context-history browser smoke passes its six checks.

The shared `test:recent-context` command runs browser and desktop smoke sequentially in the existing Windows `chats` group; its CI coverage guard was observed failing before registration and passing afterward. No workflow jobs were added.

Reusable smoke evidence is saved in `artifacts/recent-context/` with a fresh variant directory per run. The executable override supports separately proving the exact installed artifact. No installed-artifact proof is claimed in this source feature validation.

The production build passes TypeScript, Vite, and existing native build steps. Vite retains its pre-existing large-chunk advisory. The full unit command `npm test` passed 1,703 tests with no failures and one existing skip (1,704 total). The existing retained safe native workflow replay test remains skipped; this is not a live-provider acceptance claim.

## Practical limits

The preparation uses the app's bounded locally retained message window, which currently contains at most 150 messages; it cannot recover old discarded history or unseen native tools. A queued capsule whose selected sources leave that window fails closed and must be removed/reviewed again. Character counts are UTF-16 string counts, not billing tokens. Runtime contract doubles prove final local text construction and dispatch boundaries only. No test proves native retention content, summarization quality, billing acceptance or end-to-end provider behavior.

## Readable review follow-up

After independent review of `5e36c5d`, the default review now displays validated You/Muse messages, known outcomes and explicit shortened-excerpt labels. The exact prepared section remains unchanged under a collapsed **View prepared context** disclosure. Invalid reviews show an error and remain blocked; literal HTML-shaped saved text is rendered as text. No capsule fields, binding, context caps, queue or dispatch behavior changed.

The new validated read-parser regression and readable-review smoke were observed failing before the presentation fix and passing afterward. Focused feature/context/queue tests pass 34/34; production build passes with the same chunk advisory. Browser smoke passes six checks at `artifacts/recent-context/browser-mVagca`; built-source Electron passes five at `artifacts/recent-context/desktop-cd2VeU`. The narrow screenshot was inspected visually. Both smoke variants verify default readable text/outcome labels, collapsed raw detail, and exact section equality when opened. Desktop also verifies explicit truncation and literal HTML-shaped text without rendered child elements. Per the scoped review instruction, the full suite was not repeated for this presentation-only follow-up; the preceding full result remains 1,703 passed, zero failed, one existing skip.
