# Motion refinement

The user asked for a further deep review and implementation of smoother movement throughout MuseBench. This follow-up builds on the existing app-motion pass rather than increasing animation everywhere.

## Findings and approach

- Code request activity, file diffs, and expanded file lists still change height immediately. Use the existing reversible `MotionDisclosure`, retaining lazy construction and releasing large hidden content after closing.
- Native HTML details throughout activity, project commands, connection capabilities, receipts, Customize, and analytics still snap. Progressively enhance their native content box with intrinsic-height CSS transitions; exclude the positioned editor menu. Preserve native summary/keyboard semantics.
- Chat/Work currently changes its selected background instantly. Add a small moving selection pill without moving the control or its native browser host. Reverse from the current visual position when clicked rapidly.
- Sub-Agent list/detail/tab changes currently swap abruptly. Use the existing identity-based surface fade, without replaying on live activity updates.
- Saved Work recents and the Sites/Spaces sidebar lists still use immediate `hidden` changes. Extend the existing disclosure primitive to these lists and the saved-work search field.

Alternatives considered: a global animation library/presence manager adds unnecessary lifecycle and focus risk; longer fades would hide rather than fix abrupt layout changes. The selected implementation extends the existing lightweight CSS/Web Animations primitives.

## Constraints

Use the shared preview/desktop renderer and existing dependencies. Keep navigation immediate, native browser bounds fixed, draft and scroll state intact, and the existing launch cadence. Respect both app and OS reduced motion, including changes during an animation. No animation on streamed tokens. Closed heavy content must remain lazy. Avoid permanent `will-change`, whole-app height animation, and repeated geometry reads per frame.

Closing menus/dialogs and changing the native sidebar width remain immediate: focus restoration and embedded-view coordinates must not wait for an exit animation. External Meta pages are outside this renderer's styling control.

## Acceptance

Measure intermediate layout frames in browser and production Electron; test rapid reversals, keyboard focus, reduced motion, lazy DOM release, selection pill alignment, and stable native host geometry. Re-run existing app motion, startup, long-chat responsiveness, preview parity, and relevant UI checks. Record current screenshots and limits in the validation report. Commit/push the completed feature and deliver the matching desktop build under the user's standing release authorization.
