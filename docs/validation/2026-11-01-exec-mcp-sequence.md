# Exec MCP startup projection omissions

Installed native Muse 1.4.14 with the app-owned public web MCP server emitted a valid completed tool run whose projected exec JSONL started at sequence 2 and skipped sequence 8. The default conversation fold correctly rejected those gaps; treating all gaps as acceptable would discard a meaningful evidence check.

The local capture `artifacts/native-web-public-raw.jsonl` and retained export `artifacts/native-web-retained.json` identify the bounded startup pattern. The retained export contains an `mcp.startup` task with UUIDv5 identity and a `runtime.mcp_tool_identity_catalog` event for the exact app-owned web tool. The exec projection emits a synthetic UUIDv5 task-link for that startup task but omits startup/catalog slots from the exposed records. The following model, tool, output and terminal records remain contiguous. Retained export sequence numbers and exec projection sequence numbers are separate domains.

`createExecConversationFold({allowMcpStartupOmissions:true})` now supports only that prefix:

1. An initial native accepted-command reconciliation at sequence 2 may omit one startup slot. It must be a durable `turn.submit` acceptance with null client ID, a UUIDv7 command ID, and matching causation.
2. The root prefix must be accepted command, durable session/run link, durable Meta model configuration, optional native input status, durable run start, and a durable UUIDv5 startup task-link. Prefix controls and task links retain the accepted command/run causation.
3. Exactly one missing catalog slot may separate that synthetic task-link from a UUIDv7 model task-link. Both links must be durable session events with matching command, run and task-stream identity.
4. That link must immediately lead to the same task's durable `task.lifecycle.proposed` event with `task_kind:model.meta.response`. Any different task, producer, lifecycle, output, or intervening event poisons the fold.

The option defaults false and validates its boolean type. It does not enable general initial offsets, later task/tool gaps, background-continuation gaps, usage gaps, absent command/model identity, approval resolution, or missing terminal/exit evidence. Existing explicit retained-session offset handling remains separate. All records continue through the unchanged single-run authority validator after global validation and sequence rebasing. The omitted slots create no shell/tool results or completion authority.

The captured 36-record projection is committed as `test/fixtures/native-mcp-startup.jsonl`, so its regression runs in CI without depending on ignored local artifacts. Its successful web result contains public Example Domain content from the local integration fixture. Tests verify the exact Meta model, accepted root command/run, only one owned run, no invented shell results, genuine tool-result payload, and final native terminal plus exit 0.

Negative mutations cover larger initial offsets, non-native acceptances, malformed/foreign/ephemeral task links, incorrect UUID versions, changed startup control durability/causation, larger gaps, wrong first model proposals, missing lifecycle records, later model/tool/output/terminal gaps, usage gaps, foreign terminal commands, and contradictory exit codes.

Validation: `node --test test/exec-conversation-events.test.mjs test/exec-events.test.mjs` passed **62/62** checks. No native process, paid model request, installed profile mutation, app restart, or publication was needed for this parser correction. Real current runtime launch/cleanup and the final integrated public-web path require their separate parent-run acceptance evidence; fixture replay alone does not establish those outcomes.
