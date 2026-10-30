# Platform downloads and releases

Every push to `main` stamps one version from the Git commit count and now builds **Windows 11 x64 only**. The other configurations below are retained, but run only when an operator explicitly enables **Test all platforms (artifacts only; do not publish a release)** in the manual workflow. That option validates and retains workflow artifacts without publishing a GitHub release. The collector defaults to the Windows profile; its retained `RELEASE_PROFILE=all` option requires all seven targets and rejects incomplete sets. Unknown profiles and unexpected targets fail validation.

The routine release workflow validates package contents, launches the packaged Windows app with an isolated profile, and publishes only after required checks pass. A newer main commit supersedes an older unpublished build. Existing drafts are not silently merged or published; they block publication and remain unchanged for review. Existing published releases stay immutable. Public releases for other platforms need a deliberate future release-policy change; the manual test option cannot replace a Windows-only release.

| Platform | CPU | Download | Updates |
| --- | --- | --- | --- |
| Windows | x64, ARM64 | Setup `.exe` | In-app download and restart |
| Linux | x64, ARM64 | `.AppImage`, `.deb` | AppImage in-app; deb manual |
| macOS | Intel x64, Apple silicon ARM64 | `.dmg`, `.zip` | Manual until Developer ID signing is configured |
| Android | ARM, ARM64, x86_64 | Universal signed `.apk` | Download and install the newer APK over the existing app |

The x64 Windows installer retains its existing name. ARM64 includes `arm64` in its filename. When both are explicitly built, combined Windows update metadata lists both files so the updater can choose the native architecture. Normal Windows-only releases contain only the x64 download. Linux update channels are architecture-specific. `SHA256SUMS` and `release-manifest.json` accompany every release and identify source commit, target, file size and digest. The publisher also verifies the updater's SHA-512 download digests before uploading anything.

macOS packages are ad-hoc signed, without Apple notarization. Gatekeeper may require the user to approve opening a download in System Settings. We do not disable Gatekeeper. Signed distribution and automatic macOS updates require Apple Developer ID credentials; iOS App Store/TestFlight distribution additionally needs provisioning.

Muse Code still requires the official Muse CLI and a valid Meta account. Linux/macOS use the native Muse session host and preserve its permission checks. Windows uses the existing supervised process runtime; its managed helpers use AnyCPU for x64/ARM64. Local speech dictation is Windows-only; other systems can use their keyboard dictation. Native package launch checks do not claim live provider login/model execution on all six machines.

Local packaging: `npm run package:desktop` on the target OS/architecture. `node scripts/verify-personal-package.mjs` verifies its contents, and `node scripts/portable-desktop-smoke.mjs` launches it with a fresh isolated profile. Linux CI runs the latter under Xvfb. Production sandbox settings are not weakened by the CI launch flags.

The [Android companion](android-companion.md) uses its own Meta session for chat; Code connects to explicitly paired desktop sessions. Its signed APK is required only in the explicit all-platform release, verified against a stable certificate and exercised on an Android emulator. iOS delivery is deferred pending Apple provisioning.

Sources: [GitHub native runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), [electron-builder multi-platform builds](https://www.electron.build/v26/docs/features/multi-platform-build/), [updater signing requirements](https://www.electron.build/v26/docs/features/auto-update/), [official Muse setup](https://dev.meta.ai/docs/muse-code).
