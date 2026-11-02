# App-owned public webpage reading

## Scope

`public-web-mcp.mjs` provides one read-only `read_web_page({url})` tool over JSONL MCP stdio. `public-web-reader.mjs` performs owned Node HTTP/S GET requests. This path does not depend on native Muse `web_fetch`, a shell command, a browser session, or any provider request.

The reader accepts HTTP/S URLs on default ports, refuses URL userinfo and ambiguous/control-character input, checks every DNS answer against public address policy, and pins a reviewed address into the actual socket lookup. Each redirect is revalidated and resolved again; HTTPS downgrade, private destinations, mixed public/private answers, IPv4-mapped IPv6 spellings, documentation/reserved networks and deprecated 6to4 relay addresses are refused. TLS authenticates the original hostname with normal verification.

No caller headers, cookies, authentication, proxy agents, writes, scripts, forms, embedded resources or mutable account configuration are supported. Response cookies are discarded. This is a public source reader; JavaScript-only pages, PDFs, sign-in pages and protected content are outside its scope.

## Bounds and provenance

- 15-second total deadline, including DNS, redirects and body processing.
- Three redirects, 16 KiB response headers, 1 MiB compressed wire and 2 MiB decoded body per response.
- Only HTML/XHTML/plain text; identity/gzip/deflate/Brotli content encoding.
- At most 24,000 UTF-16 code units of extracted text, with an explicit truncation flag.
- Requested URL, final source URL, title, HTTP status/content type, UTC fetched timestamp and an untrusted-data notice accompany page text.
- MCP frames, pending requests and encoded output have independent bounds. Cancellation aborts active network work ahead of queued jobs. Transport errors return fixed codes without echoing remote bodies or exception messages.

HTML extraction is a bounded lightweight text extractor, not a rendered browser or full article parser. It removes scripts, styles, templates, iframes, SVG, comments and head metadata; it decodes common/numeric entities and preserves block breaks. Source content remains untrusted.

## Integration

Import `createPublicWebMcpConfig` from `src/runtime/public-web-mcp.mjs` and pass the existing curated child environment to `createPublicWebMcpConfig({nodePath,serverPath,env})`. Both paths must be absolute. The result is `{command:nodePath,args:[serverPath],env:{...env,ELECTRON_RUN_AS_NODE:'1'}}`, suitable for an app-owned ephemeral native MCP stdio entry. No profile persistence is required. The server accepts no CLI arguments and registers exactly `read_web_page`.

The package/bundle must trace `public-web-mcp.mjs` → `public-web-reader.mjs` → `discovery-remote-network.mjs` → `discovery-errors.mjs`; the last two supply the existing public address classifier/error imports. If the build bundles the module, use its bundled absolute server path in the ephemeral config.

## Verification

`node --test test/public-web-reader.test.mjs test/public-web-mcp.test.mjs` passes all 12 targeted tests. Coverage includes public-only DNS resolution, numeric/IPv4-mapped/private/documentation addresses, pinned socket lookup, mixed DNS results, rebinding between redirects, redirect limits and TLS downgrade, forbidden authentication arguments, cookie non-forwarding, compressed/decompressed limits, bounded output, DNS deadline, cancellation, safe errors, invalid frames and a spawned real Node MCP stdio roundtrip.

A direct public read of `https://example.com/` succeeded at `2026-11-02T02:12:41.361Z`, returning title `Example Domain`, extracted public text and the untrusted-data notice.

A separate real child-process MCP initialize → tools/list → tools/call roundtrip read `https://example.com/` at `2026-11-02T02:13:25.075Z`, returning title `Example Domain` and 156 text characters. The process exited with code 0 and empty stderr. This proves the app-owned server's live public read path. It does not by itself prove native Muse registration, packaged launch or a final release; those are verified by the integration/release workflow.

## Integrated native acceptance

At 2026-11-02T02:37:24Z, the real Muse 1.4.14 exec host registered the required reader, requested the public Example Domain URL, returned its source/title/text/timestamp to the offline provider fixture, and emitted a completed native run with exit 0. The production conversation fold accepted the captured MCP startup pattern with its narrow opt-in; provider/model identity and final output were verified. Shell and writes were explicitly disabled, OS sandbox remained enabled, and no real provider request occurred. CLI settings require snake-case framing, mode:required, and ELECTRON_RUN_AS_NODE as a whole-value environment reference.

At 2026-11-02T02:37:31Z, an isolated real native MSP host accepted session/start with the required reader and returned it from mcpServer/list. This fixture explicitly used Full access solely to qualify the currently available interactive path; it does not establish Windows MSP sandbox support. The correct MSP framing is lineDelimitedJson. No turn/model request was sent, and host cleanup was confirmed. The installed app/profile was untouched.
