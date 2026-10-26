# Prototype validation

Validated 25 October 2026 with Chromium 154.0.8037.57 and the installed Playwright tooling. `node tests/ui.cjs` exited 0 and recorded **17 passing checks**, zero browser JavaScript errors, and zero external requests in the tested UI flow. `node --check app.js` and the standalone bundle build succeeded.

These are tests of the visual prototype. The three checks displayed inside the product are deliberately scripted fixture outcomes; they do not execute a user's project tests.

## Behavior verified

1. Later workflow stages are disabled before plan approval.
2. Runtime provenance is explicit and the native modal closes with Escape.
3. Approving the plan creates a labeled simulated diff.
4. Acceptance is unavailable before preview inspection and passing checks.
5. The caffeine-free filter removes the caffeinated sample product.
6. Before view restores the original collection and removes the new filter.
7. A failing simulated check blocks acceptance even after preview inspection.
8. Passing checks plus an inspected preview allow demo acceptance.
9. Demo acceptance can be undone while retaining the change for review.
10. Chat escapes markup and explains that it does not generate a new plan/code.
11. Extension concepts cannot install anything or grant access.
12. Reset clears the fixture workflow and custom local messages.
13. The preview width switch works.
14. There is no horizontal page overflow at 390, 768, 1024 and 1440 CSS pixels.
15. Filter controls work with keyboard focus, Tab and Enter.
16. The tested flow emits no browser errors or external network requests.
17. The standalone HTML works through the local HTTP server.

Full machine-readable evidence: `artifacts/test-results.json`. Reproducible browser code: `tests/ui.cjs`.

## Visual review

Saved captures were opened and inspected, not merely generated. They are local QA evidence, not Library uploads.

| Step | Capture | Observed health |
|---|---|---|
| 1. Plan | `artifacts/01-plan.png` | Clear three-step plan and one primary action; subsequent workflow steps visibly gated. |
| 2. Changes | `artifacts/02-changes.png` | Readable illustrative additions/removal, scope and mock wording present. Intended check coverage is explicitly distinguished from executed results. |
| 3. Preview | `artifacts/03-preview.png` | Before/after and width controls visible; filtered sample shows two teas, no clipping at desktop size. |
| 4. Failed checks | `artifacts/04-failed-check.png` | Amber failure message, failing row, and disabled review action agree. |
| 5. Review | `artifacts/05-review.png` | Evidence status and acceptance meaning are visible. No commit or deployment claim. |
| 6. Narrow layout | `artifacts/06-mobile.png` | Single-column content and sample products; primary action reachable with scrolling; no horizontal overflow. |

The dark rail, conversation and light workspace remain distinct without excessive card nesting. The sample preview uses original CSS illustrations and typography rather than copied application assets.

Remaining design limitations: compact metadata is small and needs a real contrast/zoom audit before production; at narrow widths the project rail and earlier chat bubbles are hidden to prioritize the current task, so a production mobile design needs explicit drawers/history controls. Only the filter control's keyboard path and native dialog Escape behavior were exercised, not a full screen-reader audit. One ordinary page scroll is used rather than an IDE's independent panes. The prototype intentionally lacks project switching, a real file explorer and an extension installer.

## Exact blocked action

- Action: navigate the test browser directly to the standalone HTML file.
- Target: `file:///workspace/muse-workspace-spike/artifacts/Patchlight-Interactive-Demo.html`.
- Status: **denied**, with Chromium `net::ERR_BLOCKED_BY_ADMINISTRATOR`.
- Completed independently: the same standalone HTML was served normally by localhost and passed its workflow smoke test.
- Unresolved: opening the file directly from disk remains unverified. No retry or browser-policy change was attempted. This was a browser policy restriction, not an automatic approval-review rejection.

## Not tested or claimed

No Muse installation, SDK handshake, model call, authentication, real file edit, test runner, git checkpoint, persistent storage, plugin grant, publishing, cross-browser compatibility, or commercial license clearance. Mock acceptance survives only within the current page lifetime. The future architecture in the handoff is a proposal, not implemented infrastructure.

All product files were created under `/workspace/muse-workspace-spike`. The existing yoru application and its secrets/configuration were not used; only its preinstalled Playwright package was used as execution tooling. No dependency installation, paid call, subscription, push, public repository or outreach occurred.
