# MuseBench desktop and mobile distribution

The user authorized automatic GitHub downloads for Windows, Linux, macOS and Android on every main release. Choose x64 and ARM64; do not add 32-bit builds. Their mobile decision is: chat works independently, Code requires desktop sessions. Existing permission to implement, push completed features and keep desktop/preview aligned applies.

## Desktop

Build on native GitHub runners for Windows x64/ARM64, Linux x64/ARM64, and macOS Intel/Apple silicon. Preserve the Windows x64 installer name and update channel. Publish one version from one commit only after all required builds and checks pass. Merge architecture-specific updater metadata without overwriting another architecture; verify hashes before publishing. Keep existing Windows coverage and add portable runtime tests plus an isolated packaged-app launch on each native runner.

Linux downloads are AppImage and deb; macOS downloads are dmg and zip. Windows downloads are NSIS installers. macOS initially uses ad-hoc signing, without notarization or automatic installation of updates; Apple Developer credentials are a later requirement. Keep download links available in Settings on platforms without an automatic installer. Linux AppImage can use electron-updater. Do not weaken native Muse sandbox or version checks to claim portability. Windows-specific speech and process helpers must not run on POSIX systems.

## Android companion

Use an Android app that preserves its own chat login and opens the official Meta AI chat independently. Code connects explicitly to a running MuseBench desktop. A bundled, responsive companion screen lists desktop Code chats, reads messages, and submits follow-ups to a selected existing chat. Desktop remains the owner of files, tools, approvals, billing and native Muse credentials. The mobile app never copies desktop provider credentials or runs a substitute coding backend.

Pairing is opt-in on the desktop, over TLS with certificate pinning, an expiring one-time pairing secret and revocable device credentials. The listener is off by default, stops on app exit and does not open router ports. Bind requests to a specific chat and refuse stale selection or busy state. No arbitrary shell, JavaScript, filesystem or renderer IPC endpoint is exposed. Android stores device authorization using the Android Keystore. Native bridge methods are available only to the bundled companion page, never to Meta pages. Produce a stable-key-signed APK for ARM64 and x64 tablets/phones on every release. Do not publish private signing keys.

iOS distribution is deferred until Apple provisioning is available; document the reusable companion protocol and UI without advertising an installable iOS build.

## Evidence

Distinguish package integrity and native runner boot checks from live Muse account verification. Test unauthorized, expired, revoked, duplicate and stale mobile requests. Test mobile screen at phone/tablet sizes. Verify final release assets, manifests and source commit. Do not claim hardware or provider flows were tested where they were not.
