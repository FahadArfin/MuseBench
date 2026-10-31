# Meta app list inside Settings Connections

Replaces the launcher-card page with eight compact service rows in Settings → Connections. Each Connect action identifies its app. Verified connected entries expose Manage through Meta's official settings; no disconnect or consent is automatic. Refresh uses a disposable sandboxed official Meta page in the existing session, preserving foreground chats and drafts. Unreadable or ambiguous status stays unknown. Browser preview explicitly reports that it cannot read real account connections.

## Checks

- Full shared-app browser and Electron smoke passed: `artifacts/settings-connections/preview-zzsVfD/report.json`, `artifacts/settings-connections/desktop-mGKpoB/report.json`.
- Eight individual provider commands, connected-state rendering, failed refresh invalidation, existing embedded catalogs and native routes, narrow navigation, keyboard focus, light/dark and reduced motion passed. Tests deny external network; provider requests: zero.
- Build passed with existing large-chunk advisory.
- Backend full unit suite: 2,139 passed, 1 existing skip, 0 failures (`artifacts/meta-apps-unit-tests.log`).
- Review found row-ownership and asynchronously arriving row defects. Exact visible row identity now excludes controls belonging to unknown sibling providers; bounded cancellable readiness waits for real app rows. All 111 focused backend tests passed after correction (`artifacts/meta-apps-focused-review.log`). Independent re-review confirmed both fixes, including an additional delayed Connect/abort probe, with no remaining actionable P1/P2 findings.

## Visual comparison

Source: user screenshot `codex-clipboard-3b066c07-b6e2-43c0-a6f1-00dbc6550644.png` (789×486). Implementation: `preview-zzsVfD/connections-dark.png` at 1508×1043 CSS pixels, density 1; narrow `connections-narrow.png` at 390×760. These show different outer shells and auth states, so comparison is of the app list inside the retained MuseBench Settings shell, not pixel-identical outer geometry. Both source and implementation were inspected together.

- Typography: retained shared Inter UI font, 13px compact rows; clear 32px service icons.
- Layout: one rounded group, 49px rows, inset separators, titles left and Connect right, matching the source rhythm. Narrow view fits without horizontal overflow.
- Colors: existing solid charcoal reading surface, light service icon tiles, restrained blue interaction states. No transparent chat content.
- Assets: three multicolor Google marks and one Outlook mark bundled with pinned provenance. Four unavailable brand marks use distinct Lucide service-category icons, a deliberate deviation from the reference.
- Copy: all eight exact service names preserved. Connection availability and preview limitations are explicit; secondary destinations are compact footer actions rather than replacing the app list.

No live provider permission was granted. Fixture routing is not authorization acceptance.

## Installed verification and live navigation correction

Version 0.2.295 (37ac42b) passed all six CI groups and was installed from its hash-verified published Windows x64 installer. All seven native Settings views passed; the eight app rows rendered in the installed Connections page. A full profile backup preserved 1,516 files (632,923,753 bytes).

The live status read exposed a defect absent from fixtures: Meta's profile dropdown is driven by `pointerdown`; calling `click()` leaves it closed. The same signed-in session's official Apps page displayed all eight apps as unconnected. A bounded diagnostic compared the old action (no menu, two attempts) with a single pointer press on the exact observed profile trigger. The latter opened Settings and read all eight real statuses successfully. No account connection, consent, payment, or model request was made. Before evidence: `artifacts/desktop-update-settings-295/meta-apps-live-probe-before.json`.

The focused correction dispatches pointerdown only on the exact profile navigation trigger. It waits for menu state before a click-only compatibility fallback, and preserves cancellation/origin/deadline checks. The corrected source adapter was exercised in the installed Electron runtime and the same real Meta session: settings opened in 2,074 ms and all eight real statuses were read by 2,079 ms. Evidence: `artifacts/desktop-update-settings-295/meta-apps-live-probe.json`. This verifies read-only provider acceptance; granting app access remains a user action.

Correction verification: full unit suite 2,143 passed, one existing skip, zero failures (`artifacts/meta-apps-pointer-full-tests.log`). Independent review cleared the scoped change, independently passed all ten adapter/navigation tests, and confirmed navigation during the fallback wait cancels without a late click. Existing browser/desktop layout receipts remain applicable because this correction does not change UI files.

final result: passed
