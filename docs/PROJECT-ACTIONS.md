# Project actions

In a Muse Code chat, open **Checks → Project actions → Add action**. Give the action a name, command and working folder. Use **Other platforms** for separate Windows, macOS and Linux commands. Saving never starts the command.

Choose **Review** to see the exact command, folder, shell and time limit, then **Run action**. Output appears in the check terminal. Use Cancel or the Activity menu to stop it. Recent action runs retain the result and a bounded output excerpt. Switching chats stops the owned command and preserves its stop receipt.

Commands run locally with your account's permissions. Windows uses Windows PowerShell without profiles; macOS and Linux use `/bin/sh`. They do not grant Muse new permissions or consume model usage. An action without a command for the current operating system cannot run. If definitions change after review, refresh and review them again.

Definitions travel with the project in `.musebench/actions.json`:

```json
{
  "version": 1,
  "actions": [
    {
      "id": "build",
      "name": "Build site",
      "cwd": ".",
      "commands": {
        "win32": "npm run build",
        "darwin": "npm run build",
        "linux": "npm run build"
      },
      "timeoutSeconds": 120
    }
  ]
}
```

Folders are relative to the project and must already exist. Linked folders and paths outside the project are rejected. The file supports up to 50 actions within 64 KiB; commands have a 4,000-character limit and time limits range from 1 to 600 seconds. Loading a repository never executes these definitions. A successful action does not replace the package checks in a validation profile.

Browser preview uses clearly marked samples. It can demonstrate editing and review, but executing an action requires the desktop app.
