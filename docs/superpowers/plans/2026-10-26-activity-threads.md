# Muse Code activity, threads and changes

Implement the supplied Claude/Codex references within the existing desktop shell. Keep chat full width until the user opens Threads or Review. Retain native sandbox, approval and process ownership rules, and personal browser sessions.

1. Verify native exec task and agent events using existing fixtures and a bounded sandboxed probe. Never infer live agents from assistant prose.
2. Test and add a bounded observational activity projection after existing command/run validation. Persist activity by user turn; cancellation, restart and failure must never leave false live rows. Keep activity separate from authoritative run/check evidence.
3. Replace prefix/suffix-only line counting with a shared bounded line diff. Label counts as changes since chat started. Handle binary files and large comparisons explicitly.
4. Add inline expandable activity, current action, elapsed run time, an on-demand Threads panel with detail drill-down, real agent status when reported, and a clickable changes summary/file picker opening the selected diff.
5. Verify parsing, ownership, persistence and regression tests; exercise desktop UI at wide/narrow sizes and inspect screenshots against references. Package the exact build, run packaged smoke tests, retain login and sandbox configuration, and reopen the normal app after checking it is idle.

Validation distinguishes fixture coverage from live native model evidence. No invented tasks, fake progress, unsupported steering or automatic parallel-agent spawning.
