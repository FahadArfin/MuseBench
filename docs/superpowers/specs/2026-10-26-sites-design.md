# MuseBench Sites

## Intent
Build Sites into the existing Windows app so a user can create or import a website, preview it, save an immutable version, publish to a real host and manage/share the result. Follow ChatGPT Sites' clear separation of drafts, saved versions and publication. Preserve Code, Work, Spaces, existing login storage and the Muse sandbox.

## Approach
Recommended builder choice: native Electron/React management with a direct Netlify hosting adapter. Unlike a custom server, this can keep a public URL available after MuseBench closes. Unlike forwarding to ChatGPT tools, it works independently of this conversation. A provider-preference question is pending; implement the adapter behind an interface. No external deployment occurs before an explicit Publish action. The user has authorized implementation; registration, billing changes and live hosting credentials remain user-owned.

First release is static HTML/CSS/JavaScript sites, including exported Work dashboards/reports/slides and built output folders. Muse can generate/edit a site inside a separate managed sandbox workspace. Do not run imported build scripts. Full server apps, databases, email delivery, visitor authentication and analytics collection are not implied. Netlify public hosting is explicitly labeled; do not label secret/unlisted links private. Provider domain/analytics controls open the official dashboard rather than fabricating unavailable controls.

## Experience
Sites navigation alongside Spaces and private Work. A library of drafts/live sites with search and useful status. Create a starter, import a built folder or copy a validated Work artifact. Site studio: native prompt and real Muse activity, isolated responsive preview, source files, version history and settings. Save captures immutable bytes; Publish names the selected version and public audience. Share opens/copies the verified production URL. Rollback is an explicit publication of a previous version. Availability controls open the official provider dashboard because Netlify does not document an unpublish operation in its public API. Local removal must not imply remote deletion.

## Boundaries
Publishing is performed only by main process with credentials encrypted by Electron safeStorage. Authentication uses the official Netlify OAuth ticket flow when a registered MuseBench client ID is configured; personal token entry is a clearly labeled local-development fallback. Never bundle another application's client ID, forward credentials to generated pages, or reuse Meta/Muse credentials. Public redistribution requires a registered OAuth application. Tokens never enter returned state or logs.

Preview uses a separate protocol, opaque iframe origin, restrictive CSP and no app bridge, network, popup, form submission or filesystem access. All imports traverse only a selected build directory, reject links/junctions/traversal, hidden/config/source/credential files, and cap files/bytes. Show exactly what is included before saving/publishing. Generated files are untrusted. Publication can expose imported/generated content; the app clearly identifies the public audience.

Persist operation state before remote mutations. Save remote site/deploy IDs immediately. On ambiguous failures, refresh/reconcile instead of blindly creating duplicate sites/deploys. Resume polling after restart. Only report Live after confirming provider-ready status and the production deployment association. Do not retry destructive mutations automatically. Updating a draft must not change live content.

## Verification
Service and transport tests for exact bytes, role of tokens, rejects, failure recovery, restart, lifecycle and same-site selection races. Independent review of publication and preview boundaries. Packaged two-stage create/edit/save/publish mock-provider tests and existing Work/Spaces regressions. A real public deployment requires the user's hosting connection, is separately labeled and must be fetched without credentials before claimed working.

Sources: https://learn.chatgpt.com/docs/sites/managing-a-site ; https://learn.chatgpt.com/docs/sites/publishing-and-sharing ; https://docs.netlify.com/api-and-cli-guides/api-guides/get-started-with-api/ ; https://open-api.netlify.com/

