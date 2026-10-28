# Skill context inspector validation

28 October 2026. Shared browser-preview and Electron renderer.

Customize → Skills → Installed now preserves Muse's startup and invocation context estimates and loader diagnostics. The compact catalog summary and each skill's details expand with the app's shared disclosure motion. Aggregates use the whole installed catalog, including while filtering to one skill. Missing, malformed, omitted or overflowing observations remain partial or unavailable rather than appearing as zero cost.

Failed refreshes retain a visibly marked last successful inventory only for the same CLI, project and project-trust decision. A first failure has no estimate. Activation changes always request a fresh native list; retained observations cannot authorize a mutation. Recovery clears the stale state. Cached results are copied so callers cannot modify subsequent observations.

## Verification

- Red tests reproduced the original dropped metadata and the later review finding (lost rows after refresh failure).
- `node --test test/skill-context.test.mjs test/customize.test.mjs`: 40 passed, including metadata projection, safe numeric bounds, duplicate/truncated catalogs, global aggregation, success/failure/recovery, context invalidation and fresh-only mutations.
- `npm test`: 1,093 passed, zero failures.
- `npm run build`: TypeScript and production bundle passed; the existing bundle-size advisory remains.
- Preview catalog smoke: 12 checks passed. Electron catalog smoke: seven checks passed, using the built renderer and real preload with isolated main-process fixtures.
- Shared inspector checks cover keyboard disclosure, filtered totals, activation refresh, unavailable fields, plain-text diagnostics, narrow layout, stale retention and recovery. Screenshots wait for finite disclosure animations to settle.
- Existing preview/desktop parity suite: 92 scenes passed before the stale-retention correction. The corrected inspector was then exercised in both catalog suites.
- A read-only actual Customize service snapshot using installed Muse 1.4.14 returned 27 skills, 4,617 reported startup tokens, complete numeric coverage, one loader note, and no service errors. No model call or profile mutation was required. Direct CLI inventory earlier returned the same count/estimate with no diagnostic; workspace context differs from the service's default profile working directory.
- Independent review found one actionable issue, stale retention; the regression was reproduced and fixed. No other actionable findings were reported.

Local evidence (ignored artifacts):

- `artifacts/skill-context-retention-red.txt`, `artifacts/skill-context-retention-green.txt`
- `artifacts/skill-context-tests-final.txt`, `artifacts/skill-context-build-final.txt`
- `artifacts/catalog-preview/compact-uoNJq2/report.json`
- `artifacts/catalog-desktop/source-zbHufX/report.json`
- `artifacts/skill-context/native-kBPuKp/report.json`

Native values are estimates reported by Muse, not measured live prompt occupancy or billed usage. The [official skills guide](https://meta-models.github.io/muse-code-sdk/next/guides/extend/skills/) documents metadata inspection, activation, lazy instruction loading and catalog compression. Runtime trust and compression can change actual context. Preview and smoke examples are explicitly simulated. No claims are made about skill execution or model quality.

The preceding motion release, 0.2.114, was installed through MuseBench's updater and reopened. Its installer matched the public manifest SHA-512; installed executable and ASAR versions matched. This feature still requires its own exact-head CI/release and installed UI verification after this validation record is committed.

The first publication attempt did not release an installer. Windows CI exposed the late-font startup race documented in the motion validation report and an asynchronous smoke assertion: the recovery check counted the stale badge before the refresh IPC reply updated React. The smoke now waits for the badge to disappear, preserving the required recovery behavior. No application refresh behavior or assertion was removed.
