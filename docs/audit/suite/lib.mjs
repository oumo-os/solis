// audit/lib.mjs — shared harness for the Solis module-by-module audits.
// AUDIT base = isolated API (solis_audit DB); LIVE base = real dev API (solis DB).
import { execFileSync } from 'child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import vm from 'vm';

export const REPO = process.env.SOLIS_REPO || 'M:/Dev/projects/New folder/solis/solis';
export const XAMPP = process.env.SOLIS_XAMPP || 'm:\\dev\\xampp';
export const LIVE = 'http://localhost/solis/api';
export const AUDIT = 'http://localhost/solis-audit/api.php';
export const MYSQL = XAMPP + '\\mysql\\bin\\mysql.exe';
export const DB_LIVE = 'solis';
export const DB_AUDIT = 'solis_audit';
export const REPORT_DIR = (process.env.TEMP || 'C:/Users/DELL/AppData/Local/Temp') + '/solis-audit-reports';

export function sql(db, q) {
  return execFileSync(MYSQL, ['-uroot', db, '-e', q], { encoding: 'utf8' });
}

export function sqlRows(db, q) {
  const out = sql(db, q).trim();
  if (!out) return [];
  const lines = out.split(/\r?\n/).filter(Boolean);
  const head = lines[0].split('\t');
  return lines.slice(1).map(l => {
    const c = l.split('\t');
    const o = {};
    head.forEach((h, i) => { o[h] = c[i]; });
    return o;
  });
}

export function count(db, table, where = '1=1') {
  const rows = sqlRows(db, `SELECT COUNT(*) AS n FROM ${table} WHERE ${where};`);
  return rows.length ? Number(rows[0].n) : 0;
}

export async function login(base, email, password = 'solis123', opts = {}) {
  // The audit harness logs in as many actors; the persistent login limiter
  // (10 / 15 min) is reset in the ISOLATED database only. The live app keeps
  // its limiter; the auth module audit exercises it deliberately.
  if (opts.clearLimiters !== false && base === AUDIT) {
    try { sql(DB_AUDIT, 'DELETE FROM rate_limits;'); } catch { /* table may not exist yet */ }
  }
  const r = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const j = await r.json().catch(() => ({}));
  if (!j.token) throw new Error(`login failed ${email}: ${r.status} ${JSON.stringify(j)}`);
  return j.token;
}

export async function req(base, method, path, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let j = null;
  try { j = await r.json(); } catch { /* non-JSON body */ }
  return { status: r.status, j };
}

export class Report {
  constructor(module) {
    this.module = module;
    this.rows = [];
    this.notes = [];
  }
  check(name, cond, detail) {
    const ok = !!cond;
    this.rows.push({ name, ok, detail: ok ? undefined : detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  => ' + JSON.stringify(detail)}`);
    return ok;
  }
  note(text) {
    this.notes.push(text);
    console.log('NOTE  ' + text);
  }
  get failures() { return this.rows.filter(r => !r.ok); }
  get passes() { return this.rows.filter(r => r.ok); }
  summary() {
    const f = this.failures.length;
    return `${this.module}: ${this.passes.length}/${this.rows.length} passed${f ? `, ${f} FAILED` : ''}`;
  }
  save() {
    mkdirSync(REPORT_DIR, { recursive: true });
    const file = `${REPORT_DIR}/${this.module}.json`;
    writeFileSync(file, JSON.stringify({
      module: this.module,
      total: this.rows.length,
      passed: this.passes.length,
      failed: this.failures.length,
      checks: this.rows,
      notes: this.notes
    }, null, 2));
    console.log('\n' + this.summary() + `  -> ${file}`);
    return file;
  }
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── UI layer helper: extract a real function from the SPA and run it in a
// sandbox with stubbed DOM helpers (L3 verification without a browser).
export function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('function not found: ' + name);
  let i = src.indexOf('{', start);
  if (i < 0) throw new Error('no body for ' + name);
  let depth = 0, end = -1;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = j + 1; break; } }
  }
  if (end < 0) throw new Error('unbalanced body for ' + name);
  return src.slice(start, end);
}

export function spaSource() {
  return readFileSync(REPO + '/platform/index.html', 'utf8').replace(/\r\n/g, '\n');
}

// ─── Whole-app harness ───────────────────────────────────────────────────
// Boots the entire SPA (external scripts + the inline script) in a sandboxed
// DOM against a live API, so real render functions can be exercised without
// a browser.
export function makeEl(id) {
  return {
    id: id || '',
    innerHTML: '', textContent: '', value: '', checked: false, disabled: false,
    style: {}, dataset: {}, children: [], childNodes: [], className: '', tagName: 'DIV',
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { return c; },
    insertBefore(c) { this.children.push(c); return c; },
    remove() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
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
}

export function ctxStub() {
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

export function bootApp(token, base = AUDIT) {
  const errs = [];
  const els = new Map();
  const spa = spaSource();
  const doc = {
    getElementById(id) { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); },
    querySelector() { return makeEl('q'); },
    querySelectorAll() { return []; },
    createElement(tag) { const e = makeEl('c'); e.tagName = String(tag).toUpperCase(); return e; },
    createTextNode(t) { return { textContent: t }; },
    addEventListener(evt, fn) {
      if (evt === 'DOMContentLoaded' || evt === 'load') { try { fn(); } catch (e) { errs.push('DOMContentLoaded: ' + e.message); } }
    },
    removeEventListener() {},
    body: makeEl('body'), documentElement: makeEl('html'),
    activeElement: null, hidden: false, visibilityState: 'visible'
  };
  const sandbox = {
    document: doc,
    console: { log() {}, warn() {}, error() {}, info() {} },
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
      return fetch(base + '/' + path, Object.assign({}, opts, { headers }));
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
  const store = {
    getItem: (k) => (k === 'solisToken' ? sandbox.__token : null),
    setItem: () => {}, removeItem: () => {}
  };
  sandbox.localStorage = store; sandbox.sessionStorage = store;
  sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
  sandbox.__token = token;

  vm.createContext(sandbox);
  const srcs = [...spa.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m => m[1]);
  for (const src of srcs) {
    const path = (src.startsWith('../') ? REPO + '/' + src.replace('../', '') : REPO + '/platform/' + src).split('?')[0];
    try { vm.runInContext(readFileSync(path, 'utf8'), sandbox, { filename: path.split('/').pop() }); }
    catch (e) { errs.push('external ' + path.split('/').pop() + ': ' + e.message); }
  }
  const scripts = [...spa.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  scripts.forEach((code, i) => {
    try { vm.runInContext(code, sandbox, { filename: 'spa-inline-' + i + '.js' }); }
    catch (e) { errs.push('script ' + i + ': ' + e.message); }
  });
  return { sandbox, els, errs, spa };
}
