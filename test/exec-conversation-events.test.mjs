import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createExecConversationFold } from '../src/runtime/exec-conversation-events.mjs';

const launch = (taskId = 'workflow-task-a') => ({
  status: 'launched', entryId: 'readme-marker-probe', hostApiVersion: 'v1',
  scriptBytes: 308, scriptHash: `sha256:${'a'.repeat(64)}`, scriptPath: 'C:\\fixture\\workflow.js',
  taskId, workflowRunId: `workflow-run-${taskId}`, workId: `work.v1.workflow.${taskId}`,
  maxParallelAgents: 14, tokenBudget: null, policy: { id: 'policy:standard', caps: 'caps:generated-js-workflow', childLimit: 14 }, args: {},
});
function builder() {
  let sessionSequence = 0, usageSequence = 0, id = 0, commandId, runId;
  const rows = [];
  function add(type, fields = {}, envelope = {}) {
    const usage = type === 'run.usage';
    const kind = { 'runtime.command.accepted': 'command_accepted', 'session.run.linked': 'session_run_linked',
      'run.model.configured': 'run_model_configured', 'run.lifecycle.started': 'run_started', 'run.output.delta': 'run_output_delta',
      'run.usage': 'run_usage', 'tool.result': 'tool_result' }[type]
      ?? (type.startsWith('run.terminal.') ? 'run_terminal' : 'task_lifecycle');
    const record = { schema_version: 1, payload_schema_version: 1, id: `record-${++id}`,
      stream: { kind: usage ? 'exec.usage' : 'session', id: 'session-a' }, sequence: usage ? ++usageSequence : ++sessionSequence,
      recorded_at: 1000000 + id, record_type: 'event', durability: 'durable', causation_id: commandId,
      payload_type: type, payload: { kind, command_id: commandId,
        ...(type !== 'runtime.command.accepted' ? { run_stream: { kind: 'run', id: runId } } : {}), ...fields }, ...envelope };
    rows.push(record); return record;
  }
  function start(suffix = 'a', client_id = null) {
    commandId = `command-${suffix}`; runId = `run-${suffix}`;
    add('runtime.command.accepted', { command_kind: 'turn.submit', client_id }, { record_type: 'reconciliation' });
    add('session.run.linked'); add('run.model.configured', { provider_id: 'meta', model_id: 'muse-test' }); add('run.lifecycle.started');
  }
  const workflow = (taskId = 'workflow-task-a', callId = 'workflow-call-a') => add('tool.result', {
    call_id: callId, text: JSON.stringify(launch(taskId)), correlation_facts: { tool_name: 'workflow', outcome: 'success' },
  });
  const terminal = (text = '', terminal = 'completed') => add(`run.terminal.${terminal}`, { terminal, text, reason: null });
  const workflowTerminal = (taskId = 'workflow-task-a', kind = 'completed') => add(`task.lifecycle.${kind}`, {
    task_id: taskId, task_stream: { kind: 'task', id: taskId }, event: { kind, task_id: taskId, ...(kind === 'failed' ? { reason: 'Child failed' } : {}) },
  });
  const shell = (callId = 'shell-call-a') => add('tool.result', { call_id: callId, correlation_facts: { tool_name: 'powershell', outcome: 'success' },
    text: JSON.stringify({ command: 'Get-Location', output: 'C:\\fixture', exit_code: 0, terminal_status: 'completed', truncated: false }) });
  return { rows, add, start, workflow, terminal, workflowTerminal, shell };
}

test('resumed sessions allow an initial sequence offset but still reject missing later records',()=>{
 const b=builder();b.start();b.terminal('Done');
 const rows=b.rows.map(row=>({...row,sequence:row.sequence+25}));
 assert.throws(()=>createExecConversationFold().accept(rows[0]),/sequence/i);
 const resumed=createExecConversationFold({allowSessionOffset:true});for(const row of rows)resumed.accept(row);assert.equal(resumed.finish(0).success,true);
 const gap=createExecConversationFold({allowSessionOffset:true});gap.accept(rows[0]);assert.throws(()=>gap.accept({...rows[1],sequence:rows[1].sequence+1}),/sequence/i);
});
function sample({ shell = false, failedWorkflow = false } = {}) {
  const b = builder(); b.start(); b.workflow(); b.add('run.usage', { calls: 1 }); b.terminal('Started.');
  b.workflowTerminal('workflow-task-a', failedWorkflow ? 'failed' : 'completed'); b.start('b', 'muse-runtime-background-terminal');
  b.add('run.output.delta', { text: 'Partial' }); if (shell) b.shell(); b.add('run.usage', { calls: 1 }); b.terminal('Done.'); return b;
}
const consume = (fold, rows) => { for (const row of rows) fold.accept(row); return fold; };

test('verified workflow continuation retains root attribution and renders only observed workflow activity', () => {
  const fold = consume(createExecConversationFold(), sample().rows);
  const result = fold.finish(0);
  assert.equal(result.success, true); assert.equal(result.commandId, 'command-a'); assert.equal(result.runId, 'run-a');
  assert.deepEqual(result.ownedRunIds, ['run-a', 'run-b']); assert.equal(result.text, 'Started.\n\nDone.');
  const workflow = result.activity.items.find(item => item.id === 'workflow-task-a');
  assert.equal(workflow.kind, 'tool'); assert.equal(workflow.status, 'completed'); assert.match(workflow.title, /readme.marker.probe/i);
  assert.deepEqual(workflow.workflow,{parentRunId:'run-a',parallelLimit:14});
  assert.equal(workflow.output, ''); assert(!JSON.stringify(workflow).includes('work.v1.')); assert(!result.activity.items.some(item => item.kind === 'agent'));
});

test('continuation shell evidence preserves its real run id', () => {
  const result = consume(createExecConversationFold(), sample({ shell: true }).rows).finish(0);
  assert.equal(result.shellResults[0].runId, 'run-b'); assert.equal(result.runId, 'run-a');
});

test('each owned workflow run must verify its own Meta model identity',()=>{
 for(const target of ['command-a','command-b'])for(const mutation of ['omit','foreign']){
  let rows=sample().rows;
  if(mutation==='omit')rows=rows.filter(row=>!(row.payload_type==='run.model.configured'&&row.payload.command_id===target));
  else rows.find(row=>row.payload_type==='run.model.configured'&&row.payload.command_id===target).payload.provider_id='foreign-provider';
  const sequences=new Map();for(const row of rows){const key=row.stream.kind;row.sequence=(sequences.get(key)??0)+1;sequences.set(key,row.sequence);}
  const fold=consume(createExecConversationFold(),rows);assert.throws(()=>fold.finish(0),/Meta model identity/);
 }
});

test('ordinary failed and completed runs retain single-run authority', () => {
  for (const [terminal, code, success] of [['completed', 0, true], ['failed', 1, false], ['cancelled', 130, false]]) {
    const b = builder(); b.start(); b.terminal('Final', terminal);
    const result = consume(createExecConversationFold(), b.rows).finish(code);
    assert.equal(result.success, success); assert.equal(result.terminal, terminal); assert.equal(result.text, 'Final');
  }
});

test('unsettled workflows and missing reporting continuations cannot finish', () => {
  for (const settle of [false, true]) {
    const b = builder(); b.start(); b.workflow(); b.terminal(); if (settle) b.workflowTerminal();
    const fold = consume(createExecConversationFold(), b.rows);
    assert.equal(fold.snapshot().terminal, null); assert.throws(() => fold.finish(0), /workflow|continuation/i);
  }
});

test('only the precise native background client can follow a settled workflow', () => {
  for (const client of [null, 'other-client', 'muse-runtime-background']) {
    const b = builder(); b.start(); b.workflow(); b.terminal(); b.workflowTerminal(); b.start('b', client);
    assert.throws(() => consume(createExecConversationFold(), b.rows), /background|continuation|command/i);
  }
  for (const phase of ['ordinary', 'running', 'unsettled']) {
    const b = builder(); b.start(); if (phase !== 'ordinary') b.workflow(); if (phase !== 'running') b.terminal(); b.start('b', 'muse-runtime-background-terminal');
    assert.throws(() => consume(createExecConversationFold(), b.rows), /workflow|terminal|continuation|command/i);
  }
});

test('unrelated late events and duplicate terminals remain fatal', () => {
  for (const late of ['run.output.delta', 'task.lifecycle.completed', 'run.terminal.completed']) {
    const b = builder(); b.start(); b.terminal(); b.add(late, { text: 'late', terminal: 'completed', event: { kind: 'completed', task_id: 'unrelated' } });
    const fold = createExecConversationFold(); assert.throws(() => consume(fold, b.rows)); assert.throws(() => fold.finish(0));
  }
});

test('workflow terminal identity, run, command, type and durability must match its launch', () => {
  const mutations = [
    r => { r.payload.task_id = 'other'; }, r => { r.payload.task_stream.id = 'other'; }, r => { r.payload.event.task_id = 'other'; },
    r => { r.payload.command_id = 'foreign'; }, r => { r.payload.run_stream.id = 'foreign'; }, r => { r.payload.event.kind = 'failed'; },
    r => { r.durability = 'ephemeral'; }, r => { r.record_type = 'status'; }, r => { r.payload.kind = 'other'; },
  ];
  for (const mutate of mutations) {
    const b = builder(); b.start(); b.workflow(); b.terminal(); mutate(b.workflowTerminal());
    assert.throws(() => consume(createExecConversationFold(), b.rows));
  }
});

test('workflow launch is a bounded, durable, run-correlated native success, never model prose', () => {
  const variants = [
    r => { r.payload.run_stream = undefined; }, r => { r.payload.command_id = 'foreign'; }, r => { r.durability = 'ephemeral'; },
    r => { r.payload.kind = 'other'; }, r => { r.payload.text = 'launched'; },
    ...['taskId', 'entryId', 'hostApiVersion', 'workflowRunId', 'workId'].map(key => r => { const x = JSON.parse(r.payload.text); delete x[key]; r.payload.text = JSON.stringify(x); }),
  ];
  for (const mutate of variants) { const b = builder(); b.start(); mutate(b.workflow()); assert.throws(() => consume(createExecConversationFold(), b.rows)); }
  const b = builder(); b.start(); b.add('run.output.delta', { text: JSON.stringify(launch()) }); b.terminal(); b.start('b', 'muse-runtime-background-terminal');
  assert.throws(() => consume(createExecConversationFold(), b.rows));
});

test('global duplicate ids, session changes, child streams and sequence gaps remain fatal across handoff', () => {
  const mutations = [
    (r, rows) => { r.id = rows[0].id; }, r => { r.sequence--; }, r => { r.sequence++; },
    r => { r.stream.id = 'child-session'; }, r => { r.stream.kind = 'run'; },
    r => { r.payload.command_id = 'foreign'; }, r => { r.causation_id = 'foreign'; },
  ];
  for (const mutate of mutations) {
    const rows = sample().rows; const target = rows.find(r => r.payload_type === 'runtime.command.accepted' && r.payload.client_id); mutate(target, rows);
    assert.throws(() => consume(createExecConversationFold(), rows));
  }
});

test('workflow task/call replay and repeated authorization are refused', () => {
  for (const duplicate of ['task', 'call']) {
    const b = builder(); b.start(); b.workflow(); b.workflow(duplicate === 'task' ? 'workflow-task-a' : 'workflow-task-b', duplicate === 'call' ? 'workflow-call-a' : 'workflow-call-b');
    assert.throws(() => consume(createExecConversationFold(), b.rows), /duplicate|workflow/i);
  }
  const b = sample(); b.start('c', 'muse-runtime-background-terminal');
  assert.throws(() => consume(createExecConversationFold(), b.rows), /workflow|continuation/i);
});

test('a workflow cannot reuse an ordinary task or a previous workflow control identity', () => {
  const b = builder(); b.start();
  b.add('task.stream.linked', { kind: 'task_stream_linked', task_id: 'workflow-task-a', task_stream: { kind: 'task', id: 'workflow-task-a' } });
  b.workflow(); assert.throws(() => consume(createExecConversationFold(), b.rows), /duplicate|identity/i);
  for (const key of ['workflowRunId', 'workId']) {
    const next = sample(); const repeated = next.workflow('workflow-task-b', 'workflow-call-b');
    const parsed = JSON.parse(repeated.payload.text); parsed[key] = launch()[key]; repeated.payload.text = JSON.stringify(parsed);
    // Insert before the reporting run terminal so this tests identity, not lateness.
    next.rows.splice(next.rows.length - 2, 1);
    for (let i = 0, seq = 0, usage = 0; i < next.rows.length; i++) next.rows[i].sequence = next.rows[i].stream.kind === 'exec.usage' ? ++usage : ++seq;
    assert.throws(() => consume(createExecConversationFold(), next.rows), /duplicate|identity/i);
  }
});

test('root approval holds survive handoff and can never establish success', () => {
  const b = builder(); b.start(); b.add('approval.requested', { kind: 'approval_requested' }); b.workflow(); b.terminal(); b.workflowTerminal(); b.start('b', 'muse-runtime-background-terminal');
  assert.throws(() => consume(createExecConversationFold(), b.rows), /approval/i);
  const ordinary = builder(); ordinary.start(); ordinary.add('approval.requested', { kind: 'approval_requested' }); ordinary.terminal();
  assert.throws(() => consume(createExecConversationFold(), ordinary.rows).finish(0), /approval/i);
});

test('a failed workflow can be reported without masquerading as a successful workflow', () => {
  const result = consume(createExecConversationFold(), sample({ failedWorkflow: true }).rows).finish(0);
  assert.equal(result.success, true); assert.equal(result.activity.items.find(item => item.id === 'workflow-task-a').status, 'failed');
});

test('process mismatch, cumulative output bounds and global record bounds are preserved', () => {
  assert.throws(() => consume(createExecConversationFold(), sample().rows).finish(1), /exit|contradict/i);
  assert.throws(() => consume(createExecConversationFold({ maxText: 10 }), sample().rows), /text|output|limit/i);
  assert.throws(() => consume(createExecConversationFold({ maxRecords: 10 }), sample().rows), /record|limit/i);
  const b = builder(); b.start(); b.shell(); b.workflow(); b.terminal(); b.workflowTerminal(); b.start('b', 'muse-runtime-background-terminal'); b.shell('shell-call-b'); b.terminal();
  assert.throws(() => consume(createExecConversationFold({ maxShellResults: 1 }), b.rows), /shell.*count|shell.*limit/i);
  assert.throws(() => consume(createExecConversationFold({ maxShellBytes: 300 }), b.rows), /shell.*limit/i);
});

test('limits are validated before accepting records', () => {
  for (const option of ['maxText', 'maxRecords', 'maxShellBytes', 'maxShellResults', 'maxHandoffs', 'maxActivityItems', 'maxActivityBytes']) {
    for (const value of [0, -1, Infinity, 0.5]) assert.throws(() => createExecConversationFold({ [option]: value }), /limit/i);
  }
  for (const options of [{ maxHandoffs: 5 }, { maxActivityItems: 121 }, { maxActivityBytes: 200001 }]) assert.throws(() => createExecConversationFold(options), /limit/i);
});

test('handoff and activity storage bounds apply to the whole conversation', () => {
  const b = builder(); b.start(); b.workflow(); b.terminal(); b.workflowTerminal(); b.start('b', 'muse-runtime-background-terminal');
  b.workflow('workflow-task-b', 'workflow-call-b'); b.terminal(); b.workflowTerminal('workflow-task-b'); b.start('c', 'muse-runtime-background-terminal');
  assert.throws(() => consume(createExecConversationFold({ maxHandoffs: 1 }), b.rows), /limit|handoff/i);
  const result = consume(createExecConversationFold({ maxActivityItems: 1 }), sample().rows).finish(0);
  assert(result.activity.items.length <= 1);
});

test('snapshots and repeated finish results are detached and the completed fold rejects later records', () => {
  const b = sample({ shell: true }); const fold = consume(createExecConversationFold(), b.rows); const snapshot = fold.snapshot();
  snapshot.ownedRunIds.push('fake'); snapshot.activity.items[0].title = 'fake'; snapshot.shellResults[0].runId = 'fake';
  const result = fold.finish(0); assert(!result.ownedRunIds.includes('fake')); assert.notEqual(result.activity.items[0].title, 'fake'); assert.equal(result.shellResults[0].runId, 'run-b');
  result.activity.items.length = 0; assert(fold.finish(0).activity.items.length > 0); assert.throws(() => fold.finish(1)); assert.throws(() => fold.accept(b.rows[0]));
});

const nativeCapture = new URL('../artifacts/activity-agent-probe/run-TaL9vi/stdout.jsonl', import.meta.url);
test('replays the retained safe native workflow capture through production validation', { skip: !existsSync(nativeCapture) }, async () => {
  const rows = (await readFile(nativeCapture, 'utf8')).trim().split(/\r?\n/).map(JSON.parse);
  const result = consume(createExecConversationFold(), rows).finish(0);
  assert.equal(result.success, true); assert.equal(result.ownedRunIds.length, 2); assert.equal(result.recordCount, rows.length);
  assert.match(result.text, /MUSEBENCH_CHILD_READ_/); assert.equal(result.activity.items.filter(item => item.kind === 'agent').length, 0);
  assert(!result.activity.items.some(item => item.output.includes('workflowRunId') || item.output.includes('work.v1.workflow')));
});
