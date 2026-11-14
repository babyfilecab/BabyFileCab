// The week arrows carry on into the next or previous calendar year.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const source = require('./source.cjs');
const pick = name => { const i = source.indexOf(`function ${name}(`); const j = source.indexOf('\nfunction ', i + 1); return source.slice(i, j); };
const box = {};
vm.createContext(box);
vm.runInContext(`let FIRM_CALENDAR_YEARS=[2025,2026,2027,2028];let firmCalendarYear=2026;let firmCalendarWeekStarts=[];let firmCalendarWeekIndex=0;
function setFirmCalendarYear(y){firmCalendarYear=y;firmCalendarWeekStarts=buildFirmCalendarWeekStarts(y);firmCalendarWeekIndex=0;}
` + ['firmCalendarUTCDate', 'firmCalendarMondayFor', 'buildFirmCalendarWeekStarts', 'stepFirmCalendarWeek'].map(pick).join('\n') +
  `;this.state=()=>[firmCalendarYear,firmCalendarWeekStarts[firmCalendarWeekIndex].toISOString().slice(0,10)];
  this.go=(y,i)=>{setFirmCalendarYear(y);firmCalendarWeekIndex=i<0?firmCalendarWeekStarts.length+i:i;};this.step=stepFirmCalendarWeek;`, box);

box.go(2026, -1);
assert.deepEqual(Array.from(box.state()), [2026, '2026-12-28']);
assert.equal(box.step(1), true);
assert.deepEqual(Array.from(box.state()), [2027, '2027-01-04'], 'skips the week 2026 and 2027 share');
assert.equal(box.step(-1), true);
assert.deepEqual(Array.from(box.state()), [2027, '2026-12-28'], 'the shared week, shown in 2027');
assert.equal(box.step(-1), true);
assert.deepEqual(Array.from(box.state()), [2026, '2026-12-21']);
box.go(2028, -1);
assert.equal(box.step(1), false, 'stops after the last year');
box.go(2025, 0);
assert.equal(box.step(-1), false, 'stops before the first year');
console.log('calendar year step tests passed');
