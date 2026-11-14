// Recycle Bin: restore or permanently remove deleted files, tax years and clients.

let recycleBinItems = [];

const RECYCLE_KIND_LABELS = { file: 'File', taxyear: 'Tax year', client: 'Client' };

function formatRecycleDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function recycleDaysLeft(expiresAt) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}

async function showRecycleBin() {
  recycleBinItems = await backend().ListRecycleBin() || [];
  renderRecycleBin();
  $('recycleBinBackdrop').classList.remove('hidden');
  setTimeout(() => $('recycleBinClose').focus(), 20);
}

function hideRecycleBin() {
  $('recycleBinBackdrop').classList.add('hidden');
}

function renderRecycleBin() {
  const list = $('recycleBinList');
  list.replaceChildren();
  $('recycleBinEmpty').classList.toggle('hidden', recycleBinItems.length > 0);
  $('recycleBinEmptyAll').disabled = recycleBinItems.length === 0;
  recycleBinItems.forEach(item => {
    const li = document.createElement('li');
    li.className = 'needs-attention-item';
    const body = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = item.name;
    const meta = document.createElement('span');
    const days = recycleDaysLeft(item.expiresAt);
    meta.textContent = [
      RECYCLE_KIND_LABELS[item.kind] || 'Item',
      item.location,
      `deleted ${formatRecycleDate(item.deletedAt)}${item.deletedBy ? ` by ${item.deletedBy}` : ''}`,
      `${days} day${days === 1 ? '' : 's'} left`,
    ].filter(Boolean).join(' · ');
    body.append(name, meta);
    const actions = document.createElement('div');
    actions.className = 'recycle-bin-actions';
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'secondary';
    restore.textContent = 'Restore';
    restore.dataset.recycleRestore = item.id;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'danger admin-only';
    remove.textContent = 'Delete forever';
    remove.dataset.recycleDelete = item.id;
    actions.append(restore, remove);
    li.append(body, actions);
    list.appendChild(li);
  });
}

async function restoreRecycleItem(id) {
  const item = recycleBinItems.find(i => i.id === id);
  const restoredPath = await backend().RestoreFromRecycleBin(id);
  recycleBinItems = recycleBinItems.filter(i => i.id !== id);
  renderRecycleBin();
  await refreshTree(restoredPath);
  toast(`${item?.name || 'Item'} restored.`);
}

async function deleteRecycleItem(id) {
  const item = recycleBinItems.find(i => i.id === id);
  if (!confirm(`Permanently delete ${item?.name || 'this item'}? This cannot be undone.`)) return;
  await backend().DeleteFromRecycleBin(id);
  recycleBinItems = recycleBinItems.filter(i => i.id !== id);
  renderRecycleBin();
}

async function emptyRecycleBin() {
  if (!recycleBinItems.length) return;
  if (!confirm(`Permanently delete all ${recycleBinItems.length} item(s) in the Recycle Bin? This cannot be undone.`)) return;
  await backend().EmptyRecycleBin();
  recycleBinItems = [];
  renderRecycleBin();
  toast('Recycle Bin emptied.');
}

function wireRecycleBin() {
  $('recycleBinClose').addEventListener('click', hideRecycleBin);
  $('recycleBinCloseTop').addEventListener('click', hideRecycleBin);
  $('recycleBinEmptyAll').addEventListener('click', () => call(emptyRecycleBin));
  $('recycleBinBackdrop').addEventListener('keydown', e => { if (e.key === 'Escape') hideRecycleBin(); });
  $('recycleBinList').addEventListener('click', e => {
    const restore = e.target.closest('[data-recycle-restore]');
    if (restore) { call(() => restoreRecycleItem(restore.dataset.recycleRestore)); return; }
    const remove = e.target.closest('[data-recycle-delete]');
    if (remove) call(() => deleteRecycleItem(remove.dataset.recycleDelete));
  });
}
