# MuseBench Chat / Work validation — 2026-10-26

Added a native Work mode beside personal Chat with 24 templates across six teams, four artifact types, local source attachments, saved conversations, activity, isolated previews, direct artifact editing and exports. The source examples are explicit fictional samples and never call a model. Work has a separate controller, database, workspace root and instance of the existing Muse runtime.

## Research and scope

The supplied [video](https://www.youtube.com/watch?v=en0GuyhieQk) is titled Introducing Claude Dashboards and Claude Motion. The video frames/transcript were not available through the research tool; the implementation was informed by Anthropic's [official walkthrough](https://claude.com/resources/articles/dashboards-and-motion), [ChatGPT Work](https://openai.com/chatgpt-work/) and the official [work use cases](https://learn.chatgpt.com/use-cases). The user chose a balanced mix of dashboards/animations and reports/presentations.

Implemented local source snapshots and app-rendered validated JSON. No live SQL/CRM connectors, shared cloud collaboration, scheduling, generated footage, audio or native PowerPoint output is claimed. CSV/JSON/MD/TXT are accepted; Excel and PDF inputs are not supported in this release. Native runtime approval limitations remain: interactive approvals stop headless work; resetting requires confirmed cleanup and does not bypass sandbox checks.

## Verification

- Final unit suite: **411/411**, `artifacts/work-final-unit.log`.
- TypeScript and Windows packaging pass. `artifacts/personal-package-verification.json` confirms **42** packaged source/build files and both native helpers match the tested source.
- **132** packaged Electron UI checks: Work 15, settings 11, navigation 17, composer 7, activity 11, project overview 9, slash commands 14, local review workflow 11, personal browser 25, native personal sidebar 12. Each suite used an isolated profile and sent no model requests.
- Work UI evidence: `artifacts/work-ui/packaged-gkMqo1/report.json`. Desktop/narrow layouts, all output previews, malformed edit retention, native source picker, actual file export/cancel, unsaved editor preservation, blocked-connection recovery, appearance, restart and Code isolation passed. Native speech test in the composer suite uses synthetic audio, not microphone capture.
- Actual native Muse generation and follow-up editing passed using a new isolated workspace and a non-sensitive three-row CSV: `artifacts/work-live/run-CjtBZU/report.json`. Both source runs verified `exec`, Ask me, Windows sandbox readiness, native completion and source-grounded chart values. The exported package contains the identical tested implementation. No user projects or personal messages were submitted.
- PDF and MP4 used actual isolated sandboxed Electron renderers: `artifacts/work-exports/probe-zxTEMj/report.json`. PDF includes expanded calculation/provenance panels; MP4 is H.264, 1280×720, 48 frames, four seconds. PDF pages and captured animation frames were visually inspected. FFmpeg is installed on this machine; it is optional and not bundled.
- `artifacts/work-boundaries.json`: **19** existing runtime, controller, personal-session and security modules remain byte-for-byte identical to the pre-Work package. No auth-file or cookie migration, provider credential copy or sandbox-argument change was made.

## Issues found and fixed

Independent review caught a connecting-send cancellation race, absent recovery control and discarded unsaved JSON edits. Stop/close now invalidate a service epoch and disconnect before waiting for queued operations; four regression tests prove a late connection cannot submit a model request. UI tests cover reset and per-item drafts. Reviewer rechecked all three fixes with no remaining findings.

The first live follow-up wrote the correct revised artifact but stalled in an unnecessary subsequent PowerShell verification call. The runtime timed out and confirmed native cleanup; the failure is retained at `artifacts/work-live/run-E9fpde/report.json`. Artifact guidance now uses native file tools for content-only edits and leaves managed sandbox commands available for requested/necessary data analysis. The next complete two-request workflow passed. This is not a claim that every provider command or future run is immune to timeout.

## Existing profile

The previous app was confirmed idle before being closed for packaging. The original package is retained at `artifacts/work-baseline/app.asar`. The default profile is reused without clearing history or service storage. `artifacts/work-profile-check.json` records native Work startup and Code-selection preservation; `artifacts/work-normal-launch.json` records the final launch. No credentials, account identifiers or chat contents are collected by this check.

The existing default Windows profile exposed an MSIX Roaming-to-LocalCache alias that isolated test folders did not. Startup now resolves only Electron's trusted app-data root before Work's strict path checks. The Windows junction regression passes while source aliases remain rejected. Final packaged normal-profile startup passes. Existing provider login storage is retained; live website authentication was not re-tested. The startup harness was updated to import main before Electron readiness so protocol registration occurs at the production lifecycle stage; both cancel-during-load and genuine-failure checks pass at `artifacts/startup/source-eyRq2N/report.json`. Work's 15 checks were rerun on the final package after the path correction.

Final normal launch: native UI navigation verified Meta AI > Work in the packaged app using the existing profile. Meta AI Chat loaded its signed-in account controls before switching to Work; no website messages were sent. Muse AI bot authentication was not re-tested. Evidence: artifacts/work-normal-launch.json.

