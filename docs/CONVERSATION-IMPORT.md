# Import conversations

Open **Search MuseBench → Import chats → Choose export**. Select an export, search its conversations, preview their text and check the chats to keep. **Import** saves only the selection. Search checks all parsed titles and messages, including chats outside the visible list. Scrolling reveals more rows; keyboard users can use **Show next conversations**.

Imported chats appear in the library with an **Imported** label. They are local, read-only history. **Import details** shows the source filename, original-file SHA-256, import date and omitted-item count. **Add excerpt to [chat]** appends the displayed text to the named Muse Code draft, preserving its current text, files, images and mode. Nothing is sent automatically. Open a Code project or chat first to choose that destination. **Remove imported copy** deletes only the local imported history, after confirmation.

## Supported exports

- ChatGPT JSON conversation mappings, using the explicitly selected branch. If no selected branch is present, only an unambiguous single leaf is accepted. Alternate branches, system/tool messages, tool-directed or explicitly hidden/non-final assistant messages and non-text blocks are omitted.
- Claude JSON conversations with `chat_messages`, using human/assistant text. Thinking, tool blocks and attachments are omitted.
- ZIP exports containing `conversations.json` or numbered `conversations-001.json` / `conversations_001.json` entries, including nested folders. Each selected entry's CRC-32 is checked before parsing. Only those JSON entries are read; nothing is extracted. Empty shards are skipped. Account files and other archive entries are not imported.
- Markdown and UTF-8 text files, kept as a single document message. MuseBench does not guess speakers or invent missing dates.
- The versioned MuseBench JSON form below. This is an import interchange format; it does not imply a provider session or a new export command.

```json
{
  "format": "musebench-conversations",
  "version": 1,
  "conversations": [{
    "title": "Research notes",
    "messages": [
      {"role": "user", "text": "What should we compare?", "at": "2026-10-29T12:00:00Z"},
      {"role": "assistant", "text": "Compare the timeline and source evidence."}
    ]
  }]
}
```

The source file is never modified. Exact normalized conversation duplicates are remembered across restarts. A changed title, source identity or message sequence is a different record. Unknown JSON formats and ambiguous branches fail with an explanation rather than guessing. Official export formats may change; these adapters support the validated shapes described above, not every historical or future export.

## Size and privacy

File selection is owned by the desktop picker. Parsing runs in a bounded worker. Each preview expires after ten minutes and is tied to the original file's digest; a changed source must be previewed again. A failed confirmation leaves no partial records.

Limits: 128 MiB source file, 32 MiB decoded JSON/text, 2,000 conversations, 50,000 source messages, 1 MiB per message and 16 MiB saved text. Each confirmation accepts at most 100 chats, 2,000 messages, 2 MiB text and 20,000 indexed word entries (unique words counted separately per message). These additional work bounds prevent many short messages or dense distinct text from stalling the app. Select additional batches from the same preview; a single chat above a confirmation limit needs a smaller export. Preview excerpts display up to 12,000 characters at a time, with previous/next controls and a return to the conversation; accepted saved text is not shortened.

Account metadata, settings, project instructions, tool grants and executable archive entries are excluded. Ordinary message text is preserved verbatim and may itself contain personal information. Imported text is displayed as text; it does not execute tools or resume a provider session. The browser preview uses explicitly labeled fictional samples and clears them on reload; durable imports are a desktop feature.
