# Extension review across desktop platforms

29 October 2026. Native host and SDK: 1.4.14.

The Windows selector previously checked extension configuration before interactive startup and requests, but macOS/Linux constructed the interactive runtime directly. Those paths did not perform that check. The configuration guard also only read USERPROFILE and ignored custom XDG directories inherited by Muse.

The guard now belongs to both actual runtimes. It selects USERPROFILE on Windows and HOME on macOS/Linux, honors absolute XDG_CONFIG_HOME/XDG_DATA_HOME, and rejects relative overrides. It checks project ancestors, saved native trust, plugin inventories, and bounded user/project settings. User MCP definitions still require exact app-reviewed digests. Malformed settings fail without returning their contents. Full access and project instruction review do not approve additional extensions.

Interactive startup (including resume) checks before spawning `muse serve`; new requests check before sending any turn. Failure invalidates readiness and requires reconnecting. A late result after disconnect cannot mutate a replacement connection. Work and Sites receive the same review service as Code. Native Ask me, sandbox verification, billing-source selection, and reviewed hook launch overrides retain their existing behavior.

## Evidence

- RED: direct interactive startup accepted project MCP; changed settings still sent a turn; XDG configuration was ignored; Linux/macOS required USERPROFILE.
- GREEN: 175 focused configuration, runtime, exec, selector, Customize, and integration tests.
- Complete local suite: 1,218 passed, none failed or skipped. Production build passed (existing large-bundle advisory remains).
- Real Windows Muse local-echo probe passed through the new guard: Ask me verified, reviewed UserPromptSubmit/Stop hooks executed, user and managed hook fixtures excluded, zero model requests, shutdown and temporary-profile cleanup confirmed.
- Existing Customize browser, desktop, and preview-parity checks are retained in the release workflow.

Platform table tests exercise Windows/macOS/Linux path selection using isolated on-disk fixtures. They do not establish native Muse execution on Linux/macOS. The local echo proof does not establish paid Meta inference or arbitrary plugin execution.

Customize retains its existing profile-based store. A custom XDG plugin store that the review service does not recognize stays blocked; this change does not copy grants across stores. Enterprise policy qualification and live model-issued MCP acceptance remain separate roadmap items.

## References

- [Official configuration paths and user MCP configuration](https://meta-models.github.io/muse-code-sdk/next/guides/extend/mcp-servers/)
- [Official plugin store and XDG directories](https://meta-models.github.io/muse-code-sdk/next/guides/plugins/reference/cli/)
- [Reviewed hooks validation](VALIDATION-reviewed-hooks.md)
