// Encryption check: finds files copied into the data folder by hand, which
// aren't encrypted, and encrypts them.

function renderEncryptionReport(report) {
  const files = report.unencrypted || [];
  const failed = report.failed || [];
  let summary = files.length
    ? `${files.length} of ${report.checked} file${report.checked === 1 ? '' : 's'} ${files.length === 1 ? "isn't" : "aren't"} encrypted.`
    : `All ${report.checked} file${report.checked === 1 ? ' is' : 's are'} encrypted.`;
  if (report.encrypted) summary = `Encrypted ${report.encrypted} file${report.encrypted === 1 ? '' : 's'}. ` + summary;
  $('encryptionCheckSummary').textContent = summary;
  const shown = [...failed.map(f => `Could not encrypt ${f}`), ...files.slice(0, 300)];
  $('encryptionCheckList').replaceChildren(...shown.map(text => Object.assign(document.createElement('li'), { textContent: text })));
  if (files.length > 300) $('encryptionCheckList').appendChild(Object.assign(document.createElement('li'), { textContent: `…and ${files.length - 300} more` }));
  $('encryptionCheckEncrypt').disabled = files.length === 0;
}

async function showEncryptionCheck() {
  $('encryptionCheckSummary').textContent = 'Checking…';
  $('encryptionCheckList').replaceChildren();
  $('encryptionCheckEncrypt').disabled = true;
  $('encryptionCheckBackdrop').classList.remove('hidden');
  renderEncryptionReport(await backend().CheckEncryption());
}

function hideEncryptionCheck() { $('encryptionCheckBackdrop').classList.add('hidden'); }

// Administrators hear about unencrypted files when they sign in.
async function checkEncryptionAtSignIn() {
  if (!currentUser || !isAdministrator()) return;
  const generation = sessionGeneration;
  try {
    const report = await backend().CheckEncryption();
    if (generation !== sessionGeneration) return;
    const n = (report.unencrypted || []).length;
    if (n) toast(`${n} file${n === 1 ? " in your data folder isn't" : "s in your data folder aren't"} encrypted. Open Settings › Encryption Check to fix ${n === 1 ? 'it' : 'them'}.`, true);
  } catch (_) { /* not important enough to interrupt sign-in */ }
}

function wireEncryptionCheck() {
  $('encryptionCheckClose').addEventListener('click', hideEncryptionCheck);
  $('encryptionCheckCloseTop').addEventListener('click', hideEncryptionCheck);
  $('encryptionCheckBackdrop').addEventListener('click', e => { if (e.target === $('encryptionCheckBackdrop')) hideEncryptionCheck(); });
  $('encryptionCheckRun').addEventListener('click', () => call(showEncryptionCheck));
  $('encryptionCheckEncrypt').addEventListener('click', () => call(async () => {
    const button = $('encryptionCheckEncrypt');
    button.disabled = true;
    const report = await backend().EncryptUnencryptedFiles();
    renderEncryptionReport(report);
    await refreshTree();
    toast(report.failed?.length ? `Encrypted ${report.encrypted}; ${report.failed.length} could not be encrypted.` : `Encrypted ${report.encrypted} file${report.encrypted === 1 ? '' : 's'}.`, Boolean(report.failed?.length));
  }));
}
