// Password fields, strength meter and Change Password.

function passwordVisibilityIcon(visible) {
  const slash = visible ? '<path d="M4 4l16 16" />' : '';
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M2.5 12s3.4-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.4 6.5-9.5 6.5S2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
    ${slash}
  </svg>`;
}

function updatePasswordToggle(button, input) {
  const visible = input.type === 'text';
  button.innerHTML = passwordVisibilityIcon(visible);
  button.setAttribute('aria-pressed', visible ? 'true' : 'false');
  button.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
  button.title = visible ? 'Hide password' : 'Show password';
}

// Password strength ---------------------------------------------------------
// Mirrors the backend rule in password_policy.go (12+ characters, not the
// username, not one repeated character). The meter is guidance only.
const PASSWORD_MIN_LENGTH = 12;
function passwordProblem(password, username = '') {
  const pw = String(password || '');
  if ([...pw].length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  const user = String(username || '').trim().toLowerCase();
  if (user.length >= 3 && pw.toLowerCase().includes(user)) return 'Password must not contain your username.';
  if (new Set(pw).size === 1) return 'Password must not be a single repeated character.';
  return '';
}
function passwordStrength(password, username = '') {
  const pw = String(password || '');
  if (!pw) return { score: 0, label: '', hint: `Use at least ${PASSWORD_MIN_LENGTH} characters. A short phrase of unrelated words works well.` };
  const problem = passwordProblem(pw, username);
  if (problem) return { score: 1, label: 'Too weak', hint: problem };
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(re => re.test(pw)).length;
  const unique = new Set(pw.toLowerCase()).size;
  let score = 2;
  if ([...pw].length >= 16 || (classes >= 3 && unique >= 8)) score = 3;
  if (([...pw].length >= 16 && classes >= 2 && unique >= 10) || ([...pw].length >= 20 && unique >= 8)) score = 4;
  const labels = { 2: 'Fair', 3: 'Good', 4: 'Strong' };
  const hints = { 2: 'Longer is stronger: try 16+ characters or mix in numbers and symbols.', 3: 'Good password.', 4: 'Strong password.' };
  return { score, label: labels[score], hint: hints[score] };
}
function installPasswordStrengthMeters() {
  [['createPassword', 'createUsername'], ['existingPassword', 'existingUsername'], ['changeNewPassword', null]].forEach(([inputId, userId]) => {
    const input = $(inputId);
    if (!input || input.dataset.strengthMeter) return;
    input.dataset.strengthMeter = '1';
    const meter = document.createElement('div');
    meter.className = 'password-meter';
    meter.setAttribute('aria-live', 'polite');
    meter.innerHTML = '<div class="password-meter-bar"><span></span><span></span><span></span><span></span></div><div class="password-meter-text"></div>';
    const anchor = input.closest('.password-input-wrap') || input;
    anchor.insertAdjacentElement('afterend', meter);
    const update = () => {
      const username = userId ? $(userId)?.value : currentUser?.username;
      const { score, label, hint } = passwordStrength(input.value, username);
      meter.dataset.score = String(score);
      meter.querySelector('.password-meter-text').textContent = label ? `${label} — ${hint}` : hint;
    };
    input.addEventListener('input', update);
    input.addEventListener('focus', update); // fields are cleared without input events
    if (userId) $(userId)?.addEventListener('input', update);
    update();
  });
}

function installPasswordVisibilityToggles() {
  document.querySelectorAll('input[type="password"]').forEach(input => {
    if (input.closest('.password-input-wrap')) return;
    const wrap = document.createElement('div');
    wrap.className = 'password-input-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'password-visibility-toggle';
    button.dataset.passwordFor = input.id || '';
    updatePasswordToggle(button, input);
    button.addEventListener('mousedown', e => e.preventDefault());
    button.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const start = input.selectionStart;
      const end = input.selectionEnd;
      input.type = input.type === 'password' ? 'text' : 'password';
      updatePasswordToggle(button, input);
      input.focus({ preventScroll: true });
      try { input.setSelectionRange(start, end); } catch (_) {}
    });
    wrap.appendChild(button);
  });
}

function hideAllPasswords() {
  document.querySelectorAll('.password-input-wrap input').forEach(input => {
    input.type = 'password';
    const button = input.parentElement?.querySelector('.password-visibility-toggle');
    if (button) updatePasswordToggle(button, input);
  });
}

function hideChangePassword() {
  $('changePasswordBackdrop').classList.add('hidden');
  ['changeCurrentPassword', 'changeNewPassword', 'changeConfirmPassword'].forEach(id => { $(id).value = ''; });
  hideAllPasswords();
}

async function changePassword() {
  const generation = sessionGeneration;
  const save = $('changePasswordSave');
  if (save.disabled) return;
  save.disabled = true;
  try {
    await backend().ChangePassword($('changeCurrentPassword').value, $('changeNewPassword').value, $('changeConfirmPassword').value);
    if (generation !== sessionGeneration) return;
    hideChangePassword();
    toast('Password changed. Use your new password next time you sign in.');
  } catch (e) {
    if (generation === sessionGeneration) showError(e);
  } finally { save.disabled = false; }
}
