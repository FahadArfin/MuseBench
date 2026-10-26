# Customize

Open **Customize** in the Muse Code or Meta AI sidebar. General Settings is still available from the profile menu. `/customize`, `/plugins` and `/mcp` also open the relevant setup area.

- **Skills:** search the official CLI inventory, change activation, create a personal workflow or validate and install a local folder containing SKILL.md. Manual-only skills remain available in the slash picker.
- **Connectors:** open Muse's connected-apps or WhatsApp flow with the existing personal browser session. Availability and consent are managed by the official service. Custom Code tools use MCP.
- **Plugins:** choose a local Muse-compatible bundle, inspect its capability counts, review access and install. Installed bundles can be enabled, disabled or removed. This first version does not browse remote marketplaces or automatically approve every runtime capability. A bundle requiring additional tool approval must be reviewed in the official CLI; returning to Customize requires reviewing the changed inventory again.
- **MCP servers:** configure an HTTPS endpoint or a local stdio program and arguments. Entries are optional, enabled for future runs and explicitly reviewed. Toggle or remove them, or use the official Muse CLI OAuth login/logout flow. Sign-in success does not claim a server has been tested online.

## Permissions and persistence

Muse's project shell sandbox and startup checks remain enabled. MCP services and plugin programs have separate access: local programs run as the Windows account, and remote tools can receive the data sent to them. Customize explains this and requires explicit consent before activation. It never passes `--yolo` or `--disable-sandbox`.

Setup writes the official CLI's personal configuration, so changes apply to other Muse CLI sessions as well as future MuseBench runs. Muse owns OAuth tokens. MuseBench does not read auth.json or expose raw CLI diagnostics, credential headers or unrelated settings in the renderer.

Review records live in the app profile's extension-reviews.json. Grants bind to the exact MCP entry or plugin inventory and package contents. Modifications elsewhere invalidate those grants. Existing project trust, project MCP/hooks and managed configuration restrictions remain in place. Setup is blocked during Code, Work and Sites runs and while native shutdown is uncertain.

MCP settings edits retain unrelated values, preserve the earlier document in settings.json.musebench-backup, prepare a temporary file, check for intervening edits immediately before replacement and reject detected conflicts. This is conflict detection, not a lock shared with every external editor; avoid editing settings.json in another program during setup.

## Official references

Capabilities were checked against installed Muse 1.4.13-R6996.1 `skills --help`, `plugins --help`, and `mcp login --help`, plus Meta's [extension documentation](https://dev.meta.ai/docs/muse-code/extending) and [configuration documentation](https://dev.meta.ai/docs/muse-code/configuration).

## Validation

- 534 serial unit tests passed, including review invalidation, ambiguous-file-hash regression, concurrent settings edits, failed inventory loading, secrets, active tasks and shutdown.
- Real CLI smoke tests create/toggle a skill, validate/install/toggle/remove a plugin, configure/toggle/remove MCP entries and negotiate a local MCP tool list in a native echo run with sandbox enabled.
- All native smoke tests use a disposable profile. No real account configuration, provider prompt or remote OAuth login was used.
- Electron UI coverage includes four tabs, real installation through the file picker, skill creation, MCP consent and persistence, keyboard navigation, light/dark themes and 390px layout.
- Existing slash, Settings and sidebar/navigation UI checks passed. Packaged verification and screenshots are recorded under artifacts/customize-ui and artifacts/personal-package-verification.json.
