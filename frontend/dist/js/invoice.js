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

function invoiceDefaultNumber() {
  const d = new Date();
  const parts = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')];
  const time = [String(d.getHours()).padStart(2, '0'), String(d.getMinutes()).padStart(2, '0')].join('');
  return `INV-${parts.join('')}-${time}`;
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
  $('invoiceNumber').value = invoiceDefaultNumber();
  $('invoiceDate').value = today;
  $('invoiceDueDate').value = invoiceAddDaysISO(today, 30);
  $('invoiceFeeType').value = 'Flat Fee';
  $('invoiceHours').value = '1.00';
  $('invoiceFeeValue').value = '';
  $('invoiceDescription').value = '';
  $('invoiceNotes').value = 'Thank you for your business.';
  await refreshInvoiceLogo();
  updateInvoiceFeeUI();
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

function updateInvoiceFeeUI() {
  const hourly = $('invoiceFeeType').value === 'Hourly Rate';
  $('invoiceHoursRow').classList.toggle('hidden', !hourly);
  $('invoiceFeeLabel').textContent = hourly ? 'Hourly Rate (USD $)' : 'Flat Fee (USD $)';
  $('invoiceFeeValue').placeholder = hourly ? '250.00' : '1,500.00';
  renderInvoicePreview();
}

function invoicePreviewData() {
  const clientEl = $('invoiceClient');
  const user = invoiceSelectedUser();
  const service = $('invoiceService').value;
  const feeType = $('invoiceFeeType').value;
  const fee = invoiceMoneyNumber($('invoiceFeeValue').value);
  const hours = feeType === 'Hourly Rate' ? Math.max(0, Number($('invoiceHours').value || 0)) : 1;
  const total = feeType === 'Hourly Rate' ? fee * hours : fee;
  const customDesc = $('invoiceDescription').value.trim();
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
    feeType,
    fee,
    hours,
    total,
    description: customDesc || (serviceDescription ? `${serviceDescription} — Tax Year ${$('invoiceTaxYear').value}` : ''),
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
  const hourly = data.feeType === 'Hourly Rate';
  const quantity = hourly ? data.hours.toFixed(2) : '1';
  const rate = invoiceMoney(data.fee);
  const ready = Boolean(data.clientName && data.preparerName && data.service && data.invoiceNumber && data.invoiceDate && data.dueDate && data.fee > 0 && (!hourly || data.hours > 0));
  $('invoicePreview').innerHTML = `
    <div class="invoice-preview-top">
      <div>${logo}<div class="letter-firm">${escapeHTML(data.companyName)}</div><div class="letter-preparer-name">${escapeHTML(data.preparerName || 'Preparer')}</div>${preparerLines}</div>
      <div class="invoice-preview-title"><strong>INVOICE</strong><span># ${escapeHTML(data.invoiceNumber || '—')}</span></div>
    </div>
    <div class="invoice-meta-grid"><div><span>Invoice Date</span><strong>${escapeHTML(invoiceDateDisplay(data.invoiceDate))}</strong></div><div><span>Due Date</span><strong>${escapeHTML(invoiceDateDisplay(data.dueDate))}</strong></div><div><span>Tax Year</span><strong>${escapeHTML(data.taxYear || '—')}</strong></div></div>
    <div class="invoice-billto"><span>BILL TO</span><strong>${escapeHTML(data.clientName || 'Select a client')}</strong>${clientLines}</div>
    <div class="invoice-line-head"><span>Description</span><span>Qty</span><span>Rate</span><span>Amount</span></div>
    <div class="invoice-line-row"><span>${escapeHTML(data.description || 'Select a service')}</span><span>${escapeHTML(quantity)}</span><span>${escapeHTML(rate)}</span><strong>${escapeHTML(invoiceMoney(data.total))}</strong></div>
    <div class="invoice-total"><span>Total Due</span><strong>${escapeHTML(invoiceMoney(data.total))}</strong></div>
    ${data.notes ? `<div class="invoice-note"><strong>Note</strong><p>${escapeHTML(data.notes)}</p></div>` : ''}
    ${ready ? '' : '<div class="engagement-preview-empty"><strong>Complete the invoice form above.</strong><span>Select a client, preparer, service, dates, and enter the fee information before generating the invoice.</span></div>'}`;
}

async function invoiceSelectionChanged({ client = false, preparer = false } = {}) {
  if (client) await refreshInvoiceClient();
  if (preparer) refreshInvoicePreparer();
  updateInvoiceFeeUI();
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
  if (data.fee <= 0) throw new Error(`Enter the ${data.feeType === 'Hourly Rate' ? 'hourly rate' : 'flat fee'} in U.S. dollars.`);
  if (data.feeType === 'Hourly Rate' && data.hours <= 0) throw new Error('Enter the number of hours for the hourly invoice.');
  return {
    clientPath,
    preparerUsername,
    service: data.service,
    taxYear: data.taxYear,
    invoiceNumber: data.invoiceNumber,
    invoiceDate: data.invoiceDate,
    dueDate: data.dueDate,
    feeType: data.feeType,
    feeValue: $('invoiceFeeValue').value.trim(),
    hours: String(data.hours),
    description: $('invoiceDescription').value.trim(),
    notes: $('invoiceNotes').value.trim(),
    outputPath: '',
  };
}

async function generateInvoice(kind) {
  const buttons = [$('invoiceGeneratePDF'), $('invoiceGenerateWord')];
  try {
    const req = buildInvoiceRequest();
    const chosen = await backend().ChooseInvoiceSavePath(kind, req.clientPath, req.invoiceNumber);
    if (!chosen) return;
    req.outputPath = chosen;
    buttons.forEach(button => button.disabled = true);
    const paths = await backend().GenerateInvoice(req, kind);
    const list = Array.isArray(paths) ? paths.join(' • ') : '';
    toast(`Invoice created${list ? `: ${list}` : '.'}`);
  } catch (e) {
    showError(e);
  } finally {
    buttons.forEach(button => button.disabled = false);
  }
}
