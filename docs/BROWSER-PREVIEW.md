# Annotating MuseBench in Codex

Run `npm.cmd run preview:ui`, then open <http://127.0.0.1:4319/preview.html>.
The preview listens only on this computer.

The browser and desktop mount the **same App and styles** through `src/ui/bootstrap.tsx`. Annotations on MuseBench controls are implemented in these shared sources. The Code workspace, projects, sidebar, composer, review, search, settings, profile, Customize, Work, Sites and Spaces are not separate mock implementations. Sample data supplies their content. Native window controls are shown as inert references, with the desktop header space reserved.

## Embedded websites

Meta AI and Muse render their own websites inside the desktop app. The browser now shows actual **read-only desktop snapshots**, with capture time and dimensions, rather than recreated chat, Ideas, Goals or Scheduled pages. Snapshots preserve the capture's proportions; they do not reflow as a live website at another viewport size. Annotations on this area must be checked against the desktop presentation/navigation adapter. They cannot be fixed by editing a sample screen.

Close the normal MuseBench app, then run:

```powershell
npm.cmd run build
npm.cmd run preview:snapshots
```

The capture script opens the official pages in the existing desktop account, saves their visible content locally, and closes its temporary app instance. It navigates bot, Ideas, Goals, Meta Chat, Media, Artifacts, Scheduled, Vibes and Search. It does not send messages, submit schedule changes, grant permissions or read credentials. Reopen the normal desktop app afterward. Click **Reload desktop snapshots** in the browser to load fresh captures.

Private snapshots and sidebar metadata live under `artifacts/preview-snapshots/`, which Git ignores. Never upload this folder. A clean clone shows an explicit missing-snapshot state. Individual account items and schedule actions still require the desktop app.

## Annotation workflow

1. Navigate to the screen and use Codex browser **Annotate**.
2. Apply changes to the shared native components, or the desktop adapter for website content.
3. Run `npm.cmd run test:browser-preview`, `npm.cmd run build`, and `npm.cmd run test:preview-parity`.
4. Package and update the desktop installation, then run the relevant desktop checks. Refresh snapshots after changing website presentation.

Preview edits to fictional projects/work stay in memory and reset on reload. Appearance settings are browser-local. Filesystem access, shell/model execution, authentication, microphone, notifications and publishing are desktop-only. Passing browser checks does not prove those operations.

See [the parity contract](PREVIEW-PARITY.md) for ownership and release checks. Hot reload updates the browser immediately; an installed executable changes only after rebuilding and updating it.
