---
name: musebench-release-check
description: Use when preparing or verifying a MuseBench desktop package or reporting whether tested changes reached the installed application and GitHub.
---

# MuseBench release reference

Confirm current repository scripts and the user's requested target first. This skill grants no extra permission to publish, replace an installation or interrupt active work.

1. Record the revision and inspect local changes. Run relevant regression checks, `npm.cmd run build`, `npm.cmd run test:browser-preview`, and `npm.cmd run test:preview-parity`. Read failures; do not count skipped scenes as coverage.
2. For a requested desktop package, use `npm.cmd run package`, then `node scripts/verify-personal-package.mjs`. The verifier compares packaged sources/helpers with the checkout; a successful build alone does not prove the installed app is current.
3. Review the final diff and verification evidence. Plan/Implement/Verify phases in one session are a self-review. Claim independent review only with a distinct reviewer and an identified diff/revision.
4. Preserve the app profile, active sessions and ignored workspace data when updating the installed application. Stop if active work or an approval block prevents a safe update; do not bypass it. Verify the exact installed artifact and startup separately from packaging.
5. When GitHub push is authorized, commit scoped files, push without force, and verify the remote tip. Report local tests, CI, packaging, installed version and launch as separate facts. Do not claim deployment or installation merely from a commit or package command.

If any step cannot run, name that missing evidence rather than silently substituting preview behavior.
