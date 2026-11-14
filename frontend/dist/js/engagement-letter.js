// Engagement Letter generator.

// Services and letter wording come from the backend so the preview always
// matches the finished letter.
let FIRM_SERVICES = [];
let ENGAGEMENT_SERVICES = [];
let ENGAGEMENT_SERVICE_DESCRIPTIONS = {};
let engagementTemplateInfo = null;

async function loadFirmServices() {
  if (FIRM_SERVICES.length) return;
  FIRM_SERVICES = await backend().ListFirmServices() || [];
  ENGAGEMENT_SERVICES = FIRM_SERVICES.map(s => s.code);
  ENGAGEMENT_SERVICE_DESCRIPTIONS = Object.fromEntries(FIRM_SERVICES.map(s => [s.code, s.description]));
}

function fillServiceSelect(select) {
  const current = select.value;
  select.replaceChildren(new Option('Select a service…', ''));
  FIRM_SERVICES.forEach(s => select.appendChild(new Option(s.label, s.code)));
  select.value = ENGAGEMENT_SERVICES.includes(current) ? current : '';
}

async function loadEngagementTemplate() {
  engagementTemplateInfo = await backend().GetEngagementTemplate();
}

function fillEngagementPlaceholders(text, values) {
  return String(text || '').replace(/\{([a-z_]+)\}/g, (m, name) => (name in values ? values[name] : m));
}

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
  const template = engagementTemplateInfo?.template;
  if (!template) return { intro: '', sections: [], closing: '' };
  const service = String(data.service || '').trim();
  const feeType = String(data.feeType || 'Flat Fee').trim();
  const values = {
    firm: String(data.companyName || '').trim() || 'the Firm',
    client: String(data.clientName || '').trim() || 'the Client',
    service: ENGAGEMENT_SERVICE_DESCRIPTIONS[service] || service || 'professional services',
    year: String(data.taxYear || '').trim(),
    fee_type: feeType,
    fee: engagementFormatFee(feeType, data.feeValue) || 'Enter fee or rate',
    not_included: engagementTemplateInfo.notIncluded?.[service] || '',
  };
  const kind = FIRM_SERVICES.find(s => s.code === service)?.kind || 'tax-return';
  return {
    intro: fillEngagementPlaceholders(template.intro, values),
    sections: template.sections
      .filter(s => s.appliesTo === 'all' || s.appliesTo === kind)
      .map(s => [fillEngagementPlaceholders(s.title, values), fillEngagementPlaceholders(s.body, values)]),
    closing: fillEngagementPlaceholders(template.closing, values),
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
  await loadFirmServices();
  await loadEngagementTemplate();
  fillServiceSelect($('engagementService'));
  $('engagementEditWording').classList.toggle('hidden', !isAdministrator());
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
    if (Array.isArray(paths) && paths.length) {
      await refreshTree(paths[0]);
      toast(`Engagement Letter saved as ${paths.map(p => p.split(/[\\/]/).pop()).join(' and ')}.`);
    }
  } catch (e) {
    showError(e);
  } finally {
    buttons.forEach(button => button.disabled = false);
  }
}

// Letter wording editor (administrators) --------------------------------------

let engagementWordingDraft = null;

const ENGAGEMENT_APPLIES_TO = [
  ['all', 'Every letter'],
  ['tax-return', 'Tax returns only'],
  ['bookkeeping', 'Bookkeeping only'],
  ['projection', 'Tax projections only'],
];

function showEngagementWordingEditor() {
  if (!engagementTemplateInfo) return;
  engagementWordingDraft = JSON.parse(JSON.stringify(engagementTemplateInfo.template));
  $('wordingPlaceholders').replaceChildren(...engagementTemplateInfo.placeholders.map(p => {
    const li = document.createElement('li');
    const code = document.createElement('code');
    code.textContent = `{${p.name}}`;
    li.append(code, ` ${p.meaning}`);
    return li;
  }));
  renderEngagementWordingEditor();
  $('engagementWordingBackdrop').classList.remove('hidden');
  setTimeout(() => $('wordingIntro').focus(), 20);
}

function hideEngagementWordingEditor() {
  $('engagementWordingBackdrop').classList.add('hidden');
  engagementWordingDraft = null;
}

function collectEngagementWording() {
  const draft = engagementWordingDraft;
  draft.intro = $('wordingIntro').value;
  draft.closing = $('wordingClosing').value;
  $('wordingSections').querySelectorAll('[data-wording-index]').forEach(row => {
    const s = draft.sections[Number(row.dataset.wordingIndex)];
    s.title = row.querySelector('.wording-title').value;
    s.appliesTo = row.querySelector('.wording-applies').value;
    s.body = row.querySelector('.wording-body').value;
  });
  return draft;
}

function renderEngagementWordingEditor() {
  const draft = engagementWordingDraft;
  $('wordingIntro').value = draft.intro;
  $('wordingClosing').value = draft.closing;
  const list = $('wordingSections');
  list.replaceChildren();
  draft.sections.forEach((section, index) => {
    const row = document.createElement('div');
    row.className = 'wording-section';
    row.dataset.wordingIndex = String(index);
    const head = document.createElement('div');
    head.className = 'wording-section-head';
    const title = Object.assign(document.createElement('input'), { className: 'wording-title', value: section.title, type: 'text' });
    title.setAttribute('aria-label', `Section ${index + 1} heading`);
    const applies = document.createElement('select');
    applies.className = 'wording-applies';
    applies.setAttribute('aria-label', `Section ${index + 1} applies to`);
    ENGAGEMENT_APPLIES_TO.forEach(([value, label]) => applies.appendChild(new Option(label, value)));
    applies.value = section.appliesTo;
    const buttons = document.createElement('div');
    buttons.className = 'wording-section-buttons';
    [['up', '↑', 'Move up', index === 0], ['down', '↓', 'Move down', index === draft.sections.length - 1], ['remove', 'Remove', 'Remove this section', false]].forEach(([action, text, label, disabled]) => {
      const b = Object.assign(document.createElement('button'), { type: 'button', className: action === 'remove' ? 'danger' : 'secondary', textContent: text, title: label, disabled });
      b.dataset.wordingAction = action;
      b.setAttribute('aria-label', label);
      buttons.appendChild(b);
    });
    head.append(title, applies, buttons);
    const body = Object.assign(document.createElement('textarea'), { className: 'wording-body', value: section.body, rows: 5 });
    body.setAttribute('aria-label', `Section ${index + 1} text`);
    row.append(head, body);
    list.appendChild(row);
  });
}

function engagementWordingAction(action, index) {
  const sections = collectEngagementWording().sections;
  if (action === 'up' && index > 0) [sections[index - 1], sections[index]] = [sections[index], sections[index - 1]];
  if (action === 'down' && index < sections.length - 1) [sections[index + 1], sections[index]] = [sections[index], sections[index + 1]];
  if (action === 'remove') {
    if (sections.length === 1) { toast('Keep at least one section.', true); return; }
    if (!confirm(`Remove the section "${sections[index].title || 'Untitled'}"?`)) return;
    sections.splice(index, 1);
  }
  renderEngagementWordingEditor();
}

function addEngagementWordingSection() {
  collectEngagementWording().sections.push({ title: 'New section', body: '', appliesTo: 'all' });
  renderEngagementWordingEditor();
  const rows = $('wordingSections').querySelectorAll('.wording-title');
  rows[rows.length - 1]?.select();
}

async function saveEngagementWording() {
  await backend().SaveEngagementTemplate(collectEngagementWording());
  await loadEngagementTemplate();
  hideEngagementWordingEditor();
  renderEngagementPreview();
  toast('Engagement letter wording saved for the whole firm.');
}

function resetEngagementWordingDraft() {
  if (!confirm('Replace the wording in this editor with BabyFileCab’s standard wording? Nothing is saved until you click Save.')) return;
  engagementWordingDraft = JSON.parse(JSON.stringify(engagementTemplateInfo.default));
  renderEngagementWordingEditor();
}
