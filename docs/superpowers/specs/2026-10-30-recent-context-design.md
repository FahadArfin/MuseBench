# Recent local context excerpts

The remaining OC06 work needs a useful continuity option without inventing native retention controls. Under the user's standing implementation authorization, build on MuseBench's existing native session, context preparation, saved drafts and queue. The chosen design is app-managed, reviewable verbatim excerpts. Native keep-recent tuning and advance-summary replacement remain separate unsupported capabilities.

## Behavior

- Add a compact Recent excerpts disclosure in Session details after an observed completed native compaction. It explains that excerpts come from saved local chat text, not proof of what Muse retained.
- Offer 2, 4 or 8 recent user/assistant messages; default four. Cap the entire formatted model-visible section at 8,000 characters, including JSON escaping, labels and metadata. Select from at most the latest 256 message candidates. Preserve role, message ID, known outcome and explicit truncation; exclude tools, reasoning, images, files and source snapshots.
- Prepare locally on request. Optional per-chat background preparation defaults off and refreshes only after confirmed terminal turns when a completed compaction exists. It performs no network request, model inference, native compaction or automatic send. Keep one current bounded preparation.
- The user reviews the content and selects Include with next message. Keep it separate from composer text; show a removable included-context indicator. This explicit inclusion is sent only with a later user Send, never a goal/schedule/review/handoff-generated request.
- Use the supported native text input path through composeChatContext, with quoted/attributed untrusted history and the user's current request last. Excerpts grant no permissions and do not authorize replaying old actions. The overall context limit remains 64,000 characters.
- Bind selection to project/chat, target native session, exact completed compaction ID/revision and a digest of the selected source records. Reject changed ownership, source mutation or compaction revision. Queued prompts capture the exact reviewed capsule and never silently recompute it. Adding an unrelated later message need not invalidate an otherwise unchanged queued capsule.
- Reuse the queue's durable sending/unknown receipt and no-replay semantics. Pre-dispatch failure preserves the draft/reviewed capsule. Once dispatch may have started, consume it and never silently restage on uncertainty. Cancellation/edit recovery keeps the exact capsule only through the existing guarded draft flow.
- Persist safe bounded preferences/staged data and reconcile selected task versus task-row storage without resurrecting deleted chat state. Context inspection and final dispatch must report the same included capsule. Store digest/source metadata, not duplicate payloads, in context receipts.
- Shared preview and Electron renderer get the same controls, accessible keyboard operation, narrow layout and reduced-motion behavior. No additional large banners or catalog changes.

## Acceptance

Pure bounds/provenance tests; real controller tests for staging, source/owner changes, queue editing/restart/unknown outcomes, atomic final preparation, draft preservation and absence of automatic sends. Shared browser/Electron UI checks. Native contract fixtures may prove model-visible text admission but must never be described as live summarization or billing acceptance. Existing SDK1.4.14 and native Muse backend remain unchanged.
