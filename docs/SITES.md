# MuseBench Sites

Open **Muse AI → Work → All sites**. Sites has its own library and Muse conversation for each website.

## Create and edit

Choose a landing page, portfolio or blank starter, import a built static folder, or copy a saved Work artifact. Use the chat to ask Muse for changes. Your installed Muse CLI uses its existing sign-in and Windows sandbox; hosting does not change the CLI permission profile.

The studio has desktop/mobile Preview, Files, Versions and Settings tabs. Preview runs site JavaScript in an isolated frame, without the MuseBench bridge, filesystem access, external requests, form submissions or popups. Network-dependent widgets may behave differently on the published website. Source edits and replacement folder imports update the local draft. Saved versions and the public site stay unchanged.

Use **Save version** to capture the exact files. Publish deploys that saved version, even if you later edit the draft. A public version can be restored from Versions without overwriting the draft. Site files and version history are stored on this computer.

## Current frontend-only build

Hosting setup is deferred. **Share**, **Publish**, and **Settings → Manage sharing** open the local **Sharing & publishing** interface. You can save planned access, a custom domain, search discovery preference and a version to publish. The launch checklist reflects actual local files and saved versions. No hosting account is needed.

These settings are stored per site in this desktop profile. They do not publish content, register a domain, create a link, enforce private access or change an existing hosted site. The final **Publish to web** button is disabled. Provider credential forms and automatic hosting polling are hidden/paused. Existing account data and hosting implementations are preserved for later backend work.

The editor, Muse generation, isolated preview and local version history retain their existing behavior. Only explicit requests to Muse use the existing CLI; opening or configuring sharing makes no model request.

## Deferred hosting integration

The following describes the retained integration, which is not exposed in the current frontend build. A future backend must validate and enforce supported audience/domain choices; turning on a UI flag alone does not implement private or unlisted access.

### Connect hosting

The retained provider adapter supports **Netlify**. Hosting is separate from Muse/Meta sign-in and follows your Netlify plan and permissions.

In a site's **Settings → Hosting**, open Netlify's official token page, create a personal access token for your own account and enter it directly into MuseBench. The app verifies the account and team, then protects the saved token with Windows credential encryption through Electron safeStorage. Never put the token in chat or in website files. Disconnect removes the local hosting credential; it does not take published sites offline.

Browser-based Netlify authorization is also implemented, but requires an OAuth application registered by MuseBench's distributor. Set its public client ID as `MUSEBENCH_NETLIFY_CLIENT_ID` before launching MuseBench. The ID is not a credential. Without this registration the app clearly offers personal token setup; it does not impersonate another application's OAuth identity. Public distribution should configure the registered browser flow and follow Netlify's application requirements.

### Publish and share once hosting is enabled

1. Inspect the preview and Files list, then save a version.
2. Choose the hosting team in Settings if the account has more than one.
3. Click **Publish**, review the version and **Public site** audience, then **Publish publicly**.
4. Wait for the host to report the exact deployment as ready and active in production.
5. Click **Share** to copy its public URL. Visitors need neither MuseBench nor a Muse account; the site stays hosted when MuseBench closes.

The first deployment creates a new site in your connected account. Existing same-name sites are not adopted or overwritten; change the preferred address if it is unavailable. Custom domains, analytics and site availability open the official Netlify dashboard. MuseBench does not invent visitor counts, configure billing, or claim a site was taken down through an unsupported endpoint. Deployment-specific URLs may remain accessible after changes to production availability.

If a request loses its response, **Refresh status** checks the saved operation. It does not blindly create another site or deploy. If no operation can be found, **Check pending publication** offers a reset only after you confirm that you checked Netlify. Resetting the local pending action cannot cancel a late remote operation.

## Supported content

Static HTML, CSS, browser JavaScript and allowed assets, with `index.html` at the root. Import the built output folder, not an application's source repository. Imports never execute build scripts. Limits are 200 files, 5 MiB per file and 25 MiB total; 50 local sites and 30 saved versions per site. Hidden files, credential/configuration files, server scripts, source maps, unsupported types, symlinks and Windows junctions are rejected.

Work conversion copies the rendered artifact, including its source annotations. It does not copy private chat history, attachments or login credentials. Check the copied content before publishing.

This release does not provision server runtimes, databases, visitor accounts, private/password-protected sites or multiplayer editing. It is separate from Shared Spaces membership and from ChatGPT's hosting service.

## Reference

The draft/version/publish interaction follows the [ChatGPT Sites management guide](https://learn.chatgpt.com/docs/sites/managing-a-site) and [publishing guide](https://learn.chatgpt.com/docs/sites/publishing-and-sharing). The standalone provider uses the [official Netlify API](https://docs.netlify.com/api-and-cli-guides/api-guides/get-started-with-api/) and [OpenAPI definitions](https://open-api.netlify.com/). See [validation evidence](VALIDATION-sites.md) for tested behavior and external prerequisites.
