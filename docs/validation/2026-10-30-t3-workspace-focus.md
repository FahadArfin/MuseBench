# T305: Keyboard workspace navigation

Implemented against the approved T3 workflow design, keeping Muse as the only coding backend.

F6 and Shift+F6 cycle the visible Code sidebar, conversation, composer and open details panel. Ctrl+F6 (and Ctrl+Shift+F6) provides the browser fallback. Each area remembers its last connected, enabled, visible focus target; hidden, inert and offscreen navigation is skipped. Focus uses preventScroll and does not change transcript reading/follow intent. A production busy snapshot that briefly disables a focused control restores that same control after reenable, unless newer input, focus, a boundary or a destination change superseded it.

Sidebar Up/Down/Home/End focus rendered chat rows without opening them. Longer lists reveal the row by adjusting only the sidebar scroller. Enter retains ordinary chat activation; F2 opens the existing Edit chat details dialog and submits through its existing rename handler. Project disclosure buttons, ordinary Tab access, context menus and Alt+Shift reorder retain their existing semantics. No tree roles were added. Shortcut help and inset focus outlines document and expose the controls.

Dialogs, menus, the slash palette and Personal workspace/webview focus retain their own keyboard behavior. The hook performs no controller action or provider admission.

## Local evidence

- `node --test test/sidebar-order.test.mjs test/sidebar-model.test.mjs test/ci-suites.test.mjs test/navigation-history.test.mjs`: 23 passed, zero failed/skipped.
- `npm run build`: native helpers, TypeScript, Vite production UI and native MCP build passed. Existing large-chunk warning only.
- `npm run test:workspace-focus`: 21 groups passed in both Chromium preview with real controller RPC and source Electron with production preload/IPC/controller, using disposable profiles. Tests use real keyboard events for F6 forward/reverse/wrap, Ctrl fallback, row arrows/Home/End/Enter/F2/Tab, long sidebar reveal, focus memory and disabled fallback, held refresh completion, superseding focus, menu/slash/dialog boundaries, open/closed details, collapsed sidebar, 390px layout, reduced motion and Personal mode boundary. Reading position remains within 4px and the released follow intent remains released.
- Final reports: `artifacts/workspace-focus/preview-THuu2V/report.json` and `artifacts/workspace-focus/desktop-h0WRRM/report.json`. Each counts zero provider-admission actions and zero seed fake-runtime connect/send calls; renderer errors are empty. Actual recorded actions are refresh, renameTask and selectTask. The desktop narrow screenshot was visually inspected.
- `npm run test:chat-navigation`: preview/Electron sidebar and delayed read fixtures plus production Electron sidebar drag/reorder passed, including Alt+Shift reorder, persistence and project association.
- `npm run test:response-quote`: preview and production Electron quote/source-reader/keyboard/owner/shelf-fence regression checks passed.
- `npm run test:prompt-shelf`: preview and production Electron saved-prompt keyboard, mutation/recovery/upload/reload and narrow-layout regressions passed.
- `npm run test:chat-history-find`: preview and production Electron saved-reader keyboard, latest-read/query/chat identity and reduced-motion/narrow regressions passed.

CI registers `test:workspace-focus` in the chats group, uploads its reports, and retains every prior required command. The fixture supports `MUSEBENCH_EXECUTABLE` for later exact-artifact validation. Final validation uses repository Node 22.14.0; early development-only runs used the bundled Node 24.19.0, without changing dependencies or CI runtime requirements.

This is local fixture and source Electron evidence. Remote CI, packaging, installed-artifact acceptance and live provider delivery remain separate. No provider execution, paid request, account/billing/security change, personal session mutation, push or installation was performed. The already green broad unit suite was not repeated for this UI feature.

## Review correction: overflow clipping

Independent review found that a remembered row could remain within viewport coordinates while being entirely clipped above its sidebar scroller. Focus validity now intersects the viewport and each overflow ancestor's client box (including scaled box dimensions). Viewport-fixed dialogs retain their escape from intervening scrollers, preserving F2/dialog boundaries. Sidebar arrow navigation continues using laid-out row eligibility and reveals the chosen row only inside its own scroller.

The actual App regression failed before the fix because F6 focused the clipped remembered row. Both preview and production Electron now pass explicit F6 fallback and busy-reenable rejection with that row fully outside the sidebar clip yet inside viewport coordinates, while transcript position stays within 4px. The existing long-list End/reveal assertion still passes. `npm run build` and `npm run test:workspace-focus` passed after this correction on Node 22.14.0; no broad green regression groups were repeated for this round.
