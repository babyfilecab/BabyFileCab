// Shared state and tiny helpers used everywhere.

let treeData = [];
let selectedNode = null;
let selectedElement = null;
let selectedFilePaths = new Set();
let fileSelectionAnchor = null;
let expanded = new Set();
let pdfPage = 1;
let currentPDF = null;
let pdfZoom = 1.0;
let pdfRotation = 0;
let pdfSearchResults = [];
let pdfSearchIndex = -1;
let pdfSearchTimer = null;
let pdfSearchQuery = '';
let modalResolver = null;
let contextClient = null;
let contextTaxYear = null;
let contextDocument = null;
let contextSection = null;
let documentPropertiesPath = null;
let globalFindTimer = null;
let notesSelectionRange = null;
let clientFormResolver = null;
let internalDraggedPath = '';
let internalDraggedElement = null;
let clientPickerResolver = null;
let clientPickerItems = [];
let clientFormMode = 'new';
let clientFormClient = null;
let currentUser = null;

function isAdministrator() {
  return String(currentUser?.role || '').toLowerCase() === 'administrator';
}
let sessionGeneration = 0;
let pendingVaultEnrollmentUser = '';
let lastDesktopInput = Date.now();
let lastActivityPing = 0;
let lockingSession = false;
let AUTO_LOCK_MS = 15 * 60 * 1000;

async function lockSession() {
  if (!currentUser || lockingSession) return;
  lockingSession = true;
  const username = currentUser.username;
  try { await signOut(); } finally {
    $('authUsername').value = username || '';
    lockingSession = false;
  }
}

function installAutomaticLock() {
  const noteInput = () => {
    if (!currentUser || lockingSession) return;
    if (Date.now() - lastDesktopInput >= AUTO_LOCK_MS) { lockSession(); return; }
    lastDesktopInput = Date.now();
    if (Date.now() - lastActivityPing > 10000) {
      lastActivityPing = Date.now();
      backend().TouchActivity().then(active => { if (!active) lockSession(); }).catch(() => lockSession());
    }
  };
  for (const event of ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart']) {
    document.addEventListener(event, noteInput, { passive: true, capture: true });
  }
  // Native session monitoring handles sleep and account switching. Losing
  // focus or minimizing the app is not a reason to expire a ten-minute session.
  window.addEventListener('focus', () => {
    if (currentUser && Date.now() - lastDesktopInput >= AUTO_LOCK_MS) lockSession();
  });
  setInterval(async () => {
    if (!currentUser || lockingSession) return;
    if (Date.now() - lastDesktopInput >= AUTO_LOCK_MS) { await lockSession(); return; }
    try { if (!await backend().SessionActive()) await lockSession(); }
    catch (_) { await lockSession(); }
  }, 5000);
}
let clientCommunicationsRows = [];
let currentTheme = 'light';
let shortcutChord = '';
let shortcutChordTimer = null;
let firmCalendarAssignments = [];
let firmCalendarWeekStarts = [];
let firmCalendarWeekIndex = 0;
let firmCalendarSelectedClientID = '';
let firmCalendarContextAssignment = null;
let appAuditRows = [];
let engagementLetterUsers = [];
let engagementLetterClients = [];
let engagementLogoDataURL = '';
let invoiceClients = [];
let invoiceUsers = [];
let invoiceLogoDataURL = '';

const $ = (id) => document.getElementById(id);
const backend = () => window.go && window.go.main && window.go.main.App;
