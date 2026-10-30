# Integration panels validation

OC05 adds compact installed integration settings to shared preview/desktop details. The backend only accepts three bounded fields and requires a current existing source review. No model calls or personal integration changes were made.

## Source evidence

- Task 1 RED: missing service and unsupported Customize commands reproduced in `task1-red.log` and `bridge-red.log`. GREEN: 162 focused panel, Customize, plugin and project MCP tests passed in `task1-green.log`.
- Task 2 RED: the browser smoke could not find Run settings before implementation (`task2-red.log`).
- Shared smoke passed: `artifacts/integration-panels/preview-XAXpFO` and `desktop-Cuk3Ai`. Desktop uses actual Electron/Customize IPC with isolated configuration and blocked external network. It verifies private-field preservation and backups, explicit review before writing, stale-source rejection, draft isolation, reconnect wording and narrow layout. Preview also verifies late-response isolation. Neither test is provider acceptance.
- The narrow desktop check reproduced a two-pixel overflow while the disclosure chevron rotated (`desktop-6DsQP1`). Space for the rotation fixed it; the layout assertion was retained.
- Plugin tools and catalog browser/desktop regression suites passed (`plugin-regression.log`, `catalog-regression.log`). Existing review controls, layout and navigation remain covered.
- Full unit suite: 1,647 passed, no failures, one pre-existing optional skip (`task2-full.log`). Production TypeScript/Vite build passed (`task2-build-final.log`); the existing chunk-size advisory remains.
- The shared smoke is included in the existing parallel Windows extensions group. No additional serial release stage was added.

Logs and the ledger are retained under `.superpowers/sdd/2026-10-30-integration-panels/`. Exact release and installed verification are tracked separately after review/publication.

## Decisions and limitations

Continue under the standing implementation/delivery authorization; no repeated approval round. Reuse the attached isolated worktree, and carry the verified 0.2.204 installation receipt with this feature to avoid a documentation-only release. Preserve evidence rather than deleting it or rerunning unchanged passing checks solely for bookkeeping.

The optional atomic approval callback rechecks ownership and saved source before a grant can be committed. Saved is distinct from connected, applied to an existing native session, or accepted by a provider. Only already-reviewed integrations are editable. Version 1 deliberately uses finite host controls; OpenCode executable plugins and MCP Apps have different contracts and are not claimed as compatible.

Independent final review found one Important issue: explicit null required/timeout settings were displayed as defaults. Three regressions reproduced it before correction; all 36 panel tests now pass. Defaults apply only to absent fields, and malformed present values leave the panel read-only. No Critical or Minor findings were reported. Actual provider acceptance and published/installed behavior were correctly excluded from that source review and remain separately gated.
`nFinal correction verification: full suite 1,650 passed, zero failures, one optional skip (`review-full.log`); shared preview `preview-ctwDeB` and real Electron `desktop-lki7ZV` passed (`review-shared.log`).
