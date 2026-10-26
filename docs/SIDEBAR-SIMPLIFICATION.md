# Sidebar simplification — 2026-10-26

Use the user's two Claude screenshots as the layout reference: a single narrow navigation column, compact header, New action, grouped lists, subtle nested threads and a bottom profile menu. Keep MuseBench's blue identity and existing functionality.

Replace the extra icon rail with one 280px sidebar. Code keeps New chat, collapsible Projects and Recents, and search beside Recents. Folder opening stays at the Projects add button and empty state; checkpoints move to the profile menu. Personal chat keeps service destinations, compact collections and on-demand search; extra service tools move under More. Work uses New work followed by Sites/Spaces and recent work. Keep Settings in the profile menu on both sides.

This is a layout and navigation change in the current React/Electron app. No new pinning system, fake Routines/Customize feature, provider sign-in change, backend change or sandbox change. Preserve original destination handlers, item IDs and saved data. Existing Lucide line icons and system typography fit the references and remain in use; no raster assets are required.

Verify Code project/chat navigation, profile access, product switching, personal filtering, More tools, collapse/reopen and narrow overlays. Check native service views are hidden under the new profile menu. Inspect desktop/narrow and light/dark screenshots, then package and reopen the updated app.
