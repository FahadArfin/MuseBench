# Settings and Customize polish implementation plan

> **For agentic workers:** Use superpowers:executing-plans for this focused change.

**Goal:** Apply the selected conservative visual refinement to Settings and Customize and make customization and official account connections accessible from Settings.

**Architecture:** Reuse the shared React dialogs and existing bounded personal commands. Settings gains a Customize launcher section and a Connections section; launchers open the existing fully functional catalogs rather than duplicating installation state. Preview and desktop share components. Existing CLI connection remains separate.

**Tech stack:** React, TypeScript, CSS, Electron, existing Playwright fixtures.

**Spec:** User selected the first latest concept (`exec-eee1c8e1-4cdf-4168-bdfd-caf3362846ff.png`) and explicitly requested implementation plus Settings integration. Preserve compact catalog rows, solid content/sidebar surfaces, blue selection, 18px dialog corners and restrained header depth. No desktop transparency or new permissions.

## Tasks
- [x] Add searchable Customize and Connections categories and native navigation support; test search and route validation.
- [x] Add five catalog launchers in Settings and bounded Meta AI apps/settings and Muse connections actions. Add the Meta AI apps entry point to Customize/Connectors. Do not fake provider connection state or consent.
- [x] Share scoped dialog styling, keeping content opaque, current density, light theme, narrow layouts and reduced motion intact.
- [x] Verify actual shared UI in browser and isolated Electron fixtures: category search, each launcher, command routing, Escape/focus, dark/light/narrow layouts. Run build and regression checks.
- [x] Independent review, record evidence, then commit and push under existing authorization.

## Review focus
- Distinguish Muse Code MCP integrations from Meta AI account apps.
- Settings search and keyboard traversal must include new sections without regressions.
- No dead launcher, nested modal, or lost selected catalog when changing dialogs.
- No overflow at narrow widths or illegible light-theme surfaces.
- Fixture success does not establish OAuth or payment acceptance; no paid requests or consent submissions.

## Execution record
- Baseline is clean commit 792cb9c in the existing attached isolated worktree.
- User implementation authorization covers the selected visual and new sections; proceed without another design approval cycle.
