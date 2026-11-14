// Document preview and PDF viewer.

async function renderPreview(p) {
  $('preview').className = '';
  const openBtn = `<button id="openFileBtn">↗ Open File</button>`;
  if (p.kind === 'pdf') {
    currentPDF = p;
    pdfPage = 1;
    pdfZoom = 1.0;
    pdfRotation = 0;
    const pdfHeaderActions = `
      <div class="preview-header-actions">
        <button id="rotatePdfBtn" title="Rotate PDF preview 90° clockwise">↻ Rotate PDF</button>
        ${openBtn}
      </div>`;
    $('preview').innerHTML = `
      <div class="preview-header"><div class="preview-title">${escapeHTML(p.name)}</div>${pdfHeaderActions}</div>
      <div class="pdf-searchbar">
        <input id="pdfSearchInput" type="search" placeholder="Search this PDF… (Ctrl+F)" aria-label="Search this PDF" />
        <button id="pdfSearchBtn" class="primary">Search</button>
        <button id="pdfMatchPrev" title="Previous match" disabled>▲</button>
        <button id="pdfMatchNext" title="Next match" disabled>▼</button>
        <span id="pdfSearchStatus">Ctrl+F to search</span>
      </div>
      <div id="pdfSearchSnippet" class="pdf-search-snippet hidden"></div>
      <div class="pdf-controls">
        <div class="pdf-page-controls">
          <button id="pdfPrev">◀ Previous</button>
          <strong id="pdfLabel">Page 1 of ${p.pageCount}</strong>
          <button id="pdfNext">Next ▶</button>
        </div>
        <div class="pdf-zoom-controls">
          <button id="pdfZoomOut" title="Zoom out">−</button>
          <strong id="pdfZoomLabel">100%</strong>
          <button id="pdfZoomIn" title="Zoom in">+</button>
          <button id="pdfZoomReset" title="Reset zoom">Reset</button>
        </div>
      </div>
      <div class="preview-body pdf-preview-body">
        <div id="pdfLoading">Rendering PDF page…</div>
        <div id="pdfRotateStage" class="pdf-rotate-stage">
          <div id="pdfPageWrap" class="pdf-page-wrap">
            <img id="pdfImage" class="pdf-page" alt="PDF page preview" />
            <div id="pdfSearchHighlights" class="pdf-search-highlights" aria-hidden="true"></div>
          </div>
        </div>
      </div>`;
    wireOpen(p.path);
    $('rotatePdfBtn').addEventListener('click', rotateCurrentPDF);
    $('pdfPrev').addEventListener('click', () => changePDFPage(-1));
    $('pdfNext').addEventListener('click', () => changePDFPage(1));
    $('pdfZoomOut').addEventListener('click', () => changePDFZoom(-0.1));
    $('pdfZoomIn').addEventListener('click', () => changePDFZoom(0.1));
    $('pdfZoomReset').addEventListener('click', () => setPDFZoom(1.0));
    $('pdfSearchBtn').addEventListener('click', searchCurrentPDF);
    $('pdfSearchInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const typed = e.currentTarget.value.trim();
        if (typed && typed === pdfSearchQuery && pdfSearchResults.length) {
          movePDFSearchMatch(e.shiftKey ? -1 : 1);
        } else {
          searchCurrentPDF();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.currentTarget.value = '';
        clearPDFSearch();
        e.currentTarget.blur();
      }
    });
    $('pdfSearchInput').addEventListener('input', e => {
      clearTimeout(pdfSearchTimer);
      const value = e.target.value.trim();
      if (!value) {
        clearPDFSearch();
        return;
      }
      // Windows-style find-as-you-type. A short debounce prevents launching
      // multiple Poppler searches while the user is still typing.
      pdfSearchTimer = setTimeout(() => searchCurrentPDF(), 160);
    });
    $('pdfMatchPrev').addEventListener('click', () => movePDFSearchMatch(-1));
    $('pdfMatchNext').addEventListener('click', () => movePDFSearchMatch(1));
    await loadPDFPage();
    return;
  }
  if (p.kind === 'image') {
    $('preview').innerHTML = `<div class="preview-header"><div class="preview-title">${escapeHTML(p.name)}</div>${openBtn}</div><div class="preview-body"><img id="documentImagePreview" class="image-preview" alt="Document preview" /></div>`;
    const image = $('documentImagePreview');
    if (/^data:image\/(png|jpeg|gif|webp|bmp);base64,[A-Za-z0-9+/]*={0,2}$/.test(p.imageData || '')) image.src = p.imageData;
    else image.alt = 'Unsupported image preview';
    wireOpen(p.path); return;
  }
  if (p.kind === 'csv') {
    const table = p.rows.map(r => `<tr>${r.map(c => `<td>${escapeHTML(c)}</td>`).join('')}</tr>`).join('');
    $('preview').innerHTML = `<div class="preview-header"><div class="preview-title">${escapeHTML(p.name)}</div>${openBtn}</div><div class="preview-body csv-wrap"><table>${table}</table></div>`;
    wireOpen(p.path); return;
  }
  if (p.kind === 'spreadsheet') {
    const table = (p.rows || []).map((r, i) => `<tr>${r.map(c => `<${i === 0 ? 'th' : 'td'}>${escapeHTML(c)}</${i === 0 ? 'th' : 'td'}>`).join('')}</tr>`).join('');
    $('preview').innerHTML = `<div class="preview-header"><div class="preview-title">${escapeHTML(p.name)} — Excel Preview</div>${openBtn}</div><div class="preview-body csv-wrap"><table>${table}</table><p class="preview-note">Previewing the first worksheet (up to 200 rows). Open the file for full Excel features.</p></div>`;
    wireOpen(p.path); return;
  }
  if (p.kind === 'email') {
    $('preview').innerHTML = `<div class="preview-header"><div class="preview-title">${escapeHTML(p.name)} — Email Preview</div>${openBtn}</div><div class="preview-body"><div class="email-preview">${escapeHTML(p.text || '')}</div></div>`;
    wireOpen(p.path); return;
  }
  if (p.kind === 'text') {
    $('preview').innerHTML = `<div class="preview-header"><div class="preview-title">${escapeHTML(p.name)}</div>${openBtn}</div><div class="preview-body"><div class="text-preview">${escapeHTML(p.text || '')}</div></div>`;
    wireOpen(p.path); return;
  }
  $('preview').innerHTML = `<div class="preview-header"><div class="preview-title">${escapeHTML(p.name)}</div>${openBtn}</div><div class="preview-body"><h3>Preview unavailable</h3><p>${escapeHTML(p.message || 'Open this file in its desktop application.')}</p></div>`;
  wireOpen(p.path);
}

async function loadPDFPage() {
  if (!currentPDF) return;
  const generation = sessionGeneration;
  const pdf = currentPDF;
  const requestedPage = pdfPage;
  $('pdfLoading').style.display = 'block';
  $('pdfPageWrap').style.display = 'none';
  try {
    const data = await backend().RenderPDFPage(pdf.path, requestedPage);
    if (generation !== sessionGeneration || currentPDF !== pdf || !currentUser) return;
    const img = $('pdfImage');
    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not display the rendered PDF page.'));
      img.src = data;
    });
    if (generation !== sessionGeneration || currentPDF !== pdf || !currentUser) return;
    $('pdfPageWrap').style.display = 'inline-block';
    applyPDFZoom();
    $('pdfLoading').style.display = 'none';
    $('pdfLabel').textContent = `Page ${pdfPage} of ${currentPDF.pageCount}`;
    $('pdfPrev').disabled = pdfPage <= 1;
    $('pdfNext').disabled = pdfPage >= currentPDF.pageCount;
    updatePDFHighlights();
  } catch (e) { showError(e); }
}

function applyPDFZoom() {
  const img = $('pdfImage');
  const wrap = $('pdfPageWrap');
  const stage = $('pdfRotateStage');
  const body = document.querySelector('.pdf-preview-body');
  if (!img || !wrap || !stage || !body || !img.naturalWidth || !img.naturalHeight) return;

  const fitWidth = Math.max(320, Math.min(img.naturalWidth, body.clientWidth - 42));
  const width = Math.round(fitWidth * pdfZoom);
  const height = Math.max(1, Math.round(width * (img.naturalHeight / img.naturalWidth)));

  img.style.width = `${width}px`;
  img.style.height = `${height}px`;
  img.style.maxWidth = 'none';
  wrap.style.width = `${width}px`;
  wrap.style.height = `${height}px`;
  wrap.style.transformOrigin = 'top left';

  const rotation = ((pdfRotation % 360) + 360) % 360;
  if (rotation === 90) {
    wrap.style.transform = `translateX(${height}px) rotate(90deg)`;
    stage.style.width = `${height}px`;
    stage.style.height = `${width}px`;
  } else if (rotation === 180) {
    wrap.style.transform = `translate(${width}px, ${height}px) rotate(180deg)`;
    stage.style.width = `${width}px`;
    stage.style.height = `${height}px`;
  } else if (rotation === 270) {
    wrap.style.transform = `translateY(${width}px) rotate(270deg)`;
    stage.style.width = `${height}px`;
    stage.style.height = `${width}px`;
  } else {
    wrap.style.transform = 'none';
    stage.style.width = `${width}px`;
    stage.style.height = `${height}px`;
  }

  if ($('pdfZoomLabel')) $('pdfZoomLabel').textContent = `${Math.round(pdfZoom * 100)}%`;
  if ($('rotatePdfBtn')) {
    $('rotatePdfBtn').title = `Rotate PDF preview 90° clockwise (currently ${rotation}°)`;
  }
  updatePDFHighlights();
}

function rotateCurrentPDF() {
  if (!currentPDF) return;
  pdfRotation = (pdfRotation + 90) % 360;
  applyPDFZoom();
}

function setPDFZoom(value) {
  pdfZoom = Math.max(0.5, Math.min(3.0, Math.round(value * 10) / 10));
  applyPDFZoom();
}

function changePDFZoom(delta) {
  setPDFZoom(pdfZoom + delta);
}

async function changePDFPage(delta) {
  if (!currentPDF) return;
  const next = Math.max(1, Math.min(currentPDF.pageCount, pdfPage + delta));
  if (next === pdfPage) return;
  pdfPage = next;
  await loadPDFPage();
}

async function searchCurrentPDF() {
  if (!currentPDF) return;
  const generation = sessionGeneration;
  const pdf = currentPDF;
  const input = $('pdfSearchInput');
  const query = input?.value.trim() || '';
  if (!query) { clearPDFSearch(); input?.focus(); return; }

  clearTimeout(pdfSearchTimer);
  pdfSearchQuery = query;
  $('pdfSearchStatus').textContent = 'Searching…';
  $('pdfSearchBtn').disabled = true;
  try {
    const response = await backend().SearchPDF(pdf.path, query);
    if (generation !== sessionGeneration || currentPDF !== pdf || !currentUser) return;
    // Ignore an old result if the user typed something new while the backend was searching.
    if (($('pdfSearchInput')?.value.trim() || '') !== query) return;

    pdfSearchResults = response.results || [];
    pdfSearchIndex = pdfSearchResults.length ? 0 : -1;

    if (!response.searchable) {
      $('pdfSearchStatus').textContent = 'Not searchable';
      showPDFSearchMessage(response.message || 'This PDF has no searchable text.');
      updatePDFHighlights();
      return;
    }

    if (!response.total) {
      $('pdfSearchStatus').textContent = 'No matches';
      showPDFSearchMessage(response.message || `No match for “${query}”.`);
      $('pdfMatchPrev').disabled = true;
      $('pdfMatchNext').disabled = true;
      updatePDFHighlights();
      return;
    }

    updatePDFSearchMatch(response.total);
    await goToPDFSearchMatch();
  } catch (e) {
    showError(e);
    $('pdfSearchStatus').textContent = 'Search failed';
  } finally {
    if ($('pdfSearchBtn')) $('pdfSearchBtn').disabled = false;
  }
}

function clearPDFSearch() {
  clearTimeout(pdfSearchTimer);
  pdfSearchResults = [];
  pdfSearchIndex = -1;
  pdfSearchQuery = '';
  if ($('pdfSearchStatus')) $('pdfSearchStatus').textContent = 'Ctrl+F to search';
  if ($('pdfMatchPrev')) $('pdfMatchPrev').disabled = true;
  if ($('pdfMatchNext')) $('pdfMatchNext').disabled = true;
  if ($('pdfSearchSnippet')) $('pdfSearchSnippet').classList.add('hidden');
  updatePDFHighlights();
}

function showPDFSearchMessage(message) {
  const snippet = $('pdfSearchSnippet');
  if (!snippet) return;
  snippet.textContent = message;
  snippet.classList.remove('hidden');
}

function updatePDFSearchMatch(totalOverride = null) {
  const total = totalOverride ?? pdfSearchResults.length;
  const has = pdfSearchIndex >= 0 && pdfSearchResults.length > 0;
  $('pdfSearchStatus').textContent = has ? `Match ${pdfSearchIndex + 1} of ${total}` : 'No matches';
  $('pdfMatchPrev').disabled = !has || pdfSearchResults.length < 2;
  $('pdfMatchNext').disabled = !has || pdfSearchResults.length < 2;
  const snippet = $('pdfSearchSnippet');
  if (has) {
    const match = pdfSearchResults[pdfSearchIndex];
    snippet.innerHTML = `<strong>Page ${match.page}</strong> — ${highlightSearchText(match.snippet || '', pdfSearchQuery)}`;
    snippet.classList.remove('hidden');
  } else {
    snippet.classList.add('hidden');
  }
}

function highlightSearchText(text, query) {
  // Match all terms in one pass over the raw text, then escape each piece, so a
  // later term can never match inside an earlier <mark> tag or an &amp; entity.
  const terms = String(query || '').trim().split(/\s+/).filter(Boolean)
    .sort((a,b) => b.length - a.length)
    .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const raw = String(text || '');
  if (!terms.length) return escapeHTML(raw);
  const pattern = new RegExp(terms.join('|'), 'gi');
  let html = '', last = 0;
  for (const match of raw.matchAll(pattern)) {
    if (!match[0]) continue;
    html += escapeHTML(raw.slice(last, match.index)) + '<mark>' + escapeHTML(match[0]) + '</mark>';
    last = match.index + match[0].length;
  }
  return html + escapeHTML(raw.slice(last));
}

function updatePDFHighlights() {
  const layer = $('pdfSearchHighlights');
  if (!layer) return;
  layer.innerHTML = '';

  if (!pdfSearchResults.length || !currentPDF) return;

  pdfSearchResults.forEach((match, index) => {
    if (match.page !== pdfPage || !match.pageWidth || !match.pageHeight) return;

    const padX = 1.8;
    const padY = 1.2;
    const left = Math.max(0, ((match.x - padX) / match.pageWidth) * 100);
    const top = Math.max(0, ((match.y - padY) / match.pageHeight) * 100);
    const width = Math.min(100 - left, ((match.width + padX * 2) / match.pageWidth) * 100);
    const height = Math.min(100 - top, ((match.height + padY * 2) / match.pageHeight) * 100);

    const mark = document.createElement('div');
    mark.className = `pdf-search-highlight${index === pdfSearchIndex ? ' active' : ''}`;
    mark.style.left = `${left}%`;
    mark.style.top = `${top}%`;
    mark.style.width = `${width}%`;
    mark.style.height = `${height}%`;
    layer.appendChild(mark);
  });
}

async function goToPDFSearchMatch() {
  if (pdfSearchIndex < 0 || !pdfSearchResults.length) return;
  const match = pdfSearchResults[pdfSearchIndex];
  pdfPage = Math.max(1, Math.min(currentPDF.pageCount, match.page));
  updatePDFSearchMatch();
  await loadPDFPage();
}

async function movePDFSearchMatch(delta) {
  if (!pdfSearchResults.length) return;
  pdfSearchIndex = (pdfSearchIndex + delta + pdfSearchResults.length) % pdfSearchResults.length;
  await goToPDFSearchMatch();
}

function wireOpen(path) {
  $('openFileBtn')?.addEventListener('click', () => call(async () => backend().OpenFile(path)));
}
