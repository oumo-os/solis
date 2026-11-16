// Smoke-test the static pages: run their inline scripts against the live
// bootstrap payload with a DOM stub, assert sections render real data.
const fs = require('fs');
const http = require('http');
const vm = require('vm');
const base = (process.env.SOLIS_REPO || 'M:/Dev/projects/New folder/solis/solis') + '/';

function get(url) {
  return new Promise((res, rej) => {
    http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }).on('error', rej);
  });
}

function extractInline(html) {
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m, out = '';
  while ((m = re.exec(html))) out += m[1] + '\n';
  return out;
}

async function runPage(file, payload, assertFn) {
  const html = fs.readFileSync(base + file, 'utf8');
  const code = extractInline(html);
  const store = {};
  const missing = [];
  const doc = {
    getElementById(id) {
      if (!html.includes('id="' + id + '"')) missing.push(id);
      return {
        set innerHTML(v) { store[id] = String(v); },
        get innerHTML() { return store[id] || ''; },
        set textContent(v) { store[id] = String(v); },
        get textContent() { return store[id] || ''; },
        style: {},
        classList: { toggle() {}, add() {}, remove() {} }
      };
    },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  const liveJs = fs.readFileSync(base + 'shared/live.js', 'utf8');
  const sandbox = {
    document: doc,
    SolMark: function () { return '<svg/>'; },
    fetch: function () { return Promise.resolve({ ok: true, json: function () { return Promise.resolve(payload); } }); },
    console: console,
    String: String, Number: Number, Math: Math, JSON: JSON, Promise: Promise, Array: Array, Object: Object
  };
  vm.createContext(sandbox);
  vm.runInContext(liveJs, sandbox, { filename: 'live.js' });
  vm.runInContext(code, sandbox, { filename: file });
  await new Promise(r => setTimeout(r, 50)); // let the fetch().then chain render
  const problems = assertFn(store, payload);
  const status = (problems.length === 0 && missing.length === 0) ? 'PASS' : 'FAIL';
  console.log(status + ' ' + file + (problems.length ? ' :: ' + problems.join(' | ') : '') + (missing.length ? ' :: MISSING IDS ' + missing.join(',') : ''));
  return status === 'PASS';
}

(async function () {
  const payload = JSON.parse(await get('http://localhost/solis/api/bootstrap'));
  let all = true;

  all = await runPage('index.html', payload, (s, p) => {
    const probs = [];
    if (!s.stats || s.stats.indexOf(String(p.opportunities.length)) === -1) probs.push('stats missing opps count');
    if (!s.stats || s.stats.indexOf(String(p.participants.filter(x => x.steward).length)) === -1) probs.push('stats missing stewards count');
    if (s['sector-news'].indexOf(p.news[0].title) === -1) probs.push('sector news title absent');
    if (s['commons-activity'].indexOf(p.publications[0].title) === -1) probs.push('activity publication absent');
    if (s.opportunities.indexOf(p.opportunities[0].title) === -1) probs.push('opportunity title absent');
    if (s.opportunities.indexOf(p.opportunities[0].deadline) === -1) probs.push('opportunity deadline absent');
    ['SGAC', 'PSLV-C60', 'AfricaSpace Summit 2026 — What', 'Moon Camp'].forEach(f => {
      if (JSON.stringify(s).indexOf(f) !== -1) probs.push('fixture leaked: ' + f);
    });
    return probs;
  }) && all;

  all = await runPage('events.html', payload, (s, p) => {
    const probs = [];
    if (!s['events-count'] || s['events-count'].indexOf(String(p.events.length)) === -1) probs.push('count wrong: ' + s['events-count']);
    if (s['events-list'].indexOf(p.events[0].title) === -1) probs.push('first event absent');
    if (s['month-mini'].indexOf(String(p.events[0].date).split(' ')[0]) === -1) probs.push('month chip absent');
    if (JSON.stringify(s).indexOf('IAC 2026') !== -1) probs.push('fixture leaked: IAC 2026');
    return probs;
  }) && all;

  all = await runPage('observatory.html', payload, (s, p) => {
    const probs = [];
    if (s['observatory-cards'].indexOf(p.events.length + ' upcoming') === -1) probs.push('calendar count absent');
    if (s['observatory-cards'].indexOf(p.publications.length + ' pieces') === -1) probs.push('pub count absent');
    if (s['observatory-cards'].indexOf(p.library.length + ' resources') === -1) probs.push('library count absent');
    if (s.publications.indexOf(p.publications[0].title) === -1) probs.push('first pub absent');
    if (JSON.stringify(s).indexOf('200+ resources') !== -1) probs.push('fixture leaked: 200+');
    return probs;
  }) && all;

  all = await runPage('stewards.html', payload, (s, p) => {
    const probs = [];
    const stewards = p.participants.filter(x => x.steward);
    if (s['stewards-list'].indexOf(stewards[0].name) === -1) probs.push('first steward absent');
    if (s['stewards-list'].split('card').length - 1 !== stewards.length) probs.push('card count mismatch');
    if (JSON.stringify(s).indexOf('Nakabugo') !== -1) probs.push('fixture leaked: Nakabugo');
    return probs;
  }) && all;

  all = await runPage('expeditions.html', payload, (s, p) => {
    const probs = [];
    if (!s['exp-count'] || s['exp-count'].indexOf(String(p.projects.length)) === -1) probs.push('count wrong: ' + s['exp-count']);
    if (s['exp-grid'].indexOf(p.projects[0].title) === -1) probs.push('first project absent');
    if (s['exp-grid'].indexOf(p.projects[0].progress + '% complete') === -1) probs.push('progress absent');
    if (JSON.stringify(s).indexOf('Ground Station Cost-Share') !== -1) probs.push('fixture leaked');
    return probs;
  }) && all;

  console.log(all ? 'ALL PAGES PASS' : 'SOME PAGES FAILED');
  process.exit(all ? 0 : 1);
})();
