# Subagent browser and messaging

Expose native agents in the main Sub-Agents pane, grouped into Active and Done. Selecting an agent shows its objective, result, readable native activity and controls. Keep parent request/workflow activity accessible separately. Session-tools rows open the selected agent.

Reuse the existing controller/runtime childControl and inspectChild authority: exact task, session, observed item and revision. Send context to running children with sendMessage; offer follow-up only where followupTask is supported. Never send to the parent as a fallback or change transport/permissions automatically. Unsupported transports explain the limitation. Accepted means admitted by Muse, not proof the child has read it.

Preserve per-agent drafts while browsing, prevent duplicate commands, clear only after a new matching accepted receipt, and retain uncertain/rejected drafts. Reuse the workflow/earlier-turn restrictions and expose stop/interrupt separately from message submission.

Verify with native child protocol/unit tests and an isolated production-renderer Electron fixture covering active/done selection, direct delivery, follow-up, stale/unknown receipts, navigation/drafts and unsupported connections. No live provider calls or installed profile changes.

## Verification

- Full build/typecheck passed; 159 targeted child/messaging/inspection/runtime tests passed.
- Production shared renderer in isolated Electron: 11 subagent flow checks passed, including slow refresh with retained content/no overlapping reads, direct target routing, accepted/stale/unknown receipts, per-agent drafts, ownership guards, and workflow filtering. Evidence: `artifacts/subagent-messaging/desktop-oo3f2T/report.json`.
- Existing child activity (9 checks), workflow retry/skip (8 checks), and request activity/navigation (14 checks) passed in isolated Electron. Evidence: `artifacts/child-inspection-ui/desktop-yMZU8S`, `artifacts/child-restart-ui/desktop-3wd8Dy`, `artifacts/activity-ui/source-Othr7n`.
- Focused independent review found workflow-routing and refresh-content issues; both were fixed and reviewed again with no material findings remaining.
- Installed SDK defines the native child control/read methods used here. This is provider-free protocol and UI verification, not live child delivery proof. Default Windows exec does not expose these controls. No transport/permission changes, paid model calls, publication, installation or installed-profile changes were performed.
