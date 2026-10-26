# Project overview implementation

1. Add an Electron regression using real controller data and isolated local folders; establish failure against the existing interface.
2. Add the overview component and project navigation. Keep review optional and reuse persisted tasks for child chats.
3. Update old UI tests to explicitly open Review when needed. Validate source behavior, then review screenshots and changes.
4. Back up the current package, build/package, run packaged UI regressions and full unit tests, and verify packaged bytes.
5. Record evidence and reopen the normal-profile application. Keep authentication/session storage and sandbox configuration untouched.
