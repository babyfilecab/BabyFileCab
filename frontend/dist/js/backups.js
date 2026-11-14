// Automatic backups: settings dialog, the background schedule, and restoring
// a backup from the sign-in screen.

let backupTimer = null;
let backupFailureShown = false;

function describeBackupStatus(s) {
  const when = v => new Date(v).toLocaleString();
  if (s.lastError) return { ok: false, text: `Last backup failed ${when(s.lastRun)}: ${s.lastError}` };
  if (s.lastOk) return { ok: true, text: `Last backup ${when(s.lastOk)}${s.lastSizeMb ? ` (${s.lastSizeMb} MB)` : ''}.` };
  return { ok: true, text: 'No backup has been made yet.' };
}

function renderBackupStatus(s) {
  const status = describeBackupStatus(s);
  const box = $('backupStatus');
  box.textContent = status.text;
  box.classList.toggle('is-error', !status.ok);
}

async function showBackupSettings() {
  const s = await backend().GetBackupSettings();
  $('backupFolder').value = s.folder || '';
  $('backupFrequency').value = s.frequency || 'off';
  $('backupKeep').value = String(s.keep || 10);
  renderBackupStatus(s);
  const admin = currentUser?.role === 'administrator';
  ['backupChooseFolder', 'backupFrequency', 'backupKeep', 'backupSave'].forEach(id => { $(id).disabled = !admin; });
  if (!admin) $('backupStatus').textContent += ' Only an administrator can change these settings.';
  $('backupBackdrop').classList.remove('hidden');
}

function hideBackupSettings() {
  $('backupBackdrop').classList.add('hidden');
}

async function saveBackupSettingsFromDialog() {
  const s = await backend().SaveBackupSettings($('backupFolder').value, $('backupFrequency').value, Number($('backupKeep').value));
  renderBackupStatus(s);
  hideBackupSettings();
  toast(s.frequency === 'off' ? 'Automatic backups are off.' : `Automatic backups: ${s.frequency === 'daily' ? 'every day' : 'every week'}.`);
  runScheduledBackup();
}

async function backUpNowFromDialog() {
  const button = $('backupNow');
  button.disabled = true;
  button.textContent = 'Backing up…';
  try {
    if ($('backupFolder').value && currentUser?.role === 'administrator') {
      await backend().SaveBackupSettings($('backupFolder').value, $('backupFrequency').value, Number($('backupKeep').value));
    }
    const s = await backend().BackUpNow();
    renderBackupStatus(s);
    toast('Backup saved and verified.');
  } catch (e) {
    showError(e);
    renderBackupStatus(await backend().GetBackupSettings());
  } finally {
    button.disabled = false;
    button.textContent = 'Back Up Now';
  }
}

async function runScheduledBackup() {
  if (!currentUser) return;
  try {
    const s = await backend().RunScheduledBackup();
    if (s.lastError && !backupFailureShown) {
      backupFailureShown = true;
      toast(`Automatic backup failed: ${s.lastError}`, true);
    }
  } catch (e) {
    if (!backupFailureShown) {
      backupFailureShown = true;
      toast(`Automatic backup failed: ${e?.message || e}`, true);
    }
  }
}

function startBackupSchedule() {
  stopBackupSchedule();
  backupFailureShown = false;
  // Give sign-in a moment to settle, then check every 30 minutes.
  backupTimer = setTimeout(function tick() {
    runScheduledBackup();
    backupTimer = setTimeout(tick, 30 * 60 * 1000);
  }, 60 * 1000);
}

function stopBackupSchedule() {
  clearTimeout(backupTimer);
  backupTimer = null;
  $('backupBackdrop')?.classList.add('hidden');
}

async function restoreBackupFromSignIn() {
  const info = await backend().ChooseBackupToRestore();
  if (!info || !info.path) return;
  const created = info.createdAt ? new Date(info.createdAt).toLocaleString() : 'an unknown date';
  if (!confirm(`Restore the backup from ${created}?\n\nEverything in BabyFileCab will go back to how it was then. Your current data is not deleted; it is moved to a folder named BabyFileCabData-before-restore.`)) return;
  const setAside = await backend().RestoreFullBackup(info.path);
  await initialiseAuth();
  toast(setAside ? `Backup restored. Your previous data was kept in ${setAside}.` : 'Backup restored.');
}

function wireBackups() {
  $('restoreBackupBtn').addEventListener('click', () => call(restoreBackupFromSignIn));
  $('backupChooseFolder').addEventListener('click', () => call(async () => {
    const folder = await backend().ChooseBackupFolder();
    if (folder) {
      $('backupFolder').value = folder;
      if ($('backupFrequency').value === 'off') $('backupFrequency').value = 'daily';
    }
  }));
  $('backupSave').addEventListener('click', () => call(saveBackupSettingsFromDialog));
  $('backupNow').addEventListener('click', () => call(backUpNowFromDialog));
  $('backupCancel').addEventListener('click', hideBackupSettings);
  $('backupBackdrop').addEventListener('keydown', e => { if (e.key === 'Escape') hideBackupSettings(); });
}
