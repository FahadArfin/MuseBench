# Retained personal navigation

MuseBench keeps a separate live Electron document for each visited Muse Search,
Feed and Library section, and for Meta AI Search, Media, Artifacts, Scheduled and
Vibes. The existing main chats, side chats, Ideas and Goals continue to retain
their documents. Returning to a section normally changes which view is visible
instead of loading its website again. Drafts, search text, filters and scroll
stay in that document. Explicit New chat still creates a new conversation.

After a visible usable page settles, the browser prepares likely destinations
one at a time. Hovering or focusing a sidebar destination prioritizes it. At most
three unvisited tool documents are prepared; visited documents are never evicted
to make room for speculation. A hint cannot navigate or reload a visited page.
Preparation stops while the workspace is hidden or authenticating, cannot open
popups, and never submits messages, creates chats or changes account settings.
An explicit sign-in requirement blocks preparation. When Meta's sign-out control
is hidden in its account menu, its complete navigation sidebar is sufficient for
read-only preparation; that check does not assert that the user is authenticated.

The cache lives in the app process. It does not save copies of private page HTML
or extract cookies. Existing Electron origin isolation and browser cache remain
in place. Authentication transitions invalidate account-owned documents; a
consistently signed-out Muse page does not repeatedly discard Meta AI drafts.
Websites still control their own live updates. Reload remains available when
fresh server data is needed. Cold visits, authentication and website requests can
still take time; this is not an offline copy of either service.

The browser preview uses the same navigation controls and predecodes its current
local desktop captures, with two image decodes at a time. Those captures remain
read-only snapshots, not live authenticated websites.

## Verification

- Controller tests cover independent documents, draft preservation, warm-load
  promotion, account invalidation, hover safety and explicit New chat behavior.
- `npm run test:navigation-cache` runs the real Electron controller and website
  adapters against intercepted offline fixtures. It checks request counts,
  document identity, search reopening, drafts, filters, scroll and shutdown.
  It uses an isolated profile and makes no model or live-account requests.
- Preview image tests cover bounded decoding, capture revisions and failures.
- The Windows release workflow runs the Electron cache smoke before packaging.

Local reports are written to ignored `artifacts/navigation-cache/report.json`.
Fixture timings measure view switching on this machine; they do not measure
Meta's production network or server latency.
