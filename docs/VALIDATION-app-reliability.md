# App reliability batch — 2026-10-31

This local batch addresses all seven findings and four observations from
`artifacts/app-audit/report.json`, based on source commit
`c449bc44e1bcb29145d76b5d6f76f7c92e58afa5`. It preserves the existing login and
typing changes. No commit, push, publication, installer, installed-app restart,
real profile modification, provider message or paid request was performed.

## Implemented fixes

| Audit item | Result |
| --- | --- |
| Browser-login startup/shutdown stalls | Restore, save and close have deadlines and late-write fences. Final close retries changed cookie revisions under its original deadline. An unabortable restore quarantines the same partition until restart. Protected-storage failures produce a persistent, safe personal-browser notice. |
| Billing helper cleanup | The native owner remains retained after an unconfirmed exit. Account changes and new probes remain blocked until terminal confirmation; documented failed-spawn termination releases ownership. |
| Cancelled sign-in cleanup | Sending kill no longer means the child has exited. Window-independent owners retain cleanup blockers through background mode, updates and quit. |
| Slow repository refresh | Cancellable background inspection runs outside the action queue. Sends, stops, navigation and strict evidence operations invalidate stale observations. |
| Stale dictation continuation | A superseded start or stop cannot globally cancel a newer recording or append speech to a different draft. Early native speech is buffered for its matching capture. |
| Oversized dictated draft | Speech shares the 16,000-character message budget. Excess is copyable, reinsertable or explicitly discardable, persists per chat through window/app restart, and is never silently evicted. Quota failures retain the prior durable snapshot and in-memory text, show a warning/retry, and stop further dictation. |
| Controller close ordering | Close interrupts preparation, drains accepted durable writes, rejects queued new execution, then confirms final disconnects. Cleanup failure no longer silently forces normal quit. |
| History persistence cost | Revision gates eliminate unchanged writes/publications. Immutable encoded messages are reused across changing tails; task/app snapshots retain their existing complete durable JSON format. |
| Snapshot disk growth | Grace-period, reference-aware incremental CAS collection preserves retained baselines, checkpoints, restores, nested descriptors and in-flight captures. Uncertain inventory or concurrent writers prevents deletion. |
| Build dependency advisories | Patched packaging dependencies retain legacy consumer API compatibility. Full dependency audit reports zero vulnerabilities. |
| Multiple native-control relays | Shared authenticated loopback HTTP supports multiple clients inside one app listener. Stdio remains compatible and cleans up on EOF, termination or confirmed parent disappearance. Active clients are not killed. |

Persistent speech recovery is bounded to 262,144 UTF-16 characters per chat,
1,048,576 characters total and 128 owners. CAS deletion has a 24-hour grace
period; mark and directory work is incremental. Owner inventory uses retained
keyset statements rather than the reproduced Node 22.14 temporary-iterator
crash path. See [controller validation](VALIDATION-controller-reliability.md).

## Review corrections

Independent review also caught and verified fixes for failed executable spawns
being mistaken for live children, a changed cookie invalidating the final save,
silent persistence failures, recovery loss on BrowserWindow destruction, and a
native SQLite access violation with 48 MB of retained chat JSON. The final
controller, lifecycle and native-control/dictation reviews report no remaining
confirmed actionable findings in their inspected changes.

The desktop flow also reproduced quit being blocked by an automatic account
status read. Close/quit now distinguish read probes from billing mutations and
wait for pending IPC to drain. Full ownership/update checks still include those
probes, and unconfirmed cleanup or actual account changes retain their blockers.

## Local evidence

- Full unit suite: 2,302 passed; zero failed, cancelled or skipped, including
  six regressions executing the actual close/quit/IPC handlers with held reads,
  billing mutations and cleanup faults.
  `artifacts/app-audit/reliability-unit-final.log`.
- Full build, including TypeScript, renderer, native helpers and MCP bundle:
  passed. `artifacts/app-audit/reliability-build-final.log`.
- Windows x64 directory package: passed. All 336 packaged source/build files
  and both native helpers match current source.
  `artifacts/app-audit/reliability-package-verification.log`.
- `npm audit`: zero vulnerabilities across production and development
  dependencies. `artifacts/app-audit/reliability-dependency-audit.json`.
- Protected-login restart/explicit-logout/deadline notice: six real-source
  Electron checks passed with fictional cookies and external DNS blocked.
  `artifacts/app-audit/reliability-session-source.log`.
- Dictation: 21 focused unit tests, nine browser lifecycle/quota checks,
  seven subscription checks, and four actual Electron window/process lifecycle
  checks passed. Reports use counts/lengths, not transcript content.
- Controller scheduling/persistence/GC: 128 focused tests passed. Real SQLite
  rows are checked on each changing flush; canonical text beyond 17,000
  characters, search/indexing, completion and restart remain intact.
- Final quiet changing-tail benchmark: whole-transcript encodings fell from
  48 to zero and message-window characters encoded from 114,431,369 to 191,594
  (over 99.8% less). Median excess above the 45 ms scheduling timer fell from
  18.11 to 16.51 ms; the worst sample increased from 46.46 to 54.98 ms. SQLite
  writes and host I/O still produce outliers, so no worst-case latency claim is
  made. Both versions retain the full canonical tail, index and restart data.
  `artifacts/app-audit/controller-changing-stream-before-after.json`.
- Native-control focused subset: 44 passed, plus nine concurrent lifecycle
  checks. HTTP tests cover two clients, unchanged configuration after restart,
  revocation, private grants, request bounds and late-result rejection.
- Desktop batch: all 18 checks passed, including 100 preview/desktop parity
  scenes, typing during slow polling, background mode, saved-chat/draft flows,
  billing, mobile pairing, dictation and both control paths.
  `artifacts/app-audit/reliability-desktop/report.json`.
  The original mobile shutdown attempt was invalidated after forced fixture
  cleanup; its evidence is preserved separately. A fresh bounded recheck on the
  corrected code requires and recorded normal Electron exit code zero.
- Final packaged/source lifecycle batch: four checks passed. The Windows
  package opens with real preload/controller/ASAR import worker, and HTTP plus
  cached stdio inspect/navigate that actual binary. Packaged three-launch login
  durability, failure notice and account/profile controls also pass.
  `artifacts/app-audit/reliability-packaged/report.json`.

The combined receipt is `artifacts/app-audit/reliability-final-report.json`;
`artifacts/app-audit/reliability-package-verification.json` records the exact
packaged executable/archive hashes and every matched runtime file.

New dictation lifecycle, typing-refresh and HTTP-native checks are wired into
the existing CI groups, retaining all earlier checks. Remote CI has not run for
this uncommitted batch.

## Research and compatibility choices

- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)
  and [session persistence](https://www.electronjs.org/docs/latest/api/session):
  native promises need caller deadlines and late-operation fences; persistent
  profile/partition identities remain unchanged.
- [SQLite transactions](https://www.sqlite.org/lang_transaction.html) and
  [WAL](https://www.sqlite.org/wal.html): group writes without weakening durability;
  final reference checks and deletion use a nonwaiting writer lock.
- [MCP SDK server guidance](https://ts.sdk.modelcontextprotocol.io/server) and
  [MCP transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports):
  stateless HTTP avoids one relay per client. HTTP cancellation is bound to its
  actual request/disconnect, not an unauthenticated cross-client request ID.
- [minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249) and
  [glob advisory](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4): builder
  26.18.1, ASAR 4.3.1, universal 3.0.6, filelist 2.0.2, minimatch 11.0.1 and
  modern glob 14.0.2 remove the affected chains. The old callback glob branch
  remains for its legacy consumer; it is outside the glob advisory. Actual ASAR
  pack/extract, FileList matching and legacy temp/rimraf cleanup are tested.

## Practical limits

These are isolated local and packaged fixture results, not live provider
authentication or microphone recognition proof. A provider can still expire or
revoke a session. Existing stdio clients retain their legitimate relay processes;
after release, clients must select the shared HTTP configuration to avoid those
per-client helpers. No existing client configuration was changed.

Preview and desktop continue using shared components and the existing
compatibility identifiers. The local package is a verification artifact, not a
published update.
