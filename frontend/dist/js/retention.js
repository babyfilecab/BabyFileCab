// Record keeping: tax years past the firm's period, for review.

let retentionItems = [];
let retentionSettings = { years: 7, held: [] };

// Once a month at most, administrators are told how many tax years are ready
// to review.
async function checkRetentionReminder() {
  if (!currentUser || !isAdministrator()) return;
  const generation = sessionGeneration;
  try {
    const [settings, items] = await Promise.all([backend().GetRetentionSettings(), backend().ListRetentionDue()]);
    if (generation !== sessionGeneration) return;
    const due = (items || []).filter(i => !i.held).length;
    if (!due || !retentionReminderDue(settings.remindedOn, localISODate())) return;
    $('retentionBannerText').textContent = `${due} client tax year${due === 1 ? ' is' : 's are'} past your ${settings.years}-year record-keeping period.`;
    $('retentionBanner').classList.remove('hidden');
  } catch (_) { /* try again next sign-in */ }
}

// True when the reminder was never dismissed or was dismissed 30+ days ago.
function retentionReminderDue(remindedOn, today) {
  if (!remindedOn) return true;
  const days = (Date.parse(today) - Date.parse(remindedOn)) / 86400000;
  return !(days < 30);
}

async function showRetention() {
  const [settings, items] = await Promise.all([backend().GetRetentionSettings(), backend().ListRetentionDue()]);
  retentionSettings = settings; retentionItems = items || [];
  $('retentionYears').value = String(settings.years);
  $('retentionYears').disabled = !isAdministrator();
  $('retentionShow').value = 'due';
  $('retentionSearch').value = '';
  renderRetention();
  $('retentionBackdrop').classList.remove('hidden');
}

function hideRetention() { $('retentionBackdrop').classList.add('hidden'); }

function renderRetention() {
  const show = $('retentionShow').value, q = $('retentionSearch').value.trim().toLowerCase();
  const rows = retentionItems
    .filter(i => show === 'all' || (show === 'held') === Boolean(i.held))
    .filter(i => !q || String(i.clientName).toLowerCase().includes(q) || String(i.clientId).includes(q));
  const due = retentionItems.filter(i => !i.held).length, held = retentionItems.length - due;
  $('retentionSummary').textContent = `${due} ready to review${held ? `, ${held} on hold` : ''}. Moving a tax year to the Recycle Bin keeps it for 30 days before it's gone.`;
  const admin = isAdministrator();
  $('retentionBody').replaceChildren(...rows.map(i => {
    const tr = document.createElement('tr');
    const cell = text => { const td = document.createElement('td'); td.textContent = text; return td; };
    const actions = document.createElement('td'); actions.className = 'retention-actions';
    const button = (label, act, cls = 'secondary') => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = label; b.dataset.retentionAction = act; b.dataset.path = i.path; return b; };
    actions.append(button('Open', 'open'));
    if (admin) actions.append(button(i.held ? 'Release Hold' : 'Keep (Hold)', i.held ? 'release' : 'hold'));
    if (!i.held) actions.append(button('Move to Recycle Bin', 'delete', 'danger'));
    tr.append(cell(`${i.clientName} (${i.clientId})`), cell(i.taxYear), cell(String(i.pastSince)), cell(i.held ? 'On hold' : 'Ready to review'), actions);
    return tr;
  }));
  $('retentionEmpty').classList.toggle('hidden', rows.length > 0);
  $('retentionEmpty').textContent = show === 'held' ? 'No tax years are on hold.' : `No tax years are past the ${retentionSettings.years}-year period.`;
}

async function retentionAction(act, path) {
  const item = retentionItems.find(i => i.path === path);
  if (!item) return;
  if (act === 'open') { hideRetention(); await refreshTree(item.path); return; }
  if (act === 'hold' || act === 'release') {
    retentionSettings = await backend().SetRetentionHold(item.clientId, item.taxYear, act === 'hold');
    item.held = act === 'hold';
    renderRetention();
    toast(act === 'hold' ? `${item.clientName} ${item.taxYear} will be kept.` : `Hold released on ${item.clientName} ${item.taxYear}.`);
    return;
  }
  if (act === 'delete') {
    if (!confirm(`Move ${item.clientName}'s ${item.taxYear} tax year and everything in it to the Recycle Bin? It can be restored for 30 days.`)) return;
    await backend().DeleteTaxYear(item.path);
    retentionItems = retentionItems.filter(i => i !== item);
    renderRetention();
    await refreshTree();
    toast(`${item.clientName} ${item.taxYear} moved to the Recycle Bin.`);
  }
}

function wireRetention() {
  $('retentionClose').addEventListener('click', hideRetention);
  $('retentionCloseTop').addEventListener('click', hideRetention);
  $('retentionBackdrop').addEventListener('click', e => { if (e.target === $('retentionBackdrop')) hideRetention(); });
  $('retentionShow').addEventListener('change', renderRetention);
  $('retentionSearch').addEventListener('input', renderRetention);
  $('retentionYears').addEventListener('change', () => call(async () => {
    retentionSettings = await backend().SetRetentionYears(Number($('retentionYears').value));
    retentionItems = await backend().ListRetentionDue() || [];
    renderRetention();
    toast(`Tax years are now kept ${retentionSettings.years} years after filing.`);
  }));
  $('retentionBody').addEventListener('click', e => {
    const b = e.target.closest('[data-retention-action]');
    if (b) call(() => retentionAction(b.dataset.retentionAction, b.dataset.path));
  });
  $('retentionReview').addEventListener('click', () => call(async () => {
    $('retentionBanner').classList.add('hidden');
    await backend().MarkRetentionReminded();
    await showRetention();
  }));
  $('retentionLater').addEventListener('click', () => call(async () => {
    $('retentionBanner').classList.add('hidden');
    await backend().MarkRetentionReminded();
  }));
}
