# Personal Muse in MuseBench

MuseBench keeps its local coding workspace and adds a product switcher for the personal Muse experience. The existing code review, preview, checks, saved chats, native sandbox, and CLI credentials remain separate from the website.

## Service mapping

- **Muse Code**: the existing local Muse CLI workspace.
- **Muse AI bot**: Meta's personal agent at https://muse.ai/.
- **Meta AI → Chat**: regular Meta AI chat at https://www.meta.ai/.
- **Meta AI → Ideas / Goals**: the signed-in Muse personal agent's https://muse.ai/ideas and https://muse.ai/goals pages. Both routes were verified by navigating the official account UI.
- **Meta AI → Muse AI bot**: the personal agent's main conversation, alongside regular Meta AI Chat and the native collection groups.

The bot and regular Meta AI Chat share the existing persistent Muse browser partition. Main conversation, opened side chats, Ideas, Goals and regular chat retain separate page contents, so switching sections preserves their drafts and scroll positions for the current app session. Sign in through the official website inside MuseBench. A sign-in in an external browser or the Codex research tab does not sign in MuseBench. MuseBench never imports CLI credentials or browser cookies.

## Native sidebar

Muse chats, Ideas, and Goals appear as native React lists with item titles, counts, collapsible groups, Show more, local search, refresh, and selection. Ctrl+K focuses this search, including when the remote composer has focus. Ctrl+N opens a new unsent Muse draft. Returning to New Muse chat reuses an existing unsent draft. Selecting a saved chat resolves an opaque catalog ID to its validated official link in the main process and retains its document separately; no renderer-provided URL is accepted.

The adapter reads only bounded titles and navigation targets from rendered collection controls. It does not read chat messages, framework state, cookies, tokens, or private API responses. Up to 100 unambiguous items per group stay in main-process memory; only opaque IDs, titles, kinds and status reach the local UI. A bounded refresh runs while the personal workspace is visible. Refresh re-reads the current collection documents, preserving drafts. Authentication transitions invalidate old metadata and in-flight reads; Muse authentication also discards old-account side-chat views. The separate Meta AI Chat login does not invalidate the Muse catalog.

The observed account on 2026-10-25 contained its main conversation, 24 ideas, and no side chats or goals. Live checks therefore cover main conversation, idea preview selection and reopening, empty goals, and an unsent new-chat page. Existing nonempty side chats and goals are covered by isolated realistic fixtures, not claimed as live-account proof. Collection hooks may change or omit unloaded items; empty and unavailable states are distinct. Original website navigation remains accessible through the layout toggle.

## Integrated layout and accounts

Muse opens in a compact layout that replaces its duplicate dock with MuseBench navigation. Search, Feed, Library, and Accounts invoke the official site's corresponding controls. The header's layout toggle restores the original website navigation. The More menu holds browser history, reload, external-browser access, and the current service origin. A failed secondary action shows a dismissible notice without hiding the usable page.

Accounts provides four entry points:

- **Meta AI account** opens regular Meta AI, where Meta offers its supported sign-in choices, including Facebook when available.
- **Muse account** opens Muse's official account settings.
- **Connected apps** opens Muse's Connectors settings.
- **Connect WhatsApp** opens Muse's Messaging channels settings. Select WhatsApp there, then complete the official pairing on your phone. MuseBench does not read or store the pairing code, grant access, or claim the account is connected.

The settings and messaging controls were observed in the signed-in official Muse UI on 2026-10-25. The adapter uses bounded rendered collection metadata, fixed DOM navigation controls and presentation CSS, with no private backend API, message extraction, credential access, or network interception. If controls change or the page is signed out, the original layout remains available. A public consumer Muse API covering all Chat/Ideas/Goals data was not found in the consulted documentation. Navigation is native; composition, previews, and approval actions remain in the official web client.

Settings shortcuts wait for the selected tab marker, re-querying controls replaced during page hydration. A click alone is not treated as successful navigation. Retries are bounded and limited to menu/tab navigation, never pairing or approval actions.

## Implementation

Ideas and Goals share the conversation's finite appearance palette. Recognizable official collection headers, grouped idea rows, goal categories/cards, idea previews, and goal setup dialogs receive scoped CSS. Official DOM updates continue immediately and the existing metadata refresh updates the native sidebar; no local account-data mirror is introduced. Preview/menu/setup actions, disabled controls and status text remain in their original nodes. Appearance changes and original-layout restoration retain the same document and any open preview/setup state. Live checks cover this account's 24 ideas and empty Goals categories/setup; populated goal updates are tested with fictional service HTML.

The integrated Muse conversation uses removable, origin-guarded presentation CSS over the official message and composer elements. Assistant replies use plain prose; user messages, code blocks and the two-row composer match MuseBench. Existing appearance preferences are validated as finite enums and resolved locally before reaching retained views. No message text is extracted into React, no input is replaced, and no send/stop/approval handler is intercepted. The original layout toggle removes the entire presentation stylesheet without navigation, preserving the current document and draft. Authentication origins and the separate Meta AI Chat page keep their original appearance. Site hook changes may require adapter updates; the original layout is always available.

Official service content runs in a sandboxed Electron WebContentsView, with no preload, Node integration, or local workspace bridge. Only MuseBench's trusted local UI can issue validated navigation/layout commands. Switching products keeps both the code workspace and remote browser contents alive. Native views are hidden while local menus and dialogs are open. Authentication URLs, query parameters, and credentials are not published in application state.

Muse's fresh-session sign-in can redirect through Meta's Facebook, Instagram, and Meta account authentication hosts. Only observed exact HTTPS hosts are admitted. Official authentication popups use an owned, sandboxed window and the initiating service's existing session. The observed Meta AI redirect through `https://auth.meta.ai` is also allowed as an exact authentication host. The popup title identifies the verified origin; authentication URLs and query parameters stay out of local application state. Unknown destinations, nested popups, native URL schemes, device permissions, and downloads remain restricted. Blocked secondary actions show a notice; they do not replace the parent page with an error. Voice/camera/location permissions are not enabled in the embedded view.

The normal website determines account access, billing, regional availability, and supported features. This integration is a website client, not a reimplementation of Meta's hosted agent or a promise of a public personal-agent API.

## Research, 2026-10-25

- [Muse official product page](https://ai.meta.com/muse/): personal agent, chat, cloud computer, proactive goals.
- [How Meta designed Muse](https://introducing.muse.ai/): main conversation, side chats, Goals, Ideas, and agent activity.
- [Muse security architecture](https://research.meta.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse): web/mobile clients and a user's hosted VM.
- [Meta Model API overview](https://dev.meta.ai/docs/overview): public inference APIs and Muse Code. No documented API for consumer Muse account chats, Ideas, or Goals was found among the consulted documentation.
- [Facebook manual login](https://developers.facebook.com/docs/facebook-login/manually-build-a-login-flow/): app-scoped Facebook authentication is not a grant to hosted Muse chat/Goals data. MuseBench uses Meta's existing first-party sign-in flow instead of adding misleading generic OAuth.
- [WhatsApp and Muse connection help](https://faq.whatsapp.com/1516007700293140/): pairing is completed on the primary phone. The signed-in Muse UI exposes Settings → Messaging channels → WhatsApp.
- [Muse Gadgets SDK](https://gadgets.muse.ai/) and [token terms](https://gadgets.muse.ai/sdk-terms): device SDKs provide a limited personal-agent connection, not a supported general desktop developer platform. No device command service is installed or used to bypass the Muse CLI sandbox.
- [Electron WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view) and [security guidance](https://www.electronjs.org/docs/latest/tutorial/security): native browser view and remote-content isolation.

Both service entry pages and the signed-in Ideas/Goals and messaging settings were verified in the browser. The user confirmed sign-in inside MuseBench. Automated fixture checks and real account checks are recorded separately in VALIDATION.md; an offline fixture does not prove a live OAuth grant or WhatsApp pairing.

## Prompt timeline and shared sign-in

The left-edge timeline previews rendered user prompts and their following assistant text. Hover/focus does not scroll; click or Enter jumps to the prompt. Arrow keys, Home/End and PageUp/PageDown navigate the rail; Escape closes a preview. New/streaming messages update it, and short/empty chats hide it. The same DOM-only control runs in Code, Muse and Meta AI chat. The service page keeps snippets in its own renderer memory; nothing is persisted, exported to the main renderer, sent to a model or read from account APIs. Restoring the original website layout removes the control. Virtualized or unloaded history is only indexed when the official page renders it.

Meta AI’s public frontend on 26 October uses `data-message-item`, `data-message-role`, and `data-testid="composer-input"`; these explicit hooks guard its adapter. The Muse adapter uses its previously verified chat log and message roles. Unknown layouts and authentication documents are untouched.

The shared web partition reuses `persist:musebench-personal-muse`; it does not read/copy cookies or import another browser’s profile. The earlier separate Chat partition remains on disk and is not deleted or migrated. Entering or returning from a shared account authentication flow invalidates cached account metadata and refreshes retained account pages before reuse. CLI authentication remains independent. The user completed the corrected Meta flow, and packaged restart verification confirms both services remain signed in. System appearance now follows MuseBench through Electron’s native theme preference; an explicit theme selected inside Meta remains Meta’s choice.
