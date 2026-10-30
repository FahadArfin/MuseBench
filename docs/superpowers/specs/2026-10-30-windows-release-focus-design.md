# Windows release focus

The user wants faster iteration and asks to focus on Windows 11 instead of building seven targets for each update. Normal main pushes will publish Windows x64 only. Keep the existing ARM, Linux, macOS and Android packaging behind an explicit manual workflow option; do not delete their source or old releases.

The publisher must wait for the Windows build, reject missing or unexpected targets, retain exact source/version and hash verification, and never publish failed or superseded candidates. The explicit all-platform option builds and validates workflow artifacts only; restoring public multi-platform releases is deferred. Existing drafts must remain untouched and block automatic publication instead of merging potentially foreign assets or notes. Release descriptions must name only the selected downloads. Preview and desktop continue to share the existing renderer.

Release 0.2.182 failed twice in Windows tests even though its separate validation passed. Its release job uses the OS temporary directory while validation uses the runner-owned temporary directory. Align both on one canonical runner-owned directory. Allow bounded cold-process startup time in the project-action fixture and bounded retries when Windows releases fixture directory handles. Preserve all completion, output, owner and exit assertions; do not change production cancellation or timeouts.

No model requests, account changes, active-work termination or profile deletion are needed. Verify and install only the exact latest successfully published Windows artifact under the existing authorization.
