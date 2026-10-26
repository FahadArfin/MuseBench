const DAY = 86400000;
// Calendar ordinals preserve local dates across daylight-saving changes.
const ordinal = date => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY;
const dateKey = day => new Date(day * DAY).toISOString().slice(0, 10);

export function profileStats(tasks, now = new Date()) {
  const today = ordinal(now), counts = new Map();
  let thisMonth = 0;
  for (const task of tasks) {
    const date = new Date(task.createdAt);
    if (!Number.isFinite(date.getTime()) || date > now) continue;
    const day = ordinal(date);
    counts.set(day, (counts.get(day) || 0) + 1);
    if (date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()) thisMonth++;
  }
  const activeDays = [...counts.keys()].sort((a, b) => a - b);
  let longest = 0, run = 0, previous;
  for (const day of activeDays) {
    run = previous === day - 1 ? run + 1 : 1;
    longest = Math.max(longest, run); previous = day;
  }
  let current = 0, cursor = counts.has(today) ? today : today - 1;
  while (counts.has(cursor--)) current++;
  const start = today - now.getDay() - 52 * 7;
  const days = Array.from({length: 371}, (_, i) => ({date: dateKey(start + i), count: counts.get(start + i) || 0, future: start + i > today}));
  let cumulative = 0;
  const weeks = Array.from({length: 53}, (_, i) => {
    const count = days.slice(i * 7, i * 7 + 7).reduce((sum, d) => sum + d.count, 0);
    cumulative += count;
    return {date: days[i * 7].date, count, cumulative};
  });
  return {total: tasks.length, thisMonth, longest, current, activeDays: activeDays.length, days, weeks};
}
