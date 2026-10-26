export function visit(history, route, limit = 100) {
 if (history.entries[history.index] === route) return history;
 const entries = [...history.entries.slice(0, history.index + 1), route].slice(-limit);
 return {entries, index: entries.length - 1};
}
export function historyTarget(history, direction, available = () => true) {
 for (let index = history.index + direction; index >= 0 && index < history.entries.length; index += direction) {
  if (available(history.entries[index])) return index;
 }
 return -1;
}
