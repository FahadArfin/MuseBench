# Android Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Ship an Android phone/tablet companion with independent chat and explicitly paired desktop Code sessions on every release.
**Architecture:** A bundled responsive React screen uses an origin-restricted Android message bridge. Separate browser views handle official Muse/Meta chat. An opt-in desktop HTTPS listener authenticates paired devices and forwards only existing-chat selection, follow-up messages and stop requests through the serialized controller.
**Tech Stack:** React/Vite, Node HTTPS, selfsigned 5.5, Java 17, Android WebView/Keystore, Gradle 8.11.1 and Android Gradle Plugin 8.9.
**Spec:** `docs/superpowers/specs/2026-10-28-multiplatform-design.md`

## Global Constraints

- Mobile Code requires the desktop; no provider credentials are copied to Android.
- Listener is off at launch, explicitly enabled in Settings, TLS pinned, and has revocable devices.
- Pairing links expire after ten minutes and are single use. Device credentials use protected storage.
- Native bridge is limited to bundled app content; external chat pages never receive it.
- Keep desktop/preview UI aligned and include a stable-key-signed Android APK in every future release.
- iOS distribution remains deferred pending Apple provisioning.

## Review Focus

- Retried messages after a lost response must not execute twice.
- Desktop navigation between mobile selection and submission must never send to the wrong chat.
- Revoked/expired credentials and browser-origin requests must not reach the controller.
- A replaced desktop TLS certificate must fail pin validation before credentials are sent.
- Native chat content must never reach the local companion bridge.

### Task 1: Pairing host and bound controller commands

**Files:** electron/mobile-host.mjs, electron/mobile-service.mjs, src/controller/index.mjs, test/mobile-*.test.mjs.
**Interfaces:** createMobileHost({dataDir,protection,service}) exposes command(status/start/stop/pair/revoke), close(); service exposes snapshot/readChat/command; controller accepts only internal mobileSelect/mobileMessage/mobileStop with task binding.
- [x] Add failing tests for authenticated HTTPS pairing, expiry, revocation, origins, duplicate requests, restart uncertainty and task binding.
- [x] Implement bounded TLS host, encrypted certificate storage, device-token hashes, receipt persistence and strict command validation.
- [x] Route through the existing serialized controller, retaining permissions, busy checks and runtime ownership.
- [x] Run the new tests plus controller/runtime regression coverage.

### Task 2: Desktop pairing controls and responsive mobile UI

**Files:** src/ui/MobileDevices.tsx, settings catalog/types/preload/preview bridge, mobile/*, vite.mobile.config.ts.
**Interfaces:** Desktop bridge mobileDevice(command) returns only local pairing status; Android bridge invokes pair/status/forget/command/readChat/openChat, keeps authorization private.
- [x] Add Settings → Mobile devices, local address selection, expiring pairing link and revocation.
- [x] Build mobile Chat/Code navigation, pairing, existing chat list, paginated transcript, status/approval notices, follow-up and stop.
- [x] Verify phone/tablet layout and desktop/preview controls, including failures and pending send state.

### Task 3: Android host, signing and release

**Files:** mobile/android Gradle app, native pinned HTTPS/Keystore code, build/staging scripts, release workflow, mobile docs.
**Interfaces:** APK bundles the same built mobile UI; pairing protocol v1 is implemented in native Java with pinned certificates and no redirects.
- [x] Implement separate local companion and remote chat WebViews, restrictive navigation and origin-checked WebMessageListener.
- [ ] Add native tests for TLS pin rejection, protected persistence and chat isolation; build and launch on an Android emulator.
- [x] Generate a release signing key outside Git, back it up locally, configure GitHub secrets without printing them, and publish signed APKs with version/source hashes.
- [ ] Add Android as a required release target; fresh review, full tests/build, commit and push.
- [ ] Verify all platform CI results and release assets, install the verified Windows update and reopen. Record Android emulator coverage and unavailable real-device/provider checks honestly.
