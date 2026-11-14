// Built-in PDF engine. PDF.js draws pages and searches their text inside the
// window, so previews work the same on Windows, macOS and Linux with nothing
// extra to install. Decrypted PDF bytes only ever live in memory.

let pdfjsLibPromise = null;
let pdfDocument = null;       // PDFDocumentProxy for the open preview
let pdfDocumentFor = null;    // the preview object pdfDocument belongs to
let pdfRenderTask = null;
let pdfRenderedKey = '';
let pdfPageSizes = new Map(); // page number -> { width, height } in PDF points
let pdfTextCache = new Map(); // page number -> words with page coordinates

function pdfjsAssetURL(rel) {
  return new URL(`vendor/pdfjs/${rel}`, document.baseURI).href;
}

function loadPDFJS() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import(pdfjsAssetURL('pdf.min.mjs')).then(lib => {
      lib.GlobalWorkerOptions.workerSrc = pdfjsAssetURL('pdf.worker.min.mjs');
      return lib;
    }).catch(error => {
      pdfjsLibPromise = null;
      throw error;
    });
  }
  return pdfjsLibPromise;
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function closePDFDocument() {
  pdfRenderTask?.cancel();
  pdfRenderTask = null;
  const doc = pdfDocument;
  pdfDocument = null;
  pdfDocumentFor = null;
  pdfPageSizes = new Map();
  pdfTextCache = new Map();
  pdfRenderedKey = '';
  if (doc) doc.destroy().catch(() => {});
}

async function openPDFDocument(preview) {
  closePDFDocument();
  const [lib, b64] = await Promise.all([loadPDFJS(), backend().GetPDFData(preview.path)]);
  const doc = await lib.getDocument({
    data: base64ToBytes(b64),
    cMapUrl: pdfjsAssetURL('cmaps/'),
    cMapPacked: true,
    standardFontDataUrl: pdfjsAssetURL('standard_fonts/'),
    wasmUrl: pdfjsAssetURL('wasm/'),
    iccUrl: pdfjsAssetURL('iccs/'),
    isEvalSupported: false,
  }).promise;
  if (currentPDF !== preview) {
    doc.destroy().catch(() => {});
    return null;
  }
  pdfDocument = doc;
  pdfDocumentFor = preview;
  preview.pageCount = doc.numPages;
  return doc;
}

function pdfOpenErrorMessage(error) {
  if (error?.name === 'PasswordException') return 'This PDF is password protected. Use Open File to view it in your PDF reader.';
  if (error?.name === 'InvalidPDFException') return 'This file does not look like a valid PDF. Use Open File to try your PDF reader.';
  return '';
}

async function pdfPageSize(n) {
  if (!pdfPageSizes.has(n)) {
    const page = await pdfDocument.getPage(n);
    const viewport = page.getViewport({ scale: 1 });
    pdfPageSizes.set(n, { width: viewport.width, height: viewport.height });
  }
  return pdfPageSizes.get(n);
}

// Draws page n into #pdfCanvas at the given on-screen width. The page is
// rendered off screen first so the old page stays visible until the new one
// is ready, and re-renders when zooming keep the text sharp.
async function drawPDFPage(n, cssWidth) {
  const doc = pdfDocument;
  if (!doc) return;
  const key = `${n}:${cssWidth}`;
  if (key === pdfRenderedKey) return;
  pdfRenderTask?.cancel();
  const page = await doc.getPage(n);
  if (doc !== pdfDocument) return;
  const base = page.getViewport({ scale: 1 });
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({ scale: (cssWidth / base.width) * ratio });
  const offscreen = document.createElement('canvas');
  offscreen.width = Math.ceil(viewport.width);
  offscreen.height = Math.ceil(viewport.height);
  const task = page.render({ canvas: offscreen, viewport });
  pdfRenderTask = task;
  try {
    await task.promise;
  } catch (error) {
    if (error?.name === 'RenderingCancelledException') return;
    throw error;
  }
  if (pdfRenderTask !== task || doc !== pdfDocument) return;
  pdfRenderTask = null;
  const canvas = $('pdfCanvas');
  if (!canvas) return;
  canvas.width = offscreen.width;
  canvas.height = offscreen.height;
  canvas.getContext('2d').drawImage(offscreen, 0, 0);
  pdfRenderedKey = key;
}

// Splits a page's text into words with boxes in PDF points measured from the
// top-left corner, the same shape the search highlights expect.
async function pdfPageWords(n) {
  if (pdfTextCache.has(n)) return pdfTextCache.get(n);
  const lib = await loadPDFJS();
  const page = await pdfDocument.getPage(n);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const words = [];
  for (const item of content.items) {
    if (!item.str || !item.str.trim()) continue;
    const tx = lib.Util.transform(viewport.transform, item.transform);
    const fontHeight = Math.hypot(tx[2], tx[3]) || Math.abs(item.height) || 10;
    const angle = Math.atan2(tx[1], tx[0]);
    const length = item.str.length;
    for (const match of item.str.matchAll(/\S+/g)) {
      const offset = (match.index / length) * item.width;
      words.push({
        text: match[0],
        x: tx[4] + offset * Math.cos(angle),
        y: tx[5] + offset * Math.sin(angle) - fontHeight,
        width: (match[0].length / length) * item.width,
        height: fontHeight,
      });
    }
  }
  pdfTextCache.set(n, words);
  return words;
}

function normalizePDFSearchToken(s) {
  return String(s).toLowerCase().trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

function pdfWordSnippet(words, matchStart, matchCount) {
  const start = Math.max(0, matchStart - 8);
  const end = Math.min(words.length, matchStart + matchCount + 10);
  let snippet = words.slice(start, end).map(w => w.text.trim()).join(' ');
  if (start > 0) snippet = '…' + snippet;
  if (end < words.length) snippet += '…';
  return snippet;
}

// Finds every place the typed words appear in a row, like Ctrl+F: case
// insensitive, and a typed fragment can match part of a word.
async function searchPDFText(query) {
  const queryWords = String(query).split(/\s+/).map(normalizePDFSearchToken).filter(Boolean);
  if (!queryWords.length) throw new Error('Enter a searchable word or phrase.');
  const response = { query, total: 0, results: [], searchable: false, message: '' };
  const doc = pdfDocument;
  for (let n = 1; doc && n <= doc.numPages; n++) {
    const words = await pdfPageWords(n);
    if (doc !== pdfDocument) return null;
    if (!words.length) continue;
    response.searchable = true;
    const size = await pdfPageSize(n);
    const normalized = words.map(w => normalizePDFSearchToken(w.text));
    for (let i = 0; i + queryWords.length <= words.length; i++) {
      if (!queryWords.every((q, j) => normalized[i + j].includes(q))) continue;
      response.total++;
      if (response.results.length >= 500) continue;
      const span = words.slice(i, i + queryWords.length);
      const x = Math.min(...span.map(w => w.x));
      const y = Math.min(...span.map(w => w.y));
      const right = Math.max(...span.map(w => w.x + w.width));
      const bottom = Math.max(...span.map(w => w.y + w.height));
      response.results.push({
        page: n, snippet: pdfWordSnippet(words, i, queryWords.length),
        x, y, width: right - x, height: bottom - y,
        pageWidth: size.width, pageHeight: size.height,
      });
    }
  }
  if (!response.searchable) response.message = 'This PDF has no searchable text. It may be a scanned or image-only PDF.';
  else if (!response.total) response.message = `No match for “${query}” was found in this PDF.`;
  return response;
}
