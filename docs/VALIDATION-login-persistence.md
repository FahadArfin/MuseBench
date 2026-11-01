# Login persistence across restart and update

## Findings

The last manual release reopened the default Roaming profile before the prior
temporary source-check profile was located. Profiles have separate Chromium
partitions, so switching profiles can present a logged-out account without
deleting the original login. Normal releases must reopen the same profile;
verification profiles must never become the user's normal launch target or be
merged with another account's data. The installer retains application data
(`deleteAppDataOnUninstall: false`); no browser-storage clearing occurs in the
update path.

There is also a reproducible restart gap: Electron 45.0.0 sets both
`restore_old_session_cookies` and `persist_session_cookies` to false, even for
on-disk partitions. The previous durability test explicitly expected session
cookies to disappear. The revised real-Electron test failed on the missing
session cookie before the fix. This demonstrates the app-side gap; it does not
establish which authentication cookie the live provider uses, since real user
cookie contents were not inspected.

Source: [Electron 45 network-context configuration](https://github.com/electron/electron/blob/v45.0.0/shell/browser/net/network_context_service.cc).

## Change

- Anchor Chromium sessionData explicitly to the selected userData profile.
- Restore session-only cookies for the personal Meta/Muse partition before any
  embedded page opens. Other partitions retain normal Electron behavior.
- Store only allowlisted provider-domain session cookies in `browser-login.bin`
  inside that same profile, encrypted by Electron safeStorage/Windows DPAPI.
  Plaintext fallback is forbidden. Persistent cookies and localStorage remain
  Chromium-managed, and cookie expiration and security flags remain unchanged.
- Never expose the cookie snapshot through renderer state, MCP, logs or IPC.
- Debounce encrypted writes, serialize them, and save again during normal quit
  and update shutdown. Every cookie mutation immediately invalidates the old
  snapshot, and an in-flight stale snapshot cannot replace it. Explicit sign-out
  therefore cannot be restored from a prior saved snapshot.
- Do not migrate, combine, or inspect real user cookie stores. Damaged encrypted
  snapshots are discarded without changing Chromium's own current cookies.

## Bounded native lifecycle (2026-10-31)

Restore, individual saves (including queue wait), and close each have a 5-second
deadline. Tests may configure `restoreTimeoutMs`, `saveTimeoutMs`, and
`closeTimeoutMs`. The close deadline includes any earlier save and every final
snapshot retry, so a stalled early write or repeated changes cannot hold
shutdown indefinitely. Close succeeds only after a committed revision matches
the current cookie revision, and removes its listener synchronously at that
stable boundary. Retry yields are cancellable and keep the original deadline
able to fire. Electron's
asynchronous encryption availability API is preferred when present. Native
failures are converted to fixed messages/codes; neither native error details nor
cookie values are returned to callers or diagnostics.

Every asynchronous continuation checks its operation generation before issuing
more work or committing an atomic snapshot rename. A timeout invalidates the
snapshot, cancels queued work, clears all store timers, removes its cookie
listener, and suspends this store until restart. Late enumeration, decryption,
or encryption can settle but cannot resume replay or commit a snapshot. An
ordinary save failure remains visible and can be retried by the final close.
Successful final saves include a newer login after an earlier snapshot was
invalidated. Chromium's current cookies are never cleared by these failures.

`cookies.set` cannot be cancelled. The caller must keep the existing personal
partition unused until `createBrowserLoginStore` completes, then guard every
personal browser view with `store.canUseSession()`. If an in-flight native replay
outlives its deadline or is interrupted by another cookie change, the partition
stays quarantined for this process, including after late native completion. The
exported `BROWSER_LOGIN_SESSION_BLOCKED_MESSAGE` supplies the safe restart
instruction. Missing snapshots, unavailable encryption, and timeouts before any
native set is pending do not block a fresh sign-in. No partition/profile is
renamed or replaced. See [Electron Cookies](https://www.electronjs.org/docs/latest/api/cookies)
for the non-cancellable promise API and [safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)
for the asynchronous OS protection API.

The module exposes `snapshot()` with `status` (`ready`, `disabled`, `failed`, or
`closed`), `sessionBlocked`, and a nullable sanitized `failure` containing only
`code`, `stage`, and `message`. The optional `onFailure` callback receives that
same safe failure information, so debounced failures are observable. Close
rejects on its own deadline/final-save failure; integration must still run the
separate Chromium durability barrier when that happens. These deadlines bound
asynchronous operations; a synchronous fallback that blocks JavaScript itself
cannot be interrupted by a JavaScript timer.

The desktop consumes this status at window creation and the safe failure callback
for later failures. Its existing personal-browser notice remains visible until
dismissed, survives navigation, and appears again when a new window opens while
storage is still failed. Fixed failure codes determine the message; raw native
errors are ignored. A restore failure says saved sign-in could not be restored;
a timed-out save says protected storage is paused until restart and reauthentication
may be needed. This warning does not block the current usable browser session.

## Verification

`node --test test/browser-login-store.test.mjs test/session-durability.test.mjs`
passes 26 tests on 2026-10-31. This covers encrypted restoration, attributes,
domain isolation, logout, write races, unavailable/plaintext OS encryption,
sanitized synchronous/asynchronous failures, restore/get/set/encrypt stalls,
late completions, queue cancellation, close deadlines, delayed native change
notifications, final-encryption changes, repeated final-save invalidations
under the original close deadline, and the existing bounded storage/update barriers. The new
failure probes use temporary directories and fictional cookies only. The
initial regressions failed before the lifecycle changes were implemented.

`node scripts/session-durability-smoke.mjs` uses three real Electron launches
and a fresh profile, intercepts HTTPS locally, and disables external DNS. It
verifies persistent cookies and localStorage, personal session-cookie restoration,
normal behavior in other partitions, removal surviving another restart, and no
plaintext fixture value in the encrypted snapshot. It asserts both Electron
storage paths remain on the same profile. The third launch injects a stalled
encryption promise and verifies the safe failure notice in the actual rendered
shell. No model/provider request is made.

These are local source checks. The updated source is not installed or released,
and live provider acceptance after an update is not yet verified. Provider-side
expiry/revocation or explicit logout can still require authentication; this
change cannot promise an account remains authorized forever.
