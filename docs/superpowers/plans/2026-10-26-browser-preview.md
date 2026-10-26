# Browser preview implementation plan

**Goal:** Open MuseBench's shared interface beside the Codex chat for element annotations.
**Architecture:** A separate Vite development entry mounts the real App with a browser-only, in-memory bridge. It contains fictional sample content and no Electron IPC, account session, filesystem, shell, or model connection. A small optional rendering context fills the personal WebContentsView slot and renders Work artifacts in browser frames. The production entry does not import the preview.
**Tech stack:** Existing React, TypeScript, Vite and Playwright; no new dependencies.
**Spec:** User-approved browser preview proposal in this conversation. Desktop accounts and sandbox remain intact. Preview is explicitly labeled and must not imply real model execution or publishing.

## Implementation

- [x] Write a failing browser smoke test for loading the shared UI, navigation, sample replies, settings, and blocked desktop operations.
- [x] Add the separate preview entry, sample bridge and personal preview, reusing existing components and artifact rendering.
- [x] Add a loopback-only preview command and a short usage guide. Preserve normal startup and production bundling.
- [x] Verify interaction, reload isolation, narrow layout, no external requests, and production compilation; open the preview inside Codex.

## Review focus

- Reload resets sample edits without deleting browser preferences or desktop data.
- Desktop-only actions report their limitation; no credential, shell, model or publishing operations run.
- Preview content stays out of the packaged app's entry graph.
- Existing menus, settings, product switching and mobile layout work through the shared components.
- Meta's signed-in website is represented by explicitly fictional content, never an imported account session.

## Verification

Browser UI checks passed (artifacts/browser-preview/report.json), including Code composer, personal destinations, Work artifact, Sites, Spaces, reload/reset isolation, and mobile width. No external requests were made by the tested flows. Motion scripts initialize and typing preserves the iframe. Production build and five desktop product-switch checks passed; sample strings and preview.html are absent from dist. The existing desktop process was left open. Preview is served at 127.0.0.1:4319 and verified in Codex browser tab 3.

Review fixes: validate Work artifact edits before storing them; render sample Sites through an optional isolated srcDoc; permit nonce-authorized artifact scripts through the preview-only parent policy; clear sample editor storage at bootstrap; memoize Work HTML to preserve interaction state.
