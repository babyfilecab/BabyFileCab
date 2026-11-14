const assert = require('node:assert/strict');
const vm = require('node:vm');
const source = require('./source.cjs');
const chunk = source.slice(source.indexOf('// Filing deadlines'), source.indexOf('function needsAttentionSnoozeKey'));
const box = {
  firmCalendarStatusLabel: s => s,
  firmCalendarDateFromISO: iso => new Date(iso + 'T12:00:00Z'),
  firmCalendarFormatDate: (d, o) => d.toLocaleDateString('en-US', { ...o, timeZone: 'UTC' }),
};
vm.createContext(box);
vm.runInContext(chunk + ';this.taxDeadlineDate=taxDeadlineDate;this.filingDeadlinesOn=filingDeadlinesOn;this.findNeedsAttention=findNeedsAttention;', box);

// Known IRS due dates, including weekend and Emancipation Day shifts.
const known = [
  [[2022, 4, 15], '2022-04-18'], // Fri Apr 15 is Emancipation Day observed
  [[2024, 6, 15], '2024-06-17'], // Saturday
  [[2024, 9, 15], '2024-09-16'], // Sunday
  [[2025, 4, 15], '2025-04-15'],
  [[2025, 6, 15], '2025-06-16'], // Sunday
  [[2026, 4, 15], '2026-04-15'],
  [[2026, 3, 15], '2026-03-16'], // Sunday
  [[2027, 1, 15], '2027-01-15'],
  [[2028, 4, 15], '2028-04-18'], // Sat, then Emancipation Day observed Mon 17th
  [[2024, 1, 15], '2024-01-16'], // MLK Day
];
for (const [[y, m, d], want] of known) assert.equal(box.taxDeadlineDate(y, m, d), want, `${y}-${m}-${d}`);
assert.ok(box.filingDeadlinesOn('2026-04-15').some(l => l.includes('1040')));
assert.ok(box.filingDeadlinesOn('2026-03-16').some(l => l.includes('1065')));
assert.equal(box.filingDeadlinesOn('2026-03-15').length, 0);

// New statuses in Needs Attention.
const items = [
  { date: '2026-04-01', clientId: '1', clientName: 'Rejected', status: 'rejected', statusSince: '2026-11-12' },
  { date: '2026-04-01', clientId: '2', clientName: 'Accepted', status: 'accepted', statusSince: '2026-04-20' },
  { date: '2026-04-01', clientId: '3', clientName: 'Waiting Ack', status: 'e-filed', statusSince: '2026-11-08' },
  { date: '2026-04-01', clientId: '4', clientName: 'Fresh E-file', status: 'e-filed', statusSince: '2026-11-12' },
  { date: '2026-04-10', clientId: '5', clientName: 'Extended', status: 'extension-filed', statusSince: '2026-04-10' },
];
const user = { username: 'amy', role: 'administrator' };
const names = today => Array.from(box.findNeedsAttention(items, today, user).map(e => e.item.clientName)).sort();
assert.deepEqual(names('2026-11-13'), ['Extended', 'Rejected', 'Waiting Ack']);
// Before September 15 an extension is not flagged.
assert.deepEqual(names('2026-08-01').includes('Extended'), false);
const ext = box.findNeedsAttention(items, '2026-10-01', user).find(e => e.item.clientName === 'Extended');
assert.match(ext.reason, /Oct 15 \(14 days left\)/);
console.log('filing deadline tests passed');
