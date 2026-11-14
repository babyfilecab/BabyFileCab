// Firm Calendar and the Needs Attention list.

// 2025 through two years past today, so the calendar never runs out.
const FIRM_CALENDAR_YEARS = firmCalendarYearRange(new Date());
let firmCalendarYear = new Date().getFullYear();

function firmCalendarYearRange(now) {
  const years = [];
  for (let y = 2025; y <= now.getFullYear() + 2; y++) years.push(y);
  return years;
}

// Tax years 2018 through the current year, newest selected by default.
function fillTaxYearSelect(select) {
  if (!select) return;
  const latest = new Date().getFullYear();
  const years = [];
  for (let y = 2018; y <= latest; y++) years.push(y);
  select.replaceChildren(...years.map(y => new Option(String(y), String(y))));
  select.value = String(latest);
}

function firmCalendarUTCDate(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day));
}

function firmCalendarISO(date) {
  return date.toISOString().slice(0, 10);
}

function firmCalendarDateFromISO(value) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  return firmCalendarUTCDate(year, month - 1, day);
}

function firmCalendarFormatDate(date, options = {}) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...options }).format(date);
}

function firmCalendarMondayFor(date) {
  const monday = new Date(date);
  const daysSinceMonday = (monday.getUTCDay() + 6) % 7;
  monday.setUTCDate(monday.getUTCDate() - daysSinceMonday);
  return monday;
}

function buildFirmCalendarWeekStarts(year = firmCalendarYear) {
  const starts = [];
  const start = firmCalendarMondayFor(firmCalendarUTCDate(year, 0, 1));
  const last = firmCalendarMondayFor(firmCalendarUTCDate(year, 11, 31));
  for (let cursor = new Date(start); cursor <= last; cursor.setUTCDate(cursor.getUTCDate() + 7)) {
    starts.push(new Date(cursor));
  }
  return starts;
}

// Moves one week forward or back. At the end of December it carries on into
// the next calendar year (and back into the previous one at the start of
// January), skipping the week the two years share.
function stepFirmCalendarWeek(delta) {
  const current = firmCalendarWeekStarts[firmCalendarWeekIndex];
  const next = firmCalendarWeekIndex + delta;
  if (next >= 0 && next < firmCalendarWeekStarts.length) { firmCalendarWeekIndex = next; return true; }
  const year = firmCalendarYear + delta;
  if (!current || !FIRM_CALENDAR_YEARS.includes(year)) return false;
  const starts = buildFirmCalendarWeekStarts(year);
  const index = delta > 0 ? starts.findIndex(start => start > current) : starts.map(start => start < current).lastIndexOf(true);
  if (index < 0) return false;
  setFirmCalendarYear(year);
  firmCalendarWeekIndex = index;
  return true;
}

function firmCalendarWeekEnd(start) {
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return end;
}

function firmCalendarWeekLabel(start, index) {
  const end = firmCalendarWeekEnd(start);
  const startText = firmCalendarFormatDate(start, { month: 'short', day: 'numeric', year: start.getUTCFullYear() === firmCalendarYear ? undefined : 'numeric' });
  const endText = firmCalendarFormatDate(end, { month: 'short', day: 'numeric', year: 'numeric' });
  return `Week ${index + 1} · ${startText} – ${endText}`;
}

function populateFirmCalendarWeekSelect() {
  const select = $('firmCalendarWeekSelect');
  select.innerHTML = firmCalendarWeekStarts.map((start, index) =>
    `<option value="${index}">${escapeHTML(firmCalendarWeekLabel(start, index))}</option>`
  ).join('');
  select.value = String(firmCalendarWeekIndex);
}

function firmCalendarCurrentWeekIndex() {
  const now = new Date();
  const today = firmCalendarUTCDate(now.getFullYear(), now.getMonth(), now.getDate());
  if (today.getUTCFullYear() !== firmCalendarYear) return 0;
  for (let i = 0; i < firmCalendarWeekStarts.length; i++) {
    const start = firmCalendarWeekStarts[i];
    const end = firmCalendarWeekEnd(start);
    if (today >= start && today <= end) return i;
  }
  return 0;
}

function firmCalendarAssignmentWeekIndex(items = firmCalendarAssignments) {
  const yearItems = items.filter(item => Number(String(item.date || '').slice(0, 4)) === firmCalendarYear);
  if (!yearItems.length) return -1;
  const now = new Date();
  const today = firmCalendarUTCDate(now.getFullYear(), now.getMonth(), now.getDate());
  const sorted = [...yearItems].sort((a, b) => {
    const da = Math.abs(firmCalendarDateFromISO(a.date) - today);
    const db = Math.abs(firmCalendarDateFromISO(b.date) - today);
    return da - db || a.date.localeCompare(b.date);
  });
  const target = firmCalendarDateFromISO(sorted[0].date);
  return firmCalendarWeekStarts.findIndex(start => target >= start && target <= firmCalendarWeekEnd(start));
}

function updateFirmCalendarYearUI() {
  const yearSelect = $('firmCalendarYearSelect');
  if (yearSelect && yearSelect.options.length !== FIRM_CALENDAR_YEARS.length) {
    yearSelect.replaceChildren(...FIRM_CALENDAR_YEARS.map(y => new Option(String(y), String(y))));
  }
  if (yearSelect) yearSelect.value = String(firmCalendarYear);
  const reassignDate = $('firmCalendarReassignDate');
  if (reassignDate) {
    reassignDate.min = `${FIRM_CALENDAR_YEARS[0]}-01-01`;
    reassignDate.max = `${FIRM_CALENDAR_YEARS[FIRM_CALENDAR_YEARS.length - 1]}-12-31`;
  }
  $('firmCalendarTitle').textContent = `${firmCalendarYear} Firm Calendar`;
  const weekLabel = $('firmCalendarWeekYearLabel');
  if (weekLabel) weekLabel.textContent = `Week of ${firmCalendarYear}`;
  const weekSelect = $('firmCalendarWeekSelect');
  if (weekSelect) weekSelect.setAttribute('aria-label', `Choose week of ${firmCalendarYear}`);
  const scheduleDate = $('calendarScheduleClientDate');
  if (scheduleDate) {
    scheduleDate.min = `${firmCalendarYear}-01-01`;
    scheduleDate.max = `${firmCalendarYear}-12-31`;
  }
}

function setFirmCalendarYear(year, { preferAssignments = false } = {}) {
  const parsed = Number(year);
  if (!FIRM_CALENDAR_YEARS.includes(parsed)) return;
  firmCalendarYear = parsed;
  firmCalendarWeekStarts = buildFirmCalendarWeekStarts(firmCalendarYear);
  firmCalendarWeekIndex = firmCalendarCurrentWeekIndex();
  if (preferAssignments) {
    const currentStart = firmCalendarWeekStarts[firmCalendarWeekIndex];
    const currentEnd = currentStart ? firmCalendarWeekEnd(currentStart) : null;
    const hasCurrentAssignments = currentStart && firmCalendarAssignments.some(item => {
      const d = firmCalendarDateFromISO(item.date);
      return d >= currentStart && d <= currentEnd;
    });
    if (!hasCurrentAssignments) {
      const assignmentIndex = firmCalendarAssignmentWeekIndex();
      if (assignmentIndex >= 0) firmCalendarWeekIndex = assignmentIndex;
    }
  }
  updateFirmCalendarYearUI();
  populateFirmCalendarWeekSelect();
}

let firmCalendarPreparers = [];
let firmCalendarPreparerView = '*';
let firmCalendarPreparerReassignItem = null;
function calendarPreparerName(username) {
  if (!username) return 'Unassigned';
  const user = firmCalendarPreparers.find(user => user.username.toLowerCase() === username.toLowerCase());
  return user ? [user.firstName,user.lastName].filter(Boolean).join(' ') || user.username : username;
}
function calendarPreparerInitials(username) {
  const name = calendarPreparerName(username);
  return name.split(/\s+/).filter(Boolean).slice(0,2).map(part => part[0]).join('').toUpperCase();
}
function calendarAssignmentsForPreparer(items, view) {
  return view === '*' ? [...items] : items.filter(item => (item.preparerUsername || '').toLowerCase() === view.toLowerCase());
}
function renderCalendarPreparerMenu() {
  const menu = $('firmCalendarPreparerMenu'); menu.replaceChildren();
  const choices = [{username:'*',label:'Entire Firm — All Preparers'},{username:'',label:'Unassigned Clients'}, ...firmCalendarPreparers.map(user => ({username:user.username,label:calendarPreparerName(user.username)}))];
  for (const choice of choices) {
    const button = document.createElement('button'); button.type='button'; button.setAttribute('role','menuitemradio');
    button.setAttribute('aria-checked',String(choice.username===firmCalendarPreparerView)); button.textContent = choice.label;
    button.addEventListener('click', () => {
      firmCalendarPreparerView=choice.username; menu.classList.add('hidden'); clearFirmCalendarClientDetail(); renderCalendarPreparerMenu(); renderFirmCalendarWeek();
    }); menu.appendChild(button);
  }
  const view = firmCalendarPreparerView;
  $('firmCalendarPreparerButton').textContent = view === '*' ? `${calendarPreparerInitials(currentUser.username)} • Entire Firm ▾` : view === '' ? 'Unassigned ▾' : `${calendarPreparerInitials(view)} • ${calendarPreparerName(view)} ▾`;
  $('firmCalendarPreparerButton').setAttribute('aria-expanded','false');
}
function hideCalendarPreparerReassign() { $('firmCalendarPreparerReassignBackdrop').classList.add('hidden'); firmCalendarPreparerReassignItem=null; }
function showCalendarPreparerReassign(item) {
  firmCalendarPreparerReassignItem={...item};
  $('firmCalendarPreparerReassignClient').textContent=`${item.clientName} — ${item.date}`;
  const select=$('firmCalendarPreparerReassignSelect'); select.replaceChildren();
  for (const user of [{username:''},...firmCalendarPreparers]) {
    const option=document.createElement('option'); option.value=user.username; option.textContent=calendarPreparerName(user.username); select.appendChild(option);
  }
  select.value=item.preparerUsername || '';
  $('firmCalendarPreparerReassignBackdrop').classList.remove('hidden'); select.focus();
}
async function saveCalendarPreparerReassign() {
  if (!firmCalendarPreparerReassignItem || $('firmCalendarPreparerReassignSave').disabled) return;
  const item={...firmCalendarPreparerReassignItem},generation=sessionGeneration;
  $('firmCalendarPreparerReassignSave').disabled=true;
  try {
    const assignments=await backend().ReassignFirmCalendarPreparer2026(item.date,item.clientId,$('firmCalendarPreparerReassignSelect').value);
    if (generation!==sessionGeneration) return;
    firmCalendarAssignments=assignments; hideCalendarPreparerReassign(); clearFirmCalendarClientDetail(); renderFirmCalendarWeek(); toast('Preparer assignment saved.');
  } catch(error) { if(generation===sessionGeneration) showError(error); }
  finally { $('firmCalendarPreparerReassignSave').disabled=false; }
}

function preferredFirmCalendarAssignment(items = firmCalendarAssignments) {
  if (!items.length) return null;
  const now = new Date();
  const today = firmCalendarUTCDate(now.getFullYear(), now.getMonth(), now.getDate());
  const supported = items.filter(item => FIRM_CALENDAR_YEARS.includes(Number(String(item.date || '').slice(0, 4))));
  if (!supported.length) return null;
  return [...supported].sort((a, b) => {
    const aDate = firmCalendarDateFromISO(a.date);
    const bDate = firmCalendarDateFromISO(b.date);
    const aSameYear = aDate.getUTCFullYear() === today.getUTCFullYear() ? 0 : 1;
    const bSameYear = bDate.getUTCFullYear() === today.getUTCFullYear() ? 0 : 1;
    return aSameYear - bSameYear || Math.abs(aDate - today) - Math.abs(bDate - today) || a.date.localeCompare(b.date);
  })[0];
}

// Filing deadlines -------------------------------------------------------------
// Federal due dates for calendar-year filers. A date that lands on a weekend
// or a Washington, D.C. legal holiday moves to the next business day, as the
// IRS does (that's why April 15 sometimes becomes April 17 or 18).

function nthWeekdayISO(year, month, weekday, n) {
  // n = 1..4 for first..fourth, -1 for last. month is 1-12, weekday 0=Sunday.
  if (n > 0) {
    const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const day = 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const lastDay = new Date(Date.UTC(year, month, 0));
  const back = (lastDay.getUTCDay() - weekday + 7) % 7;
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay.getUTCDate() - back).padStart(2, '0')}`;
}

function observedHolidayISO(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const dow = date.getUTCDay();
  if (dow === 6) date.setUTCDate(day - 1);
  if (dow === 0) date.setUTCDate(day + 1);
  return date.toISOString().slice(0, 10);
}

const federalHolidayCache = {};
function federalHolidays(year) {
  if (!federalHolidayCache[year]) {
    federalHolidayCache[year] = new Set([
      observedHolidayISO(year, 1, 1),
      nthWeekdayISO(year, 1, 1, 3),   // Martin Luther King Jr. Day
      nthWeekdayISO(year, 2, 1, 3),   // Washington's Birthday
      observedHolidayISO(year, 4, 16), // D.C. Emancipation Day
      nthWeekdayISO(year, 5, 1, -1),  // Memorial Day
      observedHolidayISO(year, 6, 19),
      observedHolidayISO(year, 7, 4),
      nthWeekdayISO(year, 9, 1, 1),   // Labor Day
      nthWeekdayISO(year, 10, 1, 2),  // Columbus Day
      observedHolidayISO(year, 11, 11),
      nthWeekdayISO(year, 11, 4, 4),  // Thanksgiving
      observedHolidayISO(year, 12, 25),
      observedHolidayISO(year + 1, 1, 1), // Jan 1 that is observed on Dec 31
    ]);
  }
  return federalHolidayCache[year];
}

// Returns the ISO date a deadline actually falls on.
function taxDeadlineDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  for (;;) {
    const iso = date.toISOString().slice(0, 10);
    const dow = date.getUTCDay();
    if (dow !== 0 && dow !== 6 && !federalHolidays(date.getUTCFullYear()).has(iso)) return iso;
    date.setUTCDate(date.getUTCDate() + 1);
  }
}

// Deadlines shown on the calendar for one calendar year.
const FILING_DEADLINES = [
  [1, 15, 'Q4 estimated tax (prior year)'],
  [1, 31, 'W-2, 1099-NEC to recipients and IRS'],
  [3, 15, '1065, 1120-S due (or extend)'],
  [4, 15, '1040, 1120, 1041, 709 due (or extend) · Q1 estimate'],
  [5, 15, '990 due (or extend)'],
  [6, 15, 'Q2 estimated tax'],
  [9, 15, 'Extended 1065, 1120-S due · Q3 estimate'],
  [9, 30, 'Extended 1041 due'],
  [10, 15, 'Extended 1040, 1120 due'],
  [11, 15, 'Extended 990 due'],
];

const filingDeadlineCache = {};
function filingDeadlinesFor(year) {
  if (!filingDeadlineCache[year]) {
    const byDate = {};
    FILING_DEADLINES.forEach(([month, day, label]) => {
      const iso = taxDeadlineDate(year, month, day);
      (byDate[iso] = byDate[iso] || []).push(label);
    });
    filingDeadlineCache[year] = byDate;
  }
  return filingDeadlineCache[year];
}

function filingDeadlinesOn(iso) {
  return filingDeadlinesFor(Number(iso.slice(0, 4)))[iso] || [];
}

// Needs attention ------------------------------------------------------------
// Flags scheduled work that has stalled, using the statuses preparers already
// set on the Firm Calendar. Staff see their own and unassigned clients;
// administrators see the whole firm.
const NEEDS_ATTENTION_RULES = {
  'waiting-on-reports': 7,
  '8879-sent': 7,
  'waiting-for-signature': 7,
  'signed': 3,
  'ready-to-e-file': 2,
  'e-filed': 3,   // no acceptance yet
  'rejected': 0,  // needs fixing straight away
};
// Statuses that mean the work is finished.
const FINISHED_CALENDAR_STATUSES = new Set(['completed', 'accepted']);

// Individual extensions run to October 15 (moved to the next business day).
// Remind from September 15 so there is a month to finish.
function extensionReminder(item, todayISO) {
  const year = Number(String(item.date).slice(0, 4));
  if (!year) return null;
  const due = taxDeadlineDate(year, 10, 15);
  const remindFrom = `${year}-09-15`;
  if (todayISO < remindFrom) return null;
  const days = daysBetweenISO(todayISO, due);
  const reason = days >= 0
    ? `Extension filed · extended deadline ${firmCalendarFormatDate(firmCalendarDateFromISO(due), { month: 'short', day: 'numeric' })} (${days} day${days === 1 ? '' : 's'} left)`
    : `Extension filed · extended deadline passed ${-days} day${days === -1 ? '' : 's'} ago`;
  return { item, days: Math.max(0, -days), reason };
}
let needsAttentionItems = [];

function localISODate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function daysBetweenISO(fromISO, toISO) {
  const [fy, fm, fd] = String(fromISO).split('-').map(Number);
  const [ty, tm, td] = String(toISO).split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

function findNeedsAttention(assignments, todayISO, user) {
  const me = String(user?.username || '').toLowerCase();
  const admin = user?.role === 'administrator';
  const out = [];
  for (const item of assignments || []) {
    const owner = String(item.preparerUsername || '').toLowerCase();
    if (!admin && owner && owner !== me) continue;
    const status = item.status || '';
    if (FINISHED_CALENDAR_STATUSES.has(status)) continue;
    const plural = n => `${n} day${n === 1 ? '' : 's'}`;
    if (status === 'extension-filed') {
      const reminder = extensionReminder(item, todayISO);
      if (reminder) out.push(reminder);
    } else if (status === 'rejected') {
      const days = daysBetweenISO(item.statusSince || item.date, todayISO);
      out.push({ item, days, reason: `E-file rejected ${days ? `${plural(days)} ago` : 'today'}` });
    } else if (NEEDS_ATTENTION_RULES[status] !== undefined) {
      // Older entries have no status date; fall back to the scheduled date.
      const since = item.statusSince || item.date;
      const days = daysBetweenISO(since, todayISO);
      if (days >= NEEDS_ATTENTION_RULES[status]) {
        out.push({ item, days, reason: `${firmCalendarStatusLabel(status)} for ${plural(days)}` });
      }
    } else if (item.date < todayISO) {
      const days = daysBetweenISO(item.date, todayISO);
      out.push({ item, days, reason: `${status ? firmCalendarStatusLabel(status) + ', s' : 'S'}cheduled ${plural(days)} ago` });
    }
  }
  return out.sort((a, b) => b.days - a.days || String(a.item.clientName).localeCompare(String(b.item.clientName)));
}

function needsAttentionSnoozeKey() {
  return `babyfilecab-needs-attention-snooze:${String(currentUser?.username || '').toLowerCase()}`;
}

async function refreshNeedsAttention({ atSignIn = false, open = false } = {}) {
  if (!currentUser) return;
  const generation = sessionGeneration;
  const assignments = await backend().GetFirmCalendar2026();
  if (!firmCalendarPreparers.length) firmCalendarPreparers = await backend().ListCompanyUsers().catch(() => []);
  if (generation !== sessionGeneration) return;
  needsAttentionItems = findNeedsAttention(assignments, localISODate(), currentUser);
  const button = $('needsAttentionBtn');
  $('needsAttentionCount').textContent = String(needsAttentionItems.length);
  button.classList.toggle('hidden', needsAttentionItems.length === 0);
  const snoozed = localStorage.getItem(needsAttentionSnoozeKey()) === localISODate();
  if (open || (atSignIn && needsAttentionItems.length && !snoozed)) showNeedsAttention();
}

function showNeedsAttention() {
  const count = needsAttentionItems.length;
  const scope = currentUser?.role === 'administrator' ? 'across the firm' : 'for you and unassigned clients';
  $('needsAttentionSummary').textContent = count
    ? `${count} scheduled item${count === 1 ? '' : 's'} ${scope} ${count === 1 ? 'has' : 'have'} been waiting or ${count === 1 ? 'is' : 'are'} past due.`
    : `Nothing needs attention ${scope}.`;
  const list = $('needsAttentionList');
  list.replaceChildren();
  needsAttentionItems.forEach((entry, index) => {
    const li = document.createElement('li');
    li.className = 'needs-attention-item';
    const body = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = entry.item.clientName || `Client ${entry.item.clientId}`;
    const meta = document.createElement('span');
    const preparer = entry.item.preparerUsername ? calendarPreparerName(entry.item.preparerUsername) : 'Unassigned';
    meta.textContent = `${entry.reason} · ${firmCalendarFormatDate(firmCalendarDateFromISO(entry.item.date), { month: 'short', day: 'numeric', year: 'numeric' })} · ${preparer}`;
    body.append(name, meta);
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'secondary';
    open.textContent = 'Open';
    open.dataset.needsAttentionIndex = String(index);
    li.append(body, open);
    list.appendChild(li);
  });
  $('needsAttentionSnooze').checked = localStorage.getItem(needsAttentionSnoozeKey()) === localISODate();
  $('needsAttentionBackdrop').classList.remove('hidden');
  setTimeout(() => $('needsAttentionClose').focus(), 20);
}

function hideNeedsAttention() {
  const backdrop = $('needsAttentionBackdrop');
  if (!backdrop || backdrop.classList.contains('hidden')) return;
  try {
    if ($('needsAttentionSnooze').checked) localStorage.setItem(needsAttentionSnoozeKey(), localISODate());
    else localStorage.removeItem(needsAttentionSnoozeKey());
  } catch (_) {}
  backdrop.classList.add('hidden');
}

async function openNeedsAttentionItem(index) {
  const entry = needsAttentionItems[Number(index)];
  hideNeedsAttention();
  await showFirmCalendar();
  if (entry) {
    const fresh = firmCalendarAssignments.find(a => a.date === entry.item.date && a.clientId === entry.item.clientId) || entry.item;
    focusFirmCalendarOnAssignment(fresh, { showClient: true });
  }
}

function focusFirmCalendarOnAssignment(item, { showClient = false } = {}) {
  if (!item) return false;
  const date = firmCalendarDateFromISO(item.date);
  const targetYear = date.getUTCFullYear();
  if (!FIRM_CALENDAR_YEARS.includes(targetYear)) return false;
  if (targetYear !== firmCalendarYear) setFirmCalendarYear(targetYear);
  const index = firmCalendarWeekStarts.findIndex(start => date >= start && date <= firmCalendarWeekEnd(start));
  if (index < 0) return false;
  firmCalendarWeekIndex = index;
  if (firmCalendarPreparerView !== '*') firmCalendarPreparerView = item.preparerUsername || '';
  $('firmCalendarSearch').value = '';
  renderCalendarPreparerMenu();
  renderFirmCalendarWeek();
  if (showClient) showFirmCalendarClientDocuments(item.clientId);
  return true;
}

async function showFirmCalendar() {
  if (!currentUser) return;
  // Refresh the exact same shared company schedule that Search -> Go to Calendar uses.
  // On first open, focus the calendar on a real saved assignment instead of leaving
  // the user on an empty current week.
  await refreshTree();
  firmCalendarSelectedClientID = '';
  $('firmCalendarSearch').value = '';
  firmCalendarPreparers = await backend().ListCompanyUsers();
  firmCalendarPreparerView = '*';
  firmCalendarAssignments = await backend().GetFirmCalendar2026();

  const nowYear = new Date().getFullYear();
  if (FIRM_CALENDAR_YEARS.includes(nowYear)) firmCalendarYear = nowYear;
  else if (!FIRM_CALENDAR_YEARS.includes(firmCalendarYear)) firmCalendarYear = FIRM_CALENDAR_YEARS[FIRM_CALENDAR_YEARS.length - 1];

  setFirmCalendarYear(firmCalendarYear);
  renderCalendarPreparerMenu();
  clearFirmCalendarClientDetail();
  $('firmCalendarBackdrop').classList.remove('hidden');

  const preferred = preferredFirmCalendarAssignment();
  if (!focusFirmCalendarOnAssignment(preferred)) renderFirmCalendarWeek();
  setTimeout(() => $('firmCalendarWeekSelect')?.focus(), 20);
}

function hideFirmCalendar() {
  if (!$('firmCalendarBackdrop').classList.contains('hidden')) refreshNeedsAttention().catch(() => {});
  hideCalendarScheduleClient();
  hideCalendarPreparerReassign();
  $('firmCalendarPreparerMenu').classList.add('hidden');
  $('firmCalendarBackdrop').classList.add('hidden');
}

function clearFirmCalendarClientDetail() {
  firmCalendarSelectedClientID = '';
  $('firmCalendarClientDetail').classList.add('hidden');
  $('firmCalendarClientEmpty').classList.remove('hidden');
  $('firmCalendarClientEmpty').innerHTML = '<div class="empty-icon">🗂️</div><h3>Client Documents</h3><p>Click a client name on the calendar to see that client\'s Permanent Folder and documents organized by tax year.</p>';
  $('firmCalendarClientName').textContent = '';
  $('firmCalendarClientMeta').textContent = '';
  $('firmCalendarClientDocuments').innerHTML = '';
}

// Every status, in the order a return usually moves through them.
// Keep in step with calendarStatuses in calendar_status.go.
const FIRM_CALENDAR_STATUSES = [
  ['drafting', 'Drafting'],
  ['waiting-on-reports', 'Waiting on reports'],
  ['extension-filed', 'Extension filed'],
  ['8879-sent', '8879 Sent'],
  ['waiting-for-signature', 'Waiting for Signature'],
  ['signed', 'Signed'],
  ['ready-to-e-file', 'Ready to E-file'],
  ['e-filed', 'E-filed'],
  ['accepted', 'Accepted'],
  ['rejected', 'Rejected'],
  ['completed', 'Completed'],
];
function firmCalendarStatusLabel(status) {
  const found = FIRM_CALENDAR_STATUSES.find(([value]) => value === status);
  return found ? found[1] : '';
}
function firmCalendarStatusOptionsHTML() {
  return FIRM_CALENDAR_STATUSES.map(([value, label]) => `<option value="status-${value}">${escapeHTML(label)}</option>`).join('');
}
// Fills the calendar right-click menu from FIRM_CALENDAR_STATUSES.
function buildFirmCalendarStatusMenu() {
  const menu = $('firmCalendarContextMenu');
  const clear = menu?.querySelector('[data-calendar-context-action="status-clear"]');
  if (!clear || menu.querySelector('[data-calendar-context-action="status-drafting"]')) return;
  let after = clear;
  FIRM_CALENDAR_STATUSES.forEach(([value, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.calendarContextAction = `status-${value}`;
    button.textContent = label;
    after.after(button);
    after = button;
  });
}
function firmCalendarStatusBadge(status) {
  if (status === 'completed') return '<span class="firm-calendar-completed" title="Completed" aria-label="Completed">✓</span>';
  const label=firmCalendarStatusLabel(status);
  return label ? `<span class="firm-calendar-work-status calendar-status-${status}">${label}</span>` : '';
}
function searchFirmCalendarAssignments(items, query) {
  const term = String(query || '').trim().toLocaleLowerCase();
  if (!term) return [];
  return items.filter(item => String(item.clientName || '').toLocaleLowerCase().includes(term))
    .sort((a,b) => a.date.localeCompare(b.date) || String(a.clientName).localeCompare(String(b.clientName)));
}
let calendarScheduleClient = null;
function calendarSearchAllClients(clients, query) {
  const term=String(query || '').trim().toLocaleLowerCase();
  return term ? clients.filter(client => client.type === 'client' && (String(client.name || '').toLocaleLowerCase().includes(term) || String(client.clientId || '').toLocaleLowerCase().includes(term))).sort((a,b) => a.name.localeCompare(b.name)) : [];
}
function hideCalendarScheduleClient() { $('calendarScheduleClientBackdrop').classList.add('hidden'); calendarScheduleClient=null; }
function showCalendarScheduleClient(clientID) {
  const client=treeData.find(client => client.type === 'client' && client.clientId === clientID);
  if (!client) { toast('Client no longer available. Refresh the calendar.',true); return; }
  calendarScheduleClient={...client};
  $('calendarScheduleClientName').textContent=client.name;
  const start=firmCalendarWeekStarts[firmCalendarWeekIndex];
  $('calendarScheduleClientDate').value=start && start.getUTCFullYear()===firmCalendarYear ? firmCalendarISO(start) : `${firmCalendarYear}-01-01`;
  const select=$('calendarScheduleClientPreparer'); select.replaceChildren();
  for (const user of [{username:''},...firmCalendarPreparers]) {
    const option=document.createElement('option'); option.value=user.username; option.textContent=calendarPreparerName(user.username); select.appendChild(option);
  }
  select.value=firmCalendarPreparerView === '*' ? currentUser.username : firmCalendarPreparerView;
  $('calendarScheduleClientBackdrop').classList.remove('hidden'); $('calendarScheduleClientDate').focus();
}
async function saveCalendarScheduleClient() {
  if (!calendarScheduleClient || $('calendarScheduleClientSave').disabled) return;
  const client={...calendarScheduleClient}, date=$('calendarScheduleClientDate').value, username=$('calendarScheduleClientPreparer').value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !FIRM_CALENDAR_YEARS.includes(Number(date.slice(0, 4))) || !$('calendarScheduleClientDate').checkValidity()) { toast(`Choose a valid date in ${firmCalendarYear}.`,true); return; }
  const existing=firmCalendarAssignments.find(item => item.date===date && item.clientId===client.clientId);
  if (existing && !confirm('This client is already scheduled on that date. Update its assigned preparer?')) return;
  const generation=sessionGeneration; $('calendarScheduleClientSave').disabled=true;
  try {
    const assignments=existing ? await backend().ReassignFirmCalendarPreparer2026(date,client.clientId,username) : await backend().AssignClientToFirmCalendarForPreparer2026(date,client.path,username);
    if (generation!==sessionGeneration) return;
    firmCalendarAssignments=assignments; firmCalendarPreparerView=username;
    const selectedDate=firmCalendarDateFromISO(date);
    const index=firmCalendarWeekStarts.findIndex(start => selectedDate>=start && selectedDate<=firmCalendarWeekEnd(start));
    if(index>=0)firmCalendarWeekIndex=index;
    hideCalendarScheduleClient(); renderCalendarPreparerMenu(); renderFirmCalendarWeek(); toast('Client assigned to calendar.');
  } catch(error) {if(generation===sessionGeneration)showError(error);}
  finally { $('calendarScheduleClientSave').disabled=false; }
}

function goToClientOnCalendar(clientID, dateISO) {
  const item=firmCalendarAssignments.find(item => item.clientId===clientID && item.date===dateISO);
  if(!item){toast('This calendar assignment is no longer available.',true);return;}
  if (!focusFirmCalendarOnAssignment(item, { showClient: true })) return;
  const chip=[...$('firmCalendarGrid').querySelectorAll('[data-calendar-assignment-client]')].find(chip => chip.dataset.calendarAssignmentClient===clientID && chip.dataset.calendarAssignmentDate===dateISO);
  chip?.scrollIntoView({block:'nearest',inline:'nearest'});
  chip?.querySelector('button')?.focus({preventScroll:true});
}

let calendarSearchSelectedClient = '';
function calendarSearchSelectedAssignment() {
  const date=$('calendarSearchDateChoice')?.value;
  return firmCalendarAssignments.find(item => item.clientId===calendarSearchSelectedClient && item.date===date);
}
function renderFirmCalendarSearch() {
  const query=$('firmCalendarSearch').value.trim(), results=$('firmCalendarSearchResults');
  results.classList.toggle('hidden',!query);
  if(!query){results.replaceChildren();calendarSearchSelectedClient='';return;}
  const clients=calendarSearchAllClients(treeData,query);
  if(!clients.some(client=>client.clientId===calendarSearchSelectedClient))calendarSearchSelectedClient=clients[0]?.clientId || '';
  const selected=clients.find(client=>client.clientId===calendarSearchSelectedClient);
  const entries=firmCalendarAssignments.filter(item=>item.clientId===calendarSearchSelectedClient).sort((a,b)=>a.date.localeCompare(b.date));
  results.innerHTML=`<div class="calendar-search-summary">${clients.length} matching client${clients.length===1?'':'s'} · All firm clients</div><div class="calendar-search-workspace"><div class="calendar-search-list">${clients.map(client=>{
    const count=firmCalendarAssignments.filter(item=>item.clientId===client.clientId).length;
    return `<button type="button" class="calendar-search-client ${client.clientId===calendarSearchSelectedClient?'is-selected':''}" data-calendar-select-client="${escapeHTML(client.clientId)}" aria-pressed="${client.clientId===calendarSearchSelectedClient}"><strong>${escapeHTML(client.name)}</strong><small>${count ? `${count} scheduled date${count===1?'':'s'}`:'Not scheduled'}</small></button>`;
  }).join('') || '<p>No clients found. Try a different name.</p>'}</div><div class="calendar-search-detail">${selected ? `<h3>${escapeHTML(selected.name)}</h3><p>Select a scheduled entry to open it or make changes.</p>${entries.length ? `<label for="calendarSearchDateChoice">Scheduled date · preparer · status</label><select id="calendarSearchDateChoice">${entries.map(item=>`<option value="${escapeHTML(item.date)}">${escapeHTML(item.date)} · ${escapeHTML(calendarPreparerName(item.preparerUsername))} · ${escapeHTML(firmCalendarStatusLabel(item.status) || 'No status')}</option>`).join('')}</select><div class="calendar-search-actions"><button type="button" class="primary" data-calendar-search-command="go">Go to Calendar</button><select id="calendarSearchEditChoice" aria-label="Change selected assignment"><option value="">Change assignment…</option><option value="preparer">Change preparer</option><option value="date">Move to another date</option><optgroup label="Set status">${firmCalendarStatusOptionsHTML()}<option value="clear">Clear status</option></optgroup></select></div>` : '<p class="calendar-search-empty">This client has no scheduled dates yet.</p>'}<button type="button" class="secondary" data-calendar-schedule-client="${escapeHTML(selected.clientId)}">＋ Assign a Date &amp; Preparer</button>` : '<p>Search for a client to get started.</p>'}</div></div>`;
}
async function setFirmCalendarStatus(item, status) {
  const generation = sessionGeneration;
  try {
    const assignments = await backend().SetFirmCalendarStatus2026(item.date, item.clientId, status);
    if (generation !== sessionGeneration) return;
    firmCalendarAssignments = assignments;
    renderFirmCalendarWeek();
    toast('Calendar status saved.');
  } catch (error) { if (generation === sessionGeneration) showError(error); }
}

function firmCalendarAssignmentsForDate(dateISO) {
  return calendarAssignmentsForPreparer(firmCalendarAssignments, firmCalendarPreparerView)
    .filter(item => item.date === dateISO)
    .sort((a, b) => calendarPreparerName(a.preparerUsername).localeCompare(calendarPreparerName(b.preparerUsername)) || String(a.clientName || '').localeCompare(String(b.clientName || '')));
}

function renderFirmCalendarWeek() {
  if (!firmCalendarWeekStarts.length) return;
  firmCalendarWeekIndex = Math.max(0, Math.min(firmCalendarWeekIndex, firmCalendarWeekStarts.length - 1));
  const start = firmCalendarWeekStarts[firmCalendarWeekIndex];
  const end = firmCalendarWeekEnd(start);
  $('firmCalendarWeekSelect').value = String(firmCalendarWeekIndex);
  $('firmCalendarWeekLabel').textContent = `${firmCalendarFormatDate(start, { month: 'long', day: 'numeric' })} – ${firmCalendarFormatDate(end, { month: 'long', day: 'numeric', year: 'numeric' })}`;
  $('firmCalendarPrevWeek').disabled = firmCalendarWeekIndex === 0 && firmCalendarYear === FIRM_CALENDAR_YEARS[0];
  $('firmCalendarNextWeek').disabled = firmCalendarWeekIndex === firmCalendarWeekStarts.length - 1 && firmCalendarYear === FIRM_CALENDAR_YEARS[FIRM_CALENDAR_YEARS.length - 1];

  const now = new Date();
  const todayISO = firmCalendarISO(firmCalendarUTCDate(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayCards = [];
  for (let offset = 0; offset < 7; offset++) {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + offset);
    const iso = firmCalendarISO(date);
    const inYear = date.getUTCFullYear() === firmCalendarYear;
    const assignments = firmCalendarAssignmentsForDate(iso);
    const clientRows = assignments.length
      ? assignments.map(item => {
          const unavailable = !item.clientPath;
          const selected = item.clientId === firmCalendarSelectedClientID;
          const returnType = String(item.returnType || '').trim().toUpperCase();
          const returnTypeBadge = returnType ? `<span class="firm-calendar-return-type" title="Client return type">${escapeHTML(returnType)}</span>` : '<span class="firm-calendar-return-type is-missing" title="Return type not set">—</span>';
          return `<div class="firm-calendar-preparer-label">${escapeHTML(calendarPreparerName(item.preparerUsername))}</div><div class="firm-calendar-client-chip ${unavailable ? 'is-unavailable' : ''} ${selected ? 'is-selected' : ''} ${item.status === 'completed' ? 'is-completed' : ''}" data-calendar-assignment-date="${iso}" data-calendar-assignment-client="${escapeHTML(item.clientId)}">
            <button class="firm-calendar-client-link" type="button" data-calendar-client-id="${escapeHTML(item.clientId)}" data-calendar-date="${iso}" ${unavailable ? 'disabled' : ''} title="${unavailable ? 'Client is no longer active' : 'View client documents • Right-click to reschedule'}">
              <span class="firm-calendar-client-name">👶 ${escapeHTML(item.clientName || item.clientId)}</span>${firmCalendarStatusBadge(item.status)}
              ${returnTypeBadge}
            </button>
            <button class="firm-calendar-remove" type="button" data-calendar-remove-date="${iso}" data-calendar-remove-client="${escapeHTML(item.clientId)}" title="Remove from this day">×</button>
          </div>`;
        }).join('')
      : '<div class="firm-calendar-no-clients">No clients assigned</div>';

    dayCards.push(`<article class="firm-calendar-day ${inYear ? '' : 'is-outside-year'} ${iso === todayISO ? 'is-today' : ''}">
      <header class="firm-calendar-day-header">
        <div>
          <span class="firm-calendar-day-name">${firmCalendarFormatDate(date, { weekday: 'short' })}</span>
          <strong>${firmCalendarFormatDate(date, { month: 'short', day: 'numeric' })}</strong>
        </div>
        ${inYear ? `<button type="button" class="firm-calendar-add" data-calendar-add-date="${iso}" title="Assign a client to ${iso}">＋</button>` : ''}
      </header>
      ${filingDeadlinesOn(iso).map(label => `<div class="firm-calendar-deadline" title="Federal deadline for calendar-year filers">${escapeHTML(label)}</div>`).join('')}
      <div class="firm-calendar-day-clients">${clientRows}</div>
    </article>`);
  }
  $('firmCalendarGrid').innerHTML = dayCards.join('');
  renderFirmCalendarSearch();
  const yearAssignmentCount = firmCalendarAssignments.filter(item => Number(String(item.date || '').slice(0, 4)) === firmCalendarYear).length;
  $('firmCalendarStatus').textContent = `${yearAssignmentCount} assignment${yearAssignmentCount === 1 ? '' : 's'} in the ${firmCalendarYear} company calendar. Multiple clients can be assigned to the same day.`;
}

async function firmCalendarAssignClient(dateISO) {
  // Temporarily hide the calendar while the existing client picker is active so
  // the picker remains the top-most Wails modal.
  $('firmCalendarBackdrop').classList.add('hidden');
  let client = null;
  try {
    client = await chooseClient('Assign Client to Firm Calendar', `Choose a client to schedule for ${firmCalendarFormatDate(firmCalendarDateFromISO(dateISO), { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.`);
  } finally {
    $('firmCalendarBackdrop').classList.remove('hidden');
  }
  if (!client) return;
  firmCalendarAssignments = await backend().AssignClientToFirmCalendarForPreparer2026(dateISO, client.path, firmCalendarPreparerView === '*' ? currentUser.username : firmCalendarPreparerView);
  renderFirmCalendarWeek();
  toast(`${client.name} assigned to ${firmCalendarFormatDate(firmCalendarDateFromISO(dateISO), { month: 'short', day: 'numeric' })}.`);
}

async function firmCalendarRemoveClient(dateISO, clientID) {
  const item = firmCalendarAssignments.find(a => a.date === dateISO && a.clientId === clientID);
  if (!item) return;
  if (!confirm(`Remove ${item.clientName || 'this client'} from ${firmCalendarFormatDate(firmCalendarDateFromISO(dateISO), { month: 'long', day: 'numeric', year: 'numeric' })}?`)) return;
  firmCalendarAssignments = await backend().RemoveClientFromFirmCalendar2026(dateISO, clientID);
  if (firmCalendarSelectedClientID === clientID && !firmCalendarAssignments.some(a => a.clientId === clientID)) clearFirmCalendarClientDetail();
  renderFirmCalendarWeek();
}

function showFirmCalendarContextMenu(dateISO, clientID, x, y) {
  const item = firmCalendarAssignments.find(a => a.date === dateISO && a.clientId === clientID);
  if (!item) return;
  firmCalendarContextAssignment = item;
  const label = $('firmCalendarContextLabel');
  if (label) label.textContent = `${item.clientName || item.clientId}${item.returnType ? ` • ${String(item.returnType).toUpperCase()}` : ''}`;

  // Keep the status check mark in sync with this specific calendar assignment.
  // An empty status means "Clear Status" is the currently selected menu item.
  const selectedAction = item.status ? `status-${item.status}` : 'status-clear';
  $('firmCalendarContextMenu').querySelectorAll('button[data-calendar-context-action^="status-"]').forEach(button => {
    const selected = button.dataset.calendarContextAction === selectedAction;
    button.classList.toggle('is-current-status', selected);
    button.setAttribute('aria-checked', selected ? 'true' : 'false');
  });

  positionContextMenu($('firmCalendarContextMenu'), x, y);
}

function hideFirmCalendarReassign() {
  $('firmCalendarReassignBackdrop').classList.add('hidden');
}

function firmCalendarWeekIndexForDate(dateISO) {
  const target = firmCalendarDateFromISO(dateISO);
  for (let i = 0; i < firmCalendarWeekStarts.length; i++) {
    const start = firmCalendarWeekStarts[i];
    const end = firmCalendarWeekEnd(start);
    if (target >= start && target <= end) return i;
  }
  return firmCalendarWeekIndex;
}

function showFirmCalendarReassign() {
  const item = firmCalendarContextAssignment;
  if (!item) return;
  hideAllContextMenus();
  $('firmCalendarReassignClient').textContent = item.clientName || item.clientId;
  $('firmCalendarReassignCurrent').textContent = firmCalendarFormatDate(firmCalendarDateFromISO(item.date), { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  $('firmCalendarReassignDate').value = item.date;
  $('firmCalendarReassignSave').disabled = true;
  $('firmCalendarReassignBackdrop').classList.remove('hidden');
  setTimeout(() => $('firmCalendarReassignDate')?.focus(), 20);
}

function updateFirmCalendarReassignConfirmation() {
  const item = firmCalendarContextAssignment;
  const newDate = $('firmCalendarReassignDate').value;
  $('firmCalendarReassignSave').disabled = !item || !newDate || newDate === item.date;
}

async function saveFirmCalendarReassign() {
  const item = firmCalendarContextAssignment;
  if (!item) return;
  const newDate = $('firmCalendarReassignDate').value;
  if (!newDate) { toast('Choose a new date.', true); return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || !FIRM_CALENDAR_YEARS.includes(Number(newDate.slice(0, 4)))) { toast(`Firm Calendar dates must be between ${FIRM_CALENDAR_YEARS[0]} and ${FIRM_CALENDAR_YEARS[FIRM_CALENDAR_YEARS.length - 1]}.`, true); return; }
  try {
    firmCalendarAssignments = await backend().ReassignClientInFirmCalendar2026(item.date, newDate, item.clientId);
    firmCalendarContextAssignment = firmCalendarAssignments.find(a => a.date === newDate && a.clientId === item.clientId) || null;
    const movedYear = firmCalendarDateFromISO(newDate).getUTCFullYear();
    if (FIRM_CALENDAR_YEARS.includes(movedYear) && movedYear !== firmCalendarYear) setFirmCalendarYear(movedYear);
    firmCalendarWeekIndex = firmCalendarWeekIndexForDate(newDate);
    hideFirmCalendarReassign();
    renderFirmCalendarWeek();
    toast(`${item.clientName || 'Client'} moved to ${firmCalendarFormatDate(firmCalendarDateFromISO(newDate), { weekday: 'short', month: 'short', day: 'numeric' })}.`);
  } catch (e) {
    showError(e);
  }
}

function findFirmCalendarClient(clientID) {
  return treeData.find(node => node.type === 'client' && node.clientId === clientID) || null;
}

function flattenCalendarDocuments(node, prefix = '') {
  const out = [];
  for (const child of node?.children || []) {
    const location = prefix ? `${prefix} / ${child.name}` : child.name;
    if (child.type === 'file') out.push({ node: child, location: prefix || node.name });
    else out.push(...flattenCalendarDocuments(child, location));
  }
  return out;
}

function renderFirmCalendarDocumentGroup(title, node, kind = 'year') {
  const docs = flattenCalendarDocuments(node);
  const rows = docs.length
    ? docs.map(({ node: doc, location }) => `<button type="button" class="firm-calendar-document-row" data-calendar-document-path="${escapeHTML(doc.path)}">
        <span class="firm-calendar-document-icon">${escapeHTML(iconFor(doc))}</span>
        <span class="firm-calendar-document-copy"><strong>${escapeHTML(doc.name)}</strong><small>${escapeHTML(location || title)}</small></span>
      </button>`).join('')
    : '<div class="firm-calendar-documents-empty">No documents in this area.</div>';
  return `<section class="firm-calendar-document-group ${kind}">
    <h4>${escapeHTML(title)}</h4>
    <div>${rows}</div>
  </section>`;
}

function showFirmCalendarClientDocuments(clientID) {
  const client = findFirmCalendarClient(clientID);
  firmCalendarSelectedClientID = clientID;
  renderFirmCalendarWeek();
  if (!client) {
    $('firmCalendarClientEmpty').classList.remove('hidden');
    $('firmCalendarClientDetail').classList.add('hidden');
    $('firmCalendarClientEmpty').innerHTML = '<div class="empty-icon">⚠️</div><h3>Client unavailable</h3><p>This scheduled client is no longer in the active client tree. Remove the assignment or unarchive the client first.</p>';
    return;
  }

  $('firmCalendarClientEmpty').classList.add('hidden');
  $('firmCalendarClientDetail').classList.remove('hidden');
  $('firmCalendarClientName').textContent = client.name;
  const assignment = firmCalendarAssignments.find(item => item.clientId === clientID);
  const returnType = assignment?.returnType ? String(assignment.returnType).toUpperCase() : '—';
  $('firmCalendarClientMeta').textContent = `Client ID ${client.clientId || '—'} • Return Type ${returnType} • Click a document below to open it in BabyFileCab.`;

  const permanent = (client.children || []).find(child => child.type === 'permanent');
  const years = (client.children || []).filter(child => child.type === 'taxyear');
  const clientSections = (client.children || []).filter(child => child.type === 'section');
  const groups = [];
  if (permanent) groups.push(renderFirmCalendarDocumentGroup('Permanent Folder', permanent, 'permanent'));
  for (const year of years) groups.push(renderFirmCalendarDocumentGroup(`Tax Year ${year.name}`, year, 'year'));
  for (const section of clientSections) groups.push(renderFirmCalendarDocumentGroup(section.name, section, 'section'));
  $('firmCalendarClientDocuments').innerHTML = groups.length ? groups.join('') : '<div class="firm-calendar-documents-empty">No client folders are available yet.</div>';
}

async function openFirmCalendarClientInTree() {
  const client = findFirmCalendarClient(firmCalendarSelectedClientID);
  if (!client) return;
  hideFirmCalendar();
  $('treeSearch').value = '';
  expanded.add(client.path);
  await refreshTree(client.path);
}

async function openFirmCalendarDocument(path) {
  if (!path) return;
  hideFirmCalendar();
  $('treeSearch').value = '';
  expandAncestors(path);
  await refreshTree(path);
}
