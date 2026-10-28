# Muse typography

Muse uses **Inter Variable** for interface and default conversation text, and
**JetBrains Mono Variable** for code, diffs, terminal output, and the optional
monospace response setting. This is a Claude desktop-inspired treatment, not a
copy of Anthropic's proprietary font assets. Existing text sizes, themes, and
saved response-font preferences continue to work.

The font families are defined in `src/shared/typography.mjs`. Both renderer entry
points load the same `src/ui/typography.css`, with normal and real italic faces
and variable weights. Fontsource packages are pinned to 5.3.0. Vite emits local
WOFF2 assets; fonts require no CDN, account, or network connection. Unicode
subsets load on demand, with platform fallbacks for unsupported scripts. Code
ligatures are disabled to keep operators literal in review views.
Vite keeps even small WOFF2 subsets as files so the renderer's existing
`default-src 'self'` policy never needs to permit data-URL fonts.

Compact embedded Muse views use the same bundled font bytes, isolated under
private family names. Login, billing, unrecognized provider layouts, original
website mode, and user-authored documents/sites retain their own typography.
Read-only preview captures remain images of the desktop capture and cannot
change fonts until recaptured.

Both families use the SIL Open Font License. Copies are distributed in
`public/fonts/` (and the production dependency packages).

Sources: [Inter](https://rsms.me/inter/),
[JetBrains Mono](https://www.jetbrains.com/lp/mono/),
[Fontsource self-hosting](https://fontsource.org/docs/getting-started/install).

Validation on 28 October 2026: 983 unit/integration tests; 92 preview/desktop
parity scenes; 14 typography scenes covering actual rendered custom glyphs,
normal/bold/italic, response preferences and 390–1440px windows; seven native
chat checks in source and packaged builds; eight source collection checks;
186 packaged source/build/font files plus both native helpers verified.
Run `npm run build`, `npm run test:typography`, and
`npm run test:preview-parity` to repeat the renderer checks. The typography
check runs in both validation and release CI.
