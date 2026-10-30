# Reviewed project actions — source validation

CX02 adds portable `.musebench/actions.json` definitions, compact editing and exact command/folder/shell review in Checks, and owned command output, timeout and stop receipts. Preview and desktop share the component; preview never executes commands. Actions do not satisfy package validation or checkpoint acceptance.

## Evidence

- Service tests first failed for the missing module; controller tests first failed for the missing inspection API. Final focused suite: **15 passed**. Coverage includes malformed/oversized/linked definitions, unsupported platforms, stale saves/runs, owner changes, save without execution, real Windows command output/exit, timeout, cancellation, restart receipts and bounded output.
- Final full suite: **1,483 passed, 0 failed, 1 skipped**. The existing optional native workflow replay has no capture in this checkout; it is not a provider acceptance claim.
- Production build passed, with the existing large-chunk advisory.
- Shared project-action UI: **6 Chromium + 6 Electron checks passed**, including explicit review, save without run, errors, stale inspection, duplicate locking and 390px layout. Screenshots inspected.
- Work Activity: **12 checks per engine passed**. Browser preview smoke passed. `git diff --check` passed.
- A fresh independent whole-feature reviewer found **no material issues**, independently reran all 15 focused tests and cleared merging. No model request, billing operation or account/security change was made.

Local evidence is retained in `.superpowers/sdd/2026-10-30-project-actions/` and `artifacts/project-actions/`; these directories are ignored. Installed acceptance is separate: [0.2.181](2026-10-30-desktop-0.2.181.md) is the preceding release, not proof of CX02.

## Decisions and boundaries

- Reuse the existing check process owner and receipt store, with explicit action metadata. This avoids overlapping executors; action results are excluded from validation and checkpoint checks. The tradeoff is a shared current-output terminal.
- Keep review/edit controls in Checks and support bounded noninteractive commands. Interactive terminals and action deletion are outside this feature; users may edit their project file.
- Exact bytes, canonical root, platform and resolved folder bind a reviewed definition. Rechecks reject stale content. An external writer racing a filesystem operation is not covered by a universal atomic snapshot guarantee.
- Windows execution was exercised. macOS/Linux command selection was inspected and platform resolution was tested, but native execution on those systems is not claimed by these local results.
- Preserve ignored evidence through release acceptance. The user's continuous implementation and publishing authorization covers these implementation choices; no additional permission grant is introduced.

Deferred minor: add a direct regression that navigates while an action is running and immediately starts another action, checking that the old callback cannot alter the new receipt. Stop/navigation receipts and ownership guards are covered separately; the reviewer found the combined path correct by inspection.
