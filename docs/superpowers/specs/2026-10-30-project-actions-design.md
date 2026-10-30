# Reviewed project actions

CX02 gives Code projects reusable local commands for Windows, macOS and Linux. The user asked for continuous implementation of this roadmap; the choices below are implementation decisions, not new approvals. Keep the existing React/Electron architecture and preview parity.

## Approach

Extend the owned check runner rather than introduce an interactive terminal or a second process manager. A compact Project actions section in Checks lists saved actions, opens an exact command/folder review, and requires Run action for every invocation. Add/edit forms save definitions without running anything. Existing npm checks and validation profiles remain separate.

Definitions live in `.musebench/actions.json`: `{version:1,actions:[{id,name,cwd,commands:{win32?,darwin?,linux?},timeoutSeconds}]}`. Limit the file to 64 KiB and 50 unique actions, names to 80 characters, IDs to 80 safe characters, commands to 4,000 characters, and timeout to 1–600 seconds (default 120). Working folders must be existing project-relative directories, with no links or traversal. Missing platform commands appear unavailable. Windows uses Windows PowerShell without profiles; macOS/Linux use `/bin/sh`. Explicit review shows the actual shell, command, canonical folder and timeout. These are user-directed local commands, not model sandbox grants.

Opening/importing a project only reads definitions. Save and run actions carry exact project/chat identity and a digest of the reviewed manifest, canonical root and platform. Re-read and reject changed definitions before either mutation. Saving uses bounded validation, a temporary file and rename; it never replaces malformed or linked files. Editing does not change grants, accounts or billing. An external process with concurrent filesystem write access is outside an atomic filesystem snapshot guarantee; validate paths before reads and immediately before launch/write.

Runs reuse one owned process, bounded output, timeout, Activity stop controls and persisted receipts. An action receipt records its definition identity, command, folder, shell, platform, exit/status and revision. It cannot satisfy a package-script validation requirement, even if the action has the same name. Reject archived/reviewer chats, other work using the checkout, active checks/validation and stale selection. Manual action runs pause goal continuation and queued inference. Cancellation persists its receipt before navigation, and a later process callback cannot overwrite a newer run.

The UI uses one small toolbar and compact rows. Review is an inline disclosure; edit fields appear only while editing. A saved action is never auto-run. Loading/error/unsupported states are explicit, in-flight responses are bound to the selected project/chat, and duplicate clicks are locked. Narrow layouts wrap without horizontal overflow; keyboard and reduced-motion behavior use existing controls. Preview uses clearly marked sample definitions and refuses actual execution.

## Verification and limits

Test strict schema, bounds, platform choices, no automatic execution, exact stale bindings, changed files, links/traversal, safe save conflicts, actual local output/exit/timeout/stop, persisted receipts and validation isolation. Test the shared UI in Chromium and Electron, including selection changes during inspection, failed save/run, duplicate submissions and narrow layout. No model requests, live provider actions or personal profile mutations are needed. Published/installed acceptance remains separate.

Primary implementation reference: [Node child processes](https://nodejs.org/api/child_process.html#child_processspawncommand-args-options), read 30 October 2026. Use only baseline APIs supported by the repository's Node 22/Electron runtime.
