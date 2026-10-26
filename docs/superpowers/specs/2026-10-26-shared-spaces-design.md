# MuseBench shared spaces

## Intent and current architecture

Add a native Spaces library inside Meta AI > Work for related pages, validated Work artifacts, comments, and collaborators. Existing Work items live in a private local controller and sandboxed Muse workspace. Personal website sessions and Code projects stay separate. Research: https://learn.chatgpt.com/docs/space and https://learn.chatgpt.com/docs/space/collaboration describe grouping, inherited permissions and comments without sharing private chats.

## Approaches

The proposed default is an invite-based server, compared with shared OneDrive/network folders. A server can enforce roles, revoke future access, and reject stale edits atomically. Folder sync cannot reliably enforce app-level roles or concurrent updates. No external service is deployed by this change. The architecture choice was presented to the user; proceed with the recommended default under the authorized implementation request unless steered otherwise.

## Product behavior

- Spaces navigation in the Work sidebar. Create a named space with description and your display name; join by pasting an invitation. Names are self-declared, not verified account identities.
- Built-in hub is local to this computer and available while MuseBench runs. Explicit connection to a hosted HTTPS hub enables cross-computer collaboration. A standalone server entry point and setup guide accompany the feature; no hosted cloud service is claimed.
- Space contains Markdown pages and published copies of Work artifacts. Private chat history, source-file bytes, credentials, local file paths, browser cookies and CLI identity are not published. Artifact content and its source annotations are shared when the user publishes it.
- A Work item can be explicitly published to a space. A shared artifact can be copied into private Work for Muse revision. No model call on sharing, joining, reading, copying, or polling. Republishing an edited artifact is explicit.
- Server roles: owner, editor, commenter, viewer. All members can read. Owner/editor can edit pages/artifacts. Owner/editor/commenter can comment. Owner manages invitations and removes members; owner cannot remove self. Single-use invitations expire after 48 hours and can be revoked.
- Comments, revision history and restore-to-new-revision. Optimistic concurrency on every content save: stale revision produces a conflict, keeps the local draft, requires reload or explicit new-page copy. No silent overwrites.
- Native screen: space overview, Pages, Members, activity, new page, Publish work, selected page with Preview/Edit/Comments/History; narrow screens remain usable. Connection errors and last refreshed time are visible. Refresh polls only while Spaces is active.

## Boundaries

Node HTTP + SQLite backend. Bearer tokens are 256-bit opaque membership credentials, stored as hashes server-side. Per-request authorization; no anonymous content endpoints, no credential URL query parameters, no CORS. Invite secrets appear only in the invitation fragment and explicit join POST. TLS required for non-loopback client connections. Redirects forbidden. Requests bounded and timed out; server rejects browser Origin requests and unknown Host headers. Client encrypted credential storage through Electron safeStorage. Model never receives space credentials or access to hub storage.

Use existing validated artifact schema and trusted renderer in sandboxed iframes. Markdown does not enable raw HTML. Maximum page Markdown 100k characters, artifact 512 KiB, request 800 KiB, response 8 MiB; bounded histories/comments, pagination/limits visible. No arbitrary files or executable uploads. Client receives only selected shared data, never a source workspace path. Server cannot execute Muse commands.

## Verification

Two independent clients sharing a space; one-use and expired invitations; viewers cannot write; commenters cannot edit; editor access; revocation; stale save; restart durability; history restore; response limits; malformed artifact; cross-space credential rejection. UI create/join/page/comment/publish/private-copy/role/conflict/narrow/theme flows. Unit regression, build/package, exact packaged checks and preserved native sandbox/browser modules. Actual internet hosting remains a documented user setup step.
