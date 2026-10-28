import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createController } from '../src/controller/index.mjs';

const exec = promisify(execFile);

async function fixture(t, runtime) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'musebench-navigation-'));
  const project = path.join(root, 'project');
  await fs.mkdir(project);
  const source = path.join(project, 'note.txt');
  await fs.writeFile(source, 'original source\n');
  const controller = await createController({ dataDir: path.join(root, 'data'), runtime });
  t.after(async () => { await controller.close(); await fs.rm(root, { recursive: true, force: true }); });
  const act = async action => { const state = await controller.dispatch(action); assert.equal(state.error, null); return state; };
  await act({ type: 'openProject', path: project });
  const first = (await act({ type: 'newTask', request: 'First chat', mode: 'manual' })).task;
  const second = (await act({ type: 'newTask', request: 'Second chat', mode: 'manual' })).task;
  return { controller, act, source, first, second };
}

test('switching chats captures source once and keeps each chat baseline', async t => {
  const { act, source, first, second } = await fixture(t);
  await fs.writeFile(source, 'edited outside MuseBench\n');
  let reads = 0;
  const open = fs.open;
  t.mock.method(fs, 'open', async function(file, ...args) {
    if (path.resolve(file) === source) reads++;
    return open.call(this, file, ...args);
  });
  let state = await act({ type: 'selectTask', id: first.id });
  assert.equal(reads, 1, 'chat navigation must not capture the same workspace twice');
  assert.notEqual(state.task.revision, first.revision);
  assert.deepEqual(state.task.changes.map(({ before, after }) => ({ before, after })), [{ before: 'original source\n', after: 'edited outside MuseBench\n' }]);
  reads = 0;
  state = await act({ type: 'selectTask', id: second.id });
  assert.equal(reads, 1);
  assert.equal(state.task.baselineRevision, second.baselineRevision);
  assert.equal(state.task.changes[0].after, 'edited outside MuseBench\n');
});

test('navigation captures edits completed while the old runtime disconnects', async t => {
  let onDisconnect = async () => {};
  const runtime = {
    snapshot: () => ({ status: 'unavailable', permissionVerified: false, cleanup: 'confirmed', messages: [] }),
    subscribe: () => () => {},
    disconnect: () => onDisconnect(),
  };
  const { act, source, first } = await fixture(t, runtime);
  onDisconnect = async () => { await fs.writeFile(source, 'changed during cleanup\n'); };
  const state = await act({ type: 'selectTask', id: first.id });
  assert.notEqual(state.task.revision, first.revision);
  assert.equal(state.task.changes[0].after, 'changed during cleanup\n');
});

test('an unreadable target workspace does not replace the selected chat', async t => {
  const { controller, source, first, second } = await fixture(t);
  await fs.writeFile(source, Buffer.alloc(2 * 1024 * 1024 + 1));
  const state = await controller.dispatch({ type: 'selectTask', id: first.id });
  assert.match(state.error, /2 MiB/);
  assert.equal(state.task.id, second.id);
});

test('navigation reports the Git branch after runtime cleanup finishes', async t => {
  let onDisconnect = async () => {};
  const runtime = {
    snapshot: () => ({ status: 'unavailable', permissionVerified: false, cleanup: 'confirmed', messages: [] }),
    subscribe: () => () => {},
    disconnect: () => onDisconnect(),
  };
  const { act, source, first } = await fixture(t, runtime);
  const project = path.dirname(source);
  const git = (...args) => exec('git', ['-C', project, ...args], { windowsHide: true });
  await git('init');
  await git('symbolic-ref', 'HEAD', 'refs/heads/before-cleanup');
  onDisconnect = async () => { await git('symbolic-ref', 'HEAD', 'refs/heads/after-cleanup'); };
  const state = await act({ type: 'selectTask', id: first.id });
  assert.equal(state.activeProject.branch, 'after-cleanup');
});
