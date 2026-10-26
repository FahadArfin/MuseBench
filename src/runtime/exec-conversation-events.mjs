import { createExecEventFold } from './exec-events.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const label = value => typeof value === 'string' && value.length > 0 && value.length <= 1024;
const fields = ['schema_version', 'id', 'stream', 'sequence', 'recorded_at', 'record_type',
  'durability', 'causation_id', 'payload_type', 'payload_schema_version', 'payload'];
const live = status => ['queued', 'working', 'waiting'].includes(status);
const BACKGROUND_CLIENT = 'muse-runtime-background-terminal';

/**
 * A bounded conversation around the unchanged single-run exec authority.
 * Muse 1.4.13 can finish a foreground run while a launched workflow remains
 * live, then deliver its terminal and submit a background reporting turn.
 * Only that captured parent-session pattern is admitted here. Child streams,
 * parallel turns, and unrelated postterminal events remain unsupported.
 *
 * Global envelope/sequence/id checks happen BEFORE per-run sequence rebasing.
 * A durable workflow result registers its distinct background task identity;
 * a matching task terminal grants exactly one native reporting continuation.
 * No child-agent details are inferred from model prose or workflow metadata.
 * Root commandId/runId stay stable; ownedRunIds names actual shell provenance.
 * finish requires the caller's confirmed process exit, never a turn boundary.
 */
export function createExecConversationFold({
  allowSessionOffset = false, maxText = 200000, maxRecords = 20000, maxShellBytes = 200000, maxShellResults = 64,
  maxHandoffs = 4, maxActivityItems = 120, maxActivityBytes = 200000,
} = {}) {
  const limits = { maxText, maxRecords, maxShellBytes, maxShellResults };
  if ([...Object.values(limits), maxHandoffs, maxActivityItems, maxActivityBytes]
    .some(value => !Number.isSafeInteger(value) || value < 1)
    || maxHandoffs > 4 || maxActivityItems > 120 || maxActivityBytes > 200000) {
    throw Error('Muse exec conversation limits must be positive safe integers within the supported bounds.');
  }
  const runs = [], sequences = new Map(), recordIds = new Set(), commands = new Set(), runIds = new Set();
  const workflows = new Map(), workflowCalls = new Set(), taskIds = new Set(), workflowRunIds = new Set(), workIds = new Set();
  let sessionId = null, recordCount = 0, handoffs = 0, failure = null, finished = null;
  const fail = message => { failure ??= Error(`Muse exec conversation error: ${message}`); throw failure; };
  const active = () => runs.at(-1);
  const unresolved = () => [...workflows.values()].filter(workflow => !workflow.consumed);
  const newRun = () => {
    const fold = createExecEventFold(limits);
    const run = { fold, state: fold.snapshot(), sequences: new Map(), started: false };
    runs.push(run); return run;
  };

  function aggregate() {
    const root = runs[0]?.state;
    const latest = active()?.state;
    const text = runs.map(run => run.state.text).filter(Boolean).join('\n\n');
    if (text.length > maxText) fail('Combined conversation output exceeds the text limit.');
    const shellResults = runs.flatMap(run => run.state.shellResults);
    if (shellResults.length > maxShellResults) fail('Combined shell result count exceeds the limit.');
    if (shellResults.reduce((sum, item) => sum + Buffer.byteLength(JSON.stringify(item)), 0) > maxShellBytes) {
      fail('Combined shell results exceed the byte limit.');
    }
    if (new Set(shellResults.map(item => item.callId)).size !== shellResults.length) fail('Duplicate shell call result across runs.');
    const items = []; let bytes = 0, truncated = false;
    const append = source => {
      const item = { ...source };
      // A workflow invocation result includes private control handles and
      // generated-script paths. Its separate observed-work row is the UI fact.
      if (item.tool === 'tool.workflow') item.output = '';
      const size = Buffer.byteLength(JSON.stringify(item));
      if (items.length >= maxActivityItems || bytes + size > maxActivityBytes) { truncated = true; return; }
      bytes += size; items.push(item);
    };
    for (const run of runs) {
      truncated ||= run.state.activity?.truncated === true;
      for (const item of run.state.activity?.items ?? []) {
        append(run.state.terminal && live(item.status)
          ? { ...item, status: 'interrupted', detail: 'No final task status reported' } : item);
      }
      for (const workflow of workflows.values()) {
        if (workflow.ownerRunId !== run.state.runId) continue;
        append({ id: workflow.taskId, kind: 'tool', tool: 'workflow', title: workflow.title,
          status: workflow.status, detail: workflow.detail, output: '' });
      }
    }
    return {
      sessionId, commandId: root?.commandId ?? null, runId: root?.runId ?? null,
      ownedRunIds: runs.map(run => run.state.runId).filter(Boolean), text,
      terminal: unresolved().length ? null : latest?.terminal ?? null,
      reason: latest?.reason ?? null, modelId: latest?.modelId ?? root?.modelId ?? null,
      providerId: latest?.providerId ?? root?.providerId ?? null,
      approvalRequested: runs.some(run => run.state.approvalRequested), recordCount,
      shellResults: shellResults.map(item => ({ ...item })), activity: { items, truncated },
    };
  }
  const snapshot = () => structuredClone(finished ?? aggregate());

  function validateEnvelope(record) {
    if (recordCount >= maxRecords) fail('Record count exceeds the global record limit.');
    if (!object(record) || record.schema_version !== 1 || record.payload_schema_version !== 1
      || fields.some(key => !Object.hasOwn(record, key))) fail('Unsupported or malformed raw record schema.');
    if (!label(record.id) || !label(record.record_type) || !['durable', 'ephemeral'].includes(record.durability)
      || !Number.isSafeInteger(record.recorded_at) || record.recorded_at < 0
      || (record.causation_id !== null && !label(record.causation_id))
      || !object(record.stream) || !label(record.stream.id) || !label(record.stream.kind)
      || !label(record.payload_type) || !object(record.payload) || !label(record.payload.kind)) {
      fail('Malformed required raw event envelope metadata.');
    }
    if (!['session', 'exec.usage'].includes(record.stream.kind)) fail('Unsupported event stream kind.');
    if (sessionId && record.stream.id !== sessionId) fail('Event belongs to another session.');
    if (!sessionId && (record.stream.kind !== 'session' || record.payload_type !== 'runtime.command.accepted')) {
      fail('The first event must identify the accepted command in its session.');
    }
    if (record.stream.kind === 'exec.usage' && record.payload_type !== 'run.usage') fail('Unexpected event in the usage stream.');
    if (!Number.isSafeInteger(record.sequence) || record.sequence < 1 || recordIds.has(record.id)) fail('Duplicate record id or invalid sequence.');
    const key = `${record.stream.kind}:${record.stream.id}`;
    if (record.sequence !== (sequences.get(key) ?? (allowSessionOffset && record.stream.kind === 'session' ? record.sequence - 1 : 0)) + 1) fail('Non-contiguous global stream sequence.');
    return key;
  }

  function requireDurable(record, description) {
    if (record.record_type !== 'event' || record.durability !== 'durable') fail(`${description} must be a durable event.`);
  }

  function registerWorkflow(record, run) {
    const p = record.payload;
    if (record.payload_type !== 'tool.result' || p.correlation_facts?.tool_name !== 'workflow') return;
    requireDurable(record, 'Workflow result');
    if (p.kind !== 'tool_result' || !label(p.call_id) || !object(p.correlation_facts)
      || !['success', 'failure'].includes(p.correlation_facts.outcome) || typeof p.text !== 'string'
      || p.command_id !== run.state.commandId || p.run_stream?.kind !== 'run' || p.run_stream.id !== run.state.runId
      || !run.started || run.state.terminal) fail('Malformed or uncorrelated workflow result.');
    if (workflowCalls.has(p.call_id)) fail('Duplicate workflow call result.');
    if (Buffer.byteLength(p.text) > 65536) fail('Workflow result exceeds its byte limit.');
    workflowCalls.add(p.call_id);
    if (p.correlation_facts.outcome === 'failure') return;
    let value; try { value = JSON.parse(p.text); } catch { fail('Malformed workflow launch JSON.'); }
    if (!object(value) || value.status !== 'launched' || value.hostApiVersion !== 'v1'
      || !label(value.taskId) || !label(value.entryId) || !label(value.workflowRunId) || !label(value.workId)
      || !label(value.scriptPath) || !/^sha256:[a-f0-9]{64}$/.test(value.scriptHash ?? '')
      || !Number.isSafeInteger(value.scriptBytes) || value.scriptBytes < 1
      || !Number.isSafeInteger(value.maxParallelAgents) || value.maxParallelAgents < 1
      || !object(value.policy) || !label(value.policy.id) || !label(value.policy.caps)
      || value.policy.childLimit !== value.maxParallelAgents) fail('Unsupported or malformed workflow launch fields.');
    if (workflows.has(value.taskId) || taskIds.has(value.taskId) || workflowRunIds.has(value.workflowRunId) || workIds.has(value.workId)) {
      fail('Duplicate workflow task or control identity.');
    }
    if (workflows.size >= maxHandoffs) fail('Workflow handoff limit exceeded.');
    if (unresolved().length) fail('Only one outstanding workflow continuation is supported.');
    workflowRunIds.add(value.workflowRunId); workIds.add(value.workId);
    workflows.set(value.taskId, { taskId: value.taskId, ownerCommandId: p.command_id, ownerRunId: p.run_stream.id,
      status: 'working', detail: 'Running workflow', consumed: false,
      title: `Workflow: ${value.entryId.replace(/[_-]+/g, ' ')}`.slice(0, 160) });
  }

  function settleWorkflow(record) {
    const p = record.payload, workflow = workflows.get(p.task_id), run = active();
    requireDurable(record, 'Workflow terminal');
    if (!workflow || workflow.consumed || workflow.status !== 'working'
      || run?.state.terminal !== 'completed' || p.kind !== 'task_lifecycle'
      || !['task.lifecycle.completed', 'task.lifecycle.failed'].includes(record.payload_type)
      || !object(p.event) || record.payload_type !== `task.lifecycle.${p.event.kind}`
      || p.task_stream?.kind !== 'task' || p.task_stream.id !== workflow.taskId || p.event.task_id !== workflow.taskId
      || p.command_id !== workflow.ownerCommandId || p.run_stream?.kind !== 'run' || p.run_stream.id !== workflow.ownerRunId
      || record.causation_id !== workflow.ownerCommandId || run.state.commandId !== workflow.ownerCommandId
      || run.state.runId !== workflow.ownerRunId) fail('Unrelated, duplicate, or malformed workflow terminal.');
    if (p.event.kind === 'failed' && (typeof p.event.reason !== 'string' || p.event.reason.length > maxText)) {
      fail('Malformed workflow failure reason.');
    }
    workflow.status = p.event.kind;
    workflow.detail = p.event.kind === 'completed' ? 'Workflow completed' : p.event.reason.slice(0, 1500) || 'Workflow failed';
  }

  function acceptChecked(record) {
    const streamKey = validateEnvelope(record);
    const p = record.payload, type = record.payload_type;
    let run = active();
    if (!run) run = newRun();
    else if (type === 'runtime.command.accepted') {
      const authorized = unresolved().filter(workflow => ['completed', 'failed'].includes(workflow.status));
      if (runs.some(item => item.state.approvalRequested)) fail('A background continuation cannot resolve an approval hold.');
      if (run.state.terminal !== 'completed' || authorized.length !== 1
        || p.client_id !== BACKGROUND_CLIENT || p.command_kind !== 'turn.submit' || p.kind !== 'command_accepted'
        || !label(p.command_id) || commands.has(p.command_id) || record.causation_id !== p.command_id
        || record.record_type !== 'reconciliation' || record.durability !== 'durable' || record.stream.kind !== 'session') {
        fail('Uncorrelated or premature native background continuation command.');
      }
      if (++handoffs > maxHandoffs) fail('Workflow handoff limit exceeded.');
      authorized[0].consumed = true; run = newRun();
    }
    if (run.state.terminal && type !== 'run.usage') {
      settleWorkflow(record);
    } else {
      // Preserve all original command/run/terminal checks. Sequence rebasing
      // only removes other runs and the separately validated workflow receipt.
      const localSequence = (run.sequences.get(streamKey) ?? 0) + 1;
      run.state = run.fold.accept({ ...record, sequence: localSequence });
      run.sequences.set(streamKey, localSequence);
      sessionId ??= run.state.sessionId;
      if (type === 'runtime.command.accepted') commands.add(run.state.commandId);
      if (type === 'session.run.linked') {
        if (runIds.has(run.state.runId)) fail('Duplicate linked run identity.');
        runIds.add(run.state.runId);
      }
      if (type === 'run.lifecycle.started') run.started = true;
      if ((type === 'task.stream.linked' || type.startsWith('task.lifecycle.')) && label(p.task_id)) taskIds.add(p.task_id);
      registerWorkflow(record, run);
    }
    recordIds.add(record.id); sequences.set(streamKey, record.sequence); recordCount++;
    return snapshot();
  }
  function accept(record) {
    if (failure) throw failure;
    if (finished) fail('The conversation fold is already finished.');
    try { return acceptChecked(record); }
    catch (error) { failure ??= error; throw failure; }
  }
  function finish(exitCode) {
    if (failure) throw failure;
    if (finished) {
      if (exitCode !== finished.exitCode) fail('Contradictory process exit codes.');
      return snapshot();
    }
    try {
      if (unresolved().length) fail('Missing workflow terminal or expected reporting continuation.');
      if (!active()) fail('Missing accepted command and authoritative run terminal.');
      if (exitCode === 0 && runs.length > 1 && runs.some(run => run.state.providerId !== 'meta' || !label(run.state.modelId))) {
        fail('Every workflow run requires its own verified Meta model identity.');
      }
      if (runs.some(run => run.state.approvalRequested) && exitCode === 0) fail('Completion followed an unresolved approval request.');
      const result = active().fold.finish(exitCode); active().state = active().fold.snapshot();
      // Only now is a process exit confirmed. Earlier completed turns are not
      // individually finished with invented exit codes during handoff.
      if (exitCode === 0) for (const run of runs.slice(0, -1)) { run.fold.finish(exitCode); run.state = run.fold.snapshot(); }
      finished = { ...aggregate(), success: result.success, exitCode };
      return snapshot();
    } catch (error) { failure ??= error; throw failure; }
  }
  return { accept, snapshot, finish };
}
