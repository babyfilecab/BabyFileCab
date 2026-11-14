// Client tree: rendering, selection and navigation.

async function refreshTree(selectPath = null) {
  const oldSelectedPath = selectPath || selectedNode?.path || '';
  treeData = await backend().GetTree();
  selectedFilePaths = new Set([...selectedFilePaths].filter(path => findNodeByPath(path, treeData)?.type === "file"));
  renderTree();
  if (oldSelectedPath) {
    const node = findNodeByPath(oldSelectedPath, treeData);
    if (node) {
      expandAncestors(node.path);
      renderTree();
      selectNode(node, null, true);
      scrollToPath(node.path);
    }
  }
}

function renderTree() {
  const root = $('tree');
  root.innerHTML = '';
  const q = $('treeSearch').value.trim().toLowerCase();
  const filtered = q ? filterNodes(treeData, q) : treeData;
  if (!filtered.length) {
    root.innerHTML = '<div class="tree-empty">No clients yet.<br><br>Click <b>Add Client</b> in the top-right toolbar.</div>';
    return;
  }
  for (const node of filtered) root.appendChild(renderNode(node));
}

function renderNode(node) {
  const hasChildren = node.children && node.children.length > 0;
  if (hasChildren || ['client','permanent','taxyear','section'].includes(node.type)) {
    const details = document.createElement('details');
    details.className = `node-${node.type}`;
    details.dataset.path = node.path;
    details.open = expanded.has(node.path) || node.type === 'client';
    details.addEventListener('toggle', () => {
      if (details.open) expanded.add(node.path); else expanded.delete(node.path);
    });

    const summary = document.createElement('summary');
    summary.dataset.path = node.path;
    summary.dataset.dropPath = node.path;
    summary.style.setProperty('--wails-drop-target', 'drop');
    summary.appendChild(nodeContent(node));
    if (['client','permanent','taxyear','section'].includes(node.type)) {
      summary.dataset.internalDropPath = node.path;
      summary.classList.add('internal-drop-destination');
      summary.addEventListener('dragenter', internalDragEnter);
      summary.addEventListener('dragover', internalDragOver);
      summary.addEventListener('dragleave', internalDragLeave);
      summary.addEventListener('drop', e => handleInternalDocumentDrop(e, node.path, summary));
    }
    summary.addEventListener('click', e => {
      // Let the native details marker toggle while also selecting this exact row.
      selectNode(node, summary);
    });
    if (node.type === 'client') {
      summary.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();
        selectNode(node, summary);
        showClientContextMenu(node, e.clientX, e.clientY);
      });
    }
    if (node.type === 'taxyear') {
      summary.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();
        selectNode(node, summary);
        showTaxYearContextMenu(node, e.clientX, e.clientY);
      });
    }
    if (node.type === 'section') {
      summary.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();
        selectNode(node, summary);
        showSectionContextMenu(node, e.clientX, e.clientY);
      });
    }
    if (selectedNode?.path === node.path) summary.classList.add('selected');
    details.appendChild(summary);

    const children = document.createElement('div');
    children.className = 'node-children';
    for (const child of (node.children || [])) children.appendChild(renderNode(child));
    details.appendChild(children);
    return details;
  }

  const row = document.createElement('div');
  row.className = 'tree-leaf';
  row.dataset.path = node.path;
  row.dataset.dropPath = node.path;
  row.style.setProperty('--wails-drop-target', 'drop');
  row.appendChild(nodeContent(node));
  row.addEventListener('click', event => handleFileSelection(event, node, row));
  if (node.type === 'file') {
    row.addEventListener('contextmenu', e => {
      e.preventDefault();
      e.stopPropagation();
      selectNode(node, row, selectedFilePaths.has(node.path));
      showDocumentContextMenu(node, e.clientX, e.clientY);
    });
  }

  // Internal document drag-and-drop. Documents can be moved between clients,
  // Permanent Folder, tax years, and sections. notes.txt remains protected.
  if (node.type === 'file' && node.name !== 'notes.txt') {
    row.draggable = true;
    row.dataset.dragFilePath = node.path;
    row.title = 'Drag this document to another client, tax year, or section';
    row.addEventListener('dragstart', e => startInternalDocumentDrag(e, node, row));
    row.addEventListener('dragend', finishInternalDocumentDrag);
  }

  if (selectedFilePaths.has(node.path) || selectedNode?.path === node.path) row.classList.add('selected');
  return row;
}

function nodeContent(node) {
  const wrap = document.createElement('span');
  wrap.className = 'node-content';
  const icon = document.createElement('span');
  icon.className = 'node-icon';
  if (node.type === 'client') {
    icon.classList.add('client-baby-icon');
    icon.innerHTML = `<svg viewBox="0 0 32 32" aria-label="baby face" role="img"><circle cx="16" cy="17" r="11" fill="#ffd25a" stroke="#d8a62b" stroke-width="1.2"/><path d="M13 7c0-3.2 5.6-3.1 5.6.2 0 1.7-1.6 2.5-3 2.1-1.3-.3-1.7-1.5-1.1-2.4" fill="none" stroke="#9b6427" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="16" r="1.3" fill="#4e3927"/><circle cx="20" cy="16" r="1.3" fill="#4e3927"/><path d="M12.5 21c1.8 2 5.2 2 7 0" fill="none" stroke="#a14f46" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="18.5" r="1.4" fill="#f4a7a1" opacity=".65"/><circle cx="24" cy="18.5" r="1.4" fill="#f4a7a1" opacity=".65"/></svg>`;
  } else {
    icon.classList.add(`node-icon-${node.type === 'file' ? 'file' : 'folder'}`);
    icon.innerHTML = treeIconSVG(node);
  }
  const name = document.createElement('span');
  name.className = 'node-name';
  name.textContent = node.name;
  wrap.append(icon, name);
  if (node.type === 'file' && node.done) {
    wrap.classList.add('document-entered-done');
    const done = document.createElement('span');
    done.className = 'document-done-check';
    done.textContent = '✓';
    done.title = 'Entered / Done';
    done.setAttribute('aria-label', 'Entered / Done');
    wrap.appendChild(done);
  }
  return wrap;
}

// Static, trusted SVG markup only: never interpolate node names in here.
const TREE_ICON_FOLDER = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2.5 5.5a1.5 1.5 0 0 1 1.5-1.5h3.6l1.6 1.8H16a1.5 1.5 0 0 1 1.5 1.5v7.2A1.5 1.5 0 0 1 16 16H4a1.5 1.5 0 0 1-1.5-1.5z" fill="currentColor" opacity=".18"/><path d="M2.5 5.5a1.5 1.5 0 0 1 1.5-1.5h3.6l1.6 1.8H16a1.5 1.5 0 0 1 1.5 1.5v7.2A1.5 1.5 0 0 1 16 16H4a1.5 1.5 0 0 1-1.5-1.5z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';
const TREE_ICON_PERMANENT = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2.5 5.5a1.5 1.5 0 0 1 1.5-1.5h3.6l1.6 1.8H16a1.5 1.5 0 0 1 1.5 1.5v7.2A1.5 1.5 0 0 1 16 16H4a1.5 1.5 0 0 1-1.5-1.5z" fill="currentColor" opacity=".18"/><path d="M2.5 5.5a1.5 1.5 0 0 1 1.5-1.5h3.6l1.6 1.8H16a1.5 1.5 0 0 1 1.5 1.5v7.2A1.5 1.5 0 0 1 16 16H4a1.5 1.5 0 0 1-1.5-1.5z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="m10 8.3.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2L7.1 10.4l2-.3z" fill="currentColor"/></svg>';
const TREE_ICON_YEAR = '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4.5" width="14" height="12" rx="2" fill="currentColor" opacity=".14"/><rect x="3" y="4.5" width="14" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M3 8.5h14M7 3v3M13 3v3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
function treeFileIcon(color, label) {
  return `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 2.5h6.5L15.5 6.5v10a1 1 0 0 1-1 1h-9.5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z" fill="#fff" stroke="#94a3b8" stroke-width="1.2" stroke-linejoin="round"/><path d="M11.5 2.5v4h4" fill="none" stroke="#94a3b8" stroke-width="1.2" stroke-linejoin="round"/>${label ? `<rect x="2" y="10" width="12" height="6" rx="1.2" fill="${color}"/><text x="8" y="14.6" text-anchor="middle" font-size="4.6" font-weight="700" font-family="sans-serif" fill="#fff">${label}</text>` : `<path d="M7 10h6M7 12.5h6M7 15h4" stroke="${color}" stroke-width="1.2" stroke-linecap="round"/>`}</svg>`;
}
function treeIconSVG(node) {
  if (node.type === 'permanent') return TREE_ICON_PERMANENT;
  if (node.type === 'taxyear') return TREE_ICON_YEAR;
  if (node.type === 'section') return TREE_ICON_FOLDER;
  const ext = (String(node.name || '').split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return treeFileIcon('#dc2626', 'PDF');
  if (['png','jpg','jpeg','gif','webp','bmp'].includes(ext)) return treeFileIcon('#7c3aed', 'IMG');
  if (ext === 'csv' || ext === 'xls' || ext === 'xlsx') return treeFileIcon('#16a34a', ext === 'csv' ? 'CSV' : 'XLS');
  if (ext === 'doc' || ext === 'docx' || ext === 'rtf') return treeFileIcon('#2563eb', 'DOC');
  if (['eml','msg','mbox','oft'].includes(ext)) return treeFileIcon('#0891b2', 'EML');
  return treeFileIcon('#64748b', '');
}

const EMPTY_PREVIEW_ICON = '<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><rect x="14" y="8" width="36" height="48" rx="4" fill="currentColor" opacity=".08"/><path d="M18 8h20l12 12v32a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M38 8v12h12M22 32h20M22 39h20M22 46h12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function iconFor(node) {
  if (node.type === 'client') return '👶';
  if (node.type === 'permanent') return '📁';
  if (node.type === 'taxyear') return '🗓️';
  if (node.type === 'section') return '📁';
  const ext = (node.name.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return '📕';
  if (['png','jpg','jpeg','gif','webp'].includes(ext)) return '🖼️';
  if (ext === 'csv' || ext === 'xls' || ext === 'xlsx') return '📊';
  if (ext === 'doc' || ext === 'docx' || ext === 'rtf') return '📘';
  if (['eml','msg','mbox','oft'].includes(ext)) return '✉️';
  return '📄';
}

function fileSelectionRange(paths, anchor, target) {
  const first = paths.indexOf(anchor), last = paths.indexOf(target);
  if (first < 0 || last < 0) return [target];
  return paths.slice(Math.min(first, last), Math.max(first, last) + 1);
}

function visibleClientFilePaths(node) {
  const client = treeData.find(c => node.path.startsWith(c.path + '/') || node.path.startsWith(c.path + '\\'));
  if (!client) return [node.path];
  return [...$('tree').querySelectorAll('.tree-leaf[data-path]')].filter(row => {
    const path = row.dataset.path;
    if (!(path.startsWith(client.path + '/') || path.startsWith(client.path + '\\'))) return false;
    for (let parent = row.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS' && !parent.open) return false;
    }
    return true;
  }).map(row => row.dataset.path);
}

function paintFileSelection() {
  $('tree').querySelectorAll('.tree-leaf[data-path]').forEach(row => {
    row.classList.toggle('selected', selectedFilePaths.has(row.dataset.path));
    row.setAttribute('aria-selected', String(selectedFilePaths.has(row.dataset.path)));
  });
}

function handleFileSelection(event, node, row) {
  if (event.shiftKey && fileSelectionAnchor) {
    event.preventDefault();
    selectedFilePaths = new Set(fileSelectionRange(visibleClientFilePaths(node), fileSelectionAnchor, node.path));
  } else {
    selectedFilePaths = new Set([node.path]);
    fileSelectionAnchor = node.path;
  }
  selectNode(node, row, true);
}

async function selectNode(node, element = null, preserveFileSelection = false) {
  if (!preserveFileSelection || node.type !== 'file') {
    selectedFilePaths = new Set(node.type === 'file' ? [node.path] : []);
    fileSelectionAnchor = node.type === 'file' ? node.path : null;
  }
  selectedNode = node;
  if (selectedElement) selectedElement.classList.remove('selected');
  selectedElement = element || document.querySelector(`[data-path="${cssEscape(node.path)}"] > summary, [data-path="${cssEscape(node.path)}"].tree-leaf`);
  if (selectedElement) selectedElement.classList.add('selected');
  // Keep the 5-digit client ID out of the normal tree/selection display.
  // It is available from right-click > Client Properties.
  paintFileSelection();
  $('selectionTitle').textContent = selectedFilePaths.size > 1 ? `${selectedFilePaths.size} files selected — ${node.name}` : node.name;
  await updateSelectionClientSummary(node);
  const shell = document.querySelector('.preview-shell');
  if (shell) { shell.dataset.dropPath = node.path; shell.style.setProperty('--wails-drop-target', 'drop'); }
  await showSelection(node);
}

async function showSelection(node) {
  const generation = sessionGeneration;
  currentPDF = null;
  closePDFDocument();
  pdfSearchResults = [];
  pdfSearchIndex = -1;
  if (node.type === 'client' || node.type === 'permanent' || (node.type === 'file' && node.name === 'notes.txt')) {
    const [notes, history] = await Promise.all([
      backend().GetNotesDocument(node.path),
      backend().GetAuditTrail(node.path),
    ]);
    if (generation !== sessionGeneration || !currentUser) return;
    renderNotes(node, notes, history || []);
    return;
  }
  if (node.type !== 'file') {
    renderFolderInfo(node);
    return;
  }
  const preview = await backend().GetPreview(node.path);
  if (generation !== sessionGeneration || !currentUser) return;
  await renderPreview(preview);
}

function selectedClient() {
  if (!selectedNode) return null;
  for (const c of treeData) {
    if (selectedNode.path === c.path || selectedNode.path.startsWith(c.path + '/') || selectedNode.path.startsWith(c.path + '\\')) return c;
  }
  return null;
}

function clientNameFor(path) {
  for (const c of treeData) if (path === c.path || path.startsWith(c.path + '/') || path.startsWith(c.path + '\\')) return c.name;
  return 'Client';
}

function findNodeByPath(path, nodes) {
  for (const n of nodes) {
    if (n.path === path) return n;
    const found = findNodeByPath(path, n.children || []);
    if (found) return found;
  }
  return null;
}

function filterNodes(nodes, q) {
  const out = [];
  for (const n of nodes) {
    const kids = filterNodes(n.children || [], q);
    if (n.name.toLowerCase().includes(q) || (n.clientId || '').includes(q) || kids.length) out.push({...n, children: kids});
  }
  return out;
}

function expandAncestors(path) {
  for (const c of treeData) {
    if (path === c.path || path.startsWith(c.path + '/') || path.startsWith(c.path + '\\')) {
      expanded.add(c.path);
      markExpanded(c, path);
    }
  }
}

function markExpanded(node, path) {
  for (const child of node.children || []) {
    if (path === child.path || path.startsWith(child.path + '/') || path.startsWith(child.path + '\\')) {
      if (child.type !== 'file') expanded.add(child.path);
      markExpanded(child, path);
    }
  }
}

function scrollToPath(path) {
  setTimeout(() => {
    const els = [...document.querySelectorAll('[data-path]')];
    const el = els.find(x => x.dataset.path === path);
    el?.scrollIntoView({block:'nearest'});
  }, 30);
}
