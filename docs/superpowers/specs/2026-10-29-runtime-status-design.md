# Fresh, lightweight runtime status

The responsiveness audit found six full runtime snapshots per retained chat in a sidebar summary, and five summary passes during an ordinary dispatch. Each native snapshot clones messages and activity even when the caller only needs lifecycle flags.

Provide `statusSnapshot()` on the exec and interactive runtimes and their selector. It returns a new object containing only `status`, `operationBusy`, `childrenBusy`, `cleanup`, and boolean `pending`, read directly from current runtime state. No cache or timer is involved. A shared reader uses that method when present and otherwise projects one full snapshot for compatibility with existing injected runtimes. Invalid declared status responses fail rather than falling back to an idle status.

Controller sidebar summaries use one status read per retained context, deriving the label and busy state from that same observation. Existing guards use the same fresh reader; controller-local pending work still blocks actions. The running, starting, submitting, connecting, checking-permissions, operation-busy, child-busy, unconfirmed-cleanup and pending-request conditions keep their existing meaning. Full runtime snapshots, user-facing reasons, native events and renderer state contracts remain unchanged.

## Approaches considered

- Cache event metadata: avoids reads but could miss a lifecycle transition before a notification. Rejected for these guards.
- Reuse one full snapshot: compatible and useful as a fallback, but still copies transcript content per retained chat.
- Add a fresh compact read with the single-snapshot fallback: chosen implementation judgment under standing authorization. Adds a small internal runtime interface while avoiding stale safety decisions and unnecessary transcript copies.

Use existing modules and dependencies. Do not broaden permission policy, change provider configuration, run a model, edit real chats, or delete retained audit folders. Keep preview and desktop on the same renderer and unchanged bridge contract. Validate synthetic operation counts and timings separately from native inference or visible frame latency.

Completion requires failing-then-passing regressions, the existing background-chat/runtime/permission suites, full tests and renderer build, one final independent review, exact-commit CI/release, verified installation and isolated tests against the shipped modules.
