# Slash command review — 26 October 2026

The final review examined the shared parser/catalog, React picker and command dialogs, app routing, controller state, fixed CLI metadata service and trusted IPC. No credential, cookie or real-profile content was inspected.

Three actionable issues were found and fixed:

1. Active-line parsing alone allowed multiline commands to reach Send. Submission now detects command lines separately, including their multiline arguments, while excluding fenced code examples.
2. Typed arguments could override a highlighted submenu value. Enter now applies the selected submenu value first.
3. A blank New chat retained the controller's previous selected task. Copy/export now require a visible saved chat, and recap only includes history from the visible chat.

Regression coverage includes the parser's multiline/fence cases, actual Electron dialog handling without a model request, selecting Low while the input says `/reasoning high`, and copy/export/recap in a fresh draft. The reviewer independently confirmed these corrections and found no remaining blocker in the correction pass. The fixed-argv metadata calls, bounded controller inputs and trusted-sender boundary had no additional reported regression.

The final package has separate verification evidence in [VALIDATION.md](VALIDATION.md). Review is not a claim that unavailable provider-specific features have been implemented or that every possible skill/plugin can execute safely in the current connection.
