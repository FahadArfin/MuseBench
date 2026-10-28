# App motion refinement

User request: deeply review transitions throughout MuseBench and implement smoother motion.

## Findings and decisions

1. Personal service groups already ease open, but their Chat/Ideas/Goals children and Code project/pinned/recent sections snap. Use one reversible grid disclosure with immediate inert/ARIA state and focus recovery. Keep the real layout responsive to content; never guess a maximum height.
2. Menus, dialogs, review docks and mobile navigation appear abruptly. Add short opacity/translation entrances on those small surfaces, with no animation on destructive operations or network completion. Keep fixed overlays outside transformed ancestors.
3. Settings, Customize, billing tabs and Code/Work/Spaces/Sites navigation change abruptly. Fade the existing content on identity changes without remounting it, resetting drafts, or animating streaming updates. Rapid navigation cancels previous motion. Do not translate or resize native browser hosts; preserve cached provider navigation and exact native bounds.
4. Reduced-motion rules shorten durations but leave delays, and some scripted scrolling ignores the OS preference. Consolidate the policy for both OS and app preferences, including pseudo-elements, scripted animations and scroll behavior. Changing preferences mid-transition must settle immediately.
5. Existing startup typing/flight and deliberate Muse Code typewriter cadence remain. Long transcript rendering, selection, scrolling and retained drafts are performance constraints, not animation targets.

## Motion language

- Hover feedback: 120 ms; small popovers: 140 ms; page fade: 160 ms; dialogs: 200 ms; disclosures: 280 ms.
- Decelerating cubic-bezier(.22, 1, .36, 1), no bounce, no artificial navigation waits.
- Animate only opacity/individual translation for entrances. Layout interpolation is restricted to small sidebar disclosures. No global smooth scrolling, backdrop blur animation, persistent will-change, or per-message animation.
- Preview and Electron import the same motion code and CSS. Provider documents are outside the harness motion scope.

## Acceptance

Real frame measurements must show intermediate disclosure heights and finite entrances, immediate inert/focus behavior, correct final state after rapid reversal, cancellation of scripted fades, instant reduced-motion state, preserved Code drafts, no replay on stream updates, and native geometry parity. Validate light/narrow layouts, startup, navigation cache and long-chat responsiveness. No provider/model calls or real-account mutations are needed.
