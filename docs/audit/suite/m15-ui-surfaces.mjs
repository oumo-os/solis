// M15 — Whole-application boot & render audit
// Loads the entire inline SPA script into a sandboxed DOM (no browser),
// boots it against the live /api/bootstrap payload, then inspects the
// rendered DOM of every view for real data and absence of fixture figures.
import {AUDIT, req, login, Report, spaSource, REPO } from './lib.mjs';
import vm from 'vm';
import fs from 'fs';

const r = new Report('m15-app-boot');

function makeEl(id) {
  const el = {
    id: id || '',
    innerHTML: '', textContent: '', value: '', checked: false, disabled: false,
    style: {}, dataset: {}, children: [], childNodes: [], className: '', tagName: 'DIV',
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { return c; },
    insertBefore(c) { this.children.push(c); return c; },
    remove() {}, setAttribute() {}, getAttribute() { return null; },
    addEventListener() {}, removeEventListener() {},
    querySelector() { return makeEl('q'); },
    querySelectorAll() { return []; },
    closest() { return null; },
    focus() {}, blur() {}, click() {},
    getBoundingClientRect() { return { top: 0, left: 0, width: 100, height: 20, right: 100, bottom: 20 }; },
    scrollIntoView() {},
    getContext() { return ctxStub(); },
    toDataURL() { return ''; }
  };
  return el;
}
function ctxStub() {
  const noop = () => {};
  return new Proxy({}, {
    get(t, k) {
      if (k === 'canvas') return { width: 100, height: 100 };
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
      if (k === 'getImageData') return () => ({ data: [] });
      if (k === 'setTransform' || k === 'getTransform') return () => ({});
      return noop;
    },
    set() { return true; }
  });
}

function makeSandbox(bs, errs) {
  const els = new Map();
  const doc = {
    getElementById(id) {
      if (!els.has(id)) els.set(id, makeEl(id));
      return els.get(id);
    },
    querySelector() { return makeEl('q'); },
    querySelectorAll() { return []; },
    createElement(tag) { const e = makeEl('c'); e.tagName = String(tag).toUpperCase(); return e; },
    createTextNode(t) { return { textContent: t }; },
    addEventListener(evt, fn) { if (evt === 'DOMContentLoaded' || evt === 'load') { try { fn(); } catch (e) { errs.push('DOMContentLoaded: ' + e.message); } } },
    removeEventListener() {},
    body: makeEl('body'), documentElement: makeEl('html'),
    activeElement: null, hidden: false, visibilityState: 'visible'
  };
  const store = {
    getItem: (k) => (k === 'solisToken' ? sandbox.__token : null),
    setItem: () => {}, removeItem: () => {}
  };
  const sandbox = {
    document: doc,
    console: { log() {}, warn() {}, error() {}, info() {} },
    localStorage: store, sessionStorage: store,
    location: { href: 'http://localhost/solis/platform/index.html', hash: '', search: '', pathname: '/platform/index.html', reload() {} },
    navigator: { userAgent: 'node-audit', language: 'en' },
    history: { replaceState() {}, pushState() {} },
    matchMedia: () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    requestAnimationFrame: (fn) => setTimeout(() => { try { fn(); } catch (e) { errs.push('raf: ' + e.message); } }, 0),
    cancelAnimationFrame: () => {},
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
    IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
    MutationObserver: class { observe() {} disconnect() {} },
    Image: class { set src(v) {} },
    fetch: (url, opts) => {
      const path = String(url).replace(/^api\//, '').replace(/^\?/, '');
      const headers = Object.assign({}, (opts && opts.headers) || {});
      headers.Authorization = 'Bearer ' + sandbox.__token;
      return fetch(AUDIT + '/' + path, Object.assign({}, opts, { headers }));
    },
    alert() {}, confirm() { return false; }, prompt() { return null; },
    performance: { now: () => Date.now() },
    setTimeout, clearTimeout, setInterval, clearInterval,
    Date, Math, JSON, Number, String, Boolean, Array, Object, RegExp, Error, Promise, Map, Set, isNaN, parseInt, parseFloat,
    encodeURIComponent, decodeURIComponent, btoa: s => Buffer.from(String(s)).toString('base64'),
    atob: s => Buffer.from(String(s), 'base64').toString('binary'),
    __els: els, __errs: errs,
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    scrollTo() {}, scrollBy() {}, scroll() {}, innerWidth: 1280, innerHeight: 900,
    devicePixelRatio: 1, pageYOffset: 0, pageXOffset: 0
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  return sandbox;
}

async function main() {
  const tok = await login(AUDIT, 'sd@solis.local');
  const bs = await req(AUDIT, 'GET', '/bootstrap', tok);
  const errs = [];
  const sandbox = makeSandbox(bs, errs);
  sandbox.__token = tok;
  vm.createContext(sandbox);

  const spa = spaSource();
  // external scripts first, in document order, so the inline script sees SolMark, modal, MOCK helpers and SolisApi
  const srcs = [...spa.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m => m[1]);
  const platformDir = REPO + '/platform/';
  const repoDir = REPO + '/';
  for (const src of srcs) {
    const path = src.startsWith('../') ? repoDir + src.replace('../', '') : platformDir + src;
    const file = path.split('?')[0];
    try {
      vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file.split('/').pop() });
    } catch (e) {
      errs.push('external ' + file.split('/').pop() + ': ' + e.message);
    }
  }
  r.check('the SPA external scripts load cleanly', errs.length === 0, errs.slice(0, 4));

  const scripts = [...spa.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  r.check('the SPA ships an inline script', scripts.length >= 1, scripts.length);
  scripts.forEach((code, i) => {
    try { vm.runInContext(code, sandbox, { filename: 'spa-inline-' + i + '.js' }); }
    catch (e) { errs.push('script ' + i + ': ' + e.message); }
  });

  // let the boot chain settle (loadApiData -> initApp -> renders)
  await new Promise(res => setTimeout(res, 800));

  r.check('the application boots without an uncaught error', errs.length === 0, errs.slice(0, 5));
  const els = sandbox.__els;

  const viewContent = (id) => {
    const el = els.get(id);
    if (!el) return null;
    return (el.innerHTML || '') + (el.textContent || '');
  };

  const views = [
    ['view-personal', 'the personal dashboard'],
    ['threads-feed', 'the discussions feed'],
    ['participants-grid', 'the participants directory'],
    ['obs-library-list', 'the observatory library shelf'],
    ['projects-body', 'the projects table'],
    ['circles-grid', 'the circles grid'],
    ['cells-grid', 'the cells grid'],
    ['stf-body', 'the STF table'],
    ['resolutions-list', 'the governance tab'],
    ['view-personal', 'the unified personal/profile view'],
    ['inbox-list', 'the inbox'],
    ['td-title', 'the thread detail title'],
    ['pub-title', 'the publication detail title'],
    ['dm-sub', 'the domain-map summary']
  ];
  for (const [id, label] of views) {
    const content = viewContent(id);
    r.check(`${label} (${id}) rendered content`, content !== null && content.length > 0,
      content === null ? 'view element never touched' : 'empty');
  }

  // key derived values present in the rendered DOM
  const stats = viewContent('cm-stats-threads');
  r.check('the discussions stats are filled', !!stats && stats.length > 0, stats);
  const memberName = els.get('member-name');
  r.check('the sidebar shows the signed-in member', !!memberName && memberName.textContent === 'Ssempa David',
    memberName && memberName.textContent);
  const memberAvatar = els.get('member-avatar');
  r.check('the sidebar avatar shows the member initials', !!memberAvatar && memberAvatar.textContent === 'SD',
    memberAvatar && memberAvatar.textContent);
  const composeAvatar = els.get('compose-avatar');
  r.check('the compose avatar shows the member initials', !!composeAvatar && composeAvatar.textContent === 'SD',
    composeAvatar && composeAvatar.textContent);

  // ── participation wiring: the cell composers must actually post ───────
  const spaHtml = spaSource();
  r.check('the deliberation composer is wired to a post handler',
    /id="delib-msg-input"/.test(spaHtml) && /postCellMessage\(currentDelibCellId/.test(spaHtml), 'delib composer');
  r.check('the project cell composer is wired',
    /id="projcell-msg-input"/.test(spaHtml) && /postCellMessage\(currentProjectCellId/.test(spaHtml), 'project composer');
  r.check('the circle cell composer is wired',
    /id="circlecell-msg-input"/.test(spaHtml) && /postCellMessage\(currentCircleCellId/.test(spaHtml), 'circle composer');
  r.check('the participation rule is explained in the UI',
    /Participation follows your domains/.test(spaHtml), 'participation note');

  try { sandbox.renderDelibCell('cell-21'); } catch (e) { r.note('renderDelibCell threw: ' + e.message); }
  const disc = els.get('delib-discussion');
  const discHtml = (disc && disc.innerHTML) || '';
  r.check('a member with standing sees the deliberation composer', /id="delib-msg-input"/.test(discHtml), discHtml.slice(-200));

  const keepUser = sandbox.MOCK.currentUser;
  const nc = (sandbox.MOCK.participants || []).find(p => p.id === 'nc');
  sandbox.MOCK.currentUser = nc;
  try { sandbox.renderDelibCell('cell-21'); } catch (e) { r.note('renderDelibCell (no standing) threw: ' + e.message); }
  const disc2 = els.get('delib-discussion');
  const discHtml2 = (disc2 && disc2.innerHTML) || '';
  r.check('a member without standing is told why they cannot speak',
    /Participation follows your domains/.test(discHtml2) && !/id="delib-msg-input"/.test(discHtml2), discHtml2.slice(-300));
  sandbox.MOCK.currentUser = keepUser;

  // no fabricated fixture figures anywhere in the rendered DOM
  const allHtml = [...els.entries()].map(([id, el]) => (el.innerHTML || '') + (el.textContent || '')).join('\n');
  const fabricated = ['200+ resources', '38 events', '14 pieces', '12 open', '4 running', '5 active stewards', '12 open opportunities']
    .filter(f => allHtml.includes(f));
  r.check('no fabricated fixture figures are rendered', fabricated.length === 0, fabricated);

  // the participation surfaces carry real counts
  const partStats = viewContent('part-stat-participants');
  r.check('the participant count is derived from the payload',
    partStats && partStats.includes(String(bs.j.participants.length)), { partStats, expected: bs.j.participants.length });

  r.save();
  process.exit(r.failures.length ? 1 : 0);
}
main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
