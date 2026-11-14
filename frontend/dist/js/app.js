// Startup, sign-in, accounts, help and the company audit trail.

window.addEventListener('DOMContentLoaded', async () => {
  installAutomaticLock();
  installPasswordVisibilityToggles();
  installPasswordStrengthMeters();
  wireEvents();
  applyTheme(localStorage.getItem('babyfilecab-theme') || 'light', false);
  await waitForBackend();
  wireNativeFileDrop();
  await initialiseAuth();
});

async function waitForBackend() {
  for (let i = 0; i < 100; i++) {
    if (backend()) return;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error('BabyFileCab backend did not start.');
}


async function initialiseAuth() {
  hideAllPasswords();
  const hasUsers = await backend().HasUsers();
  currentUser = null;
  $('appShell').classList.add('hidden');
  $('authScreen').classList.remove('hidden');
  $('authPassword').value = '';
  $('authHelp').textContent = hasUsers
    ? 'Enter your BabyFileCab username and password.'
    : 'No local accounts exist yet. Create a new company and its first Administrator account to get started.';
  setTimeout(() => (hasUsers ? $('authUsername') : $('showCreateAccountBtn')).focus(), 40);
}

async function signIn() {
  const username = $('authUsername').value.trim();
  const password = $('authPassword').value;
  if (!username || !password) {
    toast('Enter your username and password.', true);
    (!username ? $('authUsername') : $('authPassword')).focus();
    return;
  }

  const button = $('signInBtn');
  button.disabled = true;
  button.textContent = 'Signing In…';
  try {
    const user = await backend().Login(username, password);
    $('authPassword').value = '';
    await enterApplication(user);
  } catch (e) {
    showError(e);
    $('authPassword').value = '';
    $('authPassword').focus();
  } finally {
    button.disabled = false;
    button.textContent = 'Sign In';
  }
}

async function enterApplication(user) {
  sessionGeneration++;
  hideChangePassword();
  currentUser = user;
  loadShortcutBindings();
  AUTO_LOCK_MS = await backend().GetAutoLockMinutes() * 60 * 1000;
  updateAutoLockMenu();
  lastDesktopInput = Date.now();
  lastActivityPing = 0;
  $('authScreen').classList.add('hidden');
  $('appShell').classList.remove('hidden');
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.username || 'User';
  $('signedInName').textContent = fullName;
  $('signedInAvatar').textContent = ([user?.firstName, user?.lastName].filter(Boolean).map(n => n.trim().charAt(0)).join('') || (user?.username || '?').charAt(0)).toUpperCase();
  $('signedInRole').textContent = `${displayRole(user?.role)}${user?.companyName ? ` • ${user.companyName}` : ''} • @${user?.username || ''}`;
  $('dataPath').textContent = `Data: ${await backend().DataRoot()}`;
  await refreshTree();
  refreshNeedsAttention({ atSignIn: true }).catch(() => {});
  startInboxWatch();
  startBackupSchedule();
}

async function signOut() {
  sessionGeneration++;
  hideNeedsAttention();
  $('needsAttentionBtn').classList.add('hidden');
  stopInboxWatch();
  stopBackupSchedule();
  hideCalendarScheduleClient();
  hideCalendarPreparerReassign();
  hideShortcutMapper();
  try {
    await backend().Logout();
  } catch (e) {
    showError(e);
    return;
  }
  currentUser = null;
  treeData = [];
  selectedNode = null;
  selectedElement = null;
  selectedFilePaths.clear();
  fileSelectionAnchor = null;
  expanded.clear();
  clearPreview();
  $('tree').innerHTML = '';
  $('treeSearch').value = '';
  $('signedInName').textContent = '';
  $('signedInRole').textContent = '';
  await initialiseAuth();
}

function showCreateAccount() {
  hideAllPasswords();
  resetCreateAccountForm();
  $('createAccountBackdrop').classList.remove('hidden');
  setTimeout(() => $('createCompanyName').focus(), 30);
}

function hideCreateAccount() {
  $('createAccountBackdrop').classList.add('hidden');
  $('createPassword').value = '';
  $('createConfirmPassword').value = '';
}

function resetCreateAccountForm() {
  const ids = [
    'createCompanyName', 'createUsername', 'createFirstName', 'createLastName', 'createEmail', 'createPhone',
    'createPassword', 'createConfirmPassword', 'createStreetAddress', 'createCity',
    'createState', 'createZIP', 'createCAF', 'createPTIN', 'createTelephone', 'createFax'
  ];
  for (const id of ids) $(id).value = '';
  $('createRole').value = 'administrator';
}

async function createAccount() {
  const req = {
    companyName: $('createCompanyName').value.trim(),
    username: $('createUsername').value.trim(),
    firstName: $('createFirstName').value.trim(),
    lastName: $('createLastName').value.trim(),
    email: $('createEmail').value.trim(),
    phone: $('createPhone').value.trim(),
    password: $('createPassword').value,
    confirmPassword: $('createConfirmPassword').value,
    role: $('createRole').value,
    streetAddress: $('createStreetAddress').value.trim(),
    city: $('createCity').value.trim(),
    state: $('createState').value.trim(),
    zip: $('createZIP').value.trim(),
    caf: $('createCAF').value.trim(),
    ptin: $('createPTIN').value.trim(),
    telephone: $('createTelephone').value.trim(),
    fax: $('createFax').value.trim(),
  };

  if (!req.companyName) { $('createCompanyName').focus(); toast('Company name is required.', true); return; }
  if (!req.username) { $('createUsername').focus(); toast('Username is required.', true); return; }
  if (!req.firstName) { $('createFirstName').focus(); toast('First name is required.', true); return; }
  if (!req.lastName) { $('createLastName').focus(); toast('Last name is required.', true); return; }
  if (!req.email) { $('createEmail').focus(); toast('Email address is required.', true); return; }
  if (!req.phone) { $('createPhone').focus(); toast('Phone number is required.', true); return; }
  { const problem = passwordProblem(req.password, req.username); if (problem) { $('createPassword').focus(); toast(problem, true); return; } }
  if (req.password !== req.confirmPassword) { $('createConfirmPassword').focus(); toast('Passwords do not match.', true); return; }
  if (req.role !== 'administrator') { $('createRole').focus(); toast('The first user for a new company must be an Administrator.', true); return; }

  const button = $('createAccountSave');
  button.disabled = true;
  button.textContent = 'Creating Company…';
  try {
    const user = await backend().RegisterUser(req);
    hideCreateAccount();
    $('authUsername').value = user.username || req.username;
    $('authPassword').value = '';
    toast(`${user.companyName || req.companyName} created.`);
    await enterApplication(user);
  } catch (e) {
    showError(e);
  } finally {
    button.disabled = false;
    button.textContent = 'Create Company & Account';
  }
}

async function showExistingCompanyUser() {
  hideAllPasswords();
  let companies;
  try {
    companies = await backend().ListCompanies();
  } catch (e) {
    showError(e);
    return;
  }
  if (!companies || !companies.length) {
    toast('No existing company is available yet. Create a new company account first.', true);
    return;
  }

  resetExistingCompanyUserForm();
  const select = $('existingCompanySelect');
  select.innerHTML = companies.map(c => `<option value="${escapeHTML(c.id)}">${escapeHTML(c.name)}</option>`).join('');
  if (currentUser?.companyId && companies.some(c => c.id === currentUser.companyId)) {
    select.value = currentUser.companyId;
  }
  if (currentUser?.role?.toLowerCase() === 'administrator') {
    $('existingAdminUsername').value = currentUser.username || '';
  }
  $('existingCompanyUserBackdrop').classList.remove('hidden');
  setTimeout(() => $('existingUsername').focus(), 30);
}

function hideExistingCompanyUser() {
  $('existingCompanyUserBackdrop').classList.add('hidden');
  $('existingPassword').value = '';
  $('existingConfirmPassword').value = '';
  $('existingAdminPassword').value = '';
}

function resetExistingCompanyUserForm() {
  const ids = [
    'existingUsername', 'existingFirstName', 'existingLastName', 'existingEmail', 'existingPhone',
    'existingPassword', 'existingConfirmPassword', 'existingStreetAddress', 'existingCity',
    'existingState', 'existingZIP', 'existingCAF', 'existingPTIN', 'existingTelephone', 'existingFax',
    'existingAdminUsername', 'existingAdminPassword'
  ];
  for (const id of ids) $(id).value = '';
  $('existingRole').value = 'staff';
}

async function createExistingCompanyUser() {
  const req = {
    companyId: $('existingCompanySelect').value,
    username: $('existingUsername').value.trim(),
    firstName: $('existingFirstName').value.trim(),
    lastName: $('existingLastName').value.trim(),
    email: $('existingEmail').value.trim(),
    phone: $('existingPhone').value.trim(),
    password: $('existingPassword').value,
    confirmPassword: $('existingConfirmPassword').value,
    role: $('existingRole').value,
    streetAddress: $('existingStreetAddress').value.trim(),
    city: $('existingCity').value.trim(),
    state: $('existingState').value.trim(),
    zip: $('existingZIP').value.trim(),
    caf: $('existingCAF').value.trim(),
    ptin: $('existingPTIN').value.trim(),
    telephone: $('existingTelephone').value.trim(),
    fax: $('existingFax').value.trim(),
    adminUsername: $('existingAdminUsername').value.trim(),
    adminPassword: $('existingAdminPassword').value,
  };

  if (!req.companyId) { $('existingCompanySelect').focus(); toast('Select a company.', true); return; }
  if (!req.username) { $('existingUsername').focus(); toast('Username is required.', true); return; }
  if (!req.firstName) { $('existingFirstName').focus(); toast('First name is required.', true); return; }
  if (!req.lastName) { $('existingLastName').focus(); toast('Last name is required.', true); return; }
  if (!req.email) { $('existingEmail').focus(); toast('Email address is required.', true); return; }
  if (!req.phone) { $('existingPhone').focus(); toast('Phone number is required.', true); return; }
  { const problem = passwordProblem(req.password, req.username); if (problem) { $('existingPassword').focus(); toast(problem, true); return; } }
  if (req.password !== req.confirmPassword) { $('existingConfirmPassword').focus(); toast('Passwords do not match.', true); return; }
  if (!req.adminUsername) { $('existingAdminUsername').focus(); toast('Administrator username is required.', true); return; }
  if (!req.adminPassword) { $('existingAdminPassword').focus(); toast('Administrator password is required.', true); return; }

  const button = $('existingCompanyUserSave');
  button.disabled = true;
  button.textContent = 'Creating User…';
  try {
    const user = await backend().CreateUserUnderExistingCompany(req);
    hideExistingCompanyUser();
    if (!currentUser) {
      $('authUsername').value = user.username || req.username;
      $('authPassword').value = '';
      $('authUsername').focus();
    }
    toast(`${user.firstName || user.username} was added to ${user.companyName || 'the company'}.`);
  } catch (e) {
    showError(e);
  } finally {
    button.disabled = false;
    button.textContent = 'Create User';
    $('existingAdminPassword').value = '';
  }
}

function displayRole(role) {
  return String(role || '').toLowerCase() === 'administrator' ? 'Administrator' : 'Staff';
}

function showUserManual() {
  $('userManualBackdrop').classList.remove('hidden');
  $('userManualBackdrop').querySelector('.manual-scroll').scrollTop = 0;
  setTimeout(() => $('userManualCloseTop').focus(), 20);
}

function hideUserManual() {
  $('userManualBackdrop').classList.add('hidden');
}

function showAbout() {
  $('aboutBackdrop').classList.remove('hidden');
  setTimeout(() => $('aboutCloseTop')?.focus(), 20);
}

function hideAbout() {
  $('aboutBackdrop').classList.add('hidden');
}


function showAppAuditTrail() {
  $('appAuditSearch').value = '';
  $('appAuditBackdrop').classList.remove('hidden');
  return refreshAppAuditTrail().then(() => setTimeout(() => $('appAuditSearch').focus(), 20));
}

function hideAppAuditTrail() {
  $('appAuditBackdrop').classList.add('hidden');
}

async function refreshAppAuditTrail() {
  appAuditRows = await backend().GetAppAuditTrail();
  renderAppAuditTrail();
}

function renderAppAuditTrail() {
  const q = $('appAuditSearch').value.trim().toLowerCase();
  const rows = (appAuditRows || []).filter(entry => {
    if (!q) return true;
    return [entry.username, entry.userName, entry.clientName, entry.clientId, entry.action, entry.details]
      .some(value => String(value || '').toLowerCase().includes(q));
  });
  const body = $('appAuditBody');
  body.innerHTML = rows.length ? rows.map(entry => {
    const userLabel = entry.userName
      ? `${escapeHTML(entry.userName)}${entry.username ? ` <small>@${escapeHTML(entry.username)}</small>` : ''}`
      : (entry.username ? `@${escapeHTML(entry.username)}` : '<span class="app-audit-muted">Legacy / unknown</span>');
    const clientLabel = entry.clientName
      ? `${escapeHTML(entry.clientName)}${entry.clientId ? ` <small>#${escapeHTML(entry.clientId)}</small>` : ''}`
      : '<span class="app-audit-muted">—</span>';
    return `<tr>
      <td class="app-audit-time">${escapeHTML(formatAuditTime(entry.timestamp))}</td>
      <td>${userLabel}</td>
      <td>${clientLabel}</td>
      <td><strong>${escapeHTML(entry.action || 'Activity')}</strong></td>
      <td>${entry.details ? escapeHTML(entry.details) : '<span class="app-audit-muted">—</span>'}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="5" class="app-audit-empty">No audit entries match this search.</td></tr>';
  $('appAuditStatus').textContent = `${rows.length} of ${(appAuditRows || []).length} audit entr${(appAuditRows || []).length === 1 ? 'y' : 'ies'}`;
}
