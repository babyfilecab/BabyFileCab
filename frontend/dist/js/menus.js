// Top menu bar.

function closeAppMenus() {
  document.querySelectorAll('.menu-dropdown').forEach(menu => menu.classList.add('hidden'));
  document.querySelectorAll('.menu-trigger').forEach(btn => btn.classList.remove('active'));
}

function toggleAppMenu(id) {
  const target = $(id);
  const wasOpen = target && !target.classList.contains('hidden');
  closeAppMenus();
  if (!target || wasOpen) return;
  target.classList.remove('hidden');
  document.querySelector(`.menu-trigger[data-menu="${id}"]`)?.classList.add('active');
}

async function handleMenuAction(action) {
  try {
    switch (action) {
      case 'new-client':
        await doAction('add-client');
        break;
      case 'edit-client-picker': {
        const client = await chooseClient('Edit Client', 'Choose the client whose contact and tax profile you want to edit.');
        if (!client) return;
        selectNode(client);
        await doAction('edit-client');
        break;
      }
      case 'rename-client-picker': {
        const client = await chooseClient('Rename Client', 'Choose the client you want to rename.');
        if (!client) return;
        selectNode(client);
        await doAction('rename-client');
        break;
      }
      case 'delete-client-picker': {
        const client = await chooseClient('Delete Client', 'Choose the client to move to the Recycle Bin. You can restore it for 30 days.');
        if (!client) return;
        selectNode(client);
        await doAction('delete-client');
        break;
      }
      case 'backup-client': {
        const client = await chooseClient('Back Up Client Files', 'Choose one client from the full active client list. BabyFileCab will create an encrypted .bfcbackup archive of that client.');
        if (!client) return;
        const dest = await backend().BackupClient(client.path);
        if (dest) toast(`Backup created: ${dest}`);
        break;
      }
      case 'restore-client': {
        const client = await chooseClient('Restore Client', 'Choose the client that should receive the selected encrypted .bfcbackup or legacy ZIP backup.');
        if (!client) return;
        if (!confirm(`Restore a backup into ${client.name}? Files from the backup may replace files with the same name.`)) return;
        const source = await backend().RestoreClient(client.path);
        if (source) {
          await refreshTree(client.path);
          toast(`Client restored from ${source}`);
        }
        break;
      }
      case 'archive-client': {
        const client = await chooseClient('Archive Client', 'Choose the client you want to move out of the active Work Space.');
        if (!client) return;
        if (!confirm(`Archive ${client.name}? The client will be moved to BabyFileCab's local Archive folder.`)) return;
        await backend().ArchiveClient(client.path);
        if (selectedNode && (selectedNode.path === client.path || selectedNode.path.startsWith(client.path + '/'))) {
          selectedNode = null;
          clearPreview();
        }
        await refreshTree();
        toast(`${client.name} archived.`);
        break;
      }
      case 'client-communications':
        await showClientCommunications();
        break;
      case 'sign-out':
        await signOut();
        break;
      case 'exit':
        if (confirm('Exit BabyFileCab?')) backend().ExitBabyFileCab();
        break;
      case 'search-clients': {
        const client = await chooseClient('Search Clients', 'Search by client name or client ID, then select a client to open its documents.');
        if (client) { expandAncestors(client.path); await refreshTree(client.path); }
        break;
      }
      case 'search-documents':
      case 'global-find':
        showGlobalFind();
        break;
      case 'auto-backup':
        await showBackupSettings();
        break;
      case 'scan-inbox':
        await showInbox();
        break;
      case 'inbox-folder':
        await chooseInboxFolder();
        break;
      case 'recycle-bin':
        await showRecycleBin();
        break;
      case 'unarchive-clients': {
        const archivedClients = await backend().ListArchivedClients();
        if (!archivedClients || !archivedClients.length) {
          toast('There are no archived clients.', true);
          return;
        }
        const client = await chooseClientFromItems('Unarchive Clients', 'Choose an archived client to return to the active Work Space.', archivedClients);
        if (!client) return;
        if (!confirm(`Unarchive ${client.name}? The client will return to the active Work Space.`)) return;
        const restoredPath = await backend().UnarchiveClient(client.path);
        expanded.add(restoredPath);
        await refreshTree(restoredPath);
        toast(`${client.name} unarchived.`);
        break;
      }
      case 'rename-selected-document':
        await doAction('rename-file');
        break;
      case 'delete-selected':
        if (selectedNode?.type === 'file') await doAction('delete-file');
        else if (selectedNode?.type === 'client') await doAction('delete-client');
        else if (selectedNode?.type === 'taxyear') await doAction('delete-year');
        else if (selectedNode?.type === 'section') await doAction('delete-section');
        else throw new Error('Select a client, tax year, section, or document first.');
        break;
      case 'open-data-folder':
        await backend().OpenDataFolder();
        break;
      case 'manage-users':
        await showManageUsers();
        break;
      case 'create-company-user':
        await showExistingCompanyUser();
        break;
      case 'shortcut-mapper':
        showShortcutMapper();
        break;
      case 'change-password':
        hideChangePassword();
        $('changePasswordBackdrop').classList.remove('hidden');
        $('changeCurrentPassword').focus();
        break;
      case 'auto-lock-15':
      case 'auto-lock-30':
      case 'auto-lock-45': {
        const minutes = Number(action.split('-').pop());
        await backend().SetAutoLockMinutes(minutes);
        AUTO_LOCK_MS = minutes * 60 * 1000;
        lastDesktopInput = Date.now();
        updateAutoLockMenu();
        toast(`Auto-lock set to ${minutes} minutes of inactivity.`);
        break;
      }
      case 'theme-light':
        applyTheme('light');
        break;
      case 'theme-dark':
        applyTheme('dark');
        break;
      case 'tax-calculator':
        await backend().LogAppEvent('Federal Tax Calculator opened', 'Tools menu');
        showTaxCalculator();
        break;
      case 'needs-attention':
        await refreshNeedsAttention({ open: true });
        break;
      case 'firm-calendar':
        await backend().LogAppEvent('Firm Calendar opened', `${firmCalendarYear} weekly client schedule`);
        await showFirmCalendar();
        break;
      case 'time-sheet':
        await backend().LogAppEvent('Time Sheet opened', 'Client time tracking');
        await showTimeSheet();
        break;
      case 'engagement-letter':
        await backend().LogAppEvent('Engagement Letter opened', 'Tools menu');
        await showEngagementLetter();
        break;
      case 'create-invoice':
        await backend().LogAppEvent('Create Invoice opened', 'Tools menu');
        await showInvoiceGenerator();
        break;
      case 'currency-converter':
        await backend().LogAppEvent('Currency Converter opened', 'IRS yearly-average currency exchange rates');
        showCurrencyConverter();
        break;
      case 'app-audit-trail':
        await backend().LogAppEvent('Audit Trail opened', 'Company-wide history viewed');
        await showAppAuditTrail();
        break;
      case 'how-to-use':
        showUserManual();
        $('gettingStartedGuide').querySelector('details').open = true;
        break;
      case 'user-manual':
        showUserManual();
        break;
      case 'about':
        showAbout();
        break;
    }
  } catch (e) {
    showError(e);
  }
}
