const assert = require('node:assert/strict');
const vm = require('node:vm');
const source = require('./source.cjs');
const pick = name => { const i = source.indexOf(`function ${name}(`); const j = source.indexOf('\nfunction ', i + 1); return source.slice(i, j); };
const box = {};
vm.createContext(box);
vm.runInContext(['timeSheetISODate', 'timeSheetParseDate', 'timeSheetPeriodRange', 'filterTimeSheetEntries', 'timeSheetClientTotals'].map(pick).join('\n') +
  ';this.range=timeSheetPeriodRange;this.filter=filterTimeSheetEntries;this.totals=timeSheetClientTotals;', box);

assert.deepEqual(Array.from(box.range('day', '2026-11-12')), ['2026-11-12', '2026-11-12']);
assert.deepEqual(Array.from(box.range('week', '2026-11-12')), ['2026-11-08', '2026-11-14']); // Sun-Sat
assert.deepEqual(Array.from(box.range('week', '2026-01-01')), ['2025-12-28', '2026-01-03']);
assert.deepEqual(Array.from(box.range('month', '2026-02-10')), ['2026-02-01', '2026-02-28']);
assert.deepEqual(Array.from(box.range('year', '2026-02-10')), ['2026-01-01', '2026-12-31']);

const entries = [
  { id: 1, date: '2026-11-09', username: 'amy', clientId: '00001', clientName: 'Smith', hours: 2 },
  { id: 2, date: '2026-11-10', username: 'Bob', clientId: '00002', clientName: 'Jones', hours: 1.5 },
  { id: 3, date: '2026-11-20', username: 'amy', clientId: '00001', clientName: 'Smith', hours: 3 },
  { id: 4, date: '2026-11-11', username: 'amy', clientId: '00002', clientName: 'Jones', hours: 0.5 },
];
const week = { from: '2026-11-08', to: '2026-11-14' };
assert.deepEqual(box.filter(entries, week).map(e => e.id), [1, 2, 4]);
assert.deepEqual(box.filter(entries, { ...week, person: 'bob' }).map(e => e.id), [2]);
assert.deepEqual(box.filter(entries, { ...week, clientId: '00002' }).map(e => e.id), [2, 4]);
assert.deepEqual(JSON.parse(JSON.stringify(box.totals(box.filter(entries, week)))), [['Jones', 2], ['Smith', 2]]);
console.log('time sheet period tests passed');
