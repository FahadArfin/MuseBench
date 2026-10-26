import test from 'node:test';
import assert from 'node:assert/strict';
import { computeFileDiff } from '../src/shared/file-diff.mjs';

const counts = value => [value.additions, value.deletions, value.approximate];
const lines = text => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
const rebuild = (rows, side) => rows.filter(row => row[side] !== null).map(row => row.text + (row.noNewline ? '' : '\n')).join('');

test('separated edits preserve unchanged middle lines and report only changed lines', () => {
  const diff = computeFileDiff('top\na\nKEEP\nb\ntail\n', 'top\nA\nKEEP\nB\ntail\n');
  assert.deepEqual(counts(diff), [2, 2, false]);
  assert.deepEqual(diff.rows.map(({text, kind, oldLine, newLine}) => ({text, kind, oldLine, newLine})), [
    {text: 'top', kind: 'context', oldLine: 1, newLine: 1},
    {text: 'a', kind: 'removed', oldLine: 2, newLine: null},
    {text: 'A', kind: 'added', oldLine: null, newLine: 2},
    {text: 'KEEP', kind: 'context', oldLine: 3, newLine: 3},
    {text: 'b', kind: 'removed', oldLine: 4, newLine: null},
    {text: 'B', kind: 'added', oldLine: null, newLine: 4},
    {text: 'tail', kind: 'context', oldLine: 5, newLine: 5},
  ]);
});

test('empty and newline-terminated files have actual line counts without phantom blank lines', () => {
  for (const [before, after, additions, deletions] of [
    ['', '', 0, 0], ['', 'hello', 1, 0], ['', 'hello\n', 1, 0],
    ['hello', '', 0, 1], ['hello\n', '', 0, 1], ['', '\n', 1, 0],
    ['\n', '', 0, 1], ['', '\n\n', 2, 0], ['a\n', 'a\n\n', 1, 0],
    ['\n\n', '\n', 0, 1], ['a\nb\n', 'a\nb', 1, 1],
  ]) {
    const diff = computeFileDiff(before, after);
    assert.deepEqual(counts(diff), [additions, deletions, false], JSON.stringify([before, after]));
    assert.equal(rebuild(diff.rows, 'oldLine'), before);
    assert.equal(rebuild(diff.rows, 'newLine'), after);
    assert.equal(diff.rows.filter(row => row.kind === 'added').length, additions);
    assert.equal(diff.rows.filter(row => row.kind === 'removed').length, deletions);
  }
});

test('a final newline change replaces its line and identifies the unterminated side', () => {
  const diff = computeFileDiff('hello', 'hello\n');
  assert.deepEqual(counts(diff), [1, 1, false]);
  assert.deepEqual(diff.rows.map(row => [row.kind, row.text, row.noNewline]), [
    ['removed', 'hello', true], ['added', 'hello', false],
  ]);
});

test('insertions and deletions retain independent old and new line numbers', () => {
  const diff = computeFileDiff('a\nb\nc\nd\n', 'start\na\nc\nd\nend\n');
  assert.deepEqual(counts(diff), [2, 1, false]);
  assert.deepEqual(diff.rows.map(row => [row.kind, row.oldLine, row.newLine]), [
    ['added', null, 1], ['context', 1, 2], ['removed', 2, null],
    ['context', 3, 3], ['context', 4, 4], ['added', null, 5],
  ]);
});

test('repeated lines use a minimal edit sequence and preserve source order', () => {
  for (const [before, after, additions, deletions] of [
    ['a\nb\na\nc\n', 'a\na\nb\nc\n', 1, 1],
    ['x\nx\ny\nx\n', 'x\ny\nx\nx\n', 1, 1],
    ['a\nb\nc\n', 'c\nb\na\n', 2, 2],
    ['a\na\na\n', 'a\na\n', 0, 1],
  ]) {
    const diff = computeFileDiff(before, after);
    assert.deepEqual(counts(diff), [additions, deletions, false]);
    assert.equal(rebuild(diff.rows, 'oldLine'), before);
    assert.equal(rebuild(diff.rows, 'newLine'), after);
    assert.deepEqual(computeFileDiff(before, after), diff, 'comparison must be deterministic');
  }
});

test('CRLF and Unicode content remain intact without hiding line-ending changes', () => {
  const before = 'café\r\n😀\r\nlast', after = 'café\n😀\r\nlast\n';
  const diff = computeFileDiff(before, after);
  assert.deepEqual(counts(diff), [2, 2, false]);
  assert.equal(rebuild(diff.rows, 'oldLine'), before);
  assert.equal(rebuild(diff.rows, 'newLine'), after);
});

test('small generated comparisons agree with an independent LCS oracle', () => {
  let seed = 7907;
  const random = max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
  const sample = () => Array.from({length: random(10)}, () => ['a\n', 'b\n', '\n', '🌱\n'][random(4)]).join('').replace(random(2) ? /\n$/ : /$^/, '');
  for (let attempt = 0; attempt < 250; attempt++) {
    const before = sample(), after = sample(), left = lines(before), right = lines(after);
    const table = Array.from({length: left.length + 1}, () => Array(right.length + 1).fill(0));
    for (let i = 1; i <= left.length; i++) for (let j = 1; j <= right.length; j++) {
      table[i][j] = left[i - 1] === right[j - 1] ? table[i - 1][j - 1] + 1 : Math.max(table[i - 1][j], table[i][j - 1]);
    }
    const common = table[left.length][right.length], diff = computeFileDiff(before, after);
    assert.deepEqual(counts(diff), [right.length - common, left.length - common, false], JSON.stringify([before, after]));
    assert.equal(rebuild(diff.rows, 'oldLine'), before);
    assert.equal(rebuild(diff.rows, 'newLine'), after);
  }
});

test('widely separated edits in a large file remain exact', () => {
  const source = Array.from({length: 20000}, (_, i) => `line ${i}\n`), changed = source.slice();
  changed[2] = 'changed near start\n'; changed[19997] = 'changed near end\n';
  const diff = computeFileDiff(source.join(''), changed.join(''));
  assert.deepEqual(counts(diff), [2, 2, false]);
  assert.equal(diff.totalRows, 20002);
  assert.equal(diff.truncated, true);
  assert.ok(diff.rows.length > 0 && diff.rows.length <= 10000);
});

test('large unrelated files use an explicit bounded fallback', () => {
  const before = Array.from({length: 20000}, (_, i) => `before ${i}\n`).join('');
  const after = Array.from({length: 20000}, (_, i) => `after ${i}\n`).join('');
  const diff = computeFileDiff(before, after);
  assert.deepEqual(counts(diff), [20000, 20000, true]);
  assert.equal(diff.totalRows, 40000);
  assert.equal(diff.truncated, true);
  assert.ok(diff.rows.length > 0 && diff.rows.length <= 10000);
});

test('a 2 MiB newline-only addition keeps exact totals while bounding returned rows', () => {
  const lineCount = 2 * 1024 * 1024, diff = computeFileDiff('', '\n'.repeat(lineCount));
  assert.deepEqual(counts(diff), [lineCount, 0, false]);
  assert.equal(diff.totalRows, lineCount);
  assert.equal(diff.truncated, true);
  assert.ok(diff.rows.length > 0 && diff.rows.length <= 10000);
  assert.equal(diff.rows[0].newLine, 1);
  assert.equal(diff.rows.at(-1).newLine, diff.rows.length);
});
