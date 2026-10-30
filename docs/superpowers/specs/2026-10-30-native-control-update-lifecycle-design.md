# Native control during Windows updates

The 0.2.189 installation failed once with installer exit 2 while an idle native MCP stdio process still ran the installed MuseBench.exe. Closing that exact helper allowed the same verified installer to succeed. The existing configuration uses the app executable and imports its ASAR; closing the window does not close an externally owned MCP client. Installer process checks also match processes inside the installation directory. This is an update-lifecycle defect, not a failed build.

## Chosen approach

Use a private, content-addressed copy of the already-shipped Windows Electron Node runtime and a self-contained bundle of the existing JavaScript MCP server outside the installation directory. The version-only probe needed ICU data; actual MCP negotiation additionally exposed missing V8 startup snapshots. Cache and verify both shipped snapshot files and runtime notices too. No new runtime download, dependency, permissions, provider request or command execution tool is introduced.

Terminating bridges on app shutdown would break the client's persistent connection. Depending on system Node would add a new installation prerequisite. A second MCP protocol implementation would duplicate validation/cancellation behavior. The cached runtime retains the existing SDK and tool surface, reads the current authenticated app descriptor on every call, and can remain alive while desktop files are replaced.

## Requirements

- Windows configuration points to MuseBenchControl.exe and a bundled server outside the installation tree. Runtime copies are keyed by their content; bridge bundles are separately keyed so server-only changes reuse an identical executable. Release stamping can change the executable, which creates another cache version. Retain old versions; never kill a client or delete a running cache.
- Cache preparation occurs only while obtaining the enabled App control configuration, inside the existing account-private native-control directory. Verify source and cached hashes, reject links/non-files, publish files atomically without overwriting an existing cache, and sanitize Node environment in the copyable config. Failure leaves the app usable and supplies an actionable configuration error; it must not fall back to an update-blocking command.
- Off/revoked control stays off. No change to the six tools, authorization token, permissions, request bounds, cancellation or no-replay semantics. Linux/macOS retain their existing configuration while release work targets Windows x64.
- Old client configurations require one command-path refresh. Preserve existing client grants and unrelated settings when migrating the already-authorized Codex connection. Already-running old clients must be closed/reconnected; no blind process-name kill.
- Shared preview/desktop Settings explain the update-safe configuration and retain explicit preview labeling. No startup model warming or provider calls.
- Verify real MCP negotiation from the cached runtime, unavailable-app response, app restart/reconnection, cancellation/revocation, and that the original executable/server can be replaced while the client stays connected. Packaged smoke uses the generated configuration, not a handcrafted replacement. Keep all existing release validation groups.

The user's standing implementation/update authorization covers this correction and publication. The builder chose this implementation; no additional design approval is inferred or required. Independent review and exact release/installed verification remain separate gates.
