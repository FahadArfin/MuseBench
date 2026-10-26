# MuseBench validation

25 October 2026, Windows x64. Local application only; no publication or deployment.

## Current result

The Codex/Claude-style coding workspace passed **216/216 automated tests**, the TypeScript/Vite build, Windows packaging, **16/16 source redesign checks**, **16/16 packaged redesign checks**, **11/11 packaged review-workflow checks**, and **9/9 real packaged Muse shell-workflow checks**. No renderer JavaScript errors occurred in those UI workflows.

The final real Muse request edited only the two requested lines, ran the exact sandboxed PowerShell/npm command, and passed all three fixture tests. Its native command/output card appeared in the conversation. The separate app Check remained empty until explicitly run. The real preview, independent test, exact-revision checkpoint, command evidence and restart recovery all passed. Native cleanup was confirmed. No sign-in or billing intervention was needed.

The last build was validated at `2026-10-26T00:01Z` onward (25 October locally). An earlier successful live run is retained separately; the final report below applies to the final packaged renderer.

## Evidence

- [Machine-readable validation](../artifacts/validation.json)
- [Unit-test output](../artifacts/redesign-unit-tests.tap)
- [Source redesign](../artifacts/redesign-ui/source-0hxPjT/report.json)
- [Packaged redesign](../artifacts/redesign-ui/packaged-MDOAFh/report.json)
- [Packaged review workflow](../artifacts/packaged-ui-results.json)
- [Final real Muse workflow](../artifacts/live-workflow/2026-10-26T00-01-47-360Z/report.json)
- [Package/source comparison](../artifacts/redesign-package-verification.json)
- [Visual QA](../design-qa.md), [source review](redesign-review.md), [frontend research](FRONTEND-RESEARCH.md)

The 17 packaged Electron/controller/runtime/template/frontend files match the final source/build bytes. The packaged native helper and build manifest match the compiled originals. Packaged application metadata and production dependency declarations match; Electron Builder intentionally omits scripts, devDependencies and build configuration.

| Artifact | SHA-256 |
| --- | --- |
| MuseBench.exe | d26b863c14de327552b0e6a39d1b7a409d6005b4a91412bb4b04d262c99ae26c |
| resources/app.asar | 1fb03602628a4b5a062ec35dbed79c5a4041c51f4623224ee66529f8f0e30b40 |
| resources/native/MuseBenchJob.exe | aef238d75e2244fb532d779bde0ecaa534e17878063a406a18cf3d0b7c49dfae |

## Verified interactions

Dark/light/system settings and text preferences persist. Keyboard search focuses its input; Ctrl+N, Ctrl+B, Ctrl+,, Ctrl+Enter and optional Enter/Shift+Enter behaviors work. Search and sidebar restore the correct task, project, messages and original file baseline. Unsent requests survive choosing an existing project. Unsaved plans survive Customize/Home. Plan guidance remains explicitly distinct from read-only enforcement. Manual conversations show Notes. The UI has no page overflow at 390, 1280 and 1440 pixels; narrow chat, review and navigation remain accessible.

Tests used disposable project/data directories. Normal application data is retained. Legacy current tasks migrate only with a known project association; unrelated unassociated old task records remain stored and are not guessed into another project.

## Scope and retained limits

Muse's existing sandbox, Ask me profile, supervised process cleanup and review gates remain enabled. The native runtime/helper source was unchanged by this redesign. The prior sandbox-confinement, cancellation and working-copy probes are preserved in [VALIDATION-sandboxed-shell.md](VALIDATION-sandboxed-shell.md) and [validation.sandboxed-shell.json](../artifacts/validation.sandboxed-shell.json); those specialized probes were not repeated as new redesign claims.

Windows Muse requests remain independent even though MuseBench chat journals now persist and are navigable. The existing profile-directory shell workaround, project snapshot limits and supported preview recipes still apply. Appearance resembles the supplied references; unsupported vendor plugins, accounts, voice and model selectors are not fabricated. This is not a full parity or exhaustive security claim.
