# Customize idle refresh fix

The installed 0.2.161 acceptance check reproduced the reported page jump on 29 October 2026. A native screenshot showed a temporary “A task is running” banner while the Muse runtime was unavailable. A 200ms inspection correlated the 61px layout shift with the controller's busy flag.

The shell refreshes the selected chat every five seconds and when focused. That read operation correctly holds the controller's operation lock, but Customize interpreted the transient lock as running work. Earlier preview-only idle checks did not emulate the real controller's busy transition.

The periodic/focus refresh effect now pauses while Customize is open and resumes after it closes. Controller subscriptions remain active, so actual task updates still arrive. The controller, configuration checks and restart guards are unchanged. An already-running refresh may finish when the dialog opens; this change prevents recurring idle refreshes, not ordinary completion of existing work.

The browser and Electron regression first proves refresh is active, then exercises all five tabs with focus events, waits beyond the periodic interval, and verifies refresh resumes after closing. Both regressions failed on the previous code and passed after the two-line effect change. Existing plugin consent, revocation, narrow-layout and Installed row checks also passed.

The final release receipt records the full suite, immutable CI/artifact verification, native installed checks and profile-preserving update. Initial failure evidence is retained under `artifacts/release-0.2.161/`; final installed evidence is stored with the follow-up release.
