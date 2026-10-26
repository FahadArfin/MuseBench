---
name: musebench-ui-parity
description: Use when reviewing or changing MuseBench desktop and browser preview interfaces, particularly annotated preview feedback.
---

# MuseBench UI parity reference

Check these paths and scripts still exist in the selected checkout before using them. This skill is specific to MuseBench, not an instruction to convert other projects.

- Shared interface: `src/ui/`; browser fixtures and simulated actions: `src/preview/bridge.ts`. Change shared components, then supply corresponding fixture states for newly exposed controls.
- `npm.cmd run build` verifies types and builds the renderer and native helpers.
- `npm.cmd run test:browser-preview` exercises shared controls in a real browser.
- `npm.cmd run test:preview-parity` compares browser fixtures with the production Electron renderer. Read the script's scene coverage before claiming the whole app matches.

Use the same viewport, theme, data and UI state for captures. Check keyboard access, narrow layouts and popup placement as well as static pixels. Preview replies and operations are simulated; they do not prove native sessions, Git writes, approvals or external account actions worked.

Embedded Meta/Muse website content uses read-only desktop snapshots in preview. A snapshot's capture time is part of the evidence; a saved image cannot establish current interactive website behavior. Preserve shared native navigation, but report these website comparisons separately.

Report which controls and scenes were tested and any desktop-only gaps. Do not present fixture parity as a real native model or account test.
