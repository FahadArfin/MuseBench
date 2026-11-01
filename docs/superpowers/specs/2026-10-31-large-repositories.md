# Large repository backend

## Goal and evidence

Open and operate on Nook-and-Nest (6.25 GiB, 22,089 tracked files) and PVPartPicker
(97.32 MiB, 735 files) without loading their contents into application state.
The measured largest text file is 36.45 MiB. Measurements are from public default
branches on 31 October 2026; Git LFS payloads and local ignored files are excluded.
Existing Enter-key and 8 MiB fixes must be preserved in this local batch.

## Research and alternatives

1. Increasing in-memory snapshot limits is small work but multiplies RAM, database
   JSON and Electron IPC costs. Rejected for gigabyte projects.
2. Git objects alone offer efficient immutable storage but do not cover ordinary
   folders, unstaged files and ignored-parent fixtures. Do not mutate Git config,
   staging, hooks or commits to make snapshots.
3. **Chosen: streamed SHA-256 inspection and content-addressed disk storage.**
   Snapshot manifests contain hashes, sizes, binary flags and content references.
   Small text remains inline for compatibility, under a strict aggregate budget.
   Large text is read only for a requested operation. Binary assets are hashed
   without retaining their bodies, preserving existing non-restorable semantics.

Sources:
- [Restic design](https://restic.readthedocs.io/en/stable/100_references.html):
  immutable hash-addressed blobs, atomic publication and manifests. Adopt the
  storage pattern, not a backup system or new dependency.
- [Node streams](https://nodejs.org/api/stream.html): bounded buffering and
  backpressure. Use asynchronous fixed-size reads/writes rather than readFile
  for source capture and copy operations.
- [Git index](https://git-scm.com/docs/git-update-index): stat metadata can avoid
  repeated content work; metadata is an optimization, not proof for acceptance.
  Never use assume-unchanged or repository-config changes.

## Features and contracts

- Admission: 16 GiB total, 256 MiB per file, 100,000 files. Inclusive boundaries.
  Exact hash/revision includes every eligible file, including binaries.
- Memory: 1 MiB I/O blocks; at most 128 KiB inline per file and 1 MiB inline per
  manifest. Only bounded inline text enters SQLite or IPC. Manifests remain O(file count).
- Atomic SHA-256-addressed UTF-8 text objects under application data, outside
  projects. Validate references and content when loading. Existing inline
  baselines/checkpoints continue to work; no destructive migration.
- Incremental scans compare size, nanosecond mtime/ctime, device and inode.
  Explicit evidence/restore/acceptance uses fresh content verification. Cache
  entries are published only after a complete scan and stable post-read stat.
- Preserve current Git ignore selection, secret/dependency exclusions, canonical
  root checks and refusal of links. Reject changing files or partial scans;
  never publish a partial revision. Closing cancels active inspection.
- Normal review eagerly includes only bounded small diffs; deferred text has an
  explicit omitted state. A selected-file endpoint reads a bounded diff on demand
  after verifying ownership, revision and file hashes. Oversize diff bodies stay
  explicitly unavailable; their hashes still track edits. Native Muse can read
  repository files directly; prompt attachment budgets stay independent.
- Checkpoint restore and working-copy creation stream captured text/source bytes
  and verify hashes. Existing binary restore refusal stays. Missing/corrupt
  objects must fail before modifying project files.
- Git inventory: bounded 32 MiB output and 30-second timeout for long path lists.
- No hidden services, watchers, provider calls or dependencies. No release,
  installation, profile reset or real app restart during this batch.

## Storage and scope

Disk objects deduplicate equal text across scans and tasks. Do not automatically
delete objects referenced by checkpoints. Interrupted temporary writes are
removed in finally blocks. Crash-orphan cleanup and reachability-based pruning
are follow-up features; cache storage can grow with retained history, explicitly
documented rather than deleting historical captures. Chunk-level deduplication,
background workers and virtualized 100,000-row review UIs are future optimizations,
not prerequisites for memory-bounded source capture.

## Acceptance

Tests cover multi-megabyte JSON, >4,000 files, exact admission boundaries using
small configurable budgets, incremental reuse versus forced verification,
changed/deleted/binary files, corrupted captures, cancellation, link/path attacks,
legacy baseline restore, context selection and streamed working copies.
A scale fixture uses >22,089 files and a multi-GiB sparse binary, checks memory
and event-loop responsiveness, and runs outside the normal fast unit suite.
Report synthetic scale evidence separately from live user-project evidence.

## Implementation decision

The user requested research, detailed plans and implementation in this turn.
Proceed locally with the chosen design; publication remains a separate request.
Work in the existing checkout to preserve and review the combined uncommitted
batch. No implicit commit, worktree, merge or publish is required.
