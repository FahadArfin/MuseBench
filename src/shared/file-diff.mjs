// Source snapshots already limit each file to 2 MiB. Keep line storage compact,
// bound Myers' trace/work separately, and never allocate one row per input line.
const MAX_TRACE_CELLS = 1_000_000;
const MAX_COMPARISON_WORK = 8_000_000;
const MAX_ROWS = 10_000;

export function sourceLineCount(text) {
  let count = text.length && text.charCodeAt(text.length - 1) !== 10 ? 1 : 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) count++;
  return count;
}

function indexLines(text) {
  const count = sourceLineCount(text);
  const offsets = new Uint32Array(count + 1);
  let line = 1;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) offsets[line++] = i + 1;
  if (line <= count) offsets[line] = text.length;
  return {text, offsets, count};
}

function equalLine(left, i, right, j) {
  const leftStart = left.offsets[i], rightStart = right.offsets[j];
  const leftEnd = left.offsets[i + 1], rightEnd = right.offsets[j + 1];
  return leftEnd - leftStart === rightEnd - rightStart &&
    left.text.slice(leftStart, leftEnd) === right.text.slice(rightStart, rightEnd);
}

function appendOperation(operations, kind, oldStart, newStart, count) {
  if (!count) return;
  const last = operations.at(-1);
  if (last?.kind === kind &&
      last.oldStart + (kind === 'added' ? 0 : last.count) === oldStart &&
      last.newStart + (kind === 'removed' ? 0 : last.count) === newStart) {
    last.count += count;
  } else operations.push({kind, oldStart, newStart, count});
}

function backtrack(trace, prefix, n, m) {
  const reversed = [];
  let x = n, y = m;
  for (let distance = trace.length - 1; distance > 0; distance--) {
    const index = (x - y + distance) / 2, previous = trace[distance - 1];
    const added = index === 0 || (index !== distance && previous[index - 1] < previous[index]);
    const oldX = added ? previous[index] : previous[index - 1];
    const oldY = oldX - (x - y + (added ? 1 : -1));
    const common = x - oldX - (added ? 0 : 1);
    if (common) reversed.push({kind: 'context', oldStart: prefix + x - common, newStart: prefix + y - common, count: common});
    reversed.push({kind: added ? 'added' : 'removed', oldStart: prefix + oldX, newStart: prefix + oldY, count: 1});
    x = oldX; y = oldY;
  }
  if (x) reversed.push({kind: 'context', oldStart: prefix, newStart: prefix, count: x});
  return reversed.reverse();
}

// Each trace row stores only its reachable diagonals, not a full file-size grid.
// null means a deterministic budget was exhausted, never a partial exact result.
function compareMiddle(left, right, prefix, n, m) {
  const trace = [new Int32Array([0])];
  let cells = 1, work = 0;
  for (let distance = 1; distance <= n + m; distance++) {
    cells += distance + 1;
    if (cells > MAX_TRACE_CELLS) return null;
    const previous = trace[distance - 1], current = new Int32Array(distance + 1).fill(-1);
    for (let index = 0; index <= distance; index++) {
      if (++work > MAX_COMPARISON_WORK) return null;
      const diagonal = 2 * index - distance;
      const added = index === 0 || (index !== distance && previous[index - 1] < previous[index]);
      const predecessor = added ? previous[index] : previous[index - 1];
      if (predecessor < 0) continue;
      let x = predecessor + (added ? 0 : 1), y = x - diagonal;
      if (x > n || y < 0 || y > m) continue;
      while (x < n && y < m) {
        const i = prefix + x, j = prefix + y;
        const aLength = left.offsets[i + 1] - left.offsets[i], bLength = right.offsets[j + 1] - right.offsets[j];
        work += aLength === bLength ? aLength + 1 : 1;
        if (work > MAX_COMPARISON_WORK) return null;
        if (!equalLine(left, i, right, j)) break;
        x++; y++;
      }
      current[index] = x;
      if (x === n && y === m) {
        trace.push(current);
        return backtrack(trace, prefix, n, m);
      }
    }
    trace.push(current);
  }
  return null;
}

/** Compare text files; binary detection belongs to the snapshot/controller. */
export function computeFileDiff(before, after) {
  const left = indexLines(before), right = indexLines(after);
  let prefix = 0, suffix = 0;
  while (prefix < left.count && prefix < right.count && equalLine(left, prefix, right, prefix)) prefix++;
  while (suffix < left.count - prefix && suffix < right.count - prefix &&
    equalLine(left, left.count - suffix - 1, right, right.count - suffix - 1)) suffix++;
  const n = left.count - prefix - suffix, m = right.count - prefix - suffix;
  const operations = [];
  appendOperation(operations, 'context', 0, 0, prefix);
  const middle = n && m ? compareMiddle(left, right, prefix, n, m) : [];
  const approximate = middle === null;
  if (!n || !m || approximate) {
    appendOperation(operations, 'removed', prefix, prefix, n);
    appendOperation(operations, 'added', prefix + n, prefix, m);
  } else {
    for (const operation of middle) appendOperation(operations, operation.kind, operation.oldStart, operation.newStart, operation.count);
  }
  appendOperation(operations, 'context', left.count - suffix, right.count - suffix, suffix);

  let additions = 0, deletions = 0, totalRows = 0;
  const rows = [];
  for (const operation of operations) {
    const {kind, oldStart, newStart, count} = operation;
    if (kind === 'added') additions += count;
    if (kind === 'removed') deletions += count;
    totalRows += count;
    const source = kind === 'added' ? right : left, start = kind === 'added' ? newStart : oldStart;
    const visible = Math.min(count, MAX_ROWS - rows.length);
    for (let i = 0; i < visible; i++) {
      const end = source.offsets[start + i + 1], noNewline = source.text.charCodeAt(end - 1) !== 10;
      rows.push({
        text: source.text.slice(source.offsets[start + i], end - (noNewline ? 0 : 1)),
        kind,
        oldLine: kind === 'added' ? null : oldStart + i + 1,
        newLine: kind === 'removed' ? null : newStart + i + 1,
        noNewline,
      });
    }
  }
  return {additions, deletions, rows, approximate, truncated: totalRows > rows.length, totalRows};
}
