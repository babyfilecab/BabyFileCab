// Time Sheet.

let timeSheetEntries = [];
let timeSheetSelectedDate = '';
let timeSheetEditingId = '';
let timeSheetCalendarView = null;
let timeSheetPendingDate = '';

function timeSheetISODate(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function timeSheetParseDate(value) {
  const match=String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date=new Date(Number(match[1]),Number(match[2])-1,Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}
function renderTimeSheetCalendar() {
  if (!timeSheetCalendarView) timeSheetCalendarView=timeSheetParseDate(timeSheetPendingDate) || new Date();
  const year=timeSheetCalendarView.getFullYear(), month=timeSheetCalendarView.getMonth();
  $('timeSheetCalendarMonth').textContent=new Date(year,month,1).toLocaleDateString(undefined,{month:'long',year:'numeric'});
  const selectedLabel=$('timeSheetCalendarSelected');
  if (selectedLabel) selectedLabel.textContent=timeSheetPendingDate ? `Selected: ${timeSheetDateLabel(timeSheetPendingDate)}` : 'Select a date';
  const first=new Date(year,month,1);
  const start=new Date(year,month,1-first.getDay());
  const today=timeSheetISODate(new Date());
  const days=$('timeSheetCalendarDays'); days.replaceChildren();
  for (let i=0;i<42;i++) {
    const date=new Date(start); date.setDate(start.getDate()+i);
    const iso=timeSheetISODate(date);
    const button=document.createElement('button');
    button.type='button'; button.className='time-sheet-calendar-day'; button.textContent=String(date.getDate()); button.dataset.timeSheetCalendarDate=iso;
    if (date.getMonth() !== month) button.classList.add('outside');
    const isSelected = iso === timeSheetPendingDate;
    if (isSelected) {
      button.classList.add('selected');
      button.setAttribute('aria-selected','true');
      // Use explicit inline styling as well as the CSS class so the selected
      // day remains unmistakably highlighted in Wails/WebKit on every theme.
      button.style.background = 'var(--day-selected, #0878f9)';
      button.style.color = '#ffffff';
      button.style.borderColor = 'var(--day-selected-border, #005fca)';
      button.style.outline = '3px solid var(--day-selected-ring, rgba(8,120,249,.28))';
      button.style.outlineOffset = '1px';
    } else {
      button.setAttribute('aria-selected','false');
    }
    if (iso === today) button.classList.add('today');
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      chooseTimeSheetCalendarDay(iso);
    });
    days.appendChild(button);
  }
}
function openTimeSheetCalendar() {
  timeSheetPendingDate=$('timeSheetDate').value || timeSheetSelectedDate || timeSheetISODate(new Date());
  const parsed=timeSheetParseDate(timeSheetPendingDate) || new Date();
  timeSheetCalendarView=new Date(parsed.getFullYear(),parsed.getMonth(),1);
  renderTimeSheetCalendar();
  $('timeSheetCalendarPopover').classList.remove('hidden');
  $('timeSheetDate').setAttribute('aria-expanded','true');
}
function closeTimeSheetCalendar() {
  $('timeSheetCalendarPopover').classList.add('hidden');
  $('timeSheetDate').setAttribute('aria-expanded','false');
}
function moveTimeSheetCalendarMonth(delta) {
  if (!timeSheetCalendarView) timeSheetCalendarView=new Date();
  timeSheetCalendarView=new Date(timeSheetCalendarView.getFullYear(),timeSheetCalendarView.getMonth()+delta,1);
  renderTimeSheetCalendar();
}
function chooseTimeSheetCalendarDay(date) {
  timeSheetPendingDate=date;
  const parsed=timeSheetParseDate(date);
  if (parsed) timeSheetCalendarView=new Date(parsed.getFullYear(),parsed.getMonth(),1);
  const selectedLabel=$('timeSheetCalendarSelected');
  if (selectedLabel) selectedLabel.textContent=`Selected: ${timeSheetDateLabel(date)}`;
  renderTimeSheetCalendar();
}
function acceptTimeSheetCalendarDate(event) {
  if (event) { event.preventDefault(); event.stopPropagation(); }
  if (!timeSheetPendingDate) { toast('Choose the date worked.',true); return; }

  // OK is the only commit action: close the popup first, then make the pending
  // day the active time-sheet date and immediately redraw only that day's rows.
  const confirmedDate = timeSheetPendingDate;
  closeTimeSheetCalendar();
  $('timeSheetDate').value = confirmedDate;
  timeSheetSelectedDate = confirmedDate;
  if (timeSheetEditingId) cancelTimeSheetEdit(false);
  updateTimeSheetDateStatus();
  renderTimeSheet();
  setTimeout(() => $('timeSheetDate')?.focus(), 0);
}

function timeSheetClientOptions() {
  return treeData.filter(node => node.type === 'client').sort((a,b) => String(a.name).localeCompare(String(b.name)));
}
function populateTimeSheetClients() {
  const select = $('timeSheetClient');
  const previous = select.value;
  select.replaceChildren();
  const clients = timeSheetClientOptions();
  if (!clients.length) {
    const option=document.createElement('option'); option.value=''; option.textContent='No clients available'; select.appendChild(option); select.disabled=true; return;
  }
  select.disabled=false;
  for (const client of clients) {
    const option=document.createElement('option'); option.value=client.path; option.textContent=`${client.name} (${client.clientId || ''})`; select.appendChild(option);
  }
  const selectedClient = selectedNode ? treeData.find(client => client.type === 'client' && (selectedNode.path === client.path || String(selectedNode.path || '').startsWith(client.path + '/'))) : null;
  if (previous && clients.some(client => client.path === previous)) select.value=previous;
  else if (selectedClient && clients.some(client => client.path === selectedClient.path)) select.value=selectedClient.path;
}
// Time worked as hours: "1.5", "1:30" (hours:minutes) or "90m" (minutes).
// Returns NaN when the text can't be read.
function parseTimeSheetHours(text) {
  const value = String(text ?? '').trim().toLowerCase();
  let m = value.match(/^(\d{1,2}):([0-5]\d)$/);
  if (m) return Number(m[1]) + Number(m[2]) / 60;
  m = value.match(/^(\d{1,4})\s*(m|min|mins|minutes)$/);
  if (m) return Number(m[1]) / 60;
  m = value.match(/^(\d*\.?\d+)\s*(h|hr|hrs|hours)?$/);
  if (m) return Number(m[1]);
  return NaN;
}
function timeSheetDateLabel(date) {
  if (!date) return '';
  const parts=String(date).split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return date;
  return new Date(parts[0], parts[1]-1, parts[2]).toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'});
}
// The first and last day (YYYY-MM-DD) of the period around a date. Weeks run Sunday to Saturday.
function timeSheetPeriodRange(period, iso) {
  const d = timeSheetParseDate(iso);
  if (!d) return [iso, iso];
  if (period === 'week') {
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return [timeSheetISODate(start), timeSheetISODate(end)];
  }
  if (period === 'month') return [timeSheetISODate(new Date(d.getFullYear(), d.getMonth(), 1)), timeSheetISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
  if (period === 'year') return [`${d.getFullYear()}-01-01`, `${d.getFullYear()}-12-31`];
  return [iso, iso];
}

// person: '' for everyone, otherwise a username. clientId: '' for all clients.
function filterTimeSheetEntries(entries, { from, to, person = '', clientId = '' }) {
  const who = String(person).toLowerCase();
  return entries
    .filter(e => e.date >= from && e.date <= to)
    .filter(e => !who || String(e.username || '').toLowerCase() === who)
    .filter(e => !clientId || e.clientId === clientId)
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.clientName).localeCompare(String(b.clientName)));
}

function timeSheetClientTotals(entries) {
  const totals = new Map();
  entries.forEach(e => totals.set(e.clientName || e.clientId, (totals.get(e.clientName || e.clientId) || 0) + Number(e.hours || 0)));
  return [...totals.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

function timeSheetPeriod() {
  return $('timeSheetPeriod')?.value || 'day';
}

function timeSheetPerson() {
  if (!isAdministrator()) return String(currentUser?.username || '');
  return $('timeSheetPerson')?.value ?? String(currentUser?.username || '');
}

function confirmedTimeSheetEntries() {
  const [from, to] = timeSheetPeriodRange(timeSheetPeriod(), timeSheetSelectedDate);
  return filterTimeSheetEntries(timeSheetEntries, { from, to, person: timeSheetPerson(), clientId: $('timeSheetClientFilter')?.value || '' });
}

// Administrators see everyone's time; staff see their own.
async function loadTimeSheetEntries() {
  timeSheetEntries = await (isAdministrator() ? backend().GetFirmTimeSheetEntries() : backend().GetTimeSheetEntries()) || [];
}

function populateTimeSheetFilters() {
  const person = $('timeSheetPerson');
  const previousPerson = person.value;
  person.replaceChildren(new Option('Me', String(currentUser?.username || '')), new Option('Everyone', ''));
  (firmCalendarPreparers || []).filter(u => String(u.username).toLowerCase() !== String(currentUser?.username || '').toLowerCase())
    .forEach(u => person.appendChild(new Option(calendarPreparerName(u.username), u.username)));
  if ([...person.options].some(o => o.value === previousPerson)) person.value = previousPerson;
  const client = $('timeSheetClientFilter');
  const previousClient = client.value;
  client.replaceChildren(new Option('All clients', ''));
  timeSheetClientOptions().forEach(c => client.appendChild(new Option(`${c.name} (${c.clientId || ''})`, c.clientId)));
  if ([...client.options].some(o => o.value === previousClient)) client.value = previousClient;
}

async function exportTimeSheet() {
  const shown = confirmedTimeSheetEntries();
  if (!shown.length) { toast('There are no hours shown to export.', true); return; }
  const [from, to] = timeSheetPeriodRange(timeSheetPeriod(), timeSheetSelectedDate);
  const path = await backend().ExportTimeSheetCSV(shown.map(e => e.id), from === to ? `Time_Sheet_${from}` : `Time_Sheet_${from}_to_${to}`);
  if (path) toast(`Exported ${shown.length} entr${shown.length === 1 ? 'y' : 'ies'} to ${path.split(/[\\/]/).pop()}.`);
}
function timeSheetPeriodLabel() {
  if (!timeSheetSelectedDate) return '';
  const [from, to] = timeSheetPeriodRange(timeSheetPeriod(), timeSheetSelectedDate);
  return from === to ? timeSheetDateLabel(from) : `${timeSheetDateLabel(from)} – ${timeSheetDateLabel(to)}`;
}
function updateTimeSheetDateStatus() {
  $('timeSheetDateStatus').textContent = timeSheetSelectedDate ? `Showing time worked ${timeSheetPeriod() === 'day' ? 'on' : 'from'} ${timeSheetPeriodLabel()}.` : 'Choose a date and click OK.';
}
function confirmTimeSheetDate() {
  const date=$('timeSheetDate').value;
  if (!date) { toast('Choose the date worked.',true); return; }
  timeSheetSelectedDate=date;
  if (timeSheetEditingId) cancelTimeSheetEdit(false);
  updateTimeSheetDateStatus();
  renderTimeSheet();
}
function setTimeSheetEditMode(entry) {
  if (!entry) return;
  timeSheetEditingId=entry.id;
  $('timeSheetDate').value=entry.date || '';
  timeSheetPendingDate=entry.date || '';
  timeSheetSelectedDate=entry.date || '';
  populateTimeSheetClients();
  if (entry.clientPath && [...$('timeSheetClient').options].some(option => option.value === entry.clientPath)) $('timeSheetClient').value=entry.clientPath;
  $('timeSheetWork').value=entry.work || '';
  $('timeSheetHours').value=Number(entry.hours || 0).toFixed(2);
  $('timeSheetAdd').textContent='Save Changes';
  $('timeSheetCancelEdit').classList.remove('hidden');
  updateTimeSheetDateStatus();
  renderTimeSheet();
  $('timeSheetHours').focus();
}
function cancelTimeSheetEdit(clearFields=true) {
  timeSheetEditingId='';
  $('timeSheetAdd').textContent='Add Time';
  $('timeSheetCancelEdit').classList.add('hidden');
  if (clearFields) { $('timeSheetWork').value=''; $('timeSheetHours').value=''; }
}
function renderTimeSheet() {
  const body=$('timeSheetRows'); body.replaceChildren();
  const visible=confirmedTimeSheetEntries();
  let total=0;
  const me = String(currentUser?.username || '').toLowerCase();
  const showPerson = timeSheetPerson() !== String(currentUser?.username || '');
  $('timeSheetBackdrop').classList.toggle('time-sheet-show-person', showPerson);
  for (const entry of visible) {
    total += Number(entry.hours || 0);
    const row=document.createElement('tr');
    const date=document.createElement('td'); date.textContent=entry.date || '';
    const person=document.createElement('td'); person.className='time-sheet-person-col'; person.textContent=calendarPreparerName(entry.username);
    const client=document.createElement('td'); client.textContent=entry.clientName || '';
    const work=document.createElement('td'); work.textContent=entry.work || '—';
    const hours=document.createElement('td'); hours.textContent=Number(entry.hours || 0).toFixed(2);
    const billed=document.createElement('td'); billed.textContent=entry.invoiceNumber || '—'; billed.className=entry.invoiceNumber ? 'time-sheet-billed' : 'time-sheet-unbilled';
    const actions=document.createElement('td');
    // Only your own unbilled hours can be changed.
    if (String(entry.username || '').toLowerCase() === me) {
      const again=document.createElement('button'); again.type='button'; again.className='secondary time-sheet-repeat'; again.textContent='Repeat'; again.title='Log the same work again'; again.dataset.timeEntryRepeatId=entry.id;
      actions.append(again);
    }
    if (String(entry.username || '').toLowerCase() === me && !entry.invoiceNumber) {
      const edit=document.createElement('button'); edit.type='button'; edit.className='secondary time-sheet-edit'; edit.textContent='Edit'; edit.dataset.timeEntryEditId=entry.id;
      const del=document.createElement('button'); del.type='button'; del.className='secondary time-sheet-delete'; del.textContent='Delete'; del.dataset.timeEntryId=entry.id;
      actions.append(edit,del);
    }
    row.append(date,person,client,work,hours,billed,actions); body.appendChild(row);
  }
  $('timeSheetEmpty').classList.toggle('hidden', visible.length !== 0);
  $('timeSheetEmpty').textContent=timeSheetSelectedDate ? `No time has been entered for ${timeSheetPeriodLabel()}.` : 'Choose a date and click OK.';
  const unbilled = visible.filter(e => !e.invoiceNumber).reduce((sum, e) => sum + Number(e.hours || 0), 0);
  $('timeSheetTotal').textContent=`${total.toFixed(2)} hours${unbilled < total ? ` (${unbilled.toFixed(2)} not yet billed)` : ''}`;
  $('timeSheetUser').textContent=showPerson ? (timeSheetPerson() ? `Time entered by ${calendarPreparerName(timeSheetPerson())}` : 'Time entered by everyone') : (currentUser ? `Time entered by ${[currentUser.firstName,currentUser.lastName].filter(Boolean).join(' ') || currentUser.username}` : '');
  const totals = timeSheetClientTotals(visible);
  $('timeSheetClientTotals').replaceChildren(...(totals.length > 1 ? totals.map(([name, hours]) => Object.assign(document.createElement('span'), { textContent: `${name} ${hours.toFixed(2)} h` })) : []));
  $('timeSheetExport').disabled = visible.length === 0;
}
async function showTimeSheet() {
  if (!currentUser) return;
  await refreshTree();
  populateTimeSheetClients();
  const today=new Date();
  const todayValue=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  $('timeSheetDate').value=todayValue;
  timeSheetPendingDate=todayValue;
  timeSheetSelectedDate=todayValue;
  cancelTimeSheetEdit();
  if (isAdministrator() && !firmCalendarPreparers.length) firmCalendarPreparers = await backend().ListCompanyUsers().catch(() => []);
  $('timeSheetPeriod').value = 'day';
  populateTimeSheetFilters();
  $('timeSheetPerson').value = String(currentUser.username || '');
  $('timeSheetClientFilter').value = '';
  await loadTimeSheetEntries();
  updateTimeSheetDateStatus();
  renderTimeSheet();
  updateTimerUI();
  $('timeSheetBackdrop').classList.remove('hidden');
  setTimeout(()=>$('timeSheetDate')?.focus(),20);
}
function hideTimeSheet() { closeTimeSheetCalendar(); $('timeSheetBackdrop').classList.add('hidden'); cancelTimeSheetEdit(); }
async function addTimeSheetEntry() {
  const date=$('timeSheetDate').value, clientPath=$('timeSheetClient').value, work=String($('timeSheetWork').value || '').trim(), hours=Math.round(parseTimeSheetHours($('timeSheetHours').value)*100)/100;
  if (!date) { toast('Choose the date worked.',true); return; }
  if (date !== timeSheetSelectedDate) { toast('Click OK next to the date to set the selected date first.',true); return; }
  if (!clientPath) { toast('Choose a client.',true); return; }
  if (!work) { toast('Choose or type what you worked on.',true); return; }
  if (work.length > 160) { toast('Work performed must be 160 characters or less.',true); return; }
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) { toast('Enter the time worked, for example 1.5 or 1:30 (no more than 24 hours).',true); return; }
  const button=$('timeSheetAdd'); button.disabled=true;
  try {
    if (timeSheetEditingId) {
      await backend().UpdateTimeSheetEntry(timeSheetEditingId,date,clientPath,work,hours);
      await loadTimeSheetEntries();
      cancelTimeSheetEdit();
      renderTimeSheet();
      toast('Time entry updated.');
    } else {
      await backend().SaveTimeSheetEntry(date,clientPath,work,hours);
      await loadTimeSheetEntries();
      $('timeSheetWork').value=''; $('timeSheetHours').value=''; renderTimeSheet(); toast('Time added.'); $('timeSheetWork').focus();
    }
  } catch(error) { showError(error); }
  finally { button.disabled=false; }
}
function editTimeSheetEntry(id) {
  const entry=timeSheetEntries.find(item => item.id === id);
  if (!entry) { toast('Time entry not found.',true); return; }
  setTimeSheetEditMode(entry);
}
async function deleteTimeSheetEntry(id) {
  if (!id || !confirm('Delete this time entry?')) return;
  try {
    await backend().DeleteTimeSheetEntry(id);
    await loadTimeSheetEntries();
    if (timeSheetEditingId === id) cancelTimeSheetEdit();
    renderTimeSheet(); toast('Time entry deleted.');
  }
  catch(error) { showError(error); }
}

// Timer ----------------------------------------------------------------------
// One running timer per person, kept in this computer's storage so it keeps
// going if the Time Sheet or the app is closed.
let timerTick = null;

function timerKey() {
  return currentUser ? `babyfilecab-timer:${currentUser.companyId || currentUser.companyName || ''}:${String(currentUser.username || '').toLowerCase()}` : '';
}
function runningTimer() {
  const key = timerKey();
  if (!key) return null;
  try { const t = JSON.parse(localStorage.getItem(key) || 'null'); return t && Number.isFinite(t.start) ? t : null; } catch { return null; }
}
// Whole minutes as h:mm, at least one minute.
function timerElapsedText(ms) {
  const minutes = Math.max(1, Math.round(ms / 60000));
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}
function timerClockText(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, sec = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
function startTimeSheetTimer() {
  const select = $('timeSheetClient');
  if (!select.value) { toast('Choose a client first.', true); return; }
  if (runningTimer()) { toast('A timer is already running.', true); return; }
  const client = select.options[select.selectedIndex]?.textContent || '';
  localStorage.setItem(timerKey(), JSON.stringify({ start: Date.now(), clientPath: select.value, clientName: client, work: String($('timeSheetWork').value || '').trim() }));
  updateTimerUI();
  toast(`Timer started for ${client}.`);
}
function stopTimeSheetTimer() {
  const t = runningTimer();
  if (!t) return;
  const elapsed = Date.now() - t.start;
  localStorage.removeItem(timerKey());
  if (timeSheetEditingId) cancelTimeSheetEdit(false);
  const day = timeSheetISODate(new Date(t.start));
  $('timeSheetDate').value = day; timeSheetPendingDate = day; timeSheetSelectedDate = day;
  populateTimeSheetClients();
  if ([...$('timeSheetClient').options].some(o => o.value === t.clientPath)) $('timeSheetClient').value = t.clientPath;
  if (!String($('timeSheetWork').value || '').trim() && t.work) $('timeSheetWork').value = t.work;
  const hours = elapsed > 24 * 3600000 ? '24:00' : timerElapsedText(elapsed);
  $('timeSheetHours').value = hours;
  updateTimeSheetDateStatus(); renderTimeSheet(); updateTimerUI();
  toast(`Timer stopped at ${hours}. Check the details and click Add Time.`);
  ($('timeSheetWork').value ? $('timeSheetAdd') : $('timeSheetWork')).focus();
}
function discardTimeSheetTimer() {
  if (!runningTimer() || !confirm('Discard the running timer without saving the time?')) return;
  localStorage.removeItem(timerKey());
  updateTimerUI();
}
function updateTimerUI() {
  const t = currentUser ? runningTimer() : null;
  $('timerChip').classList.toggle('hidden', !t);
  $('timeSheetTimerStart').classList.toggle('hidden', !!t);
  $('timeSheetTimerStop').classList.toggle('hidden', !t);
  $('timeSheetTimerDiscard').classList.toggle('hidden', !t);
  $('timeSheetTimerBar').classList.toggle('running', !!t);
  if (t) {
    const clock = timerClockText(Date.now() - t.start);
    $('timerChipText').textContent = clock;
    $('timerChip').title = `Timer running for ${t.clientName}. Click to open the Time Sheet.`;
    $('timeSheetTimerStatus').textContent = `Timing ${t.clientName}: ${clock} since ${new Date(t.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${timeSheetISODate(new Date(t.start)) !== timeSheetISODate(new Date()) ? ` on ${timeSheetDateLabel(timeSheetISODate(new Date(t.start)))}` : ''}.`;
    if (!timerTick) timerTick = setInterval(updateTimerUI, 1000);
  } else {
    $('timeSheetTimerStatus').textContent = "Choose the client and click Start Timer when you begin. Stop it when you're done and the time is filled in for you.";
    if (timerTick) { clearInterval(timerTick); timerTick = null; }
  }
}

// Fills the form from an earlier entry so the same work can be logged again.
function repeatTimeSheetEntry(id) {
  const entry = timeSheetEntries.find(item => item.id === id);
  if (!entry) return;
  if (timeSheetEditingId) cancelTimeSheetEdit(false);
  populateTimeSheetClients();
  if ([...$('timeSheetClient').options].some(o => o.value === entry.clientPath)) $('timeSheetClient').value = entry.clientPath;
  $('timeSheetWork').value = entry.work || '';
  $('timeSheetHours').value = Number(entry.hours || 0).toFixed(2);
  toast(`Filled in from ${entry.date}. Pick the date and click Add Time.`);
  $('timeSheetAdd').focus();
}
