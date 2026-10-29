# Native question card polish

The owner requested implementation of useful changelog improvements without another design round. This first slice adopts readable question formatting and reliable keyboard answers from the supplied ChatGPT/Codex and Grok Bot changelogs. Implementation choices below are ours within that authorization.

## Intent

Questions should read like the surrounding chat, including emphasis, lists, inline code and links. Users can choose an offered answer or explicitly choose their own answer, navigate by keyboard, and send with Ctrl/Command+Enter. Composing East Asian text must never submit an unfinished answer. Native permissions and answer identities remain unchanged.

## Approach

Use a small shared safe Markdown renderer for native question content and improve the existing NativeQuestion component. Retain ReactMarkdown's safe URL handling, disable raw HTML and remote images, and route allowed external links through the existing external opener. This extends the shared renderer used by preview and desktop.

Alternatives considered: rendering raw provider HTML adds unnecessary risk; a second question protocol would duplicate the validated native lifecycle. Neither is needed. No new package or native model call is required.

## Contract

- Existing single/multiple choices retain original labels for protocol submission, even when their displayed labels contain Markdown.
- Give every question an accessible group name using its plain source text; links inside choices never choose that answer accidentally.
- Offer an explicit `Write my own answer` control. Selecting it reveals the text field and clears choice selection; typing remains an editable answer until the user sends.
- Ctrl/Command+Enter submits only when not composing. Enter alone inserts a newline in the free-text field. No automatic sending on selecting a choice.
- Lock immediately while an answer/cancellation is being submitted, including before the next controller snapshot. A failed action unlocks; an accepted/uncertain response remains locked according to existing runtime receipts.
- A changed question identity/revision resets local state. Original session/turn/question IDs and revision are sent unchanged. Existing validation and native acknowledgement checks remain authoritative.
- Long content wraps without making the modal wider; reduced-motion users receive no new animation.
- Preview and production-Electron fixtures exercise the same UI. Fixtures prove UI/IPC behavior, not a new native model interaction.

## Scope and limitations

No new elicitation schema, provider permission, network fetch, speculative model request or credential handling. Native question protocol bounds remain three questions, two-to-three offered choices, and the existing answer length limits. Existing unavailable/unknown states remain explicit.
