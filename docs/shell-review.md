# Sandboxed command review

25 October 2026. Bounded independent source review; no outstanding actionable findings. No model calls were made by reviewers.

Reviewed the native event fold, curated environment, per-run Windows Job helper/protocol, native exec runtime, controller evidence attribution, working-copy boundaries, UI and packaging.

Fixed findings with failing-then-passing regressions:

1. Snapshot maps omitted a file named __proto__ and misclassified inherited names such as constructor/toString. Null-prototype maps and own-property reads preserve their bytes/revisions/copies, including after restart.
2. Stop before native launch legitimately had no ready/rootExit event and was wrongly marked unconfirmed. The helper now provides explicit notStarted evidence accepted only for local stop, helper exit130 and zero owned processes. A created suspended child reports its verified Job assignment before cancellation. Neither case can establish model completion.
3. A helper timeout could race a native completed event and exit zero. The wrapper exposes the validated termination reason; the runtime refuses completion on timeout, stop or owner loss while preserving confirmed cleanup.

The supervisor owns an unnamed non-breakaway Job Object with kill-on-close and atomic process assignment. It preserves native argv as data, isolates native bytes from cleanup records and bounds cancellation. The native sandbox still executes all model commands. Native tool results cannot satisfy the explicit revision check and old-task events are excluded.

Final verification: 204/204 automated tests, zero skips; verified helper source/binary hashes; actual packaged shell workflow, cancellation and copy UI proof in artifacts/validation.json. This review is not an exhaustive security audit or non-Windows runtime validation.
