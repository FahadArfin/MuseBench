# MuseBench blue accent pass — 2026-10-26

User request: review the existing app and use blue accents, especially Muse Code and Meta AI lettering, to give MuseBench a clearer visual identity. This is a presentation update within the existing layouts.

The chosen approach is a restrained blue system: blue wordmarks and links, saturated primary buttons, tinted active controls and a visible blue focus ring. A wordmark-only change would leave the rest of the app anonymous; large blue backgrounds or blue conversation text would distract from long coding sessions. Preserve neutral surfaces/body text, semantic success/error/diff colors and user-created content. This is MuseBench branding, not a claim of official Meta endorsement.

## Audit evidence captured this turn

1. Code workspace: `artifacts/redesign-ui/source-VKpOJ1/screenshots/09-workspace-1440.png`. Layout/readability healthy; name, selected chat, primary action and rail selection all look neutral.
2. Work: `artifacts/work-ui/source-TJYJQE/01-work-home.png`. Clear categories; selected Chat/Work state and template controls lack a distinct accent.
3. Sites: `artifacts/sites-ui/source-X4lKws/02-studio.png`. Studio and preview boundaries clear; product name, selected sidebar and Publish are neutral. The generated site palette is user content and should not be recolored.
4. Settings: `artifacts/settings-ui/source-EB9xit/02-general-light.png`. Readable groups; selected category, theme choice and enabled switch can share the same blue family.
5. Personal Muse chat: `artifacts/native-chat/source-6YI0NP/screenshots/01-fixture-dark-rich-chat.png`. Original message/composer nodes remain intact; send button and links can use the shared accent. Fixture is offline, not a signed-in account inspection.
6. Ideas/Goals: `artifacts/native-collections/source-koxB0b/6-goal-setup-dark.png`. Native styling is consistent; primary goal action currently white. Apply the same action blue through scoped presentation CSS. No service action or login change.

## Scope and execution

- Add one final shell branding stylesheet with shared theme tokens and explicit component selectors; avoid blanket coloring of all buttons, headings or text.
- Blue wordmarks in product selector and switch menu, plus return-to-Code identity.
- Consistent selected rail/sidebar/settings/tab/segmented controls, primary/send actions, links and focus borders across Code, personal shell, Work, Spaces and Sites.
- Mirror finite color tokens in the existing personal presentation palette and scoped chat/collection CSS. Leave provider login pages and the original website appearance option alone.
- Validate measured contrast for text/action/focus states, current native chat/collection fixture behavior, light/dark/narrow screenshots and package byte consistency. No new model calls are needed for this visual change.

Screenshots establish visual hierarchy, not complete accessibility compliance. Keyboard and contrast checks will supplement them. The normal Meta AI website remains provider-controlled; this update styles MuseBench's surrounding shell and the existing supported Muse presentation adapters.
