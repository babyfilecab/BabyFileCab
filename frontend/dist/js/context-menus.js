// Right-click menus, properties dialogs and Global Find.

function positionContextMenu(menu, x, y) {
  hideAllContextMenus();
  menu.classList.remove('hidden');
  const width = menu.offsetWidth || 230;
  const height = menu.offsetHeight || 170;
  const left = Math.min(x, window.innerWidth - width - 8);
  const top = Math.min(y, window.innerHeight - height - 8);
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;
}

function showClientContextMenu(client, x, y) {
  contextClient = client;
  positionContextMenu($('clientContextMenu'), x, y);
}

function showTaxYearContextMenu(year, x, y) {
  contextTaxYear = year;
  positionContextMenu($('taxYearContextMenu'), x, y);
}

function showSectionContextMenu(section, x, y) {
  contextSection = section;
  positionContextMenu($('sectionContextMenu'), x, y);
}

function showDocumentContextMenu(doc, x, y) {
  contextDocument = doc;
  const editBtn = $('documentContextMenu').querySelector('[data-document-action="edit"]');
  if (editBtn) editBtn.disabled = doc.name === 'notes.txt';
  const deleteBtn = $('documentContextMenu').querySelector('[data-document-action="delete"]');
  if (deleteBtn) deleteBtn.disabled = doc.name === 'notes.txt';
  const doneBtn = $('documentContextMenu').querySelector('[data-document-action="done"]');
  if (doneBtn) {
    doneBtn.classList.toggle('is-current-document-status', Boolean(doc.done));
    doneBtn.setAttribute('aria-checked', doc.done ? 'true' : 'false');
    doneBtn.title = doc.done ? 'Click to mark this document as not entered' : 'Mark this document as entered / done';
  }
  positionContextMenu($('documentContextMenu'), x, y);
}

function hideAllContextMenus() {
  document.querySelectorAll('.context-menu').forEach(menu => menu.classList.add('hidden'));
}

function hideClientContextMenu() { hideAllContextMenus(); }

async function showClientProperties(client) {
  try {
    const props = await backend().GetClientProperties(client.path);
    $('propertyClientName').textContent = props.name || client.name;
    $('propertyClientID').textContent = props.clientId || client.clientId || '—';
    $('propertyReturnType').textContent = props.returnType || '—';
    $('propertyAddress').textContent = props.address || '—';
    $('propertyPhone').textContent = props.phone || '—';
    $('propertyEmail').textContent = props.email || '—';
    $('propertyTaxID').textContent = props.taxId || '—';
    $('propertyClientPath').textContent = props.path || client.path;
    $('propertiesBackdrop').classList.remove('hidden');
  } catch (e) {
    showError(e);
  }
}

function hideClientProperties() {
  $('propertiesBackdrop').classList.add('hidden');
}

async function showDocumentProperties(doc) {
  try {
    const props = await backend().GetDocumentProperties(doc.path);
    documentPropertiesPath = props.path || doc.path;
    $('docPropertyName').textContent = props.name || doc.name;
    $('docPropertyClient').textContent = props.clientName ? `${props.clientName} (${props.clientId || ''})` : '—';
    $('docPropertyLocation').textContent = props.location || '—';
    $('docPropertySize').textContent = formatFileSize(props.size || 0);
    $('docPropertyModified').textContent = props.modified ? new Date(props.modified).toLocaleString() : '—';
    $('documentDescriptionInput').value = props.description || '';
    $('documentPropertiesBackdrop').classList.remove('hidden');
    setTimeout(() => $('documentDescriptionInput').focus(), 20);
  } catch (e) { showError(e); }
}

function hideDocumentProperties() {
  documentPropertiesPath = null;
  $('documentPropertiesBackdrop').classList.add('hidden');
}

async function saveDocumentProperties() {
  if (!documentPropertiesPath) return;
  try {
    const description = $('documentDescriptionInput').value.trim();
    await backend().SaveDocumentDescription(documentPropertiesPath, description);
    hideDocumentProperties();
    toast('Document description saved.');
  } catch (e) { showError(e); }
}

function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function showGlobalFind() {
  $('globalFindBackdrop').classList.remove('hidden');
  $('globalFindStatus').textContent = 'Type a word or phrase to search.';
  $('globalFindResults').innerHTML = '';
  setTimeout(() => { $('globalFindInput').focus(); $('globalFindInput').select(); }, 20);
}

function hideGlobalFind() {
  $('globalFindBackdrop').classList.add('hidden');
}

async function runGlobalFind() {
  const query = $('globalFindInput').value.trim();
  const resultsEl = $('globalFindResults');
  if (!query) {
    $('globalFindStatus').textContent = 'Type a word or phrase to search.';
    resultsEl.innerHTML = '';
    return;
  }
  $('globalFindStatus').textContent = 'Searching…';
  try {
    const results = await backend().GlobalFind(query);
    $('globalFindStatus').textContent = `${results.length} result${results.length === 1 ? '' : 's'} found`;
    if (!results.length) {
      resultsEl.innerHTML = '<div class="global-find-empty">No matching documents.</div>';
      return;
    }
    resultsEl.innerHTML = results.map(r => `
      <button type="button" class="global-find-result" data-global-path="${escapeHTML(r.path)}">
        <span class="global-find-result-title">${escapeHTML(r.name)}</span>
        <span class="global-find-result-client">👶 ${escapeHTML(r.clientName)} • ${escapeHTML(r.location || '')}</span>
        ${r.description ? `<span class="global-find-result-description">${escapeHTML(r.description)}</span>` : ''}
        <span class="global-find-result-match">Matched: ${escapeHTML(r.match || 'Document')}</span>
      </button>`).join('');
  } catch (e) {
    $('globalFindStatus').textContent = 'Search failed';
    showError(e);
  }
}
