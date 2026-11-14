// Settings window: everything you can change, grouped in one place.

let settingsSection = 'account';
// Set at the start of each Escape key press: was another window open on top
// of Settings? Some windows close themselves on Escape before the main
// handler runs, so it has to be checked first.
let settingsEscapeBlocked = false;

function showSettingsSection(name) {
  const nav = document.querySelector(`.settings-nav-item[data-settings-section="${name}"]`);
  if (!nav || getComputedStyle(nav).display === 'none') name = 'account';
  settingsSection = name;
  document.querySelectorAll('.settings-nav-item').forEach(b => b.classList.toggle('active', b.dataset.settingsSection === name));
  document.querySelectorAll('.settings-section').forEach(p => p.classList.toggle('hidden', p.dataset.settingsPanel !== name));
}

function updateSettingsTheme() {
  document.querySelectorAll('[data-theme-choice]').forEach(b => {
    const on = b.dataset.themeChoice === currentTheme;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', String(on));
  });
}

function updateSettingsAutoLock() {
  document.querySelectorAll('[data-auto-lock]').forEach(b => {
    const on = AUTO_LOCK_MS === Number(b.dataset.autoLock) * 60000;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', String(on));
  });
}

function shortDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

async function refreshSettingsDetails() {
  const [backup, inbox, folder, updates, version] = await Promise.all([
    backend().GetBackupSettings().catch(() => null),
    backend().GetInboxFolder().catch(() => ''),
    backend().DataRoot().catch(() => ''),
    backend().GetUpdateCheckEnabled().catch(() => false),
    backend().AppVersion().catch(() => ''),
  ]);
  if (backup && backup.frequency && backup.frequency !== 'off') {
    const last = backup.lastOk ? ` Last backup ${shortDate(backup.lastOk)}.` : ' No backup yet.';
    $('settingsBackupStatus').textContent = `${backup.frequency === 'daily' ? 'Daily' : 'Weekly'} to ${backup.folder}, keeping ${backup.keep}.${last}`;
  } else {
    $('settingsBackupStatus').textContent = 'Off. Back up everything to an external drive or network folder every day or week.';
  }
  if (!isAdministrator()) $('settingsBackupStatus').textContent += ' An administrator can change this.';
  $('settingsBackupButton').textContent = backup && backup.frequency && backup.frequency !== 'off' ? 'Change…' : 'Set Up…';
  $('settingsInboxStatus').textContent = inbox
    ? `Watching ${inbox}. New scans are encrypted and show up in File › Scan Inbox.`
    : 'Not set. Choose the folder your scanner or phone app saves to.';
  $('settingsInboxChoose').textContent = inbox ? 'Change Folder…' : 'Choose Folder…';
  $('settingsInboxClear').classList.toggle('hidden', !inbox);
  $('settingsDataFolder').textContent = folder;
  $('settingsUpdateCheck').checked = Boolean(updates);
  $('settingsVersion').textContent = version ? `BabyFileCab ${version}` : 'BabyFileCab';
}

async function showSettings(section = settingsSection) {
  if (!currentUser) return;
  const name = [currentUser.firstName, currentUser.lastName].filter(Boolean).join(' ') || currentUser.username;
  $('settingsName').textContent = name;
  $('settingsRole').textContent = `${displayRole(currentUser.role)}${currentUser.companyName ? ` • ${currentUser.companyName}` : ''} • @${currentUser.username}`;
  $('settingsAvatar').textContent = $('signedInAvatar').textContent;
  updateSettingsTheme();
  updateSettingsAutoLock();
  showSettingsSection(section);
  $('settingsBackdrop').classList.remove('hidden');
  setTimeout(() => document.querySelector('.settings-nav-item.active')?.focus(), 20);
  await refreshSettingsDetails();
}

function hideSettings() {
  if ($('settingsBackdrop').contains(document.activeElement)) document.activeElement.blur();
  $('settingsBackdrop').classList.add('hidden');
}

function wireSettings() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') settingsEscapeBlocked = [...document.querySelectorAll('.modal-backdrop:not(.hidden)')].some(m => m.id !== 'settingsBackdrop');
  }, true);
  $('settingsClose').addEventListener('click', hideSettings);
  $('settingsBackdrop').addEventListener('click', e => { if (e.target === $('settingsBackdrop')) hideSettings(); });
  document.querySelector('.settings-nav').addEventListener('click', e => {
    const b = e.target.closest('[data-settings-section]');
    if (b) showSettingsSection(b.dataset.settingsSection);
  });
  $('settingsBackdrop').addEventListener('click', e => {
    const theme = e.target.closest('[data-theme-choice]');
    if (theme) { applyTheme(theme.dataset.themeChoice); updateSettingsTheme(); return; }
    const lock = e.target.closest('[data-auto-lock]');
    if (lock) { handleMenuAction(`auto-lock-${lock.dataset.autoLock}`).then(updateSettingsAutoLock); return; }
    const action = e.target.closest('[data-menu-action]');
    if (action) handleMenuAction(action.dataset.menuAction).then(() => {
      // Show any change straight away when the person comes back here.
      if (['auto-backup', 'about'].includes(action.dataset.menuAction)) return;
      refreshSettingsDetails();
    });
  });
  $('settingsInboxChoose').addEventListener('click', () => call(async () => { await chooseInboxFolder(); await refreshSettingsDetails(); }));
  $('settingsInboxClear').addEventListener('click', () => call(async () => {
    if (!confirm('Stop watching the scan inbox folder? Scans already in the inbox stay there.')) return;
    await backend().ClearInboxFolder();
    await refreshInboxCount();
    await refreshSettingsDetails();
    toast('BabyFileCab is no longer watching a scan folder.');
  }));
  $('settingsUpdateCheck').addEventListener('change', () => call(async () => {
    const on = $('settingsUpdateCheck').checked;
    await backend().SetUpdateCheckEnabled(on);
    toast(on ? 'BabyFileCab will check for updates once a day.' : 'BabyFileCab will no longer check for updates.');
    if (on) checkForUpdate(); else $('updateBanner').classList.add('hidden');
  }));
}
