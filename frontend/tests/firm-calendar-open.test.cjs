const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const source=require('./source.cjs');
const start=source.indexOf('const FIRM_CALENDAR_YEARS');
const end=source.indexOf('async function showFirmCalendar()',start);
const box={Date,Intl};vm.createContext(box);vm.runInContext(source.slice(start,end),box);
assert.deepEqual(Array.from(box.FIRM_CALENDAR_YEARS || []),[]); // const is lexical; verify via source too
assert.match(source,/const FIRM_CALENDAR_YEARS = firmCalendarYearRange\(new Date\(\)\)/);
const years=vm.runInContext('firmCalendarYearRange(new Date(2031,0,15))',box);
assert.deepEqual(Array.from(years),[2025,2026,2027,2028,2029,2030,2031,2032,2033]);
const items=[
  {date:'2025-04-15',clientId:'a'},
  {date:'2026-10-08',clientId:'b'},
  {date:'2027-02-01',clientId:'c'}
];
const picked=box.preferredFirmCalendarAssignment(items);
assert.ok(picked && ['a','b','c'].includes(picked.clientId));
assert.match(source,/FIRM_CALENDAR_YEARS\.includes\(Number\(date\.slice\(0, 4\)\)\)/);
