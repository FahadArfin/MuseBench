# MuseBench Spaces server

Spaces stores shared pages, artifact copies, comments, membership, invitations, and revision history in its own SQLite database. It does not receive personal browser sessions, Muse credentials, private chats, or source-file bytes. Publishing is an explicit client action; artifact content and its source annotations become visible to every member of that space.

The built-in server binds to this computer. A local invitation works while MuseBench is running on the same computer. This implementation does not provision a hosted service. Cross-computer use requires an operator-managed server with a stable HTTPS origin.

## Run the standalone server

Use a Node release with `node:sqlite` enabled. Verification used Node 22.14.0; that release prints an experimental SQLite warning. The server uses Node built-ins and the existing artifact validator, without a new package dependency.

From the MuseBench source directory:

```powershell
$env:SPACES_DATA_DIR = 'C:\MuseBenchSpaces\data'
$env:SPACES_HOST = '127.0.0.1'
$env:SPACES_PORT = '4578'
node scripts/spaces-server.mjs
```

`node scripts/spaces-server.mjs --help` describes the options. The process prints its endpoint, never membership credentials or invitation secrets. Stop it with Ctrl+C, or send SIGTERM from a service manager. Preserve the data directory between launches. Use a local disk for SQLite; the database is not a shared-folder synchronization format.

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `SPACES_DATA_DIR` | `./data/spaces-server` | Persistent database directory |
| `SPACES_HOST` | `127.0.0.1` | Interface to bind |
| `SPACES_PORT` | `4578` | Listen port; `0` chooses an ephemeral port |
| `SPACES_PUBLIC_URL` | Unset | Public HTTPS origin, such as `https://spaces.example.com` |
| `SPACES_ADMIN_TOKEN` | Unset | Random base64url secret of at least 43 characters, enabling administrative space creation |

Without an admin token, HTTP space creation is disabled. The desktop's built-in hub instead creates local spaces through its internal host API. A standalone instance starts empty until explicitly provisioned.

## Host for other computers

1. Run the server as a dedicated service account with access to its data directory.
2. Put a TLS reverse proxy on the same machine, forwarding to `127.0.0.1:4578`. Set `SPACES_PUBLIC_URL` to the exact external HTTPS origin. A public URL must not contain a path, credentials, query, or fragment.
3. Preserve the public `Host` header at the proxy. The hub accepts only its configured listen/public authorities. Do not remove a browser `Origin` header to bypass the native-client restriction.
4. Expose only the proxy's HTTPS listener. If the backend must bind to a private network interface, configure the HTTPS public origin and restrict the backend port to the proxy. The Node listener itself speaks HTTP; setting a public URL does not add TLS.
5. Forward `POST /v1` without redirects, enable request size/rate limits at the proxy, and avoid logging Authorization headers or request/response bodies. Native clients refuse HTTP except on loopback and refuse redirects.

Keep one server process per data directory. Protect the SQLite files and backups with operating-system permissions; page contents are stored as readable database data. To back up without SQLite tooling, stop the service cleanly and copy the complete data directory before starting it again. A running database may also have `spaces.sqlite-wal` and `spaces.sqlite-shm` files, so copying only the main database while it is running is insufficient.

## Provision a hosted owner

Provide `SPACES_ADMIN_TOKEN` through your service manager or private environment. Generate a random value locally and keep it out of chat, source control, command-line arguments, and logs. For example, the following captures the generated value in an environment variable without printing it:

```powershell
$env:SPACES_ADMIN_TOKEN = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Retain that value in an appropriate local secret store before starting a long-lived service. An admin terminal must have the same configured value available. It can then provision a space over the HTTPS endpoint:

```powershell
$spacesUrl = 'https://spaces.example.com'
$provision = Invoke-RestMethod -Method Post -Uri "$spacesUrl/v1" `
  -ContentType 'application/json' `
  -Headers @{ Authorization = "Bearer $env:SPACES_ADMIN_TOKEN" } `
  -Body (@{
    op = 'createSpace'
    name = 'Team planning'
    description = 'Shared pages and published work'
    displayName = 'Owner setup'
  } | ConvertTo-Json -Compress)

$ownerSetupUrl = 'musebench-space://owner?server=' + `
  [Uri]::EscapeDataString($spacesUrl) + '&space=' + `
  [Uri]::EscapeDataString($provision.spaceId) + '#' + $provision.ownerSetupSecret
Set-Clipboard -Value $ownerSetupUrl
```

Paste the copied owner setup URL into **Join space** in MuseBench and enter the owner's display name. Treat that URL as an owner credential: only the intended provisioner/owner should use it. It expires after 48 hours and can be consumed once. The secret is in the URL fragment, and the client submits it only in the explicit `claimOwner` POST body. There is no browser landing page.

Claiming the setup updates the one existing owner's name and rotates the provisional owner membership token. It does not create another owner. The original `token` in the administrative response stops working after the claim. Ordinary invitations can never grant the owner role. If a response is lost during a claim, do not assume retry will succeed: the operation may already have consumed the secret.

The owner can then create viewer, commenter, or editor invitations in MuseBench. These invitations also expire after 48 hours and work once. Display names are self-declared, not verified account identities. Removing a member revokes that membership's future API access; it cannot erase copies they previously read or exported.

Clear the clipboard and provisioning variables after the intended owner claims the setup. If no more spaces need provisioning, the operator can remove the admin token from the service configuration and restart the server; existing memberships continue to work.

## API contract and limits

`POST /v1` accepts a JSON object containing `op` and, except for administrative creation, explicit `spaceId`. Authenticated calls send `Authorization: Bearer <membership-token>`. `join` and `claimOwner` use their one-use secret in the body. There is no anonymous content endpoint, credential query parameter, CORS, redirect, browser UI, or file upload endpoint.

See [spaces-contract.md](spaces-contract.md) for the application operations. Administrative additions are:

| Operation | Authorization | Request fields | Result |
| --- | --- | --- | --- |
| `createSpace` | Configured admin bearer | `name`, optional `description`, `displayName` | `spaceId`, provisional `token`, `ownerSetupSecret`, `ownerSetupExpiresAt` |
| `claimOwner` | One-use setup secret in body | `spaceId`, `secret`, `displayName` | `spaceId`, replacement owner `token` |

Membership, invitation, and owner-setup secrets contain 256 random bits and are stored only as SHA-256 hashes in SQLite. The admin secret is retained as a hash in process memory. Every authorized operation queries active membership for the requested space; role checks and mutations occur in SQLite transactions. Removed memberships remain as historical authors but disappear from the active member list.

| Limit | Behavior |
| --- | --- |
| 100 pages per space | Further creates return `409 LIMIT_REACHED`; existing pages can still be edited |
| 100 active members per space | A failed join at the limit does not consume its invitation |
| 200 invitation records per space | Includes used and revoked invitations; further creates return `409 LIMIT_REACHED` |
| 200 comments per page | Further comments return `409 LIMIT_REACHED`; existing comments can still be resolved |
| Latest 30 page revisions | Older history is pruned; restore creates a new revision |
| 100 characters for space/display names | Longer values are rejected |
| 2,000 characters for descriptions | Longer values are rejected |
| 160 characters for page titles | Longer values are rejected |
| 100,000 characters for note bodies | Longer values are rejected |
| 4,000 characters per comment | Longer values are rejected |
| 512 KiB per validated artifact | Uses the same schema/whitelist as private Work artifacts |
| 800 KiB per request; 8 MiB per response | Oversized messages return a structured error |
| 10-second request/header/socket limits | Slow or incomplete requests are terminated |

The snapshot includes `limits`; page reads include `historyLimit: 30`. No collection silently overflows these caps. Invites are returned only to owners; page bodies and artifacts are returned only when explicitly opening a page. Artifact fields outside the validated schema are discarded, and model-authored strings remain data for the trusted renderer.

Updates require the exact `expectedRevision`. A stale save or restore returns `409 CONFLICT`; the client must preserve its draft and let the user reload or create another page. Do not automatically replay writes, joins, or owner claims after an ambiguous network failure. Refresh first where an active membership is available.

## Verify locally

```powershell
node --test test/spaces-hub.test.mjs
```

The tests use independent HTTP clients and real temporary SQLite storage. They cover roles, cross-space access, invitation and owner-setup races/expiry/replay, token rotation, member removal, conflicts/restores, retention/caps, restart persistence, credential hashing, malformed artifacts, transport restrictions, and standalone startup. Local tests do not establish that an external domain, proxy, certificate, firewall, or another computer is correctly configured.
