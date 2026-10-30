# Persistent Activity inbox

CX01 continues the authorized roadmap. Implementation decisions below are the agent's choices under the user's instruction to continue feature by feature; they are not a new design approval.

## Intent and approach

Running work currently disappears from the compact Activity menu when it finishes. Extend that same menu with Running and Recent tabs, a blue unread indicator, exact-chat opening, individual read/unread controls and Mark all read. Open Recent initially when nothing is running and history exists. Keep the current running-work controls and drafts intact.

A separate notifications page would add navigation for a small list. Reusing OS notifications would lose history and confuse delivery with results. The selected approach is a local SQLite inbox projected into the existing menu. OS notification preferences and delivery receipts stay independent.

## Data and behavior

- Retain at most 200 events for 30 days, newest first. Record only newly observed controller-owned run completions, attention requests, stopped/uncertain runs and project-check results. No historical backfill on startup and no inference from OS notification delivery.
- A completed run requires an owned native turn and confirmed cleanup. Uncertain/failed outcomes use `Run needs attention`, not a success claim. Waiting events distinguish `Response requested` and `Approval requested`; they describe what happened, not whether an old request is still pending.
- Store application task/source IDs, event kind, observation timestamp and read timestamp only. Dedupe IDs hash the source and event identity, including bounded pending-request identity for distinct and concurrent questions (up to the native 32-request view). Never copy transcripts, prompts, tool output, native question bodies or credentials. Chat/project names are resolved from current metadata.
- Add events at controller transition sites, not while rendering or scanning history. Persist the source task and new events together using a SQLite savepoint. Keep at most the latest 200 failed observations in memory with their original observation times, and retry them before subsequent task persistence; this buffer cannot survive a process loss while storage is unavailable. Cache the bounded inbox for publications; no transcript reads or repeated database scans on streaming updates. Prune on startup, insert, read changes and the existing hourly maintenance cycle. Chat deletion removes its events.
- Opening an event navigates to its exact owning chat and marks it read only after successful navigation. Mark all read sends the IDs visible at invocation, so later arrivals stay unread. Reading never submits a native answer or permission choice. Missing or expired events are harmless no-ops.
- Shared React UI works in preview and desktop. Preview uses explicitly fictional sample events; it makes no provider request and is not persistence/provider acceptance proof. This pass covers the Code activity menu, not a new aggregate of Work and Sites histories.

## Acceptance

Prove duplicate suppression, distinct request identity, persistence, retention, atomic rollback, metadata privacy and deletion. Controller fixtures must cover selected/background completion, question/approval attention, unknown outcomes, restart without backfill and checks. Browser and Electron checks must cover both tabs, unread behavior including arrivals during Mark all read, navigation errors, keyboard focus, narrow layout, reduced motion and unchanged stop/draft behavior. No paid model test is authorized. Independent code review and exact-artifact release acceptance remain separate gates.
