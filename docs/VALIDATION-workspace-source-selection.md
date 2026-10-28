# Workspace source selection validation

Validated 28 October 2026.

## Observed desktop failure

During installed 0.2.118 acceptance, opening the MuseBench checkout failed with `EISDIR` on `artifacts/activity-baseline/app.asar`. The archive is a regular file ignored by Git. The controller's snapshot walker applied fixed exclusions but did not consult repository ignore rules; Electron's archive-aware filesystem then tried to treat that generated archive as a directory.

## Change

Repository-root snapshots now use a bounded, read-only `git ls-files --cached --others --exclude-standard -z` inventory to prune the existing filesystem walk. Tracked files remain included even when an ignore rule matches them. Untracked ignored build output is omitted, and nested ignore rules and negations are honored. Git worktree `.git` files are supported. Plain folders retain filesystem inspection, even when their parent repository ignores the selected directory.

Existing credential/dependency exclusions apply before the Git output budget and again during filesystem inspection, including for tracked files. Source paths follow `core.ignorecase`, preserving changed contents after case-only Windows renames while retaining the actual disk spelling in snapshots. Links, outside-root paths, unsupported file types and the existing 2 MiB/file, 24 MiB/total and 4,000-file limits remain guarded. Git commands have a five-second timeout and a bounded output buffer; inherited `GIT_*` overrides and filesystem monitor execution are disabled. Invalid repository metadata fails visibly without registering a partial project.

Git documents tracked/untracked selection, ignore handling and NUL-delimited paths in its [official ls-files reference](https://git-scm.com/docs/git-ls-files). Gitlinks and embedded repositories retain their existing bounded subtree inspection; recursive repository support is not added by this fix.

## Regression evidence

- Initial failures: `artifacts/workspace-ignore-red.log` reproduces ignored generated files exceeding the source-file limit.
- Independent review found two additional omissions: case-only renamed source paths and an unignored dependency tree overflowing the Git output budget. Both failed in `artifacts/workspace-ignore-review-red.log` before their fixes.
- `test/workspace-ignores.test.mjs`: seven real-filesystem/Git regressions pass (`artifacts/workspace-ignore-review-green.log`). Covers ignored archives, tracked ignored source, tracked credential exclusion, new files, nested ignore negation, plain folders, corrupt metadata, worktrees, case-only file/directory changes, and 12,000 excluded dependency files.
- The command-copy test now initializes a real Git repository instead of using a fabricated `.git` directory; its byte-preservation and exclusion assertions are unchanged.
- `scripts/catalog-desktop-smoke.mjs` now opens an isolated real repository with an ignored 3 MiB `app.asar` through the actual Electron preload/controller before installing its catalog fixture. It inspects the project's instruction file without granting trust. The existing catalog checks continue afterward.
- Final local verification: all 1,117 tests passed (`artifacts/workspace-ignore-suite-final.log`), TypeScript/production build passed (`artifacts/workspace-ignore-build-final.log`), and all 10 real Electron/fixture integration checks passed (`artifacts/catalog-desktop/source-FIcrJ3/report.json`). The pre-existing bundle-size advisory remains. Independent follow-up review found no additional issues after the two fixes.

No provider requests, paid model runs, account changes or automatic project-trust grants are involved. Exact-head CI, release installation and native acceptance are recorded separately with the release artifacts after publication.
