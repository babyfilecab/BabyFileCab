const fs=require('fs'); const assert=require('assert');
const html=fs.readFileSync('frontend/dist/index.html','utf8'); const js=require('./source.cjs');
assert(html.includes('data-menu-action="time-sheet"'));
assert(html.includes('id="timeSheetDate"'));
assert(html.includes('id="timeSheetDateConfirm"'));
assert(html.includes('id="timeSheetClient"'));
assert(html.includes('id="timeSheetHours"'));

assert(html.includes('id="timeSheetWork"'));
assert(html.includes('id="timeSheetWorkOptions"'));
assert(html.includes('Tax Return Preparation'));
assert(html.includes('<th>Date</th><th>Client</th><th>Work performed</th><th>Hours</th>'));
assert(js.includes("entry.work || '—'"));
assert(js.includes("$('timeSheetWork').value=entry.work || ''"));
assert(js.includes('SaveTimeSheetEntry(date,clientPath,work,hours)'));
assert(js.includes('UpdateTimeSheetEntry(timeSheetEditingId,date,clientPath,work,hours)'));
assert(html.includes('id="timeSheetCancelEdit"'));
assert(js.includes('SaveTimeSheetEntry'));
assert(js.includes('UpdateTimeSheetEntry'));
assert(js.includes('GetTimeSheetEntries'));
assert(js.includes('DeleteTimeSheetEntry'));
assert(js.includes("entry.date === timeSheetSelectedDate"));
assert(js.includes('data-time-entry-edit-id'));
assert.ok(js.includes('timeSheetSelectedDate = confirmedDate'), 'calendar OK should apply selected date, refresh filtered entries, and close popup');

assert.ok(js.includes('renderTimeSheet();'), 'calendar OK should apply selected date, refresh filtered entries, and close popup');

assert.ok(js.includes('closeTimeSheetCalendar();'), 'calendar OK should apply selected date, refresh filtered entries, and close popup');


assert.ok(!html.includes('<label class="form-field time-sheet-date-field"'), 'calendar popup must not live inside a label, which can immediately reopen it after OK');
assert.ok(html.includes('<div class="form-field time-sheet-date-field">'), 'date field should use a non-label wrapper around the popup');
assert.ok(js.includes('event.stopPropagation()'), 'calendar OK should not bubble into the date picker and reopen the popup');

console.log('time-sheet test passed');
