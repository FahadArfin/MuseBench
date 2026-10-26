---
name: musebench-runtime-check
description: Use when a MuseBench native run, shell check, session, or queued prompt fails or appears complete without reliable execution evidence.
---

# MuseBench runtime check reference

Verify the files and scripts below in the current checkout. Follow the concrete failing request; do not reset user sessions to simplify diagnosis.

- `src/runtime/exec-events.mjs` validates one native run's envelope, ownership and terminal evidence.
- `src/runtime/exec-conversation-events.mjs` folds bounded workflow handoffs and reporting continuations. An intermediate terminal is not necessarily completion of the whole process.
- `src/runtime/exec.mjs` owns native processes and cleanup. `src/controller/index.mjs` binds each task, session, queue and result. Look for cross-task or stale-turn attribution before treating late output as current.
- `npm.cmd test` runs regression tests. Add a focused reproducer for the actual failure; cover cancellation and malformed/late events when changing ownership.
- `node scripts/probe-muse.mjs` is a no-model host preflight. Native sandbox readiness and MSP handshake readiness are separate facts. Do not bypass the sandbox to make a probe pass.

On Windows use `npm.cmd` where PowerShell execution policy blocks npm.ps1. Propagate command failures explicitly:

```powershell
$ErrorActionPreference = 'Stop'
Get-Command npm.cmd -ErrorAction Stop | Out-Null
npm.cmd test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
```

A wrapper's zero exit code may accompany “command not found.” Confirm the intended executable ran, expected tests were collected, and the relevant case passed on the changed revision. A model's completed turn is not test evidence. An unconfirmed process cleanup remains unresolved even if the UI looks idle.
