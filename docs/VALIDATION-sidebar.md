# Simplified sidebar validation — 2026-10-26

The Code and Meta AI sidebars now use one navigation column based on the user's Claude screenshots. See [design scope](SIDEBAR-SIMPLIFICATION.md) and the final single-sidebar section in [design QA](../design-qa.md).

Code keeps New chat, collapsible Projects and Recents, nested project chats, and search beside Recents. Personal chat uses on-demand search and More for extra Muse tools. Work starts with New work, Sites and Spaces, then Recents; saved sites/spaces appear under their active section. Both products use the bottom profile menu. Blue Muse identity remains in place.

## Verified

- Windows build and package pass. All 52 packaged source/build files and both native helpers match the validated sources (`artifacts/sidebar-package-verification.json`).
- All 517 unit tests pass sequentially (`artifacts/sidebar-unit.log`).
- Final packaged Code navigation, personal service fixtures, brand/layout, Work, Sites and Spaces integration suites pass with no renderer errors. Exact counts and report paths are in `artifacts/sidebar-validation.json`.
- Tests cover section collapse/search, sidebar reopening from Code/Work/Sites/Spaces, draft and history retention, profile menu focus, native browser occlusion, product switching, light/dark themes and narrow layouts. Personal session persistence and sandbox isolation use offline official-origin fixtures, not a fresh live sign-in.
- 49 backend, runtime, authentication, storage, security and template files are byte-identical to the preceding package (`artifacts/sidebar-boundaries.json`). No model requests or external deployments were made.

Issues found during verification were resolved: active-product gating prevents duplicate profile portals; bounded Work scrolling keeps the profile visible; fixed-width project add buttons preserve title space. Sidebar reopen and Work search shortcuts now target the visible navigation. Closing search clears its hidden filter. Prompt starters from the personal profile switch to the Code view.

Integration scripts were updated to follow the new grouped Spaces navigation. Sites verification now closes the publication dialog through its enabled close control after the pending result, avoiding an Escape-before-render race. A concurrent Work run read its prior editor value before React settled; the check now waits for the expected restored draft and passes against the final package. No backend behavior or assertions were weakened.

Visual checks compare the supplied Claude column with final Code, light Work and narrow personal screens. No blocking visual issue remains in inspected states. Screen readers, every possible service layout and uncommon Windows scale factors were not exhaustively checked.

## Larger app branding follow-up

The product selector now shows a 28px blue icon and a 20px name (previously 15px). Product-menu icons increased from 19px to 26px, with 40px containers and 14px names. The header grows to 64px while navigation rows stay compact. Only `PersonalMuse.tsx` and `sidebar.css` changed for this follow-up.

Build/package and packaged light/dark/narrow smoke checks passed: `artifacts/brand-ui/packaged-uhxY3G/report.json`. All 52 packaged source/build files and both native helpers match validated sources (`artifacts/logo-package-verification.json`). Inspected the enlarged product selector/menu at `artifacts/brand-ui/source-PCbAAx/dark-product-menu.png`. No login, sandbox or backend changes.
