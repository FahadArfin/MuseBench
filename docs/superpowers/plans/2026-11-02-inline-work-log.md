# Inline Code work log implementation plan

**Goal:** Show Muse Code's actual ongoing work as compact, expandable command/file/web groups, matching the two supplied Codex screenshots.

**Design:** Keep the existing transcript, Thinking/Worked duration, detailed run view and Sub-Agents controls. Display compact tool groups inline below the duration. Consecutive tools share a group; model steps and agent events separate groups. Groups start collapsed, retain the user's expansion during streaming, and expose individual commands/output on demand. A live status line remains visible. Use the existing fonts, colors and icon library; no new raster assets are needed. Show only runtime observations, never invented progress or hidden model reasoning.

**Architecture:** A pure bounded shared projection classifies/groups activity and extracts safe display subjects from known tool arguments. Exec associates shell results using the native call ID; MSP observes owned native tool items even when optional workspace tools are off. Both desktop and preview use the same React work-log component. Existing persisted rows without subjects still render honest generic labels.

**Scope:** Local batch only. No publication, installation, installed-app restart, paid provider calls, permission changes or profile mutations.

- [x] Add focused failing tests for grouping, stable IDs, failure/wait states, exact shell correlation, owner/revision rejection and persistence.
- [x] Implement bounded display fields and native observation; preserve all run/permission authority checks.
- [x] Build the inline groups with keyboard-accessible disclosures, readable output, streaming stability and narrow layouts.
- [x] Verify targeted runtime/controller tests, typecheck, a focused Electron interaction flow and screenshot comparison. Preserve the existing detailed activity/scroll behavior.

## Verification

- Build/typecheck passed (`artifacts/work-log-review-build.log`).
- 260 targeted runtime/controller/projector tests passed (`artifacts/work-log-final-targeted.log`). After review fixes, 10 directly affected projection/tracker tests passed (`artifacts/work-log-review-fixes.log`).
- Isolated Electron checks cover collapsed/expanded groups, keyboard use, single-to-multiple activity streaming, retained expansion/draft, foreign-run receipt exclusion and narrow/reduced-motion rendering. The pre-fix owner regression produced four groups instead of three (`artifacts/work-log-owner-red.log`).
- Existing activity UI smoke passed (`artifacts/activity-ui/source-yVjbzj/report.json`); shared chat renderer/responsiveness and 150-message transcript checks passed (`artifacts/code-render-responsiveness/report.json`, `artifacts/transcript-render/final-PgHhtJ/report.json`). Test servers now tolerate occupied preview ports without terminating the running app.
- Final fresh review found cross-run shell receipts on the preview surface; fixed at the shared RunActivity ownership boundary. Held observations also terminalize consistently when their parent ends.
- Visual comparison and accepted differences are recorded in `design-qa.md`.

## Limits

This is source and isolated Electron/preview evidence, not a paid live Muse request or installed-app verification. The UI displays only observations supplied by the runtime. MSP exposes known native tool arguments while working; exec can show complete command text when its bound shell receipt arrives. Missing historical subjects remain generic. Model reasoning is excluded from the work log; no synthetic assistant commentary, agent events, or file line counts are generated. The installed app and profile were untouched; this batch remains unpublished.
