# Native Muse collections review

Self-review of the 2026-10-25 Ideas and Goals presentation extension. No independent subagent review was requested or performed.

- Live rendered hooks were inspected before implementing: Ideas grouped rows and preview marker, Goals creation/category controls, setup dialog and shared route header. The original account, DOM and action handlers remain authoritative.
- Collection selectors require the Muse shell and Ideas/Goals markers. Goal-card styling additionally requires the Goals creation marker so Ideas buttons do not inherit goal hover/card styles. Collection layout is scoped to the header's own content root, not a side-by-side chat.
- Chat and collections use one finite appearance resolver. Invalid CSS input still falls back to known values; the existing injection/prototype-key and serialized stylesheet-removal tests pass after extraction. No raw renderer values become CSS.
- Original mode removes chat and collection styles together. Fixture tests preserve preview identity through theme/font/motion changes and section switching; real checks preserve the same live idea document and selected ID through refresh and layout toggles.
- No fetch interception, new API, account storage, DOM replacement, authentication policy, IPC permissions or sandbox changes were added. Fixture protocol interception exists only in isolated test scripts. Real checks never invoke the idea launch or goal creation action.
- Dark/light and narrow fictional captures were inspected; live numeric bounds show 900px rows within the available viewport. Original labels, options, disabled states and primary action remain visible.

Limitations: this account has no saved goals, so populated goal-card/status updates have fixture coverage. Unknown future service markup may retain its original look; the original-layout toggle remains available. This is a native visual presentation of the official client, not a new service implementation or a guarantee of unsupported API synchronization.
