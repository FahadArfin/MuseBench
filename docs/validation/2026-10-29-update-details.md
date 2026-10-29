# Update details validation

29 October 2026. Roadmap C07. Baseline fcf434f; separate Customize compactness fix 46b89d8 intervened.

Settings now distinguishes installed, offered and confirmed downloaded versions. Release text is bounded plain text with a link to that exact published version. The green toolbar tooltip uses the same version. A ready update identifies active Code chats, checks, queues, goals, Work, Sites, dictation and app operations that prevent restart; it never stops that work automatically.

The panel refreshes only while open with a downloaded update, skips hidden-window polling, and stops on unmount. Newer update events supersede late status responses. Compact service observations omit retained transcripts and artifacts. Installation separately rechecks the original authoritative readiness and shutdown locks.

## Evidence

- Reproduced missing version ownership, metadata and blocker observations with failing tests before implementation.
- Independent review identified full Work/Sites snapshots during polling. Five failing regressions preceded compact service observations and a complete composition test that prohibits full snapshots. Pending native cleanup was also reproduced before correction.
- 89 focused updater/controller/Work/Sites tests passed. The full unit suite passed: 1,440 tests, no failures or skips.
- Seven browser and seven Electron UI checks passed: exact version/link ownership, inert notes, live named blockers, polling cleanup, late-event ordering, unconfirmed download rejection, narrow layout and reduced motion. No provider or real installer was invoked.
- Final TypeScript and production build passed, with existing bundle-size advisories. All 100 shared browser/Electron preview parity checks passed with no errors after rebuilding both from the final sources.
- Final independent review found no remaining actionable findings and independently reran 19 in-memory updater/readiness tests successfully.

Ignored evidence is retained in `.superpowers/sdd/2026-10-29-update-details/`, `artifacts/update-details/` and `artifacts/preview-parity/report.json`.

Published and installed acceptance remains pending. These checks do not establish that a new release is already available or installed; release assets must finish building, pass their platform checks and be verified before installation.
