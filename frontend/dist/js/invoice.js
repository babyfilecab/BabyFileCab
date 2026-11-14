// Create an Invoice.

function invoiceSelectedUser() {
  const username = $('invoicePreparer').value;
  return invoiceUsers.find(u => String(u.username || '') === username) || null;
}

function invoiceClearClientData() {
  const el = $('invoiceClient');
  el.dataset.name = '';
  el.dataset.address = '';
  el.dataset.phone = '';
  el.dataset.email = '';
  el.dataset.clientId = '';
}

function invoiceMoneyNumber(raw) {
  const cleaned = String(raw || '').replace(/[$,\s]/g, '');
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function invoiceMoney(value) {
  const n = Number(value || 0);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);
}

function invoiceDateDisplay(value) {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  const d = new Date(raw + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return raw;
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(d);
}

// Invoice lines: [{description, quantity, rate, timeEntryIds?}]
let invoiceLines = [];
// Time Sheet entries pulled onto this invoice, by id.
let invoiceTimeEntryIds = new Set();
let invoiceTimeCandidates = [];

function invoiceRound(n) {
  return Math.round(n * 100) / 100;
}

function invoiceLineAmount(line) {
  return invoiceRound(Number(line.quantity || 0) * Number(line.rate || 0));
}

function invoiceTotal() {
  return invoiceRound(invoiceLines.reduce((sum, line) => sum + invoiceLineAmount(line), 0));
}

function invoiceQuantityText(q) {
  const n = Number(q || 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function renderInvoiceLines() {
  const list = $('invoiceLines');
  list.replaceChildren();
  invoiceLines.forEach((line, index) => {
    const row = document.createElement('div');
    row.className = 'invoice-line-edit';
    row.dataset.invoiceLine = String(index);
    const desc = Object.assign(document.createElement('input'), { type: 'text', value: line.description, placeholder: 'Description', className: 'invoice-line-desc' });
    desc.setAttribute('aria-label', `Line ${index + 1} description`);
    const qty = Object.assign(document.createElement('input'), { type: 'number', min: '0', step: '0.25', value: String(line.quantity), className: 'invoice-line-qty' });
    qty.setAttribute('aria-label', `Line ${index + 1} quantity or hours`);
    const rate = Object.assign(document.createElement('input'), { type: 'text', inputMode: 'decimal', value: line.rate ? String(line.rate) : '', placeholder: '0.00', className: 'invoice-line-rate' });
    rate.setAttribute('aria-label', `Line ${index + 1} rate`);
    const amount = Object.assign(document.createElement('span'), { className: 'invoice-line-amount', textContent: invoiceMoney(invoiceLineAmount(line)) });
    const remove = Object.assign(document.createElement('button'), { type: 'button', className: 'secondary invoice-line-remove', textContent: '×', title: 'Remove line' });
    remove.setAttribute('aria-label', `Remove line ${index + 1}`);
    row.append(desc, qty, rate, amount, remove);
    list.appendChild(row);
  });
  updateInvoiceLinesSummary();
}

function updateInvoiceLinesSummary() {
  const billed = invoiceTimeEntryIds.size;
  $('invoiceLinesSummary').textContent = `${invoiceLines.length} line${invoiceLines.length === 1 ? '' : 's'} · Total ${invoiceMoney(invoiceTotal())}${billed ? ` · ${billed} Time Sheet entr${billed === 1 ? 'y' : 'ies'} will be marked billed` : ''}`;
}

// Reads one edited row back into invoiceLines without redrawing, so typing isn't interrupted.
function invoiceLineEdited(row) {
  const line = invoiceLines[Number(row.dataset.invoiceLine)];
  if (!line) return;
  line.description = row.querySelector('.invoice-line-desc').value;
  line.quantity = Math.max(0, Number(row.querySelector('.invoice-line-qty').value || 0));
  line.rate = invoiceMoneyNumber(row.querySelector('.invoice-line-rate').value);
  row.querySelector('.invoice-line-amount').textContent = invoiceMoney(invoiceLineAmount(line));
  updateInvoiceLinesSummary();
  renderInvoicePreview();
}

function addInvoiceLine(line = {}) {
  invoiceLines.push({ description: '', quantity: 1, rate: 0, ...line });
  renderInvoiceLines();
  renderInvoicePreview();
  const inputs = $('invoiceLines').querySelectorAll('.invoice-line-desc');
  if (!line.description) inputs[inputs.length - 1]?.focus();
}

function removeInvoiceLine(index) {
  const [removed] = invoiceLines.splice(index, 1);
  (removed?.timeEntryIds || []).forEach(id => invoiceTimeEntryIds.delete(id));
  if (!invoiceLines.length) invoiceLines.push({ description: '', quantity: 1, rate: 0 });
  renderInvoiceLines();
  renderInvoicePreview();
}

// When a service is picked, name the first empty line after it.
function invoiceServiceChanged() {
  const service = $('invoiceService').value;
  const first = invoiceLines[0];
  const description = ENGAGEMENT_SERVICE_DESCRIPTIONS[service];
  if (first && description && (!first.description || first.autoDescription)) {
    first.description = `${description} — Tax Year ${$('invoiceTaxYear').value}`;
    first.autoDescription = true;
    renderInvoiceLines();
  }
  renderInvoicePreview();
}

async function showInvoiceTimePicker() {
  const clientPath = $('invoiceClient').value;
  if (!clientPath) throw new Error('Choose the client first.');
  const entries = await backend().UnbilledTimeForClient(clientPath) || [];
  invoiceTimeCandidates = entries.filter(e => !invoiceTimeEntryIds.has(e.id));
  const list = $('invoiceTimeList');
  list.replaceChildren();
  invoiceTimeCandidates.forEach(entry => {
    const li = document.createElement('li');
    const label = document.createElement('label');
    const box = Object.assign(document.createElement('input'), { type: 'checkbox', checked: true });
    box.dataset.timeEntry = entry.id;
    const text = document.createElement('span');
    const who = isAdministrator() ? ` · ${calendarPreparerName(entry.username)}` : '';
    text.textContent = `${invoiceDateDisplay(entry.date)} · ${entry.work || 'Work'} · ${Number(entry.hours).toFixed(2)} h${who}`;
    label.append(box, text);
    li.appendChild(label);
    list.appendChild(li);
  });
  $('invoiceTimeEmpty').classList.toggle('hidden', invoiceTimeCandidates.length > 0);
  $('invoiceTimeAdd').disabled = invoiceTimeCandidates.length === 0;
  const hours = invoiceTimeCandidates.reduce((sum, e) => sum + Number(e.hours || 0), 0);
  $('invoiceTimeSummary').textContent = invoiceTimeCandidates.length
    ? `${invoiceTimeCandidates.length} unbilled entr${invoiceTimeCandidates.length === 1 ? 'y' : 'ies'} for this client, ${hours.toFixed(2)} hours.${isAdministrator() ? '' : ' Staff see their own hours only.'}`
    : 'Hours entered for this client that haven\u2019t been billed yet.';
  $('invoiceTimeBackdrop').classList.remove('hidden');
  setTimeout(() => $('invoiceTimeRate').focus(), 20);
}

function hideInvoiceTimePicker() {
  $('invoiceTimeBackdrop').classList.add('hidden');
}

function addInvoiceTimeLines() {
  const rate = invoiceMoneyNumber($('invoiceTimeRate').value);
  if (!(rate > 0)) throw new Error('Enter the hourly rate to bill these hours at.');
  const chosenIds = new Set([...$('invoiceTimeList').querySelectorAll('input[data-time-entry]:checked')].map(b => b.dataset.timeEntry));
  const chosen = invoiceTimeCandidates.filter(e => chosenIds.has(e.id));
  if (!chosen.length) throw new Error('Tick at least one entry.');
  // Drop an empty starter line so the hours aren't below a blank row.
  if (invoiceLines.length === 1 && !invoiceLines[0].description.trim() && !invoiceLines[0].rate) invoiceLines = [];
  if ($('invoiceTimeCombine').checked) {
    const hours = invoiceRound(chosen.reduce((sum, e) => sum + Number(e.hours || 0), 0));
    const first = chosen[0].date, last = chosen[chosen.length - 1].date;
    const span = first === last ? invoiceDateDisplay(first) : `${invoiceDateDisplay(first)} – ${invoiceDateDisplay(last)}`;
    invoiceLines.push({ description: `Professional services, ${span}`, quantity: hours, rate, timeEntryIds: chosen.map(e => e.id) });
  } else {
    chosen.forEach(e => invoiceLines.push({ description: `${e.work || 'Professional services'} (${invoiceDateDisplay(e.date)})`, quantity: Number(e.hours), rate, timeEntryIds: [e.id] }));
  }
  chosen.forEach(e => invoiceTimeEntryIds.add(e.id));
  hideInvoiceTimePicker();
  renderInvoiceLines();
  renderInvoicePreview();
}

// Invoices list -------------------------------------------------------------

let invoiceListItems = [];

async function showInvoiceList() {
  invoiceListItems = await backend().ListInvoices() || [];
  $('invoiceListFilter').value = invoiceListItems.some(i => !i.paid) ? 'unpaid' : 'all';
  $('invoiceListSearch').value = '';
  renderInvoiceList();
  $('invoiceListBackdrop').classList.remove('hidden');
  setTimeout(() => $('invoiceListSearch').focus(), 20);
}

function hideInvoiceList() {
  $('invoiceListBackdrop').classList.add('hidden');
}

function invoiceIsOverdue(item, today = localISODate()) {
  return !item.paid && item.dueDate && item.dueDate < today;
}

function filterInvoiceList(items, filter, query, today = localISODate()) {
  const q = String(query || '').trim().toLowerCase();
  return items.filter(item => {
    if (filter === 'unpaid' && item.paid) return false;
    if (filter === 'paid' && !item.paid) return false;
    if (filter === 'overdue' && !invoiceIsOverdue(item, today)) return false;
    return !q || `${item.number} ${item.clientName}`.toLowerCase().includes(q);
  });
}

function renderInvoiceList() {
  const today = localISODate();
  const shown = filterInvoiceList(invoiceListItems, $('invoiceListFilter').value, $('invoiceListSearch').value, today);
  const body = $('invoiceListBody');
  body.replaceChildren();
  shown.forEach(item => {
    const tr = document.createElement('tr');
    const cell = (text, className = '') => { const td = document.createElement('td'); td.textContent = text; if (className) td.className = className; tr.appendChild(td); return td; };
    cell(item.number);
    cell(item.clientName);
    cell(invoiceDateDisplay(item.invoiceDate));
    cell(invoiceDateDisplay(item.dueDate));
    cell(invoiceMoney(item.total), 'num');
    const status = cell(item.paid ? `Paid ${invoiceDateDisplay(item.paidDate)}` : invoiceIsOverdue(item, today) ? 'Overdue' : 'Unpaid');
    status.classList.add(item.paid ? 'invoice-paid' : invoiceIsOverdue(item, today) ? 'invoice-overdue' : 'invoice-unpaid');
    const actions = document.createElement('td');
    actions.className = 'invoice-list-actions';
    const toggle = Object.assign(document.createElement('button'), { type: 'button', className: 'secondary', textContent: item.paid ? 'Mark Unpaid' : 'Mark Paid' });
    toggle.dataset.invoicePaid = item.number;
    actions.appendChild(toggle);
    if (item.files?.length) {
      const open = Object.assign(document.createElement('button'), { type: 'button', className: 'secondary', textContent: 'Open' });
      open.dataset.invoiceOpen = item.number;
      actions.appendChild(open);
    }
    tr.appendChild(actions);
    body.appendChild(tr);
  });
  $('invoiceListEmpty').classList.toggle('hidden', shown.length > 0);
  const unpaid = invoiceListItems.filter(i => !i.paid);
  const overdue = unpaid.filter(i => invoiceIsOverdue(i, today));
  $('invoiceListSummary').textContent = invoiceListItems.length
    ? `${invoiceListItems.length} invoice${invoiceListItems.length === 1 ? '' : 's'} · ${invoiceMoney(unpaid.reduce((s, i) => s + i.total, 0))} unpaid${overdue.length ? ` · ${overdue.length} overdue` : ''}`
    : 'Invoices you create appear here.';
}

async function toggleInvoicePaid(number) {
  const item = invoiceListItems.find(i => i.number === number);
  if (!item) return;
  let paidDate = '';
  if (!item.paid) {
    paidDate = await ask('Mark Invoice Paid', `Date ${item.number} was paid (YYYY-MM-DD):`, localISODate());
    if (!paidDate) return;
  }
  invoiceListItems = await backend().SetInvoicePaid(number, !item.paid, paidDate.trim()) || [];
  renderInvoiceList();
  toast(item.paid ? `${number} marked unpaid.` : `${number} marked paid.`);
}

async function openInvoiceFile(number) {
  const item = invoiceListItems.find(i => i.number === number);
  const file = item?.files?.find(f => f.toLowerCase().endsWith('.pdf')) || item?.files?.[0];
  if (file) await backend().OpenFile(file);
}

function invoiceAddDaysISO(iso, days) {
  const d = new Date(String(iso || '') + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return localISODate(d);
}



async function showInvoiceGenerator() {
  invoiceClients = await backend().GetTree();
  invoiceClients = (invoiceClients || []).filter(node => node && node.type === 'client');
  if (!invoiceClients.length) {
    toast('Create a client before generating an invoice.', true);
    return;
  }
  invoiceUsers = await backend().ListCompanyUsers();
  await loadFirmServices();
  fillServiceSelect($('invoiceService'));
  $('invoiceCompanyAccount').textContent = currentUser?.companyName || 'BabyFileCab Company';

  const clientSelect = $('invoiceClient');
  clientSelect.replaceChildren();
  engagementAddOption(clientSelect, '', 'Select a client…');
  invoiceClients.forEach(client => {
    const id = client.clientId ? ` (#${client.clientId})` : '';
    engagementAddOption(clientSelect, client.path, `${client.name}${id}`);
  });
  clientSelect.value = '';
  invoiceClearClientData();
  $('invoiceClientSummary').textContent = `${invoiceClients.length} active client${invoiceClients.length === 1 ? '' : 's'} available. Choose one from the dropdown.`;

  const preparerSelect = $('invoicePreparer');
  preparerSelect.replaceChildren();
  engagementAddOption(preparerSelect, '', 'Select a preparer…');
  invoiceUsers.forEach(user => {
    const role = String(user.role || '').toLowerCase().includes('admin') ? 'Administrator' : 'Staff';
    engagementAddOption(preparerSelect, String(user.username || ''), `${engagementPreparerName(user)} — ${role}`);
  });
  preparerSelect.value = '';
  $('invoicePreparerSummary').textContent = 'Choose the preparer responsible for this invoice.';

  const today = localISODate();
  $('invoiceService').value = '';
  fillTaxYearSelect($('invoiceTaxYear'));
  $('invoiceNumber').value = await backend().NextInvoiceNumber();
  $('invoiceDate').value = today;
  $('invoiceDueDate').value = invoiceAddDaysISO(today, 30);
  invoiceLines = [{ description: '', quantity: 1, rate: 0 }];
  invoiceTimeEntryIds = new Set();
  renderInvoiceLines();
  $('invoiceNotes').value = 'Thank you for your business.';
  await refreshInvoiceLogo();
  renderInvoicePreview();
  $('invoiceBackdrop').classList.remove('hidden');
  const invoiceScroll = $('invoiceScrollContent');
  if (invoiceScroll) invoiceScroll.scrollTop = 0;
  setTimeout(() => clientSelect.focus(), 30);
}

function hideInvoiceGenerator() {
  $('invoiceBackdrop').classList.add('hidden');
}

function updateInvoiceLogoUI(info) {
  invoiceLogoDataURL = String(info?.dataURL || '');
  const img = $('invoiceFirmLogoPreview');
  const placeholder = $('invoiceFirmLogoPlaceholder');
  if (invoiceLogoDataURL) {
    img.src = invoiceLogoDataURL;
    img.classList.remove('hidden');
    placeholder.classList.add('hidden');
    $('invoiceRemoveLogo').disabled = false;
  } else {
    img.removeAttribute('src');
    img.classList.add('hidden');
    placeholder.classList.remove('hidden');
    $('invoiceRemoveLogo').disabled = true;
  }
  renderInvoicePreview();
}

async function refreshInvoiceLogo() {
  const info = await backend().GetEngagementLetterLogo();
  updateInvoiceLogoUI(info || {});
}

async function browseInvoiceLogo() {
  const info = await backend().ChooseEngagementLetterLogo();
  if (info?.dataURL) {
    updateInvoiceLogoUI(info);
    toast('Firm logo added to the invoice.');
  }
}

async function removeInvoiceLogo() {
  await backend().ClearEngagementLetterLogo();
  updateInvoiceLogoUI({});
  toast('Firm logo removed.');
}

async function refreshInvoiceClient() {
  const path = $('invoiceClient').value;
  // Hours belong to one client; drop any pulled in for the previous one.
  if (invoiceTimeEntryIds.size) {
    invoiceLines = invoiceLines.filter(line => !line.timeEntryIds?.length);
    if (!invoiceLines.length) invoiceLines.push({ description: '', quantity: 1, rate: 0 });
    invoiceTimeEntryIds = new Set();
    renderInvoiceLines();
  }
  if (!path) {
    invoiceClearClientData();
    $('invoiceClientSummary').textContent = `${invoiceClients.length} active client${invoiceClients.length === 1 ? '' : 's'} available. Choose one from the dropdown.`;
    $('invoicePreviewClient').textContent = 'Select a client';
    return;
  }
  const props = await backend().GetClientProperties(path);
  const el = $('invoiceClient');
  el.dataset.name = props.name || '';
  el.dataset.address = props.address || '';
  el.dataset.phone = props.phone || '';
  el.dataset.email = props.email || '';
  el.dataset.clientId = props.clientId || '';
  const details = [props.address, props.phone, props.email].filter(Boolean);
  $('invoiceClientSummary').textContent = details.length ? details.join('  •  ') : 'Client selected. No address, phone number, or email is saved in this client profile.';
  $('invoicePreviewClient').textContent = props.name || 'Client';
}

function refreshInvoicePreparer() {
  const user = invoiceSelectedUser();
  if (!user) {
    $('invoicePreparerSummary').textContent = 'Choose the preparer responsible for this invoice.';
    return;
  }
  const details = [engagementPreparerName(user), ...engagementPreparerAddress(user)].filter(Boolean);
  $('invoicePreparerSummary').textContent = details.length ? details.join('  •  ') : 'Preparer selected.';
}

function invoicePreviewData() {
  const clientEl = $('invoiceClient');
  const user = invoiceSelectedUser();
  const service = $('invoiceService').value;
  const serviceDescription = ENGAGEMENT_SERVICE_DESCRIPTIONS[service] || service || '';
  return {
    companyName: currentUser?.companyName || 'CPA Firm',
    logoDataURL: invoiceLogoDataURL,
    clientName: clientEl.dataset.name || '',
    clientAddress: clientEl.dataset.address || '',
    clientPhone: clientEl.dataset.phone || '',
    clientEmail: clientEl.dataset.email || '',
    clientId: clientEl.dataset.clientId || '',
    preparerName: engagementPreparerName(user),
    preparerLines: engagementPreparerAddress(user),
    service,
    serviceDescription,
    taxYear: $('invoiceTaxYear').value,
    invoiceNumber: $('invoiceNumber').value.trim(),
    invoiceDate: $('invoiceDate').value,
    dueDate: $('invoiceDueDate').value,
    lines: invoiceLines.filter(line => line.description.trim() || line.rate),
    total: invoiceTotal(),
    notes: $('invoiceNotes').value.trim(),
  };
}

function renderInvoicePreview() {
  const data = invoicePreviewData();
  $('invoicePreviewClient').textContent = data.clientName || 'Select a client';
  $('invoicePreviewService').textContent = data.service || 'Service';
  const logo = data.logoDataURL ? `<div class="letter-logo-wrap"><img class="letter-logo" src="${data.logoDataURL}" alt="${escapeHTML(data.companyName)} logo"></div>` : '';
  const preparerLines = data.preparerLines.map(line => `<div class="letter-contact">${escapeHTML(line)}</div>`).join('');
  const clientLines = [data.clientAddress, data.clientPhone, data.clientEmail].filter(Boolean).map(line => `<div class="letter-contact">${escapeHTML(line)}</div>`).join('');
  const lineRows = data.lines.map(line => `<div class="invoice-line-row"><span>${escapeHTML(line.description || '—')}</span><span>${escapeHTML(invoiceQuantityText(line.quantity))}</span><span>${escapeHTML(invoiceMoney(line.rate))}</span><strong>${escapeHTML(invoiceMoney(invoiceLineAmount(line)))}</strong></div>`).join('');
  const ready = Boolean(data.clientName && data.preparerName && data.service && data.invoiceNumber && data.invoiceDate && data.dueDate && data.total > 0 && data.lines.length && data.lines.every(l => l.description.trim() && l.quantity > 0));
  $('invoicePreview').innerHTML = `
    <div class="invoice-preview-top">
      <div>${logo}<div class="letter-firm">${escapeHTML(data.companyName)}</div><div class="letter-preparer-name">${escapeHTML(data.preparerName || 'Preparer')}</div>${preparerLines}</div>
      <div class="invoice-preview-title"><strong>INVOICE</strong><span># ${escapeHTML(data.invoiceNumber || '—')}</span></div>
    </div>
    <div class="invoice-meta-grid"><div><span>Invoice Date</span><strong>${escapeHTML(invoiceDateDisplay(data.invoiceDate))}</strong></div><div><span>Due Date</span><strong>${escapeHTML(invoiceDateDisplay(data.dueDate))}</strong></div><div><span>Tax Year</span><strong>${escapeHTML(data.taxYear || '—')}</strong></div></div>
    <div class="invoice-billto"><span>BILL TO</span><strong>${escapeHTML(data.clientName || 'Select a client')}</strong>${clientLines}</div>
    <div class="invoice-line-head"><span>Description</span><span>Qty</span><span>Rate</span><span>Amount</span></div>
    ${lineRows || '<div class="invoice-line-row"><span>Add a line above</span><span></span><span></span><strong></strong></div>'}
    <div class="invoice-total"><span>Total Due</span><strong>${escapeHTML(invoiceMoney(data.total))}</strong></div>
    ${data.notes ? `<div class="invoice-note"><strong>Note</strong><p>${escapeHTML(data.notes)}</p></div>` : ''}
    ${ready ? '' : '<div class="engagement-preview-empty"><strong>Complete the invoice form above.</strong><span>Select a client, preparer, service and dates, and give every line a description, quantity and rate.</span></div>'}`;
}

async function invoiceSelectionChanged({ client = false, preparer = false } = {}) {
  if (client) await refreshInvoiceClient();
  if (preparer) refreshInvoicePreparer();
  renderInvoicePreview();
}

function buildInvoiceRequest() {
  const data = invoicePreviewData();
  const clientPath = $('invoiceClient').value;
  const preparerUsername = $('invoicePreparer').value;
  if (!clientPath) throw new Error('Choose a client from the Client dropdown.');
  if (!preparerUsername) throw new Error('Choose a preparer from the Preparer dropdown.');
  if (!ENGAGEMENT_SERVICES.includes(data.service)) throw new Error('Choose a service from the Service dropdown.');
  if (!data.invoiceNumber) throw new Error('Enter an invoice number.');
  if (!data.invoiceDate) throw new Error('Choose an invoice date.');
  if (!data.dueDate) throw new Error('Choose a due date.');
  if (data.dueDate < data.invoiceDate) throw new Error('The due date cannot be earlier than the invoice date.');
  if (!data.lines.length) throw new Error('Add at least one line to the invoice.');
  data.lines.forEach((line, i) => {
    if (!line.description.trim()) throw new Error(`Give line ${i + 1} a description.`);
    if (!(line.quantity > 0)) throw new Error(`Line ${i + 1} needs a quantity or hours greater than zero.`);
  });
  if (!(data.total > 0)) throw new Error('The invoice total must be more than $0.00.');
  return {
    clientPath,
    preparerUsername,
    service: data.service,
    taxYear: data.taxYear,
    invoiceNumber: data.invoiceNumber,
    invoiceDate: data.invoiceDate,
    dueDate: data.dueDate,
    lines: data.lines.map(line => ({ description: line.description.trim(), quantity: Number(line.quantity), rate: Number(line.rate) })),
    notes: $('invoiceNotes').value.trim(),
    outputPath: '',
    timeEntryIds: [...invoiceTimeEntryIds],
  };
}

async function generateInvoice(kind) {
  const buttons = [$('invoiceGeneratePDF'), $('invoiceGenerateWord')];
  try {
    const req = buildInvoiceRequest();
    const chosen = await backend().ChooseInvoiceSavePath(kind, req.clientPath, req.taxYear, req.invoiceNumber);
    if (!chosen) return;
    req.outputPath = chosen;
    buttons.forEach(button => button.disabled = true);
    const paths = await backend().GenerateInvoice(req, kind);
    if (Array.isArray(paths) && paths.length) {
      await refreshTree(paths[0]);
      toast(`Invoice ${req.invoiceNumber} saved as ${paths[0].split(/[\\/]/).pop()}.`);
    }
  } catch (e) {
    showError(e);
  } finally {
    buttons.forEach(button => button.disabled = false);
  }
}
