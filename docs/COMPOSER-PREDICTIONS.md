# Composer predictions

Muse Code can offer a faint follow-up in the message box after a completed reply.
Press **Tab** to turn it into an editable draft, then **Enter** to send using your
normal composer setting. Accepting a prediction never sends it. You can type your
own message at any time; only matching prefixes retain a suggested suffix.
**Escape** dismisses the suggestion for that reply. **Shift+Tab** still navigates.

Open **Settings → General → Composer**:

- **Show predictions** controls all suggestions and is on by default.
- **Predict with Muse** is off by default. Turning it on authorizes a separate
  background Muse request after a completed reply, using normal Muse allowance.
  It can produce better contextual follow-ups. Without it, suggestions use local
  patterns in the current conversation and are less capable.

Predictions use only bounded text from the current chat. They do not retrieve
other chats, memories, files, screenshots or connected apps. The native prediction
runtime has an empty toolset, disables shell/write/web/desktop/extension tools,
and has a short timeout. It never adds a message or changes the main chat's state.
New work, navigation, cancellation or turning the feature off discards pending
results. There is at most one generation attempt per reply during the app session;
typing does not start more model requests. Failures quietly fall back to local
suggestions.

Suggestions are hidden during active work, pending questions, queued prompts,
dictation, IME composition, slash commands, attachments, text selection or editing
away from the end of the draft. Unaccepted text is never saved as a draft or sent
by pressing Enter. The same composer implementation serves preview and desktop.

This interaction follows the supplied [Composer Predictions reference](https://learn.chatgpt.com/docs/features/composer-predictions).
MuseBench does not use Codex's proprietary prediction service or its free
prediction allowance. The native Muse path was checked with the unpaid echo
provider; ordinary model prediction calls require the user's opt-in.
