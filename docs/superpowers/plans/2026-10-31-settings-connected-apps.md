# Meta apps directly in Settings Connections

User-selected screenshot is the specification: compact full-width list of Google Drive, Gmail, Google Calendar, Google Contacts, OpenTable, Outlook Calendar, Outlook People and Outlook Email, each with its own Connect action, inside the existing Settings shell. Replace launcher cards. Preserve the shared preview/desktop UI and existing opaque reading surface.

1. Add a bounded official-page adapter for reading known app rows and activating exactly one matching Connect action. Reuse the isolated Meta session and existing account popup policy; never grant permissions or disconnect automatically. Unknown/ambiguous/unavailable states stay explicit. Add policy, DOM and controller regression tests.
2. Render the list directly in SettingsConnections, with bundled service icons, loading/refresh and honest connection states. Fetch on entry and on returning focus, without background polling or fabricated connection success. Keep secondary account/settings links compact.
3. Verify shared browser/Electron UI, narrow layout, real routing and cancellation. Independently review, fix findings, build, commit/push and verify the published Windows installer before installing/reopening the idle app with profile backup.

Contract: PersonalCommand adds `metaApps` with action `refresh` or `connect` (connect requires an allowlisted app ID). PersonalState adds optional `metaApps: {status:'idle'|'loading'|'ready'|'unavailable';items:{id:string;status:'connected'|'unconnected'|'unknown'}[];updatedAt?:string;message?:string}`. IDs: google-drive, gmail, google-calendar, google-contacts, opentable, outlook-calendar, outlook-people, outlook-email. `refresh` only reads/navigation; `connect` starts the official provider flow without accepting consent. Shared app definitions live in src/shared/meta-apps.mjs plus declaration file.

Ruling: Native rows mirror only known rendered official app names and status, not a new authorization API. This preserves provider-owned consent and avoids inventing account access.
