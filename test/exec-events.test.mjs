import test from 'node:test';
import assert from 'node:assert/strict';
import { createExecEventFold } from '../src/runtime/exec-events.mjs';

// Envelope and payload shapes come from native Muse 1.4.13's echo output and
// its real Meta HTTP 402 run. Identifiers and account details are synthetic.
const session = 'session-a';
const command = 'command-a';
const run = 'run-a';
const types = {
  'runtime.command.accepted': 'command_accepted',
  'session.run.linked': 'session_run_linked',
  'run.lifecycle.started': 'run_started',
  'run.model.configured': 'run_model_configured',
  'run.output.delta': 'run_output_delta',
  'run.usage': 'run_usage',
};
function frame(sequence, type, fields = {}, stream = { kind: 'session', id: session }) {
  return {
    schema_version: 1, payload_schema_version: 1,
    id: `${stream.kind}-${sequence}`, stream, sequence,
    record_type: 'event', durability: 'durable', causation_id: command,
    recorded_at: 1780531400000000 + sequence,
    payload_type: type,
    payload: {
      kind: types[type] ?? (type.startsWith('run.terminal.') ? 'run_terminal' : 'task_lifecycle'),
      command_id: command,
      ...(type !== 'runtime.command.accepted' ? { run_stream: { kind: 'run', id: run } } : { command_kind: 'turn.submit' }),
      ...fields,
    },
  };
}
function start(fold) {
  fold.accept(frame(1, 'runtime.command.accepted'));
  fold.accept(frame(2, 'session.run.linked'));
  fold.accept(frame(3, 'run.lifecycle.started'));
  return fold;
}
function terminal(sequence, kind = 'completed', fields = {}) {
  return frame(sequence, `run.terminal.${kind}`, { terminal: kind, text: 'Finished.', reason: null, ...fields });
}

// Sanitized full nested shape captured from native Muse 1.4.13 powershell.
// Exit 0 genuinely accompanied a PowerShell command-not-found error.
function shellResult(sequence, fields = {}, result = {}) {
  return frame(sequence, 'tool.result', {
    kind: 'tool_result', call_id: 'call-shell-a',
    text: JSON.stringify({
      chunk_id: 'exec-1-1', command: 'Get-Location; whoami; npm.cmd run --ignore-scripts test',
      description: 'Print directory, user, run tests', exit_code: 0,
      terminal_status: 'completed', output: "whoami : The term 'whoami' is not recognized.\r\n",
      original_output_bytes: 56, original_output_tokens: 14, truncated: false, ...result,
    }),
    correlation_facts: { tool_name: 'powershell', outcome: 'success' }, ...fields,
  });
}

test('native shell result remains structured evidence separate from model text and run completion', () => {
  const fold = start(createExecEventFold());
  const result = fold.accept(shellResult(4));
  assert.deepEqual(result.shellResults, [{
    callId: 'call-shell-a', runId: 'run-a', toolName: 'powershell',
    command: 'Get-Location; whoami; npm.cmd run --ignore-scripts test',
    output: "whoami : The term 'whoami' is not recognized.\r\n",
    exitCode: 0, terminalStatus: 'completed', truncated: false, outcome: 'success',
  }]);
  assert.equal(result.text, '');
  assert.equal(result.terminal, null);
  assert.equal(result.success, undefined);
  assert.throws(() => fold.finish(0), /terminal/i);
});

test('shell results require the accepted command, linked started run and a durable event', () => {
  const variants = [
    { command_id: undefined }, { command_id: 'other-command' },
    { run_stream: undefined }, { run_stream: { kind: 'run', id: 'other-run' } },
  ];
  for (const fields of variants) {
    const fold = start(createExecEventFold());
    assert.throws(() => fold.accept(shellResult(4, fields)), /command|run/i);
    assert.throws(() => fold.finish(0), /command|run/i);
  }
  for (const envelope of [{ durability: 'ephemeral' }, { record_type: 'status' }]) {
    const fold = start(createExecEventFold());
    assert.throws(() => fold.accept({ ...shellResult(4), ...envelope }), /durable|event/i);
  }
  const fold = createExecEventFold();
  fold.accept(frame(1, 'runtime.command.accepted'));
  fold.accept(frame(2, 'session.run.linked'));
  assert.throws(() => fold.accept(shellResult(3)), /started/i);
});

test('malformed recognized shell results poison the fold instead of becoming model evidence', () => {
  const events = [
    shellResult(4, { kind: 'task_lifecycle' }), shellResult(4, { call_id: '' }),
    shellResult(4, { text: 'A model says the command passed.' }),
    shellResult(4, { text: 'null' }), shellResult(4, { text: '[]' }),
    shellResult(4, { correlation_facts: { tool_name: 'powershell', outcome: 'maybe' } }),
    ...[{ command: null }, { output: [] }, { exit_code: '0' }, { exit_code: 0.5 },
      { terminal_status: 'invented' }, { truncated: 'false' }, { terminal_reason: {} }].map((result) => shellResult(4, {}, result)),
  ];
  for (const event of events) {
    const fold = start(createExecEventFold());
    assert.throws(() => fold.accept(event), /shell|tool/i);
    assert.throws(() => fold.accept(terminal(4)), /shell|tool/i);
  }
});

test('shell result storage has UTF-8 byte and count limits across calls', () => {
  const fold = start(createExecEventFold({ maxShellBytes: 700 }));
  fold.accept(shellResult(4, {}, { command: 'echo', output: 'a'.repeat(150) }));
  assert.throws(() => fold.accept(shellResult(5, { call_id: 'call-shell-b' }, { command: 'echo', output: 'é'.repeat(150) })), /shell.*limit/i);
  const countFold = start(createExecEventFold({ maxShellResults: 1 }));
  countFold.accept(shellResult(4));
  assert.throws(() => countFold.accept(shellResult(5, { call_id: 'call-shell-b' })), /shell.*limit/i);
  const textFold = start(createExecEventFold({ maxShellBytes: 1000 }));
  assert.throws(() => textFold.accept(shellResult(4, {}, { output: 'é'.repeat(500) })), /shell.*limit/i);
});

test('shell result limits reject invalid values', () => {
  for (const key of ['maxShellBytes', 'maxShellResults']) {
    for (const value of [0, -1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => createExecEventFold({ [key]: value }), /limits/i);
    }
  }
});

test('duplicate shell call results cannot replay evidence', () => {
  const fold = start(createExecEventFold());
  fold.accept(shellResult(4));
  assert.throws(() => fold.accept(shellResult(5)), /duplicate.*shell|shell.*duplicate/i);
});

test('shell snapshots and repeated finish results are detached down to entries', () => {
  const fold = start(createExecEventFold());
  const accepted = fold.accept(shellResult(4));
  accepted.shellResults[0].output = 'forged';
  accepted.shellResults.length = 0;
  const snap = fold.snapshot();
  assert.equal(snap.shellResults.length, 1);
  assert.match(snap.shellResults[0].output, /not recognized/);
  snap.shellResults[0].command = 'forged';
  fold.accept(terminal(5));
  const finished = fold.finish(0);
  assert.equal(finished.shellResults[0].command, 'Get-Location; whoami; npm.cmd run --ignore-scripts test');
  finished.shellResults[0].exitCode = 777;
  finished.shellResults.push({ command: 'forged' });
  assert.equal(fold.finish(0).shellResults.length, 1);
  assert.equal(fold.finish(0).shellResults[0].exitCode, 0);
});

test('non-shell tools and model-authored shell claims do not create command evidence', () => {
  const fold = start(createExecEventFold());
  fold.accept(frame(4, 'run.output.delta', { text: '{"tool_name":"powershell","exit_code":0}' }));
  fold.accept(shellResult(5, { text: 'File opened.', correlation_facts: { tool_name: 'read_file', outcome: 'success' } }));
  assert.deepEqual(fold.snapshot().shellResults, []);
});

test('failed and truncated native shell results preserve their actual reported outcome', () => {
  const fold = start(createExecEventFold());
  fold.accept(shellResult(4, { correlation_facts: { tool_name: 'powershell', outcome: 'failure' } }, { exit_code: 1, truncated: true }));
  assert.equal(fold.snapshot().shellResults[0].exitCode, 1);
  assert.equal(fold.snapshot().shellResults[0].outcome, 'failure');
  assert.equal(fold.snapshot().shellResults[0].truncated, true);
});

test('native Windows command failure with a negative code is retained inside a completed Muse run', () => {
  const fold = start(createExecEventFold());
  // Captured Muse 1.4.13 schema; workspace details replaced by a sample path.
  fold.accept(shellResult(4, { correlation_facts: { tool_name: 'powershell', outcome: 'failure' } }, {
    command: 'npm.cmd run --ignore-scripts test', description: 'Run project test command once',
    exit_code: -4058, terminal_status: 'failed', terminal_reason: 'process exited with code -4058',
    output: "'\\\\?\\C:\\sample'\r\nCMD.EXE was started with the above path as the current directory.\r\nUNC paths are not supported. Defaulting to Windows directory.\r\nnpm error code ENOENT\n",
    original_output_bytes: 721, original_output_tokens: 181,
  }));
  assert.equal(fold.snapshot().terminal, null);
  fold.accept(terminal(5, 'completed', { text: 'The command failed.' }));
  const result = fold.finish(0);
  assert.equal(result.success, true);
  assert.equal(result.shellResults[0].exitCode, -4058);
  assert.equal(result.shellResults[0].terminalStatus, 'failed');
  assert.equal(result.shellResults[0].terminalReason, 'process exited with code -4058');
  assert.equal(result.shellResults[0].outcome, 'failure');
});

test('native-shaped completion requires its run terminal and successful process exit', () => {
  const fold = start(createExecEventFold());
  fold.accept(frame(4, 'run.output.delta', { text: 'Draft text' }));
  fold.accept(frame(5, 'task.lifecycle.completed', { event: { kind: 'completed', task_id: 'task-a' } }));
  assert.equal(fold.snapshot().terminal, null);
  fold.accept(frame(1, 'run.usage', { calls: 1 }, { kind: 'exec.usage', id: session }));
  fold.accept(terminal(6, 'completed', { text: 'Authoritative final text' }));
  const result = fold.finish(0);
  assert.equal(result.success, true);
  assert.equal(result.exitCode, 0);
  assert.equal(result.text, 'Authoritative final text');
  assert.equal(result.sessionId, session);
  assert.equal(result.commandId, command);
  assert.equal(result.runId, run);
  assert.equal(result.recordCount, 7);
});

test('native-shaped billing failure preserves model metadata and cannot complete', () => {
  const fold = start(createExecEventFold());
  fold.accept(frame(4, 'run.model.configured', { provider_id: 'meta', model_id: 'muse-spark-1.3-contributor', source: 'startup' }));
  fold.accept(frame(5, 'task.lifecycle.failed', { event: { kind: 'failed', reason: 'API error 402: Billing verification failed.' } }));
  assert.equal(fold.snapshot().terminal, null);
  fold.accept(terminal(6, 'failed', { text: '', reason: 'API error 402: Billing verification failed.' }));
  const result = fold.finish(1);
  assert.equal(result.success, false);
  assert.equal(result.terminal, 'failed');
  assert.equal(result.providerId, 'meta');
  assert.equal(result.modelId, 'muse-spark-1.3-contributor');
  assert.match(result.reason, /402/);
});

test('cancelled is a non-success even when partial model text exists', () => {
  const fold = start(createExecEventFold());
  fold.accept(frame(4, 'run.output.delta', { text: 'I have finished' }));
  fold.accept(terminal(5, 'cancelled', { text: 'Partial result', reason: 'Cancelled by user' }));
  assert.equal(fold.finish(130).success, false);
});

test('process success or a task terminal alone cannot establish run completion', () => {
  const fold = start(createExecEventFold());
  fold.accept(frame(4, 'task.lifecycle.completed', { event: { kind: 'completed' } }));
  assert.throws(() => fold.finish(0), /terminal/i);
});

test('a completed record with nonzero exit is contradictory', () => {
  const fold = start(createExecEventFold());
  fold.accept(terminal(4));
  assert.throws(() => fold.finish(1), /exit|contradict/i);
});

test('failed or cancelled terminal with zero exit is contradictory', () => {
  for (const kind of ['failed', 'cancelled']) {
    const fold = start(createExecEventFold());
    fold.accept(terminal(4, kind));
    assert.throws(() => fold.finish(0), /exit|contradict/i);
  }
});

test('unknown terminal spelling or conflicting type and payload is rejected', () => {
  for (const event of [terminal(4, 'interrupted'), terminal(4, 'completed', { terminal: 'failed' })]) {
    const fold = start(createExecEventFold());
    assert.throws(() => fold.accept(event), /terminal/i);
  }
});

test('duplicate and skipped per-stream sequence numbers are rejected', () => {
  for (const seq of [3, 5]) {
    const fold = start(createExecEventFold());
    assert.throws(() => fold.accept(frame(seq, 'run.output.delta', { text: 'x' })), /sequence/i);
  }
});

test('each stream begins at one and usage stream must belong to the main session', () => {
  for (const event of [
    frame(2, 'run.usage', {}, { kind: 'exec.usage', id: session }),
    frame(1, 'run.usage', {}, { kind: 'exec.usage', id: 'foreign-session' }),
  ]) {
    const fold = start(createExecEventFold());
    assert.throws(() => fold.accept(event), /sequence|session/i);
  }
});

test('foreign session, command, and run records are refused', () => {
  const variants = [
    { stream: { kind: 'session', id: 'foreign-session' } },
    { payload: { ...terminal(4).payload, command_id: 'foreign-command' } },
    { payload: { ...terminal(4).payload, run_stream: { kind: 'run', id: 'foreign-run' } } },
  ];
  for (const change of variants) {
    const fold = start(createExecEventFold());
    assert.throws(() => fold.accept({ ...terminal(4), ...change }), /session|command|run/i);
  }
});

test('output and terminal require a linked run and accepted command', () => {
  assert.throws(() => createExecEventFold().accept(terminal(1)), /accepted|command|start/i);
  const fold = createExecEventFold();
  fold.accept(frame(1, 'runtime.command.accepted'));
  assert.throws(() => fold.accept(terminal(2)), /linked|run|start/i);
});

test('malformed envelopes and unsupported schema are refused', () => {
  const invalid = [null, [], {}, { ...frame(1, 'runtime.command.accepted'), schema_version: 2 },
    { ...frame(1, 'runtime.command.accepted'), payload_schema_version: 2 },
    { ...frame(1, 'runtime.command.accepted'), sequence: 1.5 },
    { ...frame(1, 'runtime.command.accepted'), payload: [] }];
  for (const event of invalid) assert.throws(() => createExecEventFold().accept(event));
});

test('control payload kinds and final text must have their documented types', () => {
  for (const change of [{ kind: 'task_lifecycle' }, { text: {} }, { reason: [] }, { run_stream: null }]) {
    const fold = start(createExecEventFold());
    assert.throws(() => fold.accept(terminal(4, 'completed', change)));
  }
});

test('fold errors remain fatal even if later records appear complete', () => {
  const fold = start(createExecEventFold());
  assert.throws(() => fold.accept(frame(8, 'run.output.delta', { text: 'gap' })));
  assert.throws(() => fold.accept(terminal(4)), /sequence/i);
  assert.throws(() => fold.finish(0), /sequence/i);
});

test('bounded output refuses oversized deltas, final replacements, and reasons', () => {
  for (const event of [frame(4, 'run.output.delta', { text: '12345' }), terminal(4, 'completed', { text: '12345' }), terminal(4, 'failed', { text: '', reason: '12345' })]) {
    const fold = start(createExecEventFold({ maxText: 4 }));
    assert.throws(() => fold.accept(event), /limit|bound|large/i);
  }
  const fold = start(createExecEventFold({ maxText: 4 }));
  fold.accept(frame(4, 'run.output.delta', { text: '123' }));
  assert.throws(() => fold.accept(frame(5, 'run.output.delta', { text: '45' })), /limit|bound|large/i);
});

test('record count is bounded independently from displayed text', () => {
  const fold = start(createExecEventFold({ maxRecords: 3 }));
  assert.throws(() => fold.accept(frame(4, 'task.lifecycle.status', { event: { kind: 'status' } })), /record.*limit/i);
});

test('terminal cannot be followed by another terminal or output', () => {
  for (const event of [terminal(5), frame(5, 'run.output.delta', { text: 'late output' })]) {
    const fold = start(createExecEventFold());
    fold.accept(terminal(4));
    assert.throws(() => fold.accept(event), /terminal|finished/i);
  }
});

test('usage may arrive after terminal but before process exit', () => {
  const fold = start(createExecEventFold());
  fold.accept(terminal(4));
  fold.accept(frame(1, 'run.usage', {}, { kind: 'exec.usage', id: session }));
  assert.equal(fold.finish(0).success, true);
});

test('approval hold is explicit and cannot be mistaken for a completed run', () => {
  for (const event of [
    frame(4, 'approval.requested', { kind: 'approval_requested' }),
    frame(4, 'task.lifecycle.side_effect_intent', { event: { kind: 'side_effect_intent', policy_decision: 'prompt:human_review' } }),
  ]) {
    const fold = start(createExecEventFold());
    fold.accept(event);
    assert.equal(fold.snapshot().approvalRequested, true);
    assert.throws(() => fold.finish(0), /terminal|approval/i);
  }
});

test('snapshots are detached and completed folds reject late records', () => {
  const fold = start(createExecEventFold());
  const snap = fold.snapshot(); snap.text = 'forged'; snap.commandId = 'forged';
  assert.equal(fold.snapshot().text, '');
  assert.equal(fold.snapshot().commandId, command);
  fold.accept(terminal(4));
  assert.equal(fold.finish(0).success, true);
  assert.throws(() => fold.accept(frame(1, 'run.usage', {}, { kind: 'exec.usage', id: session })), /finished/i);
});

test('unknown process exit cannot verify completion', () => {
  const fold = start(createExecEventFold());
  fold.accept(terminal(4));
  assert.throws(() => fold.finish(null), /exit/i);
});

test('required raw envelope fields cannot be omitted even from an otherwise complete terminal', () => {
  for (const key of ['record_type', 'durability', 'recorded_at', 'causation_id']) {
    const fold = start(createExecEventFold());
    const event = terminal(4);
    delete event[key];
    assert.throws(() => fold.accept(event), /envelope/i, key);
    assert.throws(() => fold.finish(0), /envelope/i, `${key} must poison the fold`);
  }
});

test('ephemeral or status records cannot establish authoritative run completion', () => {
  for (const change of [{ durability: 'ephemeral' }, { record_type: 'status' }, { durability: 'ephemeral', record_type: 'status' }]) {
    const fold = start(createExecEventFold());
    assert.throws(() => fold.accept({ ...terminal(4), ...change }), /durable|authoritative/i);
    assert.throws(() => fold.finish(0), /durable|authoritative/i);
  }
});

test('raw envelope metadata has validated types and supported durability', () => {
  for (const change of [
    { record_type: null }, { record_type: '' }, { durability: 'eventually' },
    { recorded_at: '1780531400000000' }, { recorded_at: 1.5 }, { recorded_at: -1 },
    { recorded_at: Number.MAX_SAFE_INTEGER + 1 }, { causation_id: 42 }, { causation_id: {} },
  ]) {
    assert.throws(() => createExecEventFold().accept({ ...frame(1, 'runtime.command.accepted'), ...change }), /envelope/i);
  }
});

test('causation metadata may be null or name a causing record rather than the command', () => {
  const fold = createExecEventFold();
  fold.accept({ ...frame(1, 'runtime.command.accepted'), causation_id: null });
  fold.accept({ ...frame(2, 'session.run.linked'), causation_id: 'some-causing-record' });
  fold.accept(frame(3, 'run.lifecycle.started'));
  fold.accept(terminal(4));
  assert.equal(fold.finish(0).success, true);
});
