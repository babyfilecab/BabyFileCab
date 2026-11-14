// Update notice: a slim banner when a newer BabyFileCab release is out.

let availableUpdate = null;

async function refreshUpdateCheckMenu() {
  const enabled = await backend().GetUpdateCheckEnabled();
  const item = $('updateCheckMenuItem');
  item.textContent = `${enabled ? '✓ ' : ''}Check for Updates`;
  item.setAttribute('aria-checked', String(enabled));
  return enabled;
}

async function checkForUpdate() {
  if (!currentUser) return;
  const generation = sessionGeneration;
  try {
    if (!await refreshUpdateCheckMenu()) return;
    const info = await backend().CheckForUpdate();
    if (generation !== sessionGeneration || !info?.available) return;
    if (localStorage.getItem('babyfilecab-update-later') === info.latest) return;
    availableUpdate = info;
    $('updateBannerText').textContent = `BabyFileCab ${info.latest} is available. You have ${info.current}.`;
    $('updateBanner').classList.remove('hidden');
  } catch (_) {
    // Offline or GitHub unreachable: try again next sign-in.
  }
}

async function toggleUpdateCheck() {
  const enabled = await backend().GetUpdateCheckEnabled();
  await backend().SetUpdateCheckEnabled(!enabled);
  await refreshUpdateCheckMenu();
  toast(enabled ? 'BabyFileCab will no longer check for updates.' : 'BabyFileCab will check for updates once a day.');
  if (!enabled) checkForUpdate();
  else $('updateBanner').classList.add('hidden');
}

function wireUpdates() {
  $('updateDownload').addEventListener('click', () => call(async () => {
    if (availableUpdate?.url) await backend().OpenReleasePage(availableUpdate.url);
  }));
  $('updateLater').addEventListener('click', () => {
    if (availableUpdate?.latest) localStorage.setItem('babyfilecab-update-later', availableUpdate.latest);
    $('updateBanner').classList.add('hidden');
  });
}
