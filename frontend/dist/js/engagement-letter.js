// Engagement Letter generator.

const ENGAGEMENT_SERVICES = ['1040', '1041', '1065', '1120S', '1120', 'Bookkeeping', 'Tax Projection'];
const ENGAGEMENT_TAX_RETURN_SERVICES = new Set(['1040', '1041', '1065', '1120S', '1120']);
const ENGAGEMENT_SERVICE_DESCRIPTIONS = {
  '1040': 'Form 1040 U.S. Individual Income Tax Return',
  '1041': 'Form 1041 U.S. Income Tax Return for Estates and Trusts',
  '1065': 'Form 1065 U.S. Return of Partnership Income',
  '1120S': 'Form 1120-S U.S. Income Tax Return for an S Corporation',
  '1120': 'Form 1120 U.S. Corporation Income Tax Return',
  'Bookkeeping': 'bookkeeping services',
  'Tax Projection': 'tax projection services',
};

function engagementFormatFee(feeType, raw) {
  let value = String(raw || '').trim().replace(/^\$\s*/, '');
  if (!value) return '';
  value = '$' + value;
  if (feeType === 'Hourly Rate' && !/(\/\s*(?:hr|hour)|per\s+hour)/i.test(value)) value += '/hr';
  return value;
}

function engagementDisplayDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date());
  const d = new Date(raw + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return raw;
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(d);
}

function engagementLetterSections(data) {
  const company = String(data.companyName || '').trim() || 'the Firm';
  const client = String(data.clientName || '').trim() || 'the Client';
  const service = String(data.service || '').trim();
  const year = String(data.taxYear || '').trim();
  const feeType = String(data.feeType || 'Flat Fee').trim();
  const feeValue = engagementFormatFee(feeType, data.feeValue) || 'Enter fee or rate';
  const description = ENGAGEMENT_SERVICE_DESCRIPTIONS[service] || service || 'professional services';

  const intro = `Thank you for engaging ${company}. This Engagement Letter confirms the terms, scope, and limitations of our engagement with ${client} for ${description} for tax year or period ${year}. Please review this letter carefully because it defines the responsibilities of both the Client and the Firm.`;

  let scope;
  if (ENGAGEMENT_TAX_RETURN_SERVICES.has(service)) {
    scope = `${company} will prepare the federal ${description} identified above from information, books, records, schedules, financial statements, and representations provided by ${client}. State, local, amended, informational, payroll, sales tax, foreign reporting, bookkeeping, notice response, audit, tax planning, tax projection, and other services are outside this engagement unless separately agreed to in writing.`;
  } else if (service === 'Bookkeeping') {
    scope = `${company} will provide bookkeeping services for ${client} using bank data, source documents, account information, classifications, instructions, and other records supplied or approved by the Client. The engagement may include recording transactions, reconciliations, and preparation of management reports or financial statements from those records. Unless separately agreed in writing, this engagement does not include an audit, review, compilation, tax return preparation, payroll, sales tax, or assurance service.`;
  } else {
    scope = `${company} will prepare tax projections for ${client} using the income, deduction, withholding, estimated payment, transaction, and other assumptions supplied by the Client. A projection is an estimate based on information available at the time and is not a guarantee of the Client's final tax liability. Actual results may differ because of later transactions, incomplete information, changes in law, or other events.`;
  }

  const sections = [
    ['Scope of Services', scope],
    ['Client Responsibilities', `${client} is responsible for providing complete, accurate, and timely information and for maintaining the books, records, source documents, and supporting evidence required for the services and by applicable tax or regulatory authorities. The Client must review all returns, reports, projections, or other work product before relying on, signing, or filing it.`],
    ['Our Responsibilities', `${company} will perform the agreed services using information and records supplied by ${client}. Unless separately agreed in writing, our services are not an audit, review, examination, agreed-upon procedures engagement, or other assurance service, and we will not independently verify the information provided to us.`],
  ];

  if (ENGAGEMENT_TAX_RETURN_SERVICES.has(service)) {
    sections.push(
      ['Tax Positions and Electronic Filing', `${company} may request clarification or additional documentation when information appears incomplete or inconsistent. The Firm may decline a tax position that it believes lacks adequate support. If the return is eligible for electronic filing, the Firm will not transmit it until the required signed e-file authorization is received.`]
    );
  }

  sections.push(
    ['Deadlines and Client Action', `${client} agrees to provide requested information sufficiently in advance of applicable deadlines. An extension of time to file is not an extension of time to pay. Tax payments, estimated payments, signatures, approvals, and other Client actions remain the Client's responsibility unless separately agreed in writing.`],
    ['Fees and Additional Services', `The agreed fee arrangement for this engagement is ${feeType}: ${feeValue}. This fee applies only to the service identified in this Engagement Letter. Additional work outside the stated scope may require a separate fee or hourly charge agreed to by the Client and the Firm.`],
    ['Records and Confidentiality', `${company} will handle Client information in accordance with applicable professional and legal obligations. The Client should retain original records and supporting documentation.`],
    ['Termination', `Either ${client} or ${company} may terminate this engagement by written notice. The Client remains responsible for fees earned and costs incurred through the termination date and for all filing, payment, recordkeeping, and other deadlines after termination.`]
  );

  return {
    intro,
    sections,
    closing: `If the terms above correctly describe your understanding of this engagement, please sign below. Your signature confirms that ${client} has read, understands, and accepts this Engagement Letter with ${company}.`,
  };
}

function engagementPreparerName(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || user?.username || '';
}

function engagementPreparerAddress(user) {
  if (!user) return [];
  const cityState = [user.city, user.state].filter(Boolean).join(', ');
  const cityLine = cityState + (user.zip ? `${cityState ? ' ' : ''}${user.zip}` : '');
  return [user.streetAddress, cityLine.trim(), user.telephone || user.phone, user.email].filter(Boolean);
}

function engagementSelectedUser() {
  const username = $('engagementPreparer').value;
  return engagementLetterUsers.find(u => String(u.username || '') === username) || null;
}

function engagementClearClientData() {
  const el = $('engagementClient');
  el.dataset.name = '';
  el.dataset.address = '';
  el.dataset.phone = '';
  el.dataset.email = '';
  el.dataset.clientId = '';
  el.dataset.returnType = '';
}

function engagementAddOption(select, value, label) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  select.appendChild(option);
}

async function showEngagementLetter() {
  // Always reload the active client list when the generator opens so the
  // Client dropdown reflects the current BabyFileCab database.
  engagementLetterClients = await backend().GetTree();
  engagementLetterClients = (engagementLetterClients || []).filter(node => node && node.type === 'client');
  if (!engagementLetterClients.length) {
    toast('Create a client before generating an Engagement Letter.', true);
    return;
  }

  engagementLetterUsers = await backend().ListCompanyUsers();
  $('engagementCompanyAccount').textContent = currentUser?.companyName || 'BabyFileCab Company';

  const clientSelect = $('engagementClient');
  clientSelect.replaceChildren();
  engagementAddOption(clientSelect, '', 'Select a client…');
  engagementLetterClients.forEach(client => {
    const id = client.clientId ? ` (#${client.clientId})` : '';
    engagementAddOption(clientSelect, client.path, `${client.name}${id}`);
  });
  clientSelect.value = '';
  engagementClearClientData();

  const preparerSelect = $('engagementPreparer');
  preparerSelect.replaceChildren();
  engagementAddOption(preparerSelect, '', 'Select a preparer…');
  engagementLetterUsers.forEach(user => {
    const role = String(user.role || '').toLowerCase().includes('admin') ? 'Administrator' : 'Staff';
    engagementAddOption(preparerSelect, String(user.username || ''), `${engagementPreparerName(user)} — ${role}`);
  });
  preparerSelect.value = '';

  $('engagementService').value = '';
  fillTaxYearSelect($('engagementTaxYear'));
  $('engagementFeeType').value = 'Flat Fee';
  $('engagementFeeValue').value = '';
  $('engagementDate').value = localISODate();
  $('engagementClientSummary').textContent = `${engagementLetterClients.length} active client${engagementLetterClients.length === 1 ? '' : 's'} available. Choose one from the dropdown.`;
  $('engagementPreparerSummary').textContent = 'Choose the preparer responsible for this engagement.';

  await refreshEngagementFirmLogo();
  updateEngagementFeeUI();
  renderEngagementPreview();
  $('engagementLetterBackdrop').classList.remove('hidden');
  setTimeout(() => clientSelect.focus(), 30);
}

function hideEngagementLetter() {
  $('engagementLetterBackdrop').classList.add('hidden');
}

function updateEngagementLogoUI(info) {
  engagementLogoDataURL = String(info?.dataURL || '');
  const img = $('engagementFirmLogoPreview');
  const placeholder = $('engagementFirmLogoPlaceholder');
  if (engagementLogoDataURL) {
    img.src = engagementLogoDataURL;
    img.classList.remove('hidden');
    placeholder.classList.add('hidden');
    $('engagementRemoveLogo').disabled = false;
  } else {
    img.removeAttribute('src');
    img.classList.add('hidden');
    placeholder.classList.remove('hidden');
    $('engagementRemoveLogo').disabled = true;
  }
  renderEngagementPreview();
}

async function refreshEngagementFirmLogo() {
  const info = await backend().GetEngagementLetterLogo();
  updateEngagementLogoUI(info || {});
}

async function browseEngagementFirmLogo() {
  const info = await backend().ChooseEngagementLetterLogo();
  if (info?.dataURL) {
    updateEngagementLogoUI(info);
    toast('Firm logo added to the Engagement Letter.');
  }
}

async function removeEngagementFirmLogo() {
  await backend().ClearEngagementLetterLogo();
  updateEngagementLogoUI({});
  toast('Firm logo removed from the Engagement Letter.');
}

async function refreshEngagementClient() {
  const path = $('engagementClient').value;
  if (!path) {
    engagementClearClientData();
    $('engagementClientSummary').textContent = `${engagementLetterClients.length} active client${engagementLetterClients.length === 1 ? '' : 's'} available. Choose one from the dropdown.`;
    $('engagementPreviewClient').textContent = 'Select a client';
    return;
  }
  const props = await backend().GetClientProperties(path);
  const el = $('engagementClient');
  el.dataset.name = props.name || '';
  el.dataset.address = props.address || '';
  el.dataset.phone = props.phone || '';
  el.dataset.email = props.email || '';
  el.dataset.clientId = props.clientId || '';
  el.dataset.returnType = props.returnType || '';

  const details = [props.address, props.phone, props.email].filter(Boolean);
  $('engagementClientSummary').textContent = details.length
    ? details.join('  •  ')
    : 'Client selected. No address, phone number, or email is saved in this client profile.';
  $('engagementPreviewClient').textContent = props.name || 'Client';
}

function refreshEngagementPreparer() {
  const user = engagementSelectedUser();
  if (!user) {
    $('engagementPreparerSummary').textContent = 'Choose the preparer responsible for this engagement.';
    return;
  }
  const details = [engagementPreparerName(user), ...engagementPreparerAddress(user)].filter(Boolean);
  $('engagementPreparerSummary').textContent = details.length ? details.join('  •  ') : 'Preparer selected.';
}

function updateEngagementFeeUI() {
  const hourly = $('engagementFeeType').value === 'Hourly Rate';
  $('engagementFeeLabel').textContent = hourly ? 'Hourly Rate (USD $)' : 'Flat Fee (USD $)';
  $('engagementFeeValue').placeholder = hourly ? '250.00' : '1,500.00';
}

function engagementPreviewData() {
  const clientEl = $('engagementClient');
  const user = engagementSelectedUser();
  const service = $('engagementService').value;
  return {
    companyName: currentUser?.companyName || 'CPA Firm',
    logoDataURL: engagementLogoDataURL,
    clientName: clientEl.dataset.name || '',
    clientAddress: clientEl.dataset.address || '',
    clientPhone: clientEl.dataset.phone || '',
    clientEmail: clientEl.dataset.email || '',
    clientId: clientEl.dataset.clientId || '',
    preparerName: engagementPreparerName(user),
    preparerLines: engagementPreparerAddress(user),
    service,
    serviceDescription: ENGAGEMENT_SERVICE_DESCRIPTIONS[service] || '',
    taxYear: $('engagementTaxYear').value,
    feeType: $('engagementFeeType').value,
    feeValue: $('engagementFeeValue').value.trim(),
    date: engagementDisplayDate($('engagementDate').value),
  };
}

function renderEngagementPreview() {
  const data = engagementPreviewData();
  const fee = engagementFormatFee(data.feeType, data.feeValue);
  $('engagementPreviewClient').textContent = data.clientName || 'Select a client';
  $('engagementPreviewService').textContent = data.service || 'Service';

  const logo = data.logoDataURL
    ? `<div class="letter-logo-wrap"><img class="letter-logo" src="${data.logoDataURL}" alt="${escapeHTML(data.companyName)} logo"></div>`
    : '';
  const preparerLines = data.preparerLines.map(line => `<div class="letter-contact">${escapeHTML(line)}</div>`).join('');
  const clientLines = [data.clientAddress, data.clientPhone, data.clientEmail].filter(Boolean).map(line => `<div class="letter-contact">${escapeHTML(line)}</div>`).join('');
  const ready = Boolean(data.clientName && data.preparerName && data.service && data.taxYear && fee);

  let body;
  if (ready) {
    const text = engagementLetterSections(data);
    const sections = text.sections.map(([title, content]) => `<h4>${escapeHTML(title)}</h4><p>${escapeHTML(content)}</p>`).join('');
    body = `
      <p>Dear <strong>${escapeHTML(data.clientName)}</strong>:</p>
      <p>${escapeHTML(text.intro)}</p>
      ${sections}
      <p>${escapeHTML(text.closing)}</p>
      <div class="letter-signature"><strong>Client acceptance:</strong><br><br>${escapeHTML(data.clientName)} signature: ____________________________________<br>Date: ____________________</div>
      <div class="letter-signature"><strong>Firm acknowledgement:</strong><br><br>${escapeHTML(data.companyName)} / ${escapeHTML(data.preparerName)}: ____________________________________<br>Date: ____________________</div>`;
  } else {
    body = `<div class="engagement-preview-empty"><strong>Complete the form above to build the engagement letter.</strong><span>Select a client, preparer, service, tax year, and enter the fee or hourly rate. The preview updates automatically.</span></div>`;
  }

  $('engagementPreview').innerHTML = `
    ${logo}
    <div class="letter-letterhead">
      <div class="letter-firm">${escapeHTML(data.companyName)}</div>
      <div class="letter-preparer-name">${escapeHTML(data.preparerName || 'Preparer')}</div>
      ${preparerLines}
    </div>
    <div class="letter-date">${escapeHTML(data.date)}</div>
    <div class="letter-client">${escapeHTML(data.clientName || 'Client')}</div>
    ${clientLines}
    <h3>Engagement Letter</h3>
    <div class="letter-summary">
      <strong>Service:</strong> ${escapeHTML(data.serviceDescription || 'Select a service')}<br>
      <strong>Tax Year:</strong> ${escapeHTML(data.taxYear || '—')}<br>
      <strong>${escapeHTML(data.feeType || 'Fee')}:</strong> ${escapeHTML(fee || 'Enter an amount')}
    </div>
    ${body}`;
}

async function engagementSelectionChanged({ client = false, preparer = false } = {}) {
  if (client) await refreshEngagementClient();
  if (preparer) refreshEngagementPreparer();
  updateEngagementFeeUI();
  renderEngagementPreview();
}

function buildEngagementRequest() {
  const clientPath = $('engagementClient').value;
  const preparerUsername = $('engagementPreparer').value;
  const service = $('engagementService').value;
  const taxYear = $('engagementTaxYear').value;
  const feeType = $('engagementFeeType').value;
  const feeValue = $('engagementFeeValue').value.trim();
  if (!clientPath) throw new Error('Choose a client from the Client dropdown.');
  if (!preparerUsername) throw new Error('Choose a preparer from the Preparer dropdown.');
  if (!ENGAGEMENT_SERVICES.includes(service)) throw new Error('Choose a service from the Service dropdown.');
  if (!taxYear) throw new Error(`Choose a tax year from 2018 through ${new Date().getFullYear()}.`);
  if (!feeValue) throw new Error(`Enter the ${feeType === 'Hourly Rate' ? 'hourly rate' : 'flat fee'} in U.S. dollars.`);
  return {
    clientPath,
    preparerUsername,
    service,
    taxYear,
    feeType,
    feeValue,
    letterDate: $('engagementDate').value,
    outputPath: '',
  };
}

async function generateEngagementLetter(kind) {
  const buttons = [$('engagementGeneratePDF'), $('engagementGenerateWord')];
  try {
    const req = buildEngagementRequest();
    const chosen = await backend().ChooseEngagementLetterSavePath(kind, req.clientPath, req.service, req.taxYear);
    if (!chosen) return;
    req.outputPath = chosen;
    buttons.forEach(button => button.disabled = true);
    const paths = await backend().GenerateEngagementLetter(req, kind);
    const list = Array.isArray(paths) ? paths.join(' • ') : '';
    toast(`Engagement Letter created${list ? `: ${list}` : '.'}`);
  } catch (e) {
    showError(e);
  } finally {
    buttons.forEach(button => button.disabled = false);
  }
}
