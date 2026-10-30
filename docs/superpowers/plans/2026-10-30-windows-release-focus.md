# Windows release focus implementation

Spec: `docs/superpowers/specs/2026-10-30-windows-release-focus-design.md`

Use the existing isolated worktree and inline execution. User authorized this simplification; no additional approval is needed. Base is `193f344211a691da02cf4fdcd90b33ab943bdce1`. The preceding reviewed reply-change feature stays a separate commit and is pushed with this change to avoid another all-platform release.

## Task 1: Select release targets and align Windows test setup

- [x] Add failing coverage for a default Windows-only release, explicit all-platform selection, unexpected/missing targets, CLI profile selection and runner temporary-directory selection.
- [x] Implement the default Windows profile and manual full-platform build-only workflow option. Keep publication/hash/source checks and update release notes and platform docs.
- [x] Align CI temporary directories; extend only the flaky fixture's bounded polling and directory cleanup tolerance.
- [x] Run focused asset, setup, project-action and work-activity tests; parse both workflows; run the full offline suite and build. Inspect every result.
- [x] Obtain one independent whole-change review, fix material findings with regression evidence, and commit the tested source.
- [ ] Push to main after checking superseding work; record the resulting exact candidate and CI runs in the handoff ledger.

Interfaces: workflow selection must match collector expectations; temporary-directory setup must precede tests in validation and release. No conflict: both consume one explicit profile and one shared setup script.

Review focus: skipped job propagation, dispatch boolean semantics, incomplete all-platform publication, stale assets/source versions, Windows directory-handle lifetime, and preserving installer/updater compatibility. Distinguish local tests, CI, publication and installed proof.

## Task 2: Finish the latest verified desktop update

- [ ] Wait for terminal success of validation and release for the exact latest authorized main. If a failure is actionable, fix its cause rather than repeatedly rerunning unchanged.
- [ ] Verify installer provenance and hashes, recheck idle work, back up the complete profile, gracefully close, install and reopen.
- [ ] Verify installed version/provenance through native control; update the validation receipt and heartbeat handoff.
