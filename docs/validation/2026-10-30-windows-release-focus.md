# Windows release focus validation

User steering: focus on Windows 11 x64 and defer other platforms to reduce release overhead. Changes apply to the release workflow, asset selection, documentation and two Windows test fixtures. Shared desktop/preview application code is unchanged by this focused commit.

Normal main pushes and ordinary manual runs select Windows x64 only. An explicit manual checkbox retains all seven platform builds as test artifacts, without publishing a release. Routine publication accepts skipped optional jobs but still requires Windows success; any selected job failure or cancellation blocks it, and the collector rejects incomplete or unexpected targets. Published versions remain immutable.

## Evidence

- Previous candidate 0.2.182 / `4634df7a444c46143f69cd2e2d71abec4f851e65`: validation 40994078975 succeeded; release 40994078972 failed twice in the Windows project-action fixture's 15-second wait. Attempt two also hit a Windows fixture directory handle during removal. Other platforms had already completed; they were not the direct cause of these failures.
- RED: default collection required a missing ARM target; the runner-temp regression observed the ambient user temporary directory; the profile selector did not exist.
- GREEN: focused asset/workflow/temp/project-action/activity suite **35/35**. This includes real CLI collection and hashing, absent/extra targets, explicit all-platform selection, failed/cancelled/skipped job scenarios and unchanged updater metadata.
- Final full offline suite after review fixes: **1,508 passed, 0 failed, 1 existing optional replay skipped** (1,509 tests). No paid model request was used.
- Production build passed. Existing advisory for a bundle above 500 kB remains.
- Diff whitespace check passed. Detailed local logs remain in `.superpowers/sdd/2026-10-30-windows-release-focus/`.

## Decisions and limits

- Retain other-platform configurations behind manual opt-in; turning it on intentionally restores their build time.
- Align release and validation on the canonical runner-owned temporary directory. Extend only fixture polling to 60 seconds and fixture deletion retries to a maximum of 11 seconds; preserve the actual completion/output/identity/exit assertions. The exact CI contention cause is not established, so a green local run is not proof of remote recovery.
- Keep ignored review and release evidence under the user's preservation instruction.
- Independent review found two material publication edge cases. Both were reproduced by regression tests and fixed: full-platform test runs never publish/replace the automatic Windows release, and an existing draft remains unchanged and blocks automatic publication. A test executes the actual publication shell against a local GitHub CLI substitute; it is not a real GitHub publish.
- Focused post-review suite: **36/36 passed**. No deferred minor findings.
- Remote CI recovery, artifact integrity/installed behavior and future native execution on deferred platforms remain separate acceptance steps. Installed 0.2.181 remains the last verified desktop until a newer exact artifact passes them. Local success is not substituted for any of these external checks.
