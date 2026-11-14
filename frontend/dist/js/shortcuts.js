// Keyboard shortcuts and the shortcut editor.

const SHORTCUT_ACTIONS = [
  {id:'help',label:'Help / User manual',keys:['F1']},
  {id:'global-find',label:'Global Find',keys:['Ctrl+Shift+F']},
  {id:'pdf-find',label:'Find in PDF',keys:['Ctrl+F','Shift+M']},
  {id:'sign-out',label:'Sign out / Lock',keys:['Ctrl+Shift+L']},
  {id:'exit',label:'Exit BabyFileCab',keys:['Ctrl+Q']},
  {id:'backup-client',label:'Back up client',keys:['Ctrl+B']},
  {id:'refresh',label:'Refresh workspace',keys:['F5']},
  {id:'rename-file',label:'Rename document',keys:['F2','Shift+F']},
  {id:'upload',label:'Upload files',keys:['F']},
  {id:'add-client',label:'Add client',keys:['C']},
  {id:'edit-client',label:'Edit client',keys:['Shift+C']},
  {id:'add-year',label:'Add tax year',keys:['Y']},
  {id:'edit-year',label:'Edit tax year',keys:['Shift+Y']},
  {id:'add-section',label:'Add section',keys:['S']},
  {id:'edit-section',label:'Edit section',keys:['Shift+S']},
  {id:'delete',label:'Delete selected item(s)',keys:['D','Shift+D']},
  {id:'manage-users',label:'Manage users',keys:['M']},
];
function defaultShortcutBindings() { return Object.fromEntries(SHORTCUT_ACTIONS.map(item => [item.id, [...item.keys]])); }
let shortcutBindings = defaultShortcutBindings();
let shortcutDraft = null;
const SHORTCUT_KEYS = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', ...'0123456789',
  ...Array.from({length:24}, (_,i) => `F${i+1}`),
  'Space','Enter','Tab','Escape','Backspace','Delete','Insert','Home','End','PageUp','PageDown','ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
  'Backquote','Minus','Equal','BracketLeft','BracketRight','Backslash','Semicolon','Quote','Comma','Period','Slash',
  ...Array.from({length:10},(_,i) => `Numpad${i}`),
  'NumpadAdd','NumpadSubtract','NumpadMultiply','NumpadDivide','NumpadDecimal','NumpadEnter','NumpadEqual',
];
function shortcutFromEvent(event) {
  if (event.isComposing) return '';
  let key = String(event.key || '');
  if (/^Numpad/.test(event.code || '')) key = event.code;
  else if (['Backquote','Minus','Equal','BracketLeft','BracketRight','Backslash','Semicolon','Quote','Comma','Period','Slash'].includes(event.code)) key = event.code;
  else if (/^Digit[0-9]$/.test(event.code || '')) key = event.code.slice(5);
  else if (key === ' ') key = 'Space';
  else if (/^[a-z0-9]$/i.test(key) || /^F[0-9]+$/i.test(key)) key = key.toUpperCase();
  if (!SHORTCUT_KEYS.includes(key)) return '';
  return [(event.ctrlKey || event.metaKey) ? 'Ctrl' : '', event.altKey ? 'Alt' : '', event.shiftKey ? 'Shift' : '', key].filter(Boolean).join('+');
}
function shortcutAllowed(binding) {
  if (typeof binding !== 'string') return false;
  const parts = binding.split('+'); const key = parts.pop();
  const canonical = ['Ctrl','Alt','Shift'].filter(modifier => parts.includes(modifier));
  return SHORTCUT_KEYS.includes(key) && parts.join('+') === canonical.join('+') && !['G','Escape','Ctrl+S','Ctrl+I','Ctrl+U','Alt+F4'].includes(binding);
}
function validateShortcutBindings(bindings) {
  const used = new Map();
  for (const item of SHORTCUT_ACTIONS) {
    const keys = bindings?.[item.id];
    if (!Array.isArray(keys) || keys.length > 4) throw new Error('Invalid shortcut settings.');
    for (const key of keys) {
      if (typeof key !== 'string' || !shortcutAllowed(key)) throw new Error('That shortcut is reserved or unsupported.');
      if (used.has(key)) throw new Error(`${key} is already assigned to ${used.get(key)}.`);
      used.set(key, item.label);
    }
  }
  return bindings;
}
function shortcutStorageKey() { return 'babyfilecab-shortcuts-v1:' + JSON.stringify([currentUser.companyId, currentUser.username.toLowerCase()]); }
function loadShortcutBindings() {
  shortcutBindings = defaultShortcutBindings();
  try {
    const stored = localStorage.getItem(shortcutStorageKey());
    if (stored) shortcutBindings = validateShortcutBindings(JSON.parse(stored));
  } catch (error) { toast('Could not load saved shortcuts; using defaults.', true); }
  updateShortcutHints();
}
function updateShortcutHints() {
  const menuIds = {'help':'user-manual','rename-file':'rename-selected-document','delete':'delete-selected'};
  for (const item of SHORTCUT_ACTIONS) {
    const menu = document.querySelector(`[data-menu-action="${menuIds[item.id] || item.id}"]`);
    if (menu) {
      let hint = menu.querySelector('.menu-shortcut');
      if (!hint) { hint = document.createElement('span'); hint.className = 'menu-shortcut'; menu.appendChild(hint); }
      hint.textContent = shortcutBindings[item.id].join(' / ');
    }
  }
  const grid = $('mappedShortcutHelp');
  if (grid) {
    grid.replaceChildren();
    for (const item of SHORTCUT_ACTIONS) {
      const key = document.createElement('kbd'); key.textContent = shortcutBindings[item.id].join(' / ') || 'Disabled';
      const label = document.createElement('span'); label.textContent = item.label;
      grid.append(key, label);
    }
  }
}
function showShortcutMapper() {
  shortcutDraft = structuredClone(shortcutBindings);
  renderShortcutMapper();
  $('shortcutMapperBackdrop').classList.remove('hidden');
  $('shortcutMapperCancel').focus();
}
let shortcutSelectedRow = null;
let shortcutEditingRow = null;
function hideShortcutMapper() {
  hideShortcutEditor(); $('shortcutMapperBackdrop').classList.add('hidden'); shortcutDraft = null; shortcutSelectedRow = null;
}
function renderShortcutMapper() {
  const body = $('shortcutMapperRows'); body.replaceChildren(); shortcutSelectedRow = null;
  for (const id of ['shortcutMapperModify','shortcutMapperClear']) $(id).disabled = true;
  let number = 0;
  for (const item of SHORTCUT_ACTIONS) {
    const keys = shortcutDraft[item.id].length ? shortcutDraft[item.id] : [''];
    keys.forEach((key,index) => {
      const row = document.createElement('tr'); row.tabIndex = 0; row.setAttribute('aria-selected','false');
      const count = document.createElement('td'); count.textContent = String(++number);
      const label = document.createElement('td'); label.textContent = item.label;
      const binding = document.createElement('td'); binding.textContent = key || 'Disabled';
      row.append(count,label,binding);
      const select = () => {
        body.querySelectorAll('tr').forEach(other => { other.classList.remove('is-selected'); other.setAttribute('aria-selected','false'); });
        row.classList.add('is-selected'); row.setAttribute('aria-selected','true');
        shortcutSelectedRow = {id:item.id,index};
        for (const id of ['shortcutMapperModify','shortcutMapperClear']) $(id).disabled = false;
      };
      row.addEventListener('click',select);
      row.addEventListener('keydown',e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); } });
      row.addEventListener('dblclick', () => { select(); showShortcutEditor(false); });
      body.appendChild(row);
    });
  }
}
function showShortcutEditor() {
  if (!shortcutSelectedRow || !shortcutDraft) return;
  shortcutEditingRow = {...shortcutSelectedRow};
  const item = SHORTCUT_ACTIONS.find(item => item.id === shortcutEditingRow.id);
  $('shortcutEditName').textContent = item.label;
  const binding = shortcutDraft[item.id][shortcutEditingRow.index] || 'A';
  const parts = binding.split('+'); const key = parts.pop();
  for (const modifier of ['Ctrl','Alt','Shift']) $(`shortcutEdit${modifier}`).checked = parts.includes(modifier);
  const select = $('shortcutEditKey'); select.replaceChildren();
  for (const key of SHORTCUT_KEYS) { const option = document.createElement('option'); option.value = key; option.textContent = key.startsWith('Numpad') ? key.replace('Numpad','Numpad ') : key; select.appendChild(option); }
  select.value = key;
  $('shortcutEditError').textContent = ''; updateShortcutEditorPreview();
  $('shortcutEditBackdrop').classList.remove('hidden'); select.focus();
}
function shortcutEditorBinding() {
  return [...['Ctrl','Alt','Shift'].filter(modifier => $(`shortcutEdit${modifier}`).checked), $('shortcutEditKey').value].join('+');
}
function updateShortcutEditorPreview() { $('shortcutEditPreview').textContent = shortcutEditorBinding(); $('shortcutEditError').textContent = ''; }
function hideShortcutEditor() { $('shortcutEditBackdrop').classList.add('hidden'); shortcutEditingRow = null; }
function applyShortcutEditor() {
  if (!shortcutEditingRow || !shortcutDraft) return;
  const next = structuredClone(shortcutDraft);
  next[shortcutEditingRow.id][shortcutEditingRow.index] = shortcutEditorBinding();
  try { validateShortcutBindings(next); shortcutDraft = next; hideShortcutEditor(); renderShortcutMapper(); $('shortcutMapperSave').focus(); }
  catch (error) { $('shortcutEditError').textContent = error.message; }
}
function saveShortcutMapper() {
  try {
    validateShortcutBindings(shortcutDraft);
    localStorage.setItem(shortcutStorageKey(), JSON.stringify(shortcutDraft));
    shortcutBindings = structuredClone(shortcutDraft);
    updateShortcutHints(); hideShortcutMapper(); toast('Keyboard shortcuts saved.');
  } catch (error) { showError(error); }
}
async function runMappedShortcut(action) {
  switch (action) {
    case 'help': showUserManual(); break;
    case 'global-find': showGlobalFind(); break;
    case 'pdf-find': focusPDFFind(); break;
    case 'sign-out':
      document.querySelectorAll('.modal-backdrop').forEach(el => el.classList.add('hidden'));
      await signOut(); break;
    case 'refresh': await refreshTree(selectedNode?.path || null); toast('Workspace refreshed.'); break;
    case 'manage-users': await showManageUsers(); break;
    case 'delete': await deleteHighlightedItem(); break;
    case 'exit': case 'backup-client': await handleMenuAction(action); break;
    case 'upload':
      if (selectedNode && ['client','permanent','taxyear','section'].includes(selectedNode.type)) await doAction('upload');
      else toast('Select a client, Permanent Folder, tax year, or section first.', true);
      break;
    default: await doAction(action);
  }
}

function appWorkspaceActive() {
  return Boolean(currentUser) && !$('appShell').classList.contains('hidden');
}

function activeElementIsEditable() {
  const el = document.activeElement;
  const tag = el?.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(el?.isContentEditable);
}

function modalIsOpen() {
  return Boolean(document.querySelector('.modal-backdrop:not(.hidden)'));
}

function focusPDFFind() {
  if (!currentPDF) return false;
  const input = $('pdfSearchInput');
  if (!input) return false;
  input.focus();
  input.select();
  return true;
}

function deleteHighlightedItem() {
  if (!selectedNode) return;
  if (selectedNode.type === 'file') doAction('delete-file');
  else if (selectedNode.type === 'client') doAction('delete-client');
  else if (selectedNode.type === 'taxyear') doAction('delete-year');
  else if (selectedNode.type === 'section') doAction('delete-section');
}

function openSettingsMenuFromShortcut() {
  closeAppMenus();
  const menu = $('settingsMenu');
  if (!menu) return;
  menu.classList.remove('hidden');
  document.querySelector('.menu-trigger[data-menu="settingsMenu"]')?.classList.add('active');
  const firstItem = menu.querySelector('button:not([disabled])');
  setTimeout(() => firstItem?.focus(), 20);
}

function armShortcutChord(value) {
  shortcutChord = value;
  clearTimeout(shortcutChordTimer);
  shortcutChordTimer = setTimeout(() => { shortcutChord = ''; }, 1200);
}
