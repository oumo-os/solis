// check_inline.js — syntax-check every inline <script> block of an HTML file.
const fs = require('fs');
const vm = require('vm');
const file = process.argv[2];
if (!file) { console.error('usage: node check_inline.js <file.html>'); process.exit(2); }
const html = fs.readFileSync(file, 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let ok = true;
scripts.forEach((code, i) => {
  const lines = code.split('\n').length;
  try {
    new vm.Script(code, { filename: 'inline-' + i + '.js' });
    console.log('script #' + i + ' OK (' + lines + ' lines)');
  } catch (e) {
    ok = false;
    console.error('script #' + i + ' FAILED: ' + e.message);
  }
});
console.log(ok ? 'all ' + scripts.length + ' inline scripts pass' : 'inline script errors');
process.exit(ok ? 0 : 1);
