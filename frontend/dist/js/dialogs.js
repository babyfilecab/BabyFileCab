// Client picker, prompts and small utilities.

function chooseClient(title, help) {
  return chooseClientFromItems(title, help, treeData);
}

function chooseClientFromItems(title, help, items) {
  clientPickerItems = Array.isArray(items) ? items : [];
  if (!clientPickerItems.length) {
    toast('There are no clients to choose from.', true);
    return Promise.resolve(null);
  }
  $('clientPickerTitle').textContent = title;
  $('clientPickerHelp').textContent = help;
  $('clientPickerSearch').value = '';
  $('clientPickerBackdrop').classList.remove('hidden');
  renderClientPickerList();
  setTimeout(() => $('clientPickerSearch').focus(), 20);
  return new Promise(resolve => clientPickerResolver = resolve);
}

function renderClientPickerList() {
  const q = $('clientPickerSearch').value.trim().toLowerCase();
  const clients = clientPickerItems.filter(c => !q || c.name.toLowerCase().includes(q) || (c.clientId || '').includes(q));
  $('clientPickerList').innerHTML = clients.length ? clients.map(c => `
    <button type="button" class="client-picker-row" data-client-picker-path="${escapeHTML(c.path)}">
      <span class="client-picker-baby">👶</span>
      <span class="client-picker-name">${escapeHTML(c.name)}</span>
    </button>`).join('') : '<div class="client-picker-empty">No matching clients.</div>';
}

function closeClientPicker(value) {
  $('clientPickerBackdrop').classList.add('hidden');
  if (!clientPickerResolver) return;
  const resolve = clientPickerResolver;
  clientPickerResolver = null;
  clientPickerItems = [];
  resolve(value);
}

async function showClientCommunications() {
  clientCommunicationsRows = await backend().GetClientCommunications();
  $('clientCommunicationsSearch').value = '';
  renderClientCommunications();
  $('clientCommunicationsBackdrop').classList.remove('hidden');
  setTimeout(() => $('clientCommunicationsSearch').focus(), 20);
}

function renderClientCommunications() {
  const query = $('clientCommunicationsSearch').value.trim().toLowerCase();
  // Mirror this search into the main Work Space so Client Communications
  // also serves as a quick client-name navigator.
  $('treeSearch').value = query;
  renderTree();

  const rows = clientCommunicationsRows.filter(c => !query || String(c.name || '').toLowerCase().includes(query));
  const body = $('clientCommunicationsBody');
  body.innerHTML = rows.length ? rows.map(c => `
    <tr class="communications-row" data-communications-path="${escapeHTML(c.path)}" title="Select ${escapeHTML(c.name)} in the Work Space">
      <td><span class="communications-client">👶 ${escapeHTML(c.name)}</span></td>
      <td><span class="communications-return-type">${escapeHTML(c.returnType || '—')}</span></td>
      <td>${c.email ? `<a href="mailto:${escapeHTML(c.email)}" onclick="event.stopPropagation()">${escapeHTML(c.email)}</a>` : '<span class="communications-missing">—</span>'}</td>
      <td>${c.phone ? escapeHTML(c.phone) : '<span class="communications-missing">—</span>'}</td>
    </tr>`).join('') : `<tr><td colspan="4" class="communications-empty">${query ? 'No clients match this name.' : 'No clients have been created yet.'}</td></tr>`;
  $('clientCommunicationsStatus').textContent = `${rows.length} client${rows.length === 1 ? '' : 's'}`;
}

function hideClientCommunications() {
  $('clientCommunicationsBackdrop').classList.add('hidden');
}

function askClientDetails(initial = null, mode = 'new') {
  clientFormMode = mode;
  clientFormClient = initial || null;
  const props = initial || {};
  $('clientNameInput').value = props.name || '';
  $('clientAddressInput').value = props.address || '';
  $('clientPhoneInput').value = props.phone || '';
  $('clientEmailInput').value = props.email || '';
  $('clientTaxIDInput').value = props.taxId || '';
  $('clientReturnTypeInput').value = props.returnType || '1040';
  $('clientNameInput').disabled = false;
  $('addClientTitle').textContent = mode === 'edit' ? 'Edit Client' : 'Add Client';
  $('addClientSave').textContent = mode === 'edit' ? 'Save Changes' : 'Create Client';
  $('addClientBackdrop').querySelector('.client-form-modal > p').textContent = mode === 'edit'
    ? 'Update the client name, contact information, tax ID, or return type.'
    : 'Create a client profile. BabyFileCab will automatically assign the next 5-digit Client ID.';
  $('addClientBackdrop').classList.remove('hidden');
  setTimeout(() => $('clientNameInput').focus(), 20);
  return new Promise(resolve => clientFormResolver = resolve);
}

function submitClientForm() {
  if (!clientFormResolver) return;
  const name = $('clientNameInput').value.trim();
  if (!name) {
    $('clientNameInput').focus();
    toast('Client / Business Name is required.', true);
    return;
  }
  const value = {
    name,
    address: $('clientAddressInput').value.trim(),
    phone: $('clientPhoneInput').value.trim(),
    email: $('clientEmailInput').value.trim(),
    taxId: $('clientTaxIDInput').value.trim(),
    returnType: $('clientReturnTypeInput').value,
  };
  closeClientForm(value);
}

function closeClientForm(value) {
  if (!clientFormResolver) return;
  $('addClientBackdrop').classList.add('hidden');
  $('clientNameInput').disabled = false;
  const resolve = clientFormResolver;
  clientFormResolver = null;
  resolve(value);
}

function ask(title, help, value='') {
  $('modalTitle').textContent = title;
  $('modalHelp').textContent = help;
  $('modalInput').value = value;
  $('modalBackdrop').classList.remove('hidden');
  setTimeout(() => { $('modalInput').focus(); $('modalInput').select(); }, 20);
  return new Promise(resolve => modalResolver = resolve);
}

function closeModal(value) {
  if (!modalResolver) return;
  $('modalBackdrop').classList.add('hidden');
  const r = modalResolver; modalResolver = null; r(value);
}

async function updateSelectionClientSummary(node) {
  const client = clientForPath(node?.path || '');
  if (!client) {
    $('selectionClientName').textContent = '—';
    $('selectionReturnType').textContent = '—';
    return;
  }
  $('selectionClientName').textContent = client.name || '—';
  try {
    const props = await backend().GetClientProperties(client.path);
    $('selectionReturnType').textContent = props?.returnType || '—';
  } catch (_) {
    $('selectionReturnType').textContent = '—';
  }
}

function clientForPath(path) {
  for (const c of treeData) {
    if (path === c.path || path.startsWith(c.path + '/') || path.startsWith(c.path + '\\')) return c;
  }
  return null;
}

function updateAutoLockMenu() {
  if (typeof updateSettingsAutoLock === 'function') updateSettingsAutoLock();
}

const THEMES = { light: 'Light Theme', dark: 'Dark Theme', purple: 'Purple Theme' };
function applyTheme(theme, persist = true) {
  currentTheme = THEMES[theme] ? theme : DEFAULT_THEME;
  document.documentElement.dataset.theme = currentTheme;
  if (persist) localStorage.setItem('babyfilecab-theme', currentTheme);
  const logoSource = currentTheme === 'dark' ? 'logo-dark.png' : 'logo.png';
  document.querySelectorAll('img.logo, img.auth-logo').forEach(img => { img.src = logoSource; });
  if (typeof updateSettingsTheme === 'function') updateSettingsTheme();
}

function clearPreview() {
  currentPDF = null;
  closePDFDocument();
  $('selectionTitle').textContent = 'Select a client or document';
  $('selectionClientName').textContent = '—';
  $('selectionReturnType').textContent = '—';
  $('preview').className = 'preview-empty';
  $('preview').innerHTML = '<div class="empty-icon">' + EMPTY_PREVIEW_ICON + '</div><h2>Document Preview</h2><p>Select a PDF, Word, Excel, email, image, CSV, text file, or notes.txt from the Work Space.</p>';
}

async function call(fn) {
  try { return await fn(); }
  catch (e) { showError(e); }
}

function showError(e) {
  const msg = typeof e === 'string' ? e : (e?.message || String(e));
  toast(msg, true);
}

function toast(message, error=false) {
  const t = $('toast'); t.textContent = message; t.className = `toast${error ? ' error' : ''}`;
  clearTimeout(t._timer); t._timer = setTimeout(() => t.className = 'toast hidden', 3500);
}

function escapeHTML(v) {
  return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
function cssEscape(v) { return String(v).replace(/["\\]/g, '\\$&'); }
