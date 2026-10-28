# Muse AI launch

A fresh desktop process shows a centered blue terminal mark and types “Muse AI”,
then scales and moves the wordmark into the visible sidebar title. The terminal
crossfades to the existing chat icon at arrival. The complete sequence takes
about 1.6 seconds; the renderer has a 1.9-second fallback. Escape, a click, resize,
or hiding the window skips it. OS and MuseBench reduced-motion preferences skip
the movement entirely. A collapsed or narrow sidebar gets a short fade instead.

The normal app mounts immediately beneath the animation. Its saved state and
bundled fonts load in parallel, and the main process starts the default Meta chat
before the renderer opens. Native WebContentsViews have a separate visibility
hold so they cannot paint above the animation; page loading and layout continue.
The hold ends on completion, renderer reload/crash, or a four-second fallback.
Remote services can still take longer than the animation to respond.

An in-memory main-process ticket permits the animation once per full launch.
Renderer reloads and bringing the existing window forward do not replay it.
The preload's synchronous claim reads only that trusted, in-memory boolean.
There is no filesystem or network work in the synchronous handler.

Optional FFmpeg discovery runs in the background instead of delaying the first
window. Its result updates Work capabilities; MP4 export waits for discovery.

The preview uses the same component. Open `preview.html?launch=1` to replay it;
ordinary preview pages remain immediate. Run `npm run test:startup-animation`
after `npm run build` for browser motion and isolated desktop lifecycle checks.
Set `MUSEBENCH_EXECUTABLE` to a packaged executable to repeat desktop checks.
