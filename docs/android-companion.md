# MuseBench for Android

Download `MuseBench-<version>-android.apk` from the [latest GitHub release](https://github.com/FahadArfin/MuseBench/releases/latest). One APK supports ARM, ARM64 and x86_64 phones/tablets running Android 8 or newer. Android may ask you to allow installs from the browser or file manager you use to open the APK. Later versions install over the existing app using the same signing certificate; do not uninstall to update.

## Chat

The Chat tab opens the official Muse or Meta AI service in a separate browser view. Sign in on the device. Cookies and local provider storage persist between app launches and updates. This does not require a desktop. Uploads use Android’s file picker. Voice/video permissions are not enabled in the embedded view; use **Open in browser** when a provider needs them or requires browser-based sign-in. Provider availability and authentication policies still apply.

## Code

1. Update MuseBench on the desktop and open **Settings → Mobile devices**.
2. Turn on the desktop connection, select its LAN or private-VPN address, then choose **Pair a device**.
3. On Android, choose **Code → Scan QR code**, or paste the pairing link.
4. Choose an existing Code chat. **Open on desktop** selects it before you send a follow-up. The desktop must remain open and connected to the official Muse CLI.

Code keeps files, model login, tools and permissions on the desktop. The companion can read existing Code conversations, select a conversation, send text follow-ups, and stop the selected conversation. New projects, file editing, approvals, attachments, worktree management and model/account configuration remain desktop actions in this first mobile version. Running tasks and approval notices are visible on the companion.

Use a shared network or private VPN, and allow MuseBench through the desktop firewall on that network if prompted. No router ports or public tunnels are configured. The connection turns off at desktop exit; turning it back on retains paired devices and its port. Disconnect a device in desktop Settings to revoke its token. **Disconnect this desktop** on Android forgets its local token; revoke it on the desktop too when retiring a device.

## Connection and recovery

- Pairing codes last ten minutes and work once. Treat the QR code/link as a temporary invitation.
- HTTPS is pinned to the desktop certificate encoded in that invitation. Android rejects a changed certificate before sending credentials. Desktop identity/token hashes use Electron protected storage; Android tokens use an AES-GCM key held by Android Keystore. Linux needs a working system keyring; plaintext fallback is refused.
- The local app bridge is available only to the bundled app’s main frame. Remote chat pages have no companion bridge, and browser-origin requests cannot access the desktop endpoint.
- Messages carry unique request IDs. The desktop journals admission before executing, so replaying a request does not send twice. After an interrupted desktop process, an uncertain request is shown as **unknown** and is never automatically replayed. Check the desktop before clearing that notice or sending again.
- Certificates renew near their annual expiry and devices must then pair again. IP address changes can also require a new pairing link. Upgrades retain app data and pairing, but the connection still starts off.

## Builds and verification

`npm run build:mobile` builds the bundled responsive UI. Open `mobile/android` in Android Studio, or use JDK 17, Gradle 8.11.1 and Android SDK 35:

```
gradle -p mobile/android testDebugUnitTest assembleDebug
```

Signed release builds require `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD` and `ANDROID_KEY_ALIAS`. GitHub’s release workflow reconstructs the key only in the temporary runner directory, verifies the APK certificate against `mobile/android/signing-certificate.sha256`, and deletes that temporary key. Never commit private signing keys/passwords. The owner’s recovery copy is outside the repository in the protected `.musebench-release` directory; its password backup uses Windows DPAPI.

Android packaging and emulator checks now run only for an explicitly selected all-platform release; normal main pushes focus on Windows x64. When selected, phone/tablet UI scenarios and Android emulator tests use an isolated HTTPS desktop fixture. The native tests cover a rejected certificate, one-time pairing, Keystore persistence, duplicate-message prevention and the separation of local/remote WebViews. These checks do not prove provider sign-in on a physical Android device. Desktop package boots likewise do not constitute live Muse model runs on every CPU/OS.

iOS is deferred until Apple signing/provisioning is available. Its future companion can reuse the mobile UI and protocol without moving desktop model credentials onto the device.
