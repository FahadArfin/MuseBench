import test from 'node:test';
import assert from 'node:assert/strict';
import {profileStats} from '../src/shared/profile-stats.mjs';
const now = new Date(2026, 9, 26, 18);
const task = (day, month = 9) => ({createdAt: new Date(2026, month, day, 12).toISOString()});
test('counts chats separately from active dates and includes retained archives', () => {
 const result = profileStats([task(24), task(24), {...task(25), archived:true}, task(26), task(30,8)], now);
 assert.equal(result.total,5); assert.equal(result.thisMonth,4); assert.equal(result.activeDays,4);
 assert.equal(result.longest,3); assert.equal(result.current,3);
 assert.equal(result.days.find(d=>d.date==='2026-10-24').count,2);
 assert.equal(result.weeks.at(-1).cumulative,5);
});
test('a streak survives until the end of the next day, but a gap ends it', () => {
 assert.equal(profileStats([task(24),task(25)],now).current,2);
 const result=profileStats([task(20),task(21),task(22),task(24),task(26)],now);
 assert.equal(result.current,1);assert.equal(result.longest,3);
 assert.equal(profileStats([task(24)],now).current,0);
});
test('empty, invalid and future dates do not invent activity', () => {
 const result=profileStats([{createdAt:'bad'},task(27)],now);
 assert.equal(result.thisMonth,0);assert.equal(result.current,0);assert.equal(result.longest,0);
 assert.equal(result.weeks.at(-1).cumulative,0);assert.equal(result.days.length,371);
 assert.equal(profileStats([],now).total,0);
});
