# Embed Customize pages in Settings

User correction: replace the Customize launcher with the actual Skills, Connectors, Plugins, MCP servers and Hooks pages, directly under Customize in the Settings sidebar. Keep the selected solid charcoal style and Connections entry.

Implementation: reuse the existing catalog component in an embedded mode without its separate modal or second navigation rail. Move Skills from Coding to Customize. Keep existing standalone entry points compatible. Native Settings routes cover every catalog; legacy customize aliases Skills. Reuse existing setup, permission and installed-state behavior. Settings navigation and closing wait for an active setup operation; no paid or provider requests during tests.

Verification: search/native route unit regression; full app preview and Electron checks for the same Settings dialog across all pages, setup forms, filters/Installed, busy close/navigation protection, light/narrow layouts and account routing. Preserve existing catalog tests and settings persistence checks. Independent review before commit/push. Update desktop only from exact published, checked and hash-verified artifact.
