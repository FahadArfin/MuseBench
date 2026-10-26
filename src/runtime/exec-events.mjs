import {createActivityProjection} from '../shared/activity.mjs';
const controlKinds = new Map([
  ['runtime.command.accepted', 'command_accepted'],
  ['session.run.linked', 'session_run_linked'],
  ['run.lifecycle.started', 'run_started'],
  ['run.model.configured', 'run_model_configured'],
  ['run.output.delta', 'run_output_delta'],
  ['run.usage', 'run_usage'],
]);

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const label = (value) => typeof value === 'string' && value.length > 0 && value.length <= 1024;
const envelopeFields = [
  'schema_version', 'id', 'stream', 'sequence', 'recorded_at', 'record_type',
  'durability', 'causation_id', 'payload_type', 'payload_schema_version', 'payload',
];

/**
 * Fold the JSON objects emitted by pinned Muse 1.4.13 `exec --json`.
 * Framing, total byte limits and process ownership belong to the caller.
 *
 * accept(record) and snapshot() return detached snapshots containing
 * sessionId, commandId, runId, text, terminal, reason, modelId, providerId,
 * approvalRequested, recordCount and shellResults. Shell results retain the
 * native tool's reports; exit 0 is not proof that a project check passed.
 * Only the captured Windows powershell result schema is supported. Unknown
 * tools cannot add shell evidence. Unset identities and terminal are null.
 * finish(exitCode) adds {success, exitCode}; only a completed run AND exit 0
 * succeeds. Failed/cancelled runs with nonzero exit return success:false.
 * Malformed, incomplete or contradictory evidence permanently poisons the
 * fold. A process exit must be confirmed before calling finish.
 */
export function createExecEventFold({ maxText = 200000, maxRecords = 20000, maxShellBytes = 200000, maxShellResults = 64 } = {}) {
  if ([maxText, maxRecords, maxShellBytes, maxShellResults].some((value) => !Number.isSafeInteger(value) || value < 1)) {
    throw new Error('Muse exec fold limits must be positive safe integers.');
  }
  const state = {
    sessionId: null, commandId: null, runId: null, text: '', terminal: null,
    reason: null, modelId: null, providerId: null, approvalRequested: false,
    recordCount: 0, shellResults: [],
  };
  const activity = createActivityProjection();
  const sequences = new Map();
  const recordIds = new Set();
  const shellCallIds = new Set();
  let shellBytes = 0;
  let started = false;
  let failure = null;
  let finished = null;
  const detached = (value) => ({ ...value, activity: activity.snapshot(), shellResults: value.shellResults.map((result) => ({ ...result })) });
  const snapshot = () => detached(state);
  const fail = (message) => {
    failure ??= new Error(`Muse exec event error: ${message}`);
    throw failure;
  };
  const requireText = (value, name) => {
    if (typeof value !== 'string') fail(`${name} must be text.`);
    if (value.length > maxText) fail(`${name} exceeds the text limit.`);
  };
  const requireRun = (payload) => {
    if (!object(payload.run_stream) || payload.run_stream.kind !== 'run' || !label(payload.run_stream.id)) {
      fail('The payload is missing a valid run stream.');
    }
    if (!state.runId || payload.run_stream.id !== state.runId) fail('Run stream does not match the linked run.');
    if (payload.command_id !== state.commandId) fail('Run payload command does not match the accepted command.');
  };

  function accept(record) {
    if (failure) throw failure;
    if (finished) fail('The fold is already finished.');
    if (state.recordCount >= maxRecords) fail('Record count exceeds the record limit.');
    if (!object(record) || record.schema_version !== 1 || record.payload_schema_version !== 1) {
      fail('Unsupported or malformed record schema.');
    }
    if (envelopeFields.some((key) => !Object.hasOwn(record, key))
      || !label(record.record_type) || !['durable', 'ephemeral'].includes(record.durability)
      || !Number.isSafeInteger(record.recorded_at) || record.recorded_at < 0
      || (record.causation_id !== null && !label(record.causation_id))) {
      fail('Malformed required raw event envelope metadata.');
    }
    if (!object(record.stream) || !label(record.stream.id) || !label(record.stream.kind)
      || !label(record.id) || !label(record.payload_type) || !object(record.payload) || !label(record.payload.kind)) {
      fail('Malformed event envelope or payload.');
    }
    if (!Number.isSafeInteger(record.sequence) || record.sequence < 1) fail('Invalid stream sequence.');
    if (recordIds.has(record.id)) fail('Duplicate record id or sequence.');
    const { stream, payload: payload, payload_type: type } = record;
    if (stream.kind !== 'session' && stream.kind !== 'exec.usage') fail('Unsupported event stream kind.');
    if (state.sessionId && stream.id !== state.sessionId) fail('Event belongs to another session.');
    if (!state.sessionId && (stream.kind !== 'session' || type !== 'runtime.command.accepted')) {
      fail('The first event must identify the accepted command in its session.');
    }
    const streamKey = `${stream.kind}:${stream.id}`;
    if (record.sequence !== (sequences.get(streamKey) ?? 0) + 1) fail('Non-contiguous stream sequence.');
    if (stream.kind === 'exec.usage' && type !== 'run.usage') fail('Unexpected event in the usage stream.');
    if (state.terminal && type !== 'run.usage') fail('An event arrived after the run terminal.');
    if (payload.command_id !== undefined && (!label(payload.command_id)
      || (state.commandId && payload.command_id !== state.commandId))) {
      fail('Event command does not match the accepted command.');
    }
    const expectedKind = controlKinds.get(type);
    if (expectedKind && payload.kind !== expectedKind) fail('Control event payload kind does not match its type.');
    if (payload.kind === 'run_terminal' && !type.startsWith('run.terminal.')) fail('Run terminal has an inconsistent event type.');

    if (type === 'runtime.command.accepted') {
      if (state.commandId || !label(payload.command_id) || payload.command_kind !== 'turn.submit') {
        fail('Expected exactly one accepted turn.submit command.');
      }
      state.sessionId = stream.id;
      state.commandId = payload.command_id;
    } else if (type === 'session.run.linked') {
      if (state.runId || payload.command_id !== state.commandId || !object(payload.run_stream)
        || payload.run_stream.kind !== 'run' || !label(payload.run_stream.id)) {
        fail('Invalid or duplicate linked run.');
      }
      state.runId = payload.run_stream.id;
    } else {
      if (payload.run_stream !== undefined) requireRun(payload);
      if (expectedKind || type.startsWith('run.terminal.')) requireRun(payload);
      if (type === 'run.lifecycle.started') {
        if (started) fail('The run started more than once.');
        started = true;
      } else if (type === 'run.model.configured') {
        if (!label(payload.model_id) || !label(payload.provider_id)) fail('Invalid configured model identity.');
        if ((state.modelId && state.modelId !== payload.model_id) || (state.providerId && state.providerId !== payload.provider_id)) {
          fail('Configured model or provider changed within one run.');
        }
        state.modelId = payload.model_id;
        state.providerId = payload.provider_id;
      } else if (type === 'run.output.delta') {
        if (!started) fail('Output arrived before the run started.');
        requireText(payload.text, 'Output delta');
        if (state.text.length + payload.text.length > maxText) fail('Combined output exceeds the text limit.');
        state.text += payload.text;
      } else if (type === 'tool.result' && payload.correlation_facts?.tool_name === 'powershell') {
        requireRun(payload);
        if (!started) fail('Shell result arrived before the run started.');
        if (record.record_type !== 'event' || record.durability !== 'durable') {
          fail('An authoritative shell result must be a durable event.');
        }
        if (payload.kind !== 'tool_result' || !label(payload.call_id)
          || !object(payload.correlation_facts)
          || !['success', 'failure'].includes(payload.correlation_facts.outcome)
          || typeof payload.text !== 'string') {
          fail('Malformed shell tool result.');
        }
        if (shellCallIds.has(payload.call_id)) fail('Duplicate shell call result.');
        if (state.shellResults.length >= maxShellResults) fail('Shell result count exceeds the limit.');
        // Bound the nested JSON before parsing as well as the projected data
        // retained across all calls. Native output metadata is not retained.
        if (Buffer.byteLength(payload.text, 'utf8') > maxShellBytes) fail('Shell result exceeds the byte limit.');
        let result;
        try { result = JSON.parse(payload.text); } catch { fail('Malformed shell result JSON.'); }
        if (!object(result) || typeof result.command !== 'string' || !result.command.length
          || typeof result.output !== 'string' || !Number.isSafeInteger(result.exit_code)
          || !['completed', 'failed'].includes(result.terminal_status) || typeof result.truncated !== 'boolean'
          || (result.terminal_reason !== undefined && typeof result.terminal_reason !== 'string')) {
          fail('Unsupported or malformed shell result fields.');
        }
        const shellResult = {
          callId: payload.call_id, runId: state.runId, toolName: 'powershell',
          command: result.command, output: result.output, exitCode: result.exit_code,
          terminalStatus: result.terminal_status, truncated: result.truncated,
          outcome: payload.correlation_facts.outcome,
          ...(result.terminal_reason !== undefined ? { terminalReason: result.terminal_reason } : {}),
        };
        const bytes = Buffer.byteLength(JSON.stringify(shellResult), 'utf8');
        if (shellBytes + bytes > maxShellBytes) fail('Combined shell results exceed the byte limit.');
        shellBytes += bytes;
        shellCallIds.add(payload.call_id);
        state.shellResults.push(shellResult);
      } else if (type.startsWith('run.terminal.')) {
        if (record.record_type !== 'event' || record.durability !== 'durable') {
          fail('An authoritative run terminal must be a durable event.');
        }
        const terminal = type.slice('run.terminal.'.length);
        if (!['completed', 'failed', 'cancelled'].includes(terminal)
          || payload.kind !== 'run_terminal' || payload.terminal !== terminal) {
          fail('Unknown or contradictory run terminal.');
        }
        if (terminal === 'completed' && !started) fail('Completed terminal arrived before the run started.');
        requireText(payload.text, 'Final output');
        if (payload.reason !== null && payload.reason !== undefined) requireText(payload.reason, 'Terminal reason');
        state.text = payload.text;
        state.terminal = terminal;
        state.reason = payload.reason ?? null;
      }
    }

    // Exec has no human approval response channel. Mark holds from their
    // structured event names/policy, never from model-authored message text.
    const approvalName = `${type} ${payload.kind}`;
    const policy = object(payload.event) ? payload.event.policy_decision : undefined;
    if (/(?:approval|permission)[._/](?:requested|required|pending|prompt)/i.test(approvalName)
      || /(?:approval|permission)_(?:requested|required|pending|prompt)/i.test(approvalName)
      || (typeof policy === 'string' && /^(?:prompt|ask|approval_required)(?::|_|$)/i.test(policy))) {
      state.approvalRequested = true;
    }
    activity.accept(record,state);
    sequences.set(streamKey, record.sequence);
    recordIds.add(record.id);
    state.recordCount += 1;
    return snapshot();
  }

  function finish(exitCode) {
    if (failure) throw failure;
    if (finished) {
      if (exitCode !== finished.exitCode) fail('Contradictory process exit codes.');
      return detached(finished);
    }
    if (!Number.isSafeInteger(exitCode) || exitCode < 0) fail('A confirmed process exit code is required.');
    if (!state.terminal || !state.commandId || !state.runId) fail('Missing authoritative run terminal.');
    if ((state.terminal === 'completed') !== (exitCode === 0)) fail('Run terminal contradicts the process exit code.');
    if (state.terminal === 'completed' && state.approvalRequested) fail('Completion followed an unresolved approval request.');
    activity.finish(state.terminal);
    finished = { ...snapshot(), success: state.terminal === 'completed', exitCode };
    return detached(finished);
  }
  return { accept, snapshot, finish };
}
