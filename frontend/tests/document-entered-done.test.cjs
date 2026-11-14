const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const app = require('./source.cjs');
const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8');
const css = ['base.css', 'theme.css'].map(f => fs.readFileSync(path.join(__dirname, '../dist/css', f), 'utf8')).join('\n');

assert.match(html, /data-document-action="done"[^>]*>Entered \/ Done<\/button>/);
assert.match(app, /SetDocumentEnteredDone\(doc\.path, !Boolean\(doc\.done\)\)/);
assert.match(app, /document-entered-done/);
assert.match(app, /document-done-check/);
assert.match(app, /is-current-document-status/);
assert.match(css, /document-entered-done/);
assert.match(css, /document-done-check/);
console.log('PASS: document Entered / Done menu, persistence call, tree checkmark, and green styling are wired');
