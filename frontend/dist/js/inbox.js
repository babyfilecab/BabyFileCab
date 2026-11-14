// Scan inbox: file new scans from a watched folder into the right client.

let inboxFiles = [];
let inboxTimer = null;

function startInboxWatch() {
  stopInboxWatch();
  refreshInboxCount();
  inboxTimer = setInterval(() => { if (!document.hidden) refreshInboxCount(); }, 15000);
}

function stopInboxWatch() {
  clearInterval(inboxTimer);
  inboxTimer = null;
  inboxFiles = [];
  $('inboxBtn')?.classList.add('hidden');
  $('inboxBackdrop')?.classList.add('hidden');
}

async function refreshInboxCount() {
  if (!currentUser) return;
  const generation = sessionGeneration;
  try {
    const files = await backend().ListInbox() || [];
    if (generation !== sessionGeneration) return;
    inboxFiles = files;
  } catch (_) {
    inboxFiles = [];
  }
  $('inboxCount').textContent = String(inboxFiles.length);
  $('inboxBtn').classList.toggle('hidden', inboxFiles.length === 0);
  if (!$('inboxBackdrop').classList.contains('hidden')) renderInboxList();
}

async function chooseInboxFolder() {
  const folder = await backend().ChooseInboxFolder();
  if (folder) {
    toast(`Scan inbox folder: ${folder}`);
    await refreshInboxCount();
  }
  return folder;
}

// Every place a document can be filed inside a client, with readable labels.
function inboxFolderOptions(client) {
  const options = [];
  const walk = (node, trail) => {
    for (const child of node.children || []) {
      if (child.type === 'file') continue;
      const label = [...trail, child.name].join(' › ');
      options.push({ path: child.path, label });
      walk(child, [...trail, child.name]);
    }
  };
  walk(client, []);
  return options;
}

function inboxClientForSelection() {
  const path = selectedNode?.path || '';
  return treeData.find(c => c.type === 'client' && (path === c.path || path.startsWith(c.path + '/'))) || null;
}

function fillInboxFolders() {
  const client = treeData.find(c => c.path === $('inboxClient').value);
  const select = $('inboxFolder');
  const previous = select.value;
  const options = client ? inboxFolderOptions(client) : [];
  select.replaceChildren(...options.map(o => new Option(o.label, o.path)));
  const selectedFolder = selectedNode && selectedNode.type !== 'file' && selectedNode.type !== 'client' ? selectedNode.path : '';
  const fileParent = selectedNode?.type === 'file' ? selectedNode.path.slice(0, selectedNode.path.lastIndexOf('/')) : '';
  for (const want of [previous, selectedFolder, fileParent]) {
    if (want && options.some(o => o.path === want)) { select.value = want; break; }
  }
}

async function showInbox() {
  const folder = await backend().GetInboxFolder();
  if (!folder) {
    if (!confirm("Choose the folder your scanner or phone app saves to. New files there are moved into BabyFileCab's encrypted storage and show up in the Scan Inbox so you can file them into a client.")) return;
    if (!await chooseInboxFolder()) return;
  }
  const clients = treeData.filter(n => n.type === 'client').sort((a, b) => a.name.localeCompare(b.name));
  const clientSelect = $('inboxClient');
  clientSelect.replaceChildren(new Option('Choose a client…', ''), ...clients.map(c => new Option(`${c.name} (${c.clientId})`, c.path)));
  clientSelect.value = inboxClientForSelection()?.path || '';
  fillInboxFolders();
  $('inboxFolderLabel').textContent = `Watching ${await backend().GetInboxFolder()}. New scans are encrypted and removed from that folder within a few seconds while BabyFileCab is open. File each one into a client below.`;
  $('inboxBackdrop').classList.remove('hidden');
  await refreshInboxCount();
  renderInboxList();
}

function hideInbox() {
  $('inboxBackdrop').classList.add('hidden');
}

function renderInboxList() {
  const list = $('inboxList');
  list.replaceChildren();
  $('inboxEmpty').classList.toggle('hidden', inboxFiles.length > 0);
  inboxFiles.forEach((file, index) => {
    const li = document.createElement('li');
    li.className = 'needs-attention-item inbox-item';
    const info = document.createElement('div');
    info.className = 'inbox-item-info';
    const name = document.createElement('input');
    name.type = 'text';
    name.value = file.name;
    name.setAttribute('aria-label', `File name for ${file.name}`);
    name.dataset.inboxName = String(index);
    const meta = document.createElement('span');
    meta.textContent = `${formatFileSize(file.size || 0)} · ${new Date(file.modified).toLocaleString()}${file.encrypted ? '' : ' · not encrypted yet'}`;
    info.append(name, meta);
    const actions = document.createElement('div');
    actions.className = 'recycle-bin-actions';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'secondary';
    open.textContent = 'Open';
    open.dataset.inboxOpen = String(index);
    const fileIt = document.createElement('button');
    fileIt.type = 'button';
    fileIt.className = 'primary';
    fileIt.textContent = 'File';
    fileIt.dataset.inboxFile = String(index);
    const discard = document.createElement('button');
    discard.type = 'button';
    discard.className = 'secondary';
    discard.textContent = 'Discard';
    discard.title = 'Move this scan to the Recycle Bin';
    discard.dataset.inboxDiscard = String(index);
    discard.disabled = !file.encrypted;
    actions.append(open, discard, fileIt);
    li.append(info, actions);
    list.appendChild(li);
  });
}

async function fileInboxItem(index) {
  const file = inboxFiles[Number(index)];
  if (!file) return;
  const target = $('inboxFolder').value;
  if (!$('inboxClient').value || !target) {
    toast('Choose the client and folder to file into first.', true);
    $(!$('inboxClient').value ? 'inboxClient' : 'inboxFolder').focus();
    return;
  }
  const newName = document.querySelector(`[data-inbox-name="${Number(index)}"]`)?.value.trim() || file.name;
  const filed = await backend().FileInboxDocument(file.name, target, newName);
  inboxFiles = inboxFiles.filter(f => f !== file);
  renderInboxList();
  $('inboxCount').textContent = String(inboxFiles.length);
  $('inboxBtn').classList.toggle('hidden', inboxFiles.length === 0);
  await refreshTree(filed);
  toast(`${filed.split('/').pop()} filed.`);
}

function wireInbox() {
  $('inboxBtn').addEventListener('click', () => call(showInbox));
  $('inboxClose').addEventListener('click', hideInbox);
  $('inboxCloseTop').addEventListener('click', hideInbox);
  $('inboxRefresh').addEventListener('click', () => call(refreshInboxCount));
  $('inboxChangeFolder').addEventListener('click', () => call(async () => { if (await chooseInboxFolder()) await showInbox(); }));
  $('inboxClient').addEventListener('change', fillInboxFolders);
  $('inboxBackdrop').addEventListener('keydown', e => { if (e.key === 'Escape') hideInbox(); });
  $('inboxList').addEventListener('click', e => {
    const open = e.target.closest('[data-inbox-open]');
    if (open) { const f = inboxFiles[Number(open.dataset.inboxOpen)]; if (f) call(() => backend().OpenInboxFile(f.name)); return; }
    const fileIt = e.target.closest('[data-inbox-file]');
    if (fileIt) call(() => fileInboxItem(fileIt.dataset.inboxFile));
    const discard = e.target.closest('[data-inbox-discard]');
    if (discard) call(async () => {
      const f = inboxFiles[Number(discard.dataset.inboxDiscard)];
      if (!f || !confirm(`Move ${f.name} to the Recycle Bin? It can be restored for 30 days.`)) return;
      await backend().DiscardInboxFile(f.name);
      await refreshInboxCount();
      toast(`${f.name} moved to the Recycle Bin.`);
    });
  });
}
