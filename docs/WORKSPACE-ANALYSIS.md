# Workspace analysis tools

Open a Code chat's connection dialog, expand workspace tools and enable **Semantic code navigation**. **Navigation** keeps the existing definition, references, hover and implementations tools. Choose **Analysis + batches** before connecting to add workspace symbol search, file outlines and syntax diagnostics. Search **Explore workspace operations** for a short description of each operation.

The choice belongs to the saved native session and is retained after reconnecting. Existing sessions stay on Navigation. Disconnect before changing tools. Enabling these tools does not change the selected native permission profile.

Analysis uses a bounded snapshot of JavaScript and TypeScript source in the selected project. It does not load project compiler configuration, dependency folders, standard libraries or compiler plugins. Syntax diagnostics identify parsing problems; they are not a project typecheck or build result.

The model can search the fixed operation catalog, call one operation, or request up to eight reads in a batch. All reads in a batch share one source snapshot and analysis service. Ordinary tool activity shows each call's result or failure. Native Stop cancels the request as a whole; there is no separate per-call Stop button.

Discovery displays operation descriptions and schemas as text. It does not register arbitrary third-party tools dynamically. The tools cannot run commands, write files, access the network or change their project root. Existing source, output, worker and time limits still apply.

Local tests exercise the real analysis engine and the native session registration. A new bounded model-test authorization is needed to verify a model selecting and using this tool set. Third-party deferred tool discovery remains a separate roadmap item.
