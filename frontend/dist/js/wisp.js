// Written Information Security Plan: BabyFileCab fills in what it knows.

const WISP_FIELDS = { devices: 'wispDevices', services: 'wispServices', mfa: 'wispMFA', notes: 'wispNotes' };

async function showWISP() {
  const [input, users] = await Promise.all([backend().GetWISPInput(), backend().ListCompanyUsers()]);
  const select = $('wispCoordinator');
  select.replaceChildren(...(users || []).map(u => new Option(`${[u.firstName, u.lastName].filter(Boolean).join(' ') || u.username} (${displayRole(u.role)})`, u.username)));
  select.value = input.coordinator && [...select.options].some(o => o.value === input.coordinator) ? input.coordinator : String(currentUser?.username || '');
  for (const [key, id] of Object.entries(WISP_FIELDS)) $(id).value = input[key] || '';
  $('wispLastMade').textContent = input.lastMade
    ? `Last prepared ${timeSheetDateLabel(input.lastMade)}. Review the plan at least once a year and whenever your systems or staff change.`
    : 'Your answers are saved, so next year’s review starts from this year’s plan.';
  $('wispBackdrop').classList.remove('hidden');
}

function hideWISP() { $('wispBackdrop').classList.add('hidden'); }

async function makeWISP(format) {
  const input = { coordinator: $('wispCoordinator').value };
  for (const [key, id] of Object.entries(WISP_FIELDS)) input[key] = $(id).value.trim();
  const path = await backend().GenerateWISP(input, format);
  if (!path) return;
  hideWISP();
  toast(`Security plan saved as ${path.split(/[\\/]/).pop()}.`);
}

function wireWISP() {
  $('wispClose').addEventListener('click', hideWISP);
  $('wispCloseTop').addEventListener('click', hideWISP);
  $('wispBackdrop').addEventListener('click', e => { if (e.target === $('wispBackdrop')) hideWISP(); });
  $('wispPdf').addEventListener('click', () => call(() => makeWISP('pdf')));
  $('wispDocx').addEventListener('click', () => call(() => makeWISP('docx')));
}
