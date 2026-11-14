// All frontend scripts in the order index.html loads them, joined into one
// string, so tests can pull out functions no matter which file they live in.
const fs = require('node:fs');
const path = require('node:path');
const dist = path.join(__dirname, '../dist');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
module.exports = scripts
  .map(src => fs.readFileSync(path.join(dist, src), 'utf8').replace(/\r\n/g, '\n'))
  .join('\n');
