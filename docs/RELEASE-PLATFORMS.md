# Release platforms

MuseBench desktop releases support **x64 and ARM64 only**. There is no Windows x86/ia32 build. `scripts/package-desktop.mjs` rejects any other desktop architecture.

| Visible build | CPU | Build machine |
| --- | --- | --- |
| Windows 64-bit (x64) | Intel/AMD 64-bit | GitHub Windows x64 |
| Windows ARM64 | ARM 64-bit | GitHub `windows-11-arm` |
| Linux 64-bit (x64) | Intel/AMD 64-bit | GitHub Ubuntu x64 |
| Linux ARM64 | ARM 64-bit | GitHub Ubuntu ARM64 |
| macOS Intel | Intel 64-bit | GitHub macOS Intel |
| macOS Apple silicon | Apple ARM64 | GitHub macOS ARM64 |

Android has a separate phone/tablet APK. These release targets share source and version but require operating-system-specific binaries. Windows ARM64, Linux ARM64 and macOS Apple silicon cannot use one common executable.

`win32` and `darwin` remain only where Node/Electron require their platform identifiers: Windows and macOS respectively. They are not separate supported operating systems or evidence of 32-bit binaries. `windows-11-arm` is the GitHub runner label, not an extra ARM build. Human-facing workflow and artifact labels use Windows and macOS.

Sources: [Electron platform and CPU identifiers](https://www.electronjs.org/docs/latest/tutorial/installation), [Node platform identifier](https://nodejs.org/api/process.html#processplatform), [GitHub hosted runner architectures](https://docs.github.com/en/actions/reference/runners/github-hosted-runners). Checked 29 October 2026.

Installer names and updater manifests remain compatible with existing installations. The collector validates platform/architecture from each artifact's signed-off source manifest, not its enclosing GitHub artifact folder name.
