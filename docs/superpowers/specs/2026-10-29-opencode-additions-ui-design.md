# OpenCode-inspired additions in MuseBench

Requested and implementation authorized on 29 October 2026. These are Muse-native workflows, not a claim of OpenCode protocol or plugin compatibility. They extend the OC01–OC06 roadmap rows rather than creating a second competing feature list.

## Placement

| Feature | Entry point | Default experience | Expanded controls |
| --- | --- | --- | --- |
| OC01 running work | Small Work activity button in the Code toolbar | Count and short status; no permanent panel | Stable rows by chat with Open and supported Stop; questions and approvals link to their owning chat |
| OC02 changes and feedback | Changes action beside a completed reply; existing Review pane | Files touched by that run, reviewed/unreviewed markers | Bounded diff, exact revision and line references; Add feedback stages an editable draft; explicit Send remains required |
| OC03 tool discovery | Existing composer/context controls and Customize | Selected tools and review state in one compact summary | Search reviewed tools on demand; per-call status and cancellation live with normal tool activity, not a new dashboard |
| OC04 background engine | Settings, one Keep work running preference | Off until explicitly enabled; explain what survives closing a window | Owned service status, active chats, stop/quit behavior and update blockers; no automatic replay after a crash |
| OC05 integration panels | Installed plugin or connector details | Description and connection/review state | Small native configuration form from a bounded declarative schema; review changes before Apply; state when reconnect is needed |
| OC06 context continuity | Existing context indicator and Session details | Only observed context/compaction facts | What was restored, what is unknown, latest compaction receipt and supported Compact action; local trimming never claims native compaction |

## Interaction rules

Keep search, filter and setup actions in compact existing toolbars. Details are collapsed until requested. A successful refresh updates rows in place; a failed refresh retains prior information with an explicit snapshot label. Navigation should preserve drafts, scroll, focus and selected files. Changed ownership/revisions invalidate controls, with an understandable retry path.

Use ordinary language: Running, Needs your answer, Review changes, Add feedback, Keep work running. Runtime IDs, hashes and protocol fields belong in optional diagnostic details. Use existing motion tokens and reduced-motion behavior, stable keys and narrow layouts. No large introductory banners or duplicate installed lists.

## Delivery and verification

OC01 is implemented and source-verified. C06 establishes the shared stable-refresh and diagnostic behavior. OC02 follows the current diagnostics/updater/navigation work and the activity/project-action additions. OC03, OC04, OC05 and OC06 remain explicit roadmap work with their existing native-contract prerequisites; they must not be marked delivered from designs or fixtures alone. Each feature gets focused behavior checks, browser/Electron UI evidence, independent review and its own push. Real model acceptance requires separate bounded authorization when the existing allowance is exhausted.
