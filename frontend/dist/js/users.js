// Manage Users and vault enrollment.

async function showManageUsers() {
  if (!currentUser) return;
  try {
    const users = await backend().ListCompanyUsers();
    const body = $('manageUsersBody');
    body.innerHTML = users.length ? users.map(user => {
      const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || '—';
      const enrolled = user.vaultStatus === 'Enrolled';
      const vaultCell = enrolled ? 'Enrolled' : String(currentUser.role || '').toLowerCase() === 'administrator'
        ? `<button type="button" class="secondary" data-enroll-vault="${escapeHTML(user.username || '')}">Enroll user</button>` : 'Pending';
      return `<tr>
        <td>${escapeHTML(fullName)}</td>
        <td>@${escapeHTML(user.username || '')}</td>
        <td>${escapeHTML(displayRole(user.role))}</td>
        <td>${escapeHTML(user.email || '—')}</td>
        <td>${escapeHTML(user.phone || '—')}</td>
        <td>${vaultCell}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="6">No users found for this company.</td></tr>';
    $('manageUsersAdd').classList.toggle('hidden', String(currentUser.role || '').toLowerCase() !== 'administrator');
    $('manageUsersBackdrop').classList.remove('hidden');
    setTimeout(() => $('manageUsersClose').focus(), 20);
  } catch (e) {
    showError(e);
  }
}

function showVaultEnrollment(username) {
  if (String(currentUser?.role || '').toLowerCase() !== 'administrator') return;
  pendingVaultEnrollmentUser = username;
  $('vaultEnrollmentPassword').value = '';
  $('vaultEnrollmentTitle').textContent = `Enroll @${username} in the company vault`;
  $('vaultEnrollmentBackdrop').classList.remove('hidden');
  setTimeout(() => $('vaultEnrollmentPassword').focus(), 20);
}

function hideVaultEnrollment() {
  $('vaultEnrollmentBackdrop').classList.add('hidden');
  $('vaultEnrollmentPassword').value = '';
  pendingVaultEnrollmentUser = '';
}

async function completeVaultEnrollment() {
  const password = $('vaultEnrollmentPassword').value;
  if (!pendingVaultEnrollmentUser || !password) { toast('Enter your own password.', true); return; }
  const button = $('vaultEnrollmentSave');
  button.disabled = true;
  try {
    await backend().EnrollExistingUser(pendingVaultEnrollmentUser, password);
    hideVaultEnrollment();
    toast('Vault access enrolled. Sign out and back in to verify.');
    await showManageUsers();
  } catch (e) { showError(e); $('vaultEnrollmentPassword').value = ''; }
  finally { button.disabled = false; }
}

function hideManageUsers() {
  $('manageUsersBackdrop').classList.add('hidden');
}
