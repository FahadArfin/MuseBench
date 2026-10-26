# Slash Commands Implementation Plan

**Goal:** Implement the supplied slash menu in Muse Code with truthful native actions.
**Architecture:** Shared catalog/parser; React command picker and dialog; validated controller state; fixed read-only CLI metadata service.
**Tech Stack:** Existing Electron, React, TypeScript, Lucide, Node tests and Playwright Electron checks.
**Spec:** ../specs/2026-10-26-slash-commands.md

- [x] Test command parsing/filtering, alias matching, unknown commands, and path exclusions; implement catalog.
- [x] Test durable goal/memory/rename behavior and bounded per-request instructions; add validated controller actions.
- [x] Test CLI metadata sanitization/failure and fixed commands; add trusted IPC for skills and usage only.
- [x] Implement screenshot-matching palette, keyboard/submenus, command dialogs and existing app wiring.
- [x] Verify command actions, drafts, skill insertion, restart, narrow/light/dark layouts and unchanged sandbox/login modules.
- [x] Build/package, compare screenshot target with rendered menu, document coverage and limitations, reopen app.

Review focus: no automatic model submission from menu selection; command failures preserve drafts; no accidental shell execution; stale skills/usage responses cannot overwrite current project state; no fake service-tier/model claims.
