// Toolbar actions and drag and drop.

async function doAction(action) {
  await call(async () => {
    switch (action) {
      case 'global-find': {
        showGlobalFind();
        break;
      }
      case 'add-client': {
        const info = await askClientDetails();
        if (!info) return;
        const path = await backend().AddClient(info.name, info.address, info.phone, info.email, info.taxId, info.returnType);
        expanded.add(path);
        expanded.add(`${path}/Permanent Folder`);
        await refreshTree(path);
        break;
      }
      case 'edit-client': {
        const client = selectedClient(); if (!client) throw new Error('Select a client first.');
        const props = await backend().GetClientProperties(client.path);
        const info = await askClientDetails(props, 'edit');
        if (!info) return;
        let clientPath = client.path;
        if (info.name && info.name.trim() !== client.name.trim()) {
          clientPath = await backend().RenameClient(client.path, info.name);
        }
        await backend().UpdateClientProfile(clientPath, info.address, info.phone, info.email, info.taxId, info.returnType);
        await refreshTree(clientPath);
        toast('Client profile updated.');
        break;
      }
      case 'rename-client': {
        const client = selectedClient(); if (!client) throw new Error('Select a client first.');
        const name = await ask('Rename Client', 'Enter the new client or business name:', client.name);
        if (!name) return;
        const path = await backend().RenameClient(client.path, name);
        await refreshTree(path);
        break;
      }
      case 'delete-client': {
        const client = selectedClient(); if (!client) throw new Error('Select a client first.');
        if (!confirm(`Move ${client.name} and every document inside it to the Recycle Bin? You can restore it for 30 days.`)) return;
        await backend().DeleteClient(client.path); selectedNode = null; await refreshTree(); clearPreview(); break;
      }
      case 'add-year': {
        const client = selectedClient(); if (!client) throw new Error('Select a client first.');
        const year = await ask('Add Tax Year', 'Enter a 4-digit tax year:', new Date().getFullYear().toString());
        if (!year) return;
        const path = await backend().AddTaxYear(client.path, year);
        expanded.add(client.path); expanded.add(path); await refreshTree(path); break;
      }
      case 'edit-year': {
        if (selectedNode?.type !== 'taxyear') throw new Error('Select a tax year first.');
        const year = await ask('Edit Tax Year', 'Enter the new 4-digit tax year:', selectedNode.name);
        if (!year) return;
        const path = await backend().RenameTaxYear(selectedNode.path, year); await refreshTree(path); break;
      }
      case 'delete-year': {
        if (selectedNode?.type !== 'taxyear') throw new Error('Select a tax year first.');
        if (!confirm(`Move tax year ${selectedNode.name} and everything inside it to the Recycle Bin? You can restore it for 30 days.`)) return;
        await backend().DeleteTaxYear(selectedNode.path); selectedNode = null; await refreshTree(); clearPreview(); break;
      }
      case 'add-section': {
        if (!selectedNode || !['client','taxyear','section'].includes(selectedNode.type)) throw new Error('Select a client, tax year, or section first.');
        const selectedParent = selectedNode.path;
        const name = await ask('Add Section', 'Enter the section name:', 'Source Documents');
        if (!name) return;
        const path = await backend().AddSection(selectedParent, name);
        expandAncestors(path); expanded.add(path); clearPreview();
        await refreshTree(path); break;
      }
      case 'edit-section': {
        if (selectedNode?.type !== 'section') throw new Error('Select a section first.');
        const name = await ask('Edit Section', 'Enter the new section name:', selectedNode.name);
        if (!name) return;
        const path = await backend().RenameSection(selectedNode.path, name); await refreshTree(path); break;
      }
      case 'delete-section': {
        if (selectedNode?.type !== 'section') throw new Error('Select a section first.');
        if (!confirm(`Delete empty section ${selectedNode.name}? Files and subsections must be removed first.`)) return;
        await backend().DeleteSection(selectedNode.path); selectedNode = null; await refreshTree(); clearPreview(); break;
      }
      case 'upload': {
        if (!selectedNode) throw new Error('Select a client, Permanent Folder, tax year, or section first.');
        const files = await backend().UploadFiles(selectedNode.path);
        if (files && files.length) {
          const last = files[files.length - 1];
          expandAncestors(last); await refreshTree(last); toast(`${files.length} file(s) uploaded.`);
        }
        break;
      }
      case 'rename-file': {
        if (selectedNode?.type !== 'file' || selectedNode.name === 'notes.txt') throw new Error('Select a file other than notes.txt first.');
        const document = selectedNode;
        const name = await ask('Edit Document Name', 'Enter the new file name, including its extension:', document.name);
        if (!name) return;
        const path = await backend().RenameFile(document.path, name);
        selectedFilePaths.clear(); fileSelectionAnchor = path;
        selectedFilePaths.add(path); await refreshTree(path); break;
      }
      case 'delete-file': {
        if (selectedNode?.type !== 'file' || selectedNode.name === 'notes.txt') throw new Error('Select a file other than notes.txt first.');
        const files = [...selectedFilePaths].map(path => findNodeByPath(path, treeData)).filter(node => node?.type === 'file');
        if (!files.length) files.push(selectedNode);
        if (files.some(node => node.name === 'notes.txt')) throw new Error('Client notes.txt cannot be deleted. Deselect it first.');
        if (!confirm(files.length > 1 ? `Move all ${files.length} selected files to the Recycle Bin?` : `Move ${files[0].name} to the Recycle Bin?`)) return;
        try {
          for (const file of files) await backend().DeleteFile(file.path);
        } finally {
          selectedFilePaths.clear(); fileSelectionAnchor = null;
          selectedNode = null; await refreshTree(); clearPreview();
        }
        break;
      }
    }
  });
}

function startInternalDocumentDrag(e, node, element) {
  internalDraggedPath = node.path;
  internalDraggedElement = element;
  element.classList.add('internal-dragging');
  document.body.classList.add('internal-document-drag-active');

  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-babyfilecab-document', node.path);
    e.dataTransfer.setData('text/plain', node.path);
    try {
      const ghost = element.cloneNode(true);
      ghost.classList.add('internal-drag-ghost');
      ghost.style.width = `${Math.max(240, element.getBoundingClientRect().width)}px`;
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 18, 18);
      setTimeout(() => ghost.remove(), 0);
    } catch (_) {}
  }
}

function finishInternalDocumentDrag() {
  internalDraggedElement?.classList.remove('internal-dragging');
  internalDraggedElement = null;
  internalDraggedPath = '';
  document.body.classList.remove('internal-document-drag-active');
  document.querySelectorAll('.internal-drop-active').forEach(el => el.classList.remove('internal-drop-active'));
}

function internalDragEnter(e) {
  if (!internalDraggedPath) return;
  e.preventDefault();
  e.currentTarget.classList.add('internal-drop-active');
}

function internalDragOver(e) {
  if (!internalDraggedPath) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('internal-drop-active');
}

function internalDragLeave(e) {
  if (!internalDraggedPath) return;
  const current = e.currentTarget;
  if (e.relatedTarget && current.contains(e.relatedTarget)) return;
  current.classList.remove('internal-drop-active');
}

async function handleInternalDocumentDrop(e, targetPath, targetElement) {
  if (!internalDraggedPath) return;
  e.preventDefault();
  e.stopPropagation();
  targetElement?.classList.remove('internal-drop-active');

  const sourcePath = internalDraggedPath;
  try {
    const movedPath = await backend().MoveDocument(sourcePath, targetPath);
    finishInternalDocumentDrag();
    expandAncestors(movedPath);
    await refreshTree(movedPath);
    toast('Document moved.');
  } catch (err) {
    finishInternalDocumentDrag();
    showError(err);
  }
}

function wireNativeFileDrop() {
  if (!window.runtime || typeof window.runtime.OnFileDrop !== 'function') {
    console.warn('Wails file-drop runtime is not available.');
    return;
  }
  window.runtime.OnFileDrop(async (x, y, paths) => {
    try {
      if (!paths || !paths.length) return;
      let el = document.elementFromPoint(x, y);
      let target = el?.closest?.('[data-drop-path]');
      let targetPath = target?.dataset?.dropPath || selectedNode?.path || '';
      if (!targetPath) throw new Error('Select a client or folder before dropping files.');
      const copied = await backend().ImportDroppedFiles(targetPath, paths);
      if (copied && copied.length) {
        const last = copied[copied.length - 1];
        expandAncestors(last);
        await refreshTree(last);
        toast(`${copied.length} file(s) added by drag and drop.`);
      }
    } catch (e) {
      showError(e);
    }
  }, true);
}
