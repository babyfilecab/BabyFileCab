// Update notice: a slim banner when a newer BabyFileCab release is out.

let availableUpdate = null;

async function checkForUpdate() {
  if (!currentUser) return;
  const generation = sessionGeneration;
  try {
    if (!await backend().GetUpdateCheckEnabled()) return;
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

function wireUpdates() {
  $('updateDownload').addEventListener('click', () => call(async () => {
    if (availableUpdate?.url) await backend().OpenReleasePage(availableUpdate.url);
  }));
  $('updateLater').addEventListener('click', () => {
    if (availableUpdate?.latest) localStorage.setItem('babyfilecab-update-later', availableUpdate.latest);
    $('updateBanner').classList.add('hidden');
  });
}
