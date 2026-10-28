# Sidebar loading and browser session durability

The sidebar previously rendered idle collection states as “Loading…”, including
when Muse sign-in was required. Ideas and Goals also waited for the separate
side-chat menu to be read successfully. Missing provider markup or a stalled
page script could therefore leave the wrong loading presentation indefinitely.

Collection states now distinguish waiting, active loading, unavailable data and
required sign-in, with actions to open the provider page. A confirmed signed-in
Muse document can unlock Ideas and Goals independently of the side-chat menu.
Page reads are bounded and retain the existing document/account-generation
checks; old results cannot repopulate a different account.
Repeated loading responses have a 15-second budget per document. Background
retries preserve an actionable failure or sign-in state; explicit refresh gets
a fresh bounded attempt.

The updater does not deliberately clear browser storage. The application ID,
profile location convention and persistent partition remain unchanged. Finding
unexpired authentication records on disk demonstrates storage retention, not
that the provider still accepts the session. Provider reauthentication is a
separate question and must not be called fixed solely by an offline test.

The new main-process durability helper coalesces native persistent-session
writes after cookie changes and awaits a final write before quitting or updating.
The five-second deadline prevents an indefinite shutdown. An unsuccessful final
save blocks update installation through the existing shutdown-error path.
It neither reads cookie values nor changes cookie expiry, security attributes,
partition identities or sign-out behavior.

Run `npm run test:session-recovery` after building. The two smoke scripts use
fictional provider HTML and clean local profiles with external DNS disabled:

- Sidebar sign-in display and successful collection recovery without a side-chat menu.
- Early browser-store writes and the real application quit/restart path.
- Persistent cookies and localStorage retained in default, personal and billing sessions.
- Unchanged expiry, Secure, HttpOnly and SameSite attributes; session-only cookies still expire.

Both scripts also accept `MUSEBENCH_EXECUTABLE` for packaged-desktop verification.
Unit coverage exercises bounded reads, stale-account guards, write failures and
an update being stopped when storage cannot be saved.

Local verification on 2026-10-28: 1,053 tests passed; TypeScript and renderer
build passed; 92 preview/desktop parity scenes passed. Both recovery smoke
scripts passed against source Electron and the packaged desktop. The package
check matched all 190 source/build files and both native helpers. These are
isolated fixture results, not proof of a live provider accepting saved login.

The full suite also exposed a pre-existing font-test timing race: loaded
FontFace objects could precede the browser's rendered-font swap. The test now
waits for font readiness and layout before its unchanged strict glyph check.

Native persistence APIs: [Electron cookies](https://www.electronjs.org/docs/latest/api/cookies#cookiesflushstore)
and [Electron session storage](https://www.electronjs.org/docs/latest/api/session#sesflushstoragedata).
