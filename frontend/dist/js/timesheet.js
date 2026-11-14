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
      button.style.background = '#0878f9';
      button.style.color = '#ffffff';
      button.style.borderColor = '#005fca';
      button.style.outline = '3px solid rgba(8,120,249,.28)';
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
function timeSheetDateLabel(date) {
  if (!date) return '';
  const parts=String(date).split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return date;
  return new Date(parts[0], parts[1]-1, parts[2]).toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'});
}
function confirmedTimeSheetEntries() {
  return timeSheetEntries.filter(entry => entry.date === timeSheetSelectedDate);
}
function updateTimeSheetDateStatus() {
  $('timeSheetDateStatus').textContent = timeSheetSelectedDate ? `Showing time worked on ${timeSheetDateLabel(timeSheetSelectedDate)}.` : 'Choose a date and click OK.';
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
  for (const entry of visible) {
    total += Number(entry.hours || 0);
    const row=document.createElement('tr');
    const date=document.createElement('td'); date.textContent=entry.date || '';
    const client=document.createElement('td'); client.textContent=entry.clientName || '';
    const work=document.createElement('td'); work.textContent=entry.work || '—';
    const hours=document.createElement('td'); hours.textContent=Number(entry.hours || 0).toFixed(2);
    const actions=document.createElement('td');
    const edit=document.createElement('button'); edit.type='button'; edit.className='secondary time-sheet-edit'; edit.textContent='Edit'; edit.dataset.timeEntryEditId=entry.id;
    const del=document.createElement('button'); del.type='button'; del.className='secondary time-sheet-delete'; del.textContent='Delete'; del.dataset.timeEntryId=entry.id;
    actions.append(edit,del); row.append(date,client,work,hours,actions); body.appendChild(row);
  }
  $('timeSheetEmpty').classList.toggle('hidden', visible.length !== 0);
  $('timeSheetEmpty').textContent=timeSheetSelectedDate ? `No time has been entered for ${timeSheetDateLabel(timeSheetSelectedDate)}.` : 'Choose a date and click OK.';
  $('timeSheetTotal').textContent=`${total.toFixed(2)} hours on selected date`;
  $('timeSheetUser').textContent=currentUser ? `Time entered by ${[currentUser.firstName,currentUser.lastName].filter(Boolean).join(' ') || currentUser.username}` : '';
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
  timeSheetEntries=await backend().GetTimeSheetEntries();
  updateTimeSheetDateStatus();
  renderTimeSheet();
  $('timeSheetBackdrop').classList.remove('hidden');
  setTimeout(()=>$('timeSheetDate')?.focus(),20);
}
function hideTimeSheet() { closeTimeSheetCalendar(); $('timeSheetBackdrop').classList.add('hidden'); cancelTimeSheetEdit(); }
async function addTimeSheetEntry() {
  const date=$('timeSheetDate').value, clientPath=$('timeSheetClient').value, work=String($('timeSheetWork').value || '').trim(), hours=Number($('timeSheetHours').value);
  if (!date) { toast('Choose the date worked.',true); return; }
  if (date !== timeSheetSelectedDate) { toast('Click OK next to the date to set the selected date first.',true); return; }
  if (!clientPath) { toast('Choose a client.',true); return; }
  if (!work) { toast('Choose or type what you worked on.',true); return; }
  if (work.length > 160) { toast('Work performed must be 160 characters or less.',true); return; }
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) { toast('Enter hours greater than 0 and no more than 24.',true); return; }
  const button=$('timeSheetAdd'); button.disabled=true;
  try {
    if (timeSheetEditingId) {
      timeSheetEntries=await backend().UpdateTimeSheetEntry(timeSheetEditingId,date,clientPath,work,hours);
      cancelTimeSheetEdit();
      renderTimeSheet();
      toast('Time entry updated.');
    } else {
      timeSheetEntries=await backend().SaveTimeSheetEntry(date,clientPath,work,hours);
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
    timeSheetEntries=await backend().DeleteTimeSheetEntry(id);
    if (timeSheetEditingId === id) cancelTimeSheetEdit();
    renderTimeSheet(); toast('Time entry deleted.');
  }
  catch(error) { showError(error); }
}
