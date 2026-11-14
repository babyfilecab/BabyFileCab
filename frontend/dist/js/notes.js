// Client notes, audit trail and notes sanitizer.

function renderNotes(node, notes, history) {
  $('preview').className = '';
  $('preview').innerHTML = `
    <div class="preview-header">
      <div class="preview-title">Client Notes — ${escapeHTML(clientNameFor(node.path))}</div>
      <button id="saveNotesBtn" class="primary">Save Notes</button>
    </div>
    <div class="preview-body client-notes-view">
      <div class="notes-toolbar" aria-label="Notes formatting toolbar">
        <label>Font
          <select id="notesFont">
            <option value="Arial">Arial</option>
            <option value="Georgia">Georgia</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Verdana">Verdana</option>
            <option value="Trebuchet MS">Trebuchet MS</option>
            <option value="Courier New">Courier New</option>
          </select>
        </label>
        <label>Color <input id="notesColor" type="color" value="#172a47" /></label>
        <button type="button" id="notesBold" title="Bold"><b>B</b></button>
        <button type="button" id="notesItalic" title="Italic"><i>I</i></button>
        <button type="button" id="notesBullets" title="Bulleted list">• Bullets</button>
        <button type="button" id="notesClearFormat" title="Clear formatting">Clear format</button>
      </div>
      <div id="notesEditor" class="notes-editor rich-notes-editor" contenteditable="true" spellcheck="true" aria-label="Client notes"></div>

      <section class="audit-section">
        <div class="audit-heading-row">
          <div>
            <h3>Audit Trail / Client History</h3>
            <p>Recent activity for this client is recorded locally.</p>
          </div>
          <button id="refreshAuditBtn" class="secondary">↻ Refresh</button>
        </div>
        <div id="auditTrail" class="audit-trail"></div>
      </section>
    </div>`;

  const editor = $('notesEditor');
  editor.addEventListener('paste', event => {
    event.preventDefault();
    const html = event.clipboardData?.getData('text/html');
    const text = event.clipboardData?.getData('text/plain') || '';
    document.execCommand('insertHTML', false, html ? sanitizeNotesHTML(html) : plainTextToNotesHTML(text));
  });
  // Native drops can insert active markup directly into a contenteditable element.
  editor.addEventListener('drop', event => event.preventDefault());
  notesSelectionRange = null;
  if (notes?.html) {
    editor.innerHTML = sanitizeNotesHTML(notes.html);
  } else {
    editor.innerHTML = plainTextToNotesHTML(notes?.text || '');
  }
  renderAuditTrail(history || []);

  const rememberNotesSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount && editor.contains(selection.anchorNode)) {
      notesSelectionRange = selection.getRangeAt(0).cloneRange();
    }
  };
  const focusEditor = () => {
    editor.focus();
    if (notesSelectionRange) {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(notesSelectionRange);
    }
  };
  editor.addEventListener('mouseup', rememberNotesSelection);
  editor.addEventListener('keyup', rememberNotesSelection);
  editor.addEventListener('input', rememberNotesSelection);

  $('notesFont').addEventListener('change', e => {
    focusEditor();
    document.execCommand('fontName', false, e.target.value);
    rememberNotesSelection();
  });
  $('notesColor').addEventListener('input', e => {
    focusEditor();
    document.execCommand('foreColor', false, e.target.value);
    rememberNotesSelection();
  });
  $('notesBold').addEventListener('mousedown', e => e.preventDefault());
  $('notesBold').addEventListener('click', () => { focusEditor(); document.execCommand('bold', false, null); rememberNotesSelection(); });
  $('notesItalic').addEventListener('mousedown', e => e.preventDefault());
  $('notesItalic').addEventListener('click', () => { focusEditor(); document.execCommand('italic', false, null); rememberNotesSelection(); });
  $('notesBullets').addEventListener('mousedown', e => e.preventDefault());
  $('notesBullets').addEventListener('click', () => { focusEditor(); document.execCommand('insertUnorderedList', false, null); rememberNotesSelection(); });
  $('notesClearFormat').addEventListener('mousedown', e => e.preventDefault());
  $('notesClearFormat').addEventListener('click', () => { focusEditor(); document.execCommand('removeFormat', false, null); rememberNotesSelection(); });

  $('saveNotesBtn').addEventListener('click', () => call(async () => {
    const cleanHTML = sanitizeNotesHTML(editor.innerHTML);
    const plainText = notesEditorPlainText(editor);
    await backend().SaveNotesDocument(node.path, cleanHTML, plainText);
    editor.innerHTML = cleanHTML;
    const updatedHistory = await backend().GetAuditTrail(node.path);
    renderAuditTrail(updatedHistory || []);
    toast('Notes saved.');
  }));

  $('refreshAuditBtn').addEventListener('click', () => call(async () => {
    const updatedHistory = await backend().GetAuditTrail(node.path);
    renderAuditTrail(updatedHistory || []);
  }));
}

function renderAuditTrail(entries) {
  const root = $('auditTrail');
  if (!root) return;
  if (!entries?.length) {
    root.innerHTML = '<div class="audit-empty">No client history has been recorded yet.</div>';
    return;
  }
  root.innerHTML = entries.map(entry => `
    <div class="audit-entry">
      <div class="audit-time">${escapeHTML(formatAuditTime(entry.timestamp))}</div>
      <div class="audit-content">
        <div class="audit-action">${escapeHTML(entry.action || 'Activity')}</div>
        ${entry.details ? `<div class="audit-details">${escapeHTML(entry.details)}</div>` : ''}
      </div>
    </div>`).join('');
}

function formatAuditTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function plainTextToNotesHTML(text) {
  return escapeHTML(text || '').replace(/\r?\n/g, '<br>');
}

function sanitizeNotesHTML(input) {
  if (typeof input !== 'string' || input.length > 2 * 1024 * 1024) return '';
  const template = document.createElement('template');
  template.innerHTML = input;
  const output = document.createElement('div');
  const allowed = new Set(['DIV','P','BR','UL','OL','LI','SPAN','B','STRONG','I','EM','U','FONT']);
  const drop = new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','TEMPLATE','NOSCRIPT','HEAD','TITLE','LINK','META','BASE']);
  const fonts = new Set(['arial','georgia','times new roman','verdana','trebuchet ms','courier new','sans-serif','serif','monospace']);
  const safeStyle = (name, value) => {
    switch (name) {
      case 'color': return /^(#[0-9a-f]{3}|#[0-9a-f]{6}|black|white|red|green|blue|gray|grey|yellow|orange|purple|transparent|rgb\(\s*[0-9]{1,3}\s*,\s*[0-9]{1,3}\s*,\s*[0-9]{1,3}\s*\))$/i.test(value);
      case 'font-family': return fonts.has(value.replace(/^['"]|['"]$/g, '').toLowerCase());
      case 'font-weight': return ['normal','bold','400','700'].includes(value);
      case 'font-style': return ['normal','italic'].includes(value);
      case 'text-decoration': return ['none','underline','line-through'].includes(value);
      default: return false;
    }
  };
  const copy = (source, destination, depth) => {
    if (depth > 128) throw new Error('Formatted notes nesting is too deep.');
    for (const child of source.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        destination.appendChild(document.createTextNode(child.textContent));
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (child.namespaceURI !== 'http://www.w3.org/1999/xhtml' || drop.has(child.tagName)) continue;
        let target = destination;
        if (allowed.has(child.tagName)) {
          target = document.createElement(child.tagName.toLowerCase());
          const style = [];
          for (const declaration of (child.getAttribute('style') || '').split(';')) {
            const colon = declaration.indexOf(':');
            if (colon < 0) continue;
            const name = declaration.slice(0, colon).trim().toLowerCase();
            const value = declaration.slice(colon + 1).trim();
            if (safeStyle(name, value)) style.push(`${name}: ${value}`);
          }
          if (style.length) target.setAttribute('style', style.join('; '));
          if (child.tagName === 'FONT') {
            for (const [attr, prop] of [['color','color'],['face','font-family']]) {
              const value = child.getAttribute(attr) || '';
              if (safeStyle(prop, value)) target.setAttribute(attr, value);
            }
          }
          destination.appendChild(target);
        }
        copy(child, target, depth + 1);
      }
    }
  };
  copy(template.content, output, 0);
  return output.innerHTML;
}

function notesEditorPlainText(editor) {
  const clone = editor.cloneNode(true);
  clone.querySelectorAll('br').forEach(br => br.replaceWith(document.createTextNode('\n')));
  clone.querySelectorAll('li').forEach(li => {
    li.insertBefore(document.createTextNode('• '), li.firstChild);
    li.appendChild(document.createTextNode('\n'));
  });
  clone.querySelectorAll('div, p').forEach(el => el.appendChild(document.createTextNode('\n')));
  return (clone.textContent || '').replace(/\n{3,}/g, '\n\n').trimEnd();
}

function renderFolderInfo(node) {
  $('preview').className = '';
  $('preview').innerHTML = `
    <div class="preview-header"><div class="preview-title">${escapeHTML(node.name)}</div></div>
    <div class="preview-body">
      <h2>${escapeHTML(node.name)}</h2>
      <p>Select a document beneath this folder to preview it, or use <b>Upload</b> above.</p>
    </div>`;
}
