# Recent local excerpts

After MuseBench has observed completed native compaction in a chat's current native session, open **Session → Recent excerpts**. Choose two, four (the default), or eight recent messages, then select **Prepare excerpts**. Review the saved local text and select **Include with next message**. A removable indicator appears above the composer. The excerpts are separate from your draft and accompany only a later message you explicitly send or queue.

The optional **Prepare locally after completed turns** setting belongs to this chat and defaults off. When enabled, confirmed terminal turns refresh one local preparation while no selection is staged. It never starts a turn, sends a message, runs inference, compacts context, or changes native session retention. Review and explicit inclusion are still required.

## What is included

The selector examines at most the latest 256 locally saved candidate records and takes eligible user/assistant text. It preserves message IDs, roles, known outcomes and explicit truncation flags. It excludes tool records, reasoning, images, files and source snapshots. The complete formatted section, including attribution and JSON escaping, is limited to 8,000 JavaScript characters; longer texts use bounded verbatim suffixes. The complete request retains its existing 64,000-character limit and ends with your current request.

These excerpts are quoted, untrusted history. They grant no permissions and do not authorize replaying old actions. They show what MuseBench saved locally; they do not identify what Muse retained, tune native retention, or replace native compaction with an advance summary.

## Review and delivery safeguards

Each capsule binds to its project, chat, target native session, exact completed compaction ID/revision, and digests of its selected source records. Final preparation rechecks the binding after asynchronous connection work. Changed text, outcomes, ownership or compaction require another review. Unrelated later messages do not invalidate unchanged selected source records.

Queuing transfers the exact reviewed capsule to that request. Reorder and edit retain that snapshot; generated workflow, schedule, review, handoff and goal requests do not capture a staged selection. Queue delivery retains existing sending/unknown receipts and never retries an unknown outcome. Removing a queued request does not restage its excerpts.

Before dispatch, known preparation/storage failure preserves the original draft and reviewed selection. Once dispatch might have begun, inclusion is consumed durably. A runtime-proven rejection can restore the original draft and selection through the guarded recovery flow. If another draft exists, the exact old review is available without automatically including it with that new draft. An uncertain result is never silently restaged. Restart uses the authoritative task row for capsule/source ownership and does not reconstruct deleted chats from an older selection snapshot. Damaged staged persistence blocks sending until explicit removal or a fresh review.

Context inspection and the final request share the included capsule. Context receipts store its digests, ownership, source hashes and character count, without duplicating excerpt payloads. They identify app-prepared input and do not prove native acceptance, hidden context occupancy, model quality or billing.

## Validation and reusable smoke

- Unit regressions: `node --test test/recent-context*.test.mjs`.
- Shared browser/Electron smoke: `npm run test:recent-context`, included in the existing Windows `chats` validation group.
- Browser preview alone: `node scripts/recent-context-smoke.mjs`.
- Built source Electron renderer: build, then `node scripts/recent-context-smoke.mjs --desktop`.
- Installed artifact: set `MUSEBENCH_EXECUTABLE` to the exact installed executable, then run the same `--desktop` command. Its report labels the variant `installed` and records the executable path.

Every Electron smoke creates its own disposable profile and project beneath `artifacts/recent-context/`, asserts that Electron uses that profile, and blocks external host resolution. The fixtures contain local sample text and observed compaction records. They do not use personal profiles or connect to a native provider. Reports and narrow/reduced-motion screenshots remain in their own uniquely named artifact directory. Installed executable acceptance is a separate result from source build/tests.
