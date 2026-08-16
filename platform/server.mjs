#!/usr/bin/env node
// server.mjs — Solis Commons database prototype server.
// Serves static files (platform/) + granular REST API backed by SQLite.
// Usage: node server.mjs   →  http://localhost:3000
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, statSync, createReadStream, existsSync } from 'node:fs';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize, sep } from 'node:path';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLATFORM_DIR = join(__dirname);
const SHARED_DIR = join(PLATFORM_DIR, '..', 'shared');
const DB_PATH = process.env.SOLIS_DB || join(PLATFORM_DIR, 'solis.db');
const PORT = process.env.PORT || 3000;

// ── DB bootstrap ────────────────────────────────────────
if (!existsSync(DB_PATH)) {
  execSync(`node ${join(__dirname, 'db', 'seed.js')}`, { env: { ...process.env, SOLIS_DB: DB_PATH } });
}
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
try { db.exec('ALTER TABLE users ADD COLUMN failed_attempts INTEGER DEFAULT 0'); } catch { /* already present */ }
try { db.exec('ALTER TABLE threads ADD COLUMN endorsements INTEGER DEFAULT 0'); } catch { /* already present */ }
try { db.exec('ALTER TABLE threads ADD COLUMN proposal_cell_id TEXT'); } catch { /* already present */ }
try { db.exec("ALTER TABLE threads ADD COLUMN visibility TEXT DEFAULT 'public'"); } catch { /* already present */ }
try { db.exec('ALTER TABLE threads ADD COLUMN jstf_cell_id TEXT'); } catch { /* already present */ }

// ── helpers ─────────────────────────────────────────────
const send = (res, code, obj) => {
  if (res.writableEnded) return true;
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
  return true;
};
const readBody = (req) =>
  new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { resolve({}); }
    });
  });
// scrypt password hashing — self-describing format "scrypt$N$r$p$salt$hash".
// Legacy sha256 hashes (pre-hardening seed data) still verify and are
// transparently upgraded to scrypt on successful login.
const legacyHash = (pw) => createHash('sha256').update(String(pw)).digest('hex');
const isLegacyHash = (stored) => /^[0-9a-f]{64}$/.test(stored || '');
const hashPassword = (pw) => {
  const salt = randomBytes(16).toString('hex');
  const key = scryptSync(String(pw), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt}$${key.toString('hex')}`;
};
const verifyPassword = (pw, stored) => {
  if (!stored) return false;
  if (stored.startsWith('scrypt$')) {
    const [N, r, p, salt, hex] = stored.split('$').slice(1);
    const n = parseInt(N, 10), rr = parseInt(r, 10), pp = parseInt(p, 10);
    if (!n || !rr || !pp || !salt || !hex) return false;
    try {
      const expected = Buffer.from(hex, 'hex');
      const key = scryptSync(String(pw), salt, expected.length, { N: n, r: rr, p: pp });
      return expected.length === key.length && timingSafeEqual(expected, key);
    } catch { return false; }
  }
  return timingSafeEqual(Buffer.from(legacyHash(pw), 'hex'), Buffer.from(stored, 'hex'));
};

// ── brute-force protection ───────────────────────────────
const rateBuckets = new Map();
const rateLimit = (key, max, windowMs) => {
  const now = Date.now();
  let b = rateBuckets.get(key);
  if (!b || now - b.t > windowMs) { b = { n: 0, t: now }; }
  b.n++;
  b.t = now;
  rateBuckets.set(key, b);
  return b.n > max ? Math.ceil((b.t + windowMs - now) / 1000) : null;
};
const CLIENT_IP = (req) => (req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');
const AUTH_LIMIT = parseInt(process.env.SOLIS_AUTH_RATE || '10', 10);
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const genToken = () => randomBytes(48).toString('hex');

// ── auth ────────────────────────────────────────────────
function authUser(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const row = db.prepare(
    `SELECT u.* FROM auth_tokens t JOIN users u ON u.id = t.user_id
     WHERE t.token = ? AND t.expires_at > datetime('now')`).get(m[1]);
  return row || null;
}

// ═════════════════════════════════════════════════════════
// AUTH ENDPOINTS
// ═════════════════════════════════════════════════════════

async function authRoutes(req, res, path, method) {
if (method === 'POST' && path === '/api/auth/login') {
    const body = await readBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const retry = rateLimit(`auth:${CLIENT_IP(req)}`, AUTH_LIMIT, AUTH_WINDOW_MS);
    if (retry) return send(res, 429, { error: 'Too many attempts — please try again later', retryAfter: retry });
    const user = db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(email);
    const pw = String(body.password || '');
    if (!user || !user.password_hash || !verifyPassword(pw, user.password_hash)) {
      if (user) db.prepare('UPDATE users SET failed_attempts = COALESCE(failed_attempts,0) + 1 WHERE id = ?').run(user.id);
      return send(res, 401, { error: 'Invalid email or password' });
    }
    if (user.failed_attempts) db.prepare('UPDATE users SET failed_attempts = 0 WHERE id = ?').run(user.id);
    if (isLegacyHash(user.password_hash)) {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(pw), user.id);
      user.password_hash = null;
    }
    const token = genToken();
    const expires = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    db.prepare('INSERT INTO auth_tokens (user_id, token, expires_at) VALUES (?,?,?)').run(user.id, token, expires);
    db.prepare("DELETE FROM auth_tokens WHERE user_id = ? AND expires_at <= datetime('now')").run(user.id);
    delete user.password_hash;
    return send(res, 200, { token, user });
  }

  if (method === 'POST' && path === '/api/auth/register') {
    const retry = rateLimit(`reg:${CLIENT_IP(req)}`, AUTH_LIMIT, AUTH_WINDOW_MS);
    const body = await readBody(req);
    const { name, email, password, location, bio, essay } = body;
    if (retry) return send(res, 429, { error: 'Too many accounts created from this address — please try again later', retryAfter: retry });
    if (!name || !email || !password) return send(res, 400, { error: 'Name, email, and password required' });
    if (String(password).length < 6) return send(res, 400, { error: 'Password must be at least 6 characters' });
    const exists = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(String(email).toLowerCase());
    if (exists) return send(res, 409, { error: 'Email already registered' });
    const id = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'user-' + Date.now();
    const initials = String(name).split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const joined = new Date().toISOString().slice(0, 10);
    db.prepare(`INSERT INTO users (id,name,initials,email,location,bio,essay,joined,status,is_current,password_hash)
                VALUES (?,?,?,?,?,?,?,?,?,0,?)`)
      .run(id, name, initials, String(email).toLowerCase(), location || '', bio || '', essay || '', joined, 'Active', hashPassword(password));
    const token = genToken();
    db.prepare('INSERT INTO auth_tokens (user_id, token, expires_at) VALUES (?,?,?)')
      .run(id, token, new Date(Date.now() + 24 * 3600 * 1000).toISOString());
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    delete user.password_hash;
    return send(res, 201, { token, user });
  }

  if (method === 'POST' && path === '/api/auth/logout') {
    const m = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    if (m) db.prepare('DELETE FROM auth_tokens WHERE token = ?').run(m[1]);
    return send(res, 200, { ok: true });
  }

  if (method === 'GET' && path === '/api/auth/me') {
    const u = authUser(req);
    if (!u) return send(res, 401, { error: 'Unauthorized' });
    delete u.password_hash;
    return send(res, 200, { user: u });
  }

  return null;
}

// ═════════════════════════════════════════════════════════
// RESOURCE ROUTER
// ═════════════════════════════════════════════════════════

const routes = [
  // users
  { table: 'users', path: '/api/users', keys: ['id', 'name', 'initials', 'email', 'location', 'joined', 'status', 'standing', 'competence', 'bio', 'essay'] },
  { table: 'domains', path: '/api/domains' },
  { table: 'organisations', path: '/api/organisations' },
  { table: 'circles', path: '/api/circles' },
  { table: 'cells', path: '/api/cells' },
  { table: 'stfs', path: '/api/stfs' },
  { table: 'threads', path: '/api/threads' },
  { table: 'inbox', path: '/api/inbox' },
  { table: 'publications', path: '/api/publications' },
  { table: 'news', path: '/api/news' },
  { table: 'events', path: '/api/events' },
  { table: 'opportunities', path: '/api/opportunities' },
  { table: 'projects', path: '/api/projects' },
  { table: 'integrity_records', path: '/api/integrity-records' },
  { table: 'governance_events', path: '/api/governance-events' },
  { table: 'circle_applications', path: '/api/circle-applications' },
  { table: 'project_applications', path: '/api/project-applications' },
  { table: 'governance_ledger', path: '/api/governance-ledger' },
  { table: 'exit_reason_labels', path: '/api/exit-reason-labels' },
];

function parseId(reqUrl, base) {
  if (!reqUrl.startsWith(base + '/')) return null;
  const rest = reqUrl.slice(base.length + 1);
  if (!rest || rest.includes('/')) return null;
  return decodeURIComponent(rest);
}

async function resourceRoutes(req, res, reqUrl, method) {
  for (const r of routes) {
    const id = parseId(reqUrl, r.path);
    if (reqUrl === r.path || id !== null) {
      // GET list or item
      if (method === 'GET') {
        const idParam = parseId(reqUrl, r.path);
        if (idParam !== null) {
          const row = db.prepare(`SELECT * FROM ${r.table} WHERE id = ?`).get(idParam);
          if (!row) return send(res, 404, { error: 'Not found' });
          return send(res, 200, row);
        }
        const rows = db.prepare(`SELECT * FROM ${r.table}`).all();
        return send(res, 200, rows);
      }
      // POST → create
      if (method === 'POST' && reqUrl === r.path) {
        const body = await readBody(req);
        if (!body.id) return send(res, 400, { error: 'id required' });
        try {
          db.prepare(`INSERT INTO ${r.table} (id) VALUES (?) ON CONFLICT(id) DO NOTHING`).run(String(body.id));
          const ok = updateRow(r.table, body);
          return send(res, ok ? 201 : 409, { ok: !!ok, id: body.id });
        } catch (e) {
          return send(res, 400, { error: e.message });
        }
      }
      // PATCH/PUT → update
      if (method === 'PATCH' || method === 'PUT') {
        const body = await readBody(req);
        const row = db.prepare(`SELECT * FROM ${r.table} WHERE id = ?`).get(id);
        if (!row) return send(res, 404, { error: 'Not found' });
        updateRow(r.table, body, id);
        return send(res, 200, db.prepare(`SELECT * FROM ${r.table} WHERE id = ?`).get(id));
      }
      // DELETE
      if (method === 'DELETE') {
        const out = db.prepare(`DELETE FROM ${r.table} WHERE id = ?`).run(id);
        return send(res, out.changes ? 200 : 404, { ok: out.changes > 0 });
      }
      return send(res, 405, { error: 'Method not allowed' });
    }
  }
  return null;
}

function bindVal(v) {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'object' && v !== null) return JSON.stringify(v);
  return v;
}

// Apply a flat JSON body to a row's columns (only known columns).
function updateRow(table, body, id) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  const entries = Object.entries(body).filter(([k]) => cols.includes(k) && k !== 'id');
  if (!entries.length) return false;
  const sets = entries.map(([k]) => `${k} = ?`).join(', ');
  const vals = entries.map(([, v]) => bindVal(v));
  if (id) {
    db.prepare(`UPDATE ${table} SET ${sets} WHERE id = ?`).run(...vals, String(id));
  } else {
    db.prepare(`UPDATE ${table} SET ${sets} WHERE id = ?`).run(...vals, String(body.id));
  }
  return true;
}

// ── child collections (granular, tied to parent id) ──────
const childDefs = [
  { parent: 'circles', child: 'circle_domains', parentKey: 'circle_id', path: '/api/circles/:id/domains' },
  { parent: 'circles', child: 'circle_roster', parentKey: 'circle_id', path: '/api/circles/:id/roster' },
  { parent: 'circles', child: 'circle_proposals', parentKey: 'circle_id', path: '/api/circles/:id/proposals' },
  { parent: 'circles', child: 'circle_resolutions', parentKey: 'circle_id', path: '/api/circles/:id/resolutions' },
  { parent: 'circles', child: 'circle_activity', parentKey: 'circle_id', path: '/api/circles/:id/activity' },
  { parent: 'cells', child: 'cell_domains', parentKey: 'cell_id', path: '/api/cells/:id/domains' },
  { parent: 'cells', child: 'cell_circles', parentKey: 'cell_id', path: '/api/cells/:id/circles' },
  { parent: 'cells', child: 'cell_messages', parentKey: 'cell_id', path: '/api/cells/:id/messages' },
  { parent: 'cells', child: 'cell_tasks', parentKey: 'cell_id', path: '/api/cells/:id/tasks' },
  { parent: 'cells', child: 'cell_objectives', parentKey: 'cell_id', path: '/api/cells/:id/objectives' },
  { parent: 'cells', child: 'cell_team', parentKey: 'cell_id', path: '/api/cells/:id/team' },
  { parent: 'cells', child: 'draft_resolutions', parentKey: 'cell_id', path: '/api/cells/:id/draft-resolutions' },
  { parent: 'cells', child: 'cell_votes', parentKey: 'cell_id', path: '/api/cells/:id/votes' },
  { parent: 'cells', child: 'vote_records', parentKey: 'cell_id', path: '/api/cells/:id/vote-records' },
  { parent: 'stfs', child: 'stf_candidates', parentKey: 'stf_id', path: '/api/stfs/:id/candidates' },
  { parent: 'threads', child: 'thread_replies', parentKey: 'thread_id', path: '/api/threads/:id/replies' },
  { parent: 'circle_applications', child: 'circle_application_domains', parentKey: 'app_id', path: '/api/circle-applications/:id/domains' },
];

// ── draft-resolution sub-children (resolution_versions / implementing circles) ──
// POST /api/cells/:cellId/draft-resolutions/:draftId/versions
// POST /api/cells/:cellId/draft-resolutions/:draftId/implementing-circles
async function draftChildRoutes(req, res, reqUrl, method) {
  const m = reqUrl.match(/^\/api\/cells\/([^/]+)\/draft-resolutions\/([^/]+)\/(versions|implementing-circles)$/);
  if (!m) return null;
  if (method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const cellId = decodeURIComponent(m[1]);
  const draftId = decodeURIComponent(m[2]);
  const kind = m[3];
  const body = await readBody(req);
  const draft = db.prepare('SELECT * FROM draft_resolutions WHERE id = ? AND cell_id = ?').get(String(draftId), cellId);
  if (!draft) return send(res, 404, { error: 'Not found' });
  if (kind === 'versions') {
    const cols = ['draft_id', 'title', 'text', 'action', 'author', 'ts'];
    const keys = ['draft_id', ...cols.filter(k => k !== 'draft_id' && body[k] !== undefined)];
    db.prepare(`INSERT INTO resolution_versions (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
      .run(...keys.map(k => (k === 'draft_id' ? String(draftId) : bindVal(body[k]))));
  } else {
    db.prepare('INSERT INTO resolution_implementing_circles (draft_id, circle_name) VALUES (?,?) ON CONFLICT DO NOTHING')
      .run(String(draftId), String(body.circle_name ?? ''));
  }
  return send(res, 201, { ok: true });
}

// ── thread-engagement child routes (endorse / bookmark, per auth user) ──
// POST/DELETE /api/threads/:id/endorsement — toggle the caller's endorsement (recomputes count)
// POST/DELETE /api/threads/:id/bookmark    — toggle the caller's bookmark
async function engagementRoutes(req, res, reqUrl, method) {
  const m = reqUrl.match(/^\/api\/threads\/([^/]+)\/(endorsement|bookmark)$/);
  if (!m) return null;
  if (method !== 'POST' && method !== 'DELETE') return send(res, 405, { error: 'Method not allowed' });
  const threadId = decodeURIComponent(m[1]);
  const kind = m[2];
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Unauthorized' });
  if (!db.prepare('SELECT id FROM threads WHERE id = ?').get(threadId)) {
    return send(res, 404, { error: 'Not found' });
  }
  const table = kind === 'endorsement' ? 'thread_endorsements' : 'thread_bookmarks';
  if (method === 'POST') {
    db.prepare(`INSERT INTO ${table} (user_id, thread_id) VALUES (?,?) ON CONFLICT DO NOTHING`).run(user.id, threadId);
  } else {
    db.prepare(`DELETE FROM ${table} WHERE user_id = ? AND thread_id = ?`).run(user.id, threadId);
  }
  const active = method === 'POST';
  const resp = { ok: true, threadId };
  if (kind === 'endorsement') {
    const n = db.prepare('SELECT COUNT(*) n FROM thread_endorsements WHERE thread_id = ?').get(threadId).n;
    db.prepare('UPDATE threads SET endorsements = ? WHERE id = ?').run(n, threadId);
    resp.endorsed = active;
    resp.endorsements = n;
  } else {
    resp.bookmarked = active;
  }
  return send(res, 200, resp);
}

async function pinRoutes(req, res, reqUrl, method) {
  const m = reqUrl.match(/^\/api\/threads\/([^/]+)\/pin$/);
  if (!m) return null;
  if (method !== 'POST' && method !== 'DELETE') return send(res, 405, { error: 'Method not allowed' });
  const threadId = decodeURIComponent(m[1]);
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Unauthorized' });
  const inRoster = db.prepare(`SELECT COUNT(*) n FROM circle_roster WHERE member_id = ? AND status = 'active'`).get(user.id).n;
  if (!inRoster) return send(res, 403, { error: 'Steward access required' });
  if (!db.prepare('SELECT id FROM threads WHERE id = ?').get(threadId)) {
    return send(res, 404, { error: 'Not found' });
  }
  const pinned = method === 'POST';
  db.prepare('UPDATE threads SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, threadId);
  return send(res, 200, { ok: true, threadId, pinned });
}

// ── thread → proposal (Discussion origin, to_prod 2.5) ───
// POST /api/threads/:id/raise-proposal — steward raises a discussion into
// deliberation: creates a Deliberation Cell linked back to the thread.
async function raiseProposalRoutes(req, res, reqUrl, method) {
  const m = reqUrl.match(/^\/api\/threads\/([^/]+)\/raise-proposal$/);
  if (!m) return null;
  if (method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const threadId = decodeURIComponent(m[1]);
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Unauthorized' });
  const inRoster = db.prepare(`SELECT COUNT(*) n FROM circle_roster WHERE member_id = ? AND status = 'active'`).get(user.id).n;
  if (!inRoster) return send(res, 403, { error: 'Steward access required' });
  const t = db.prepare('SELECT * FROM threads WHERE id = ?').get(threadId);
  if (!t) return send(res, 404, { error: 'Not found' });
  if (t.proposal_cell_id) return send(res, 409, { error: 'Already raised as a proposal' });
  const memberCount = (db.prepare(`SELECT COUNT(*) n FROM users WHERE status = 'Active'`).get().n) || 0;
  const cellId = 'delib-' + Date.now().toString(36);
  const source = {
    type: 'commons-thread', proposer: user.name || user.initials,
    threadId: threadId, threadTitle: t.title, threadAuthor: t.author, threadBody: (t.body || '').slice(0, 600),
  };
  db.prepare(`INSERT INTO cells (id, type, title, status, delib_type, participants, source, resolution) VALUES (?,?,?,?,?,?,?,?)`)
    .run(cellId, 'Deliberation Cell', t.title, 'Active', 'commons-thread', Math.max(memberCount, 4), JSON.stringify(source), JSON.stringify({ status: 'Draft' }));
  db.prepare('UPDATE threads SET proposal_cell_id = ? WHERE id = ?').run(cellId, threadId);
  return send(res, 201, { ok: true, threadId, cellId });
}

// ── direct proposal (to_prod 2.5 origin #2) ─────────────
// POST /api/proposals/direct — steward raises a proposal without a source
// thread: creates a Deliberation Cell with a direct-proposal origin.
async function directProposalRoutes(req, res, reqUrl, method) {
  if (reqUrl !== '/api/proposals/direct' || method !== 'POST') {
    if (reqUrl === '/api/proposals/direct') return send(res, 405, { error: 'Method not allowed' });
    return null;
  }
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Unauthorized' });
  const inRoster = db.prepare(`SELECT COUNT(*) n FROM circle_roster WHERE member_id = ? AND status = 'active'`).get(user.id).n;
  if (!inRoster) return send(res, 403, { error: 'Steward access required' });
  const body = await readBody(req);
  const title = String(body.title || '').trim();
  if (!title) return send(res, 400, { error: 'title required' });
  const memberCount = (db.prepare(`SELECT COUNT(*) n FROM users WHERE status = 'Active'`).get().n) || 0;
  const cellId = 'delib-' + Date.now().toString(36);
  const source = {
    type: 'direct-proposal', proposer: user.name || user.initials,
    description: String(body.description || '').trim(), domain: String(body.domain || '').trim(),
  };
  db.prepare(`INSERT INTO cells (id, type, title, status, delib_type, participants, source, resolution) VALUES (?,?,?,?,?,?,?,?)`)
    .run(cellId, 'Deliberation Cell', title, 'Active', 'direct-proposal', Math.max(memberCount, 4), JSON.stringify(source), JSON.stringify({ status: 'Draft' }));
  return send(res, 201, { ok: true, cellId });
}

// ── system-bound proposal (to_prod 2.5 origin #3) ────────
// POST /api/proposals/system — steward raises a settings/circle-profile
// change as a proposal: creates a Deliberation Cell carrying the settings
// snapshot (stored in the meta catch-all, round-tripped by bootstrap).
async function settingsProposalRoutes(req, res, reqUrl, method) {
  if (reqUrl !== '/api/proposals/system' || method !== 'POST') {
    if (reqUrl === '/api/proposals/system') return send(res, 405, { error: 'Method not allowed' });
    return null;
  }
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Unauthorized' });
  const inRoster = db.prepare(`SELECT COUNT(*) n FROM circle_roster WHERE member_id = ? AND status = 'active'`).get(user.id).n;
  if (!inRoster) return send(res, 403, { error: 'Steward access required' });
  const body = await readBody(req);
  const allowed = ['system-settings', 'circle-settings', 'circle-creation'];
  const delibType = String(body.delibType || '');
  if (!allowed.includes(delibType)) return send(res, 400, { error: 'delibType required' });
  const title = String(body.title || '').trim();
  if (!title) return send(res, 400, { error: 'title required' });
  const memberCount = (db.prepare(`SELECT COUNT(*) n FROM users WHERE status = 'Active'`).get().n) || 0;
  const cellId = 'delib-' + Date.now().toString(36);
  const source = {
    type: String(body.sourceType || 'settings-proposal'),
    proposer: user.name || user.initials, submitter: user.id,
  };
  const meta = JSON.stringify({ settingsSnapshot: (body.snapshot && typeof body.snapshot === 'object') ? body.snapshot : {} });
  db.prepare(`INSERT INTO cells (id, type, title, status, delib_type, participants, source, resolution, meta) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(cellId, 'Deliberation Cell', title, 'Active', delibType, Math.max(memberCount, 4), JSON.stringify(source), JSON.stringify({ status: 'Draft' }), meta);
  return send(res, 201, { ok: true, cellId });
}

async function childRoutes(req, res, reqUrl, method) {
  for (const d of childDefs) {
    const esc = d.path.replace(/\//g, '\\/').replace(':id', '([^/]+)');
    const re = new RegExp('^' + esc + '$');
    const childIdRe = new RegExp('^' + esc + '/([^/]+)$');
    const m = reqUrl.match(re);
    const cm = reqUrl.match(childIdRe);
    if (!m && !cm) continue;
    const parentId = decodeURIComponent((m || cm)[1]);
    if (method === 'GET' && m) {
      const rows = db.prepare(`SELECT * FROM ${d.child} WHERE ${d.parentKey} = ?`).all(parentId);
      return send(res, 200, rows);
    }
    if (method !== 'GET') {
      // writes require a session — anonymous writes are rejected
      const wuser = authUser(req);
      if (!wuser) return send(res, 401, { error: 'Unauthorized' });
    }
    if (method === 'POST' && m) {
      const body = await readBody(req);
      const cols = db.prepare(`PRAGMA table_info(${d.child})`).all().map(c => c.name).filter(c => c !== d.parentKey && c !== 'id');
      const entries = Object.entries(body).filter(([k]) => cols.includes(k));
      const keys = [d.parentKey, ...entries.map(([k]) => k)];
      const vals = [parentId, ...entries.map(([, v]) => bindVal(v))];
      try {
        db.prepare(`INSERT INTO ${d.child} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...vals);
      } catch (e) {
        return send(res, 400, { error: e.message });
      }
      const created = db.prepare(`SELECT * FROM ${d.child} WHERE ${d.parentKey} = ? ORDER BY id DESC LIMIT 1`).get(parentId);
      return send(res, 201, created);
    }
    if (cm) {
      const childId = decodeURIComponent(cm[2]);
      if (method === 'PATCH' || method === 'PUT') {
        const body = await readBody(req);
        const cols = db.prepare(`PRAGMA table_info(${d.child})`).all().map(c => c.name).filter(c => c !== 'id');
        const entries = Object.entries(body).filter(([k]) => cols.includes(k));
        if (!entries.length) return send(res, 200, db.prepare(`SELECT * FROM ${d.child} WHERE id = ?`).get(childId));
        const sets = entries.map(([k]) => `${k} = ?`).join(', ');
        db.prepare(`UPDATE ${d.child} SET ${sets} WHERE id = ?`).run(...entries.map(([, v]) => bindVal(v)), String(childId));
        return send(res, 200, db.prepare(`SELECT * FROM ${d.child} WHERE id = ?`).get(childId));
      }
      if (method === 'DELETE') {
        const out = db.prepare(`DELETE FROM ${d.child} WHERE id = ?`).run(String(childId));
        return send(res, out.changes ? 200 : 404, { ok: out.changes > 0 });
      }
      return send(res, 405, { error: 'Method not allowed' });
    }
    return send(res, 405, { error: 'Method not allowed' });
  }
  return null;
}

// ── voting: cast a cell vote, recompute cell aggregates + summary ──
// POST /api/cells/:cellId/vote-records  { domain, name, initials, ws, vote }
// vote: 'yea' | 'nay' | 'abstain' (replaces any prior vote by the same
// initials on that cell + domain)
async function voteRoutes(req, res, reqUrl, method) {
  const m = reqUrl.match(/^\/api\/cells\/([^/]+)\/vote-records$/);
  if (!m) return null;
  if (method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Unauthorized' });
  const cellId = decodeURIComponent(m[1]);
  const body = await readBody(req);
  if (!body || !body.domain) return send(res, 400, { error: 'domain required' });
  // identity comes from the session token, not the request body
  const initials = String(user.initials || body.initials || '').trim();
  const vote = ['yea', 'nay', 'abstain'].includes(body.vote) ? body.vote : 'abstain';
  const ws = Math.max(0, Number(body.ws) || 0);

  db.prepare('DELETE FROM vote_records WHERE cell_id = ? AND domain = ? AND initials = ?')
    .run(cellId, body.domain, initials);
  db.prepare('INSERT INTO vote_records (cell_id, domain, name, initials, ws, vote) VALUES (?,?,?,?,?,?)')
    .run(cellId, body.domain, body.name ?? null, initials, ws, vote);

  const rows = db.prepare(`SELECT domain,
      COALESCE(SUM(CASE WHEN vote='yea' THEN ws END),0) AS yea,
      COALESCE(SUM(CASE WHEN vote='nay' THEN ws END),0) AS nay,
      COALESCE(SUM(CASE WHEN vote='abstain' THEN ws END),0) AS abst
    FROM vote_records WHERE cell_id = ? GROUP BY domain`).all(cellId);
  let totalYea = 0, totalNay = 0, totalAbst = 0;
  for (const r of rows) {
    r.yea = Number(r.yea); r.nay = Number(r.nay); r.abst = Number(r.abst);
    totalYea += r.yea; totalNay += r.nay; totalAbst += r.abst;
    db.prepare(`INSERT INTO cell_votes (cell_id, domain, yea, nay, total) VALUES (?,?,?,?,?)
      ON CONFLICT(cell_id, domain) DO UPDATE SET yea=excluded.yea, nay=excluded.nay, total=excluded.total`)
      .run(cellId, r.domain, r.yea, r.nay, r.yea + r.nay);
  }
  const summary = { yea: totalYea, nay: totalNay, abstain: totalAbst };
  db.prepare('INSERT OR REPLACE INTO cell_vote_summary (cell_id, summary) VALUES (?,?)')
    .run(cellId, JSON.stringify(summary));
  const record = db.prepare('SELECT * FROM vote_records WHERE cell_id = ? AND domain = ? AND initials = ?')
    .get(cellId, body.domain, initials);
  return send(res, 200, {
    record,
    domains: rows.map(r => ({ name: r.domain, yea: r.yea, nay: r.nay, abstain: r.abst, total: r.yea + r.nay })),
    summary
  });
}

// ── resolution lifecycle (submit to aSTF / close debate = crystallise) ──
// Both decision routes require a steward (active circle_roster) — 401
// anonymous, 403 non-steward. Close records the outcome on the cell and
// finalises the submitted draft as passed/failed.
// Submit also spawns a blind aSTF cell + stfs row so the motion appears on the STF dash.
async function governanceRoutes(req, res, reqUrl, method) {
  let m = reqUrl.match(/^\/api\/cells\/([^/]+)\/draft-resolutions\/([^/]+)\/submit$/);
  if (m && method === 'POST') {
    const user = authUser(req);
    if (!user) return send(res, 401, { error: 'Unauthorized' });
    if (!db.prepare(`SELECT COUNT(*) n FROM circle_roster WHERE member_id = ? AND status = 'active'`).get(user.id).n) {
      return send(res, 403, { error: 'Steward access required' });
    }
    const cellId = decodeURIComponent(m[1]);
    const draftId = decodeURIComponent(m[2]);
    const draft = db.prepare('SELECT * FROM draft_resolutions WHERE id = ? AND cell_id = ?').get(String(draftId), cellId);
    if (!draft) return send(res, 404, { error: 'Not found' });
    if (draft.status !== 'draft') return send(res, 409, { error: 'Resolution already submitted' });
    db.prepare("UPDATE draft_resolutions SET status = 'submitted' WHERE id = ?").run(String(draftId));
    const cell = db.prepare('SELECT * FROM cells WHERE id = ?').get(cellId);
    const resJson = (cell && cell.resolution) ? JSON.parse(cell.resolution) : {};
    resJson.status = 'Submitted';
    db.prepare('UPDATE cells SET resolution = ? WHERE id = ?').run(JSON.stringify(resJson), cellId);
    // spawn blind aSTF cell
    const astfId = 'astf-' + Date.now().toString(36);
    const originSource = cell ? JSON.parse(cell.source || '{}') : {};
    const circleName = originSource.circleName || cell.circle || '';
    const astfSource = {
      type: 'motion-audit', originCellId: cellId, originTitle: cell.title || '',
      draftId: String(draftId), draftTitle: draft.title || '', circleName,
      submittedBy: user.name || user.initials, submittedAt: new Date().toISOString(),
    };
    db.prepare(`INSERT INTO cells (id, type, title, status, delib_type, participants, circle, blind, commissioned_by, source, resolution, meta)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(astfId, 'aSTF Cell', 'aSTF · ' + (draft.title || cell.title || ''), 'Blind Review', 'motion-audit',
        cell.participants || 0, circleName, 1, cellId,
        JSON.stringify(astfSource), JSON.stringify({ status: 'Pending' }),
        JSON.stringify({ assessors: 3, rubric: { jurisdiction: 0, depth: 0, alignment: 0, competence: 0 } }));
    db.prepare('UPDATE cells SET resolution_ref = ? WHERE id = ?').run(astfId, cellId);
    const stfId = 'stf-' + astfId;
    db.prepare(`INSERT INTO stfs (id, type, purpose, circle, bucket, status, title, deadline) VALUES (?,?,?,?,?,?,?,?)`)
      .run(stfId, 'aSTF', draft.title || cell.title || '', circleName, 'active', 'Blind Review',
        draft.title || cell.title || '', new Date(Date.now() + 10*86400000).toISOString().slice(0, 10));
    return send(res, 200, { ok: true, status: 'submitted', astfId });
  }
  m = reqUrl.match(/^\/api\/cells\/([^/]+)\/debate\/close$/);
  if (m && method === 'POST') {
    const user = authUser(req);
    if (!user) return send(res, 401, { error: 'Unauthorized' });
    if (!db.prepare(`SELECT COUNT(*) n FROM circle_roster WHERE member_id = ? AND status = 'active'`).get(user.id).n) {
      return send(res, 403, { error: 'Steward access required' });
    }
    const cellId = decodeURIComponent(m[1]);
    const body = await readBody(req);
    const cell = db.prepare('SELECT * FROM cells WHERE id = ?').get(cellId);
    if (!cell) return send(res, 404, { error: 'Not found' });
    const summaryRow = db.prepare('SELECT summary FROM cell_vote_summary WHERE cell_id = ?').get(cellId);
    const s = summaryRow ? JSON.parse(summaryRow.summary) : {};
    const yea = Number(s.yea) || 0, nay = Number(s.nay) || 0;
    const outcome = nay > yea ? 'failed' : 'passed';
    const state = cell.status === 'crystallised' ? 'crystallised' : cell.status;
    const evtStem = 'evt-crystal-' + cellId.replace(/[^A-Za-z0-9_-]/g, '_');
    if (state === 'crystallised') {
      const existing = db.prepare('SELECT id FROM governance_events WHERE id LIKE ?').get(evtStem + '%');
      if (existing) return send(res, 200, { ok: true, status: 'crystallised', already: true, outcome, yea, nay });
    }
    let r = cell.resolution ? JSON.parse(cell.resolution) : {};
    if (r.status === 'Draft' || r.status === 'Submitted') r.status = 'Crystallised';
    r.outcome = outcome;
    db.prepare("UPDATE cells SET status = 'crystallised', resolution = ? WHERE id = ?").run(JSON.stringify(r), cellId);
    db.prepare("UPDATE draft_resolutions SET status = ? WHERE cell_id = ? AND status = 'submitted'")
      .run(outcome === 'failed' ? 'failed' : 'passed', cellId);
    const evtId = evtStem + '-' + Date.now();
    db.prepare('INSERT INTO governance_events (id, type, circle, date, text, participant) VALUES (?,?,?,?,?,?)')
      .run(evtId, 'cell-crystallisation', String(cell.circle || ''), new Date().toISOString().slice(0, 10),
        '"' + String(cell.title || cellId) + '" crystallised — resolution ' + outcome + ' (yea ' + yea + ' Ws / nay ' + nay + ' Ws)',
        String(body && body.participant || ''));
    return send(res, 200, { ok: true, status: 'crystallised', outcome, yea, nay });
  }
  return null;
}

// ── aSTF verdict (to_prod 2.7) ─────────────────────────
// POST /api/cells/:id/astf-verdict — files an adjudication verdict on a blind
// aSTF cell. Auth required. Once filed, the cell is unblinded and the origin
// cell's resolution is updated.
async function astfVerdictRoutes(req, res, reqUrl, method) {
  const m = reqUrl.match(/^\/api\/cells\/([^/]+)\/astf-verdict$/);
  if (!m) return null;
  if (method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Unauthorized' });
  const cellId = decodeURIComponent(m[1]);
  const cell = db.prepare('SELECT * FROM cells WHERE id = ?').get(cellId);
  if (!cell) return send(res, 404, { error: 'Not found' });
  if (cell.type !== 'aSTF Cell') return send(res, 400, { error: 'Not an aSTF cell' });
  if (cell.status === 'Verdict Filed') return send(res, 409, { error: 'Verdict already filed' });
  const body = await readBody(req);
  const verdict = String(body.verdict || '').trim();
  if (!['approved', 'rejected', 'revision'].includes(verdict)) {
    return send(res, 400, { error: 'verdict must be approved, rejected, or revision' });
  }
  const rubric = body.rubric || {};
  const jurisdiction = Math.min(9, Math.max(0, Number(rubric.jurisdiction) || 0));
  const depth = Math.min(5, Math.max(0, Number(rubric.depth) || 0));
  const alignment = Math.min(10, Math.max(0, Number(rubric.alignment) || 0));
  const competence = Math.min(6, Math.max(0, Number(rubric.competence) || 0));
  const total = jurisdiction + depth + alignment + competence;
  const rationale = String(body.rationale || '').trim();
  const flags = Array.isArray(body.flags) ? body.flags : [];
  const source = JSON.parse(cell.source || '{}');
  const astfResult = {
    verdict, rationale, flags,
    rubric: { jurisdiction, depth, alignment, competence, total },
    adjudicator: user.name || user.initials, filedAt: new Date().toISOString(),
  };
  db.prepare("UPDATE cells SET status = 'Verdict Filed', resolution = ?, blind = 0 WHERE id = ?")
    .run(JSON.stringify(astfResult), cellId);
  // update stfs row
  const stfRow = db.prepare("SELECT id FROM stfs WHERE type = 'aSTF' AND status = 'Blind Review' AND purpose = ?").get(source.draftTitle || '');
  if (stfRow) {
    db.prepare("UPDATE stfs SET status = 'Verdict Filed', bucket = 'completed' WHERE id = ?").run(stfRow.id);
  }
  // jSTF judicial audit — aSTF reviews the decision, never the jSTF members
  if (source.type === 'judicial-audit' && source.sourceCellId) {
    const jstf = db.prepare('SELECT * FROM cells WHERE id = ?').get(source.sourceCellId);
    if (jstf) {
      const jstfMeta = jstf.meta ? JSON.parse(jstf.meta) : {};
      const jstfRes = jstf.resolution ? JSON.parse(jstf.resolution) : {};
      jstfRes.audit = astfResult;
      if (verdict === 'approved') {
        // resolution applied + implementation
        jstfRes.status = 'Applied';
        const verdictInfo = source.verdict || jstfMeta.verdict || {};
        jstfRes.implementation = {
          type: verdictInfo.type || 'policy-cited',
          actions: verdictInfo.type === 'system-bound'
            ? ['target role/privileges updated per system settings', 'Ws recalculated', 'fresh vSTF composition triggered']
            : ['applied per cited policy resolutions: ' + (verdictInfo.policyRefs || []).join(', ')],
        };
        db.prepare("UPDATE cells SET status = 'Resolution Applied', resolution = ? WHERE id = ?")
          .run(JSON.stringify(jstfRes), source.sourceCellId);
      } else {
        // disapproval: the SAME jSTF cell continues — the team composition
        // is shuffled and the investigation resumes where it stopped.
        jstfRes.status = 'Revision Ordered';
        jstfRes.revisionNotes = rationale;
        db.prepare("UPDATE cells SET status = 'Under Investigation', resolution = ? WHERE id = ?")
          .run(JSON.stringify(jstfRes), source.sourceCellId);
        jstfShuffleComposition(source.sourceCellId, jstf, jstfMeta, rationale, user.name || user.initials);
      }
      const evtId = 'evt-jstf-audit-' + Date.now().toString(36);
      db.prepare('INSERT INTO governance_events (id, type, circle, date, text, participant) VALUES (?,?,?,?,?,?)')
        .run(evtId, 'jstf-audit', '', new Date().toISOString().slice(0, 10),
          '"' + (jstf.title || jstf.id) + '" — aSTF audit: ' + verdict + ' (rubric ' + total + '/30)',
          String(user.name || user.initials));
    }
    // update stfs row
    const auditStf = db.prepare("SELECT id FROM stfs WHERE type = 'aSTF' AND title = ?").get('aSTF Audit — ' + (source.targetName || ''));
    if (auditStf) db.prepare("UPDATE stfs SET status = 'Verdict Filed', bucket = 'completed' WHERE id = ?").run(auditStf.id);
    return send(res, 200, { ok: true, verdict, astfId: cellId, sourceCellId: source.sourceCellId, rubricTotal: total });
  }
  // update origin cell resolution
  if (source.originCellId) {
    const origin = db.prepare('SELECT * FROM cells WHERE id = ?').get(source.originCellId);
    if (origin) {
      const originRes = origin.resolution ? JSON.parse(origin.resolution) : {};
      if (verdict === 'approved') {
        originRes.status = 'Approved';
        db.prepare('UPDATE cells SET resolution = ? WHERE id = ?').run(JSON.stringify(originRes), source.originCellId);
        db.prepare("UPDATE draft_resolutions SET status = 'passed' WHERE cell_id = ? AND status = 'submitted'")
          .run(source.originCellId);
      } else if (verdict === 'rejected') {
        originRes.status = 'Rejected';
        db.prepare('UPDATE cells SET resolution = ? WHERE id = ?').run(JSON.stringify(originRes), source.originCellId);
        db.prepare("UPDATE draft_resolutions SET status = 'failed' WHERE cell_id = ? AND status = 'submitted'")
          .run(source.originCellId);
      }
    }
    const evtId = 'evt-astf-' + cellId.replace(/[^A-Za-z0-9_-]/g, '_') + '-' + Date.now();
    db.prepare('INSERT INTO governance_events (id, type, circle, date, text, participant) VALUES (?,?,?,?,?,?)')
      .run(evtId, 'astf-verdict', String(source.circleName || ''), new Date().toISOString().slice(0, 10),
        '"' + (cell.title || cellId) + '" — aSTF verdict: ' + verdict + ' (rubric ' + total + '/30)',
        String(user.name || user.initials));
  }
  return send(res, 200, { ok: true, verdict, astfId: cellId, originCellId: source.originCellId || null, rubricTotal: total });
}

// ── xSTF execution (to_prod 2.8) ───────────────────────
// POST /api/cells/:id/spawn-xstf — spawn an xSTF execution cell from an
// aSTF cell that received an approved verdict.  Auth + steward gate.
async function xstfSpawnRoutes(req, res, reqUrl, method) {
  const m = reqUrl.match(/^\/api\/cells\/([^/]+)\/spawn-xstf$/);
  if (!m) return null;
  if (method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Unauthorized' });
  if (!db.prepare(`SELECT COUNT(*) n FROM circle_roster WHERE member_id = ? AND status = 'active'`).get(user.id).n) {
    return send(res, 403, { error: 'Steward access required' });
  }
  const astfId = decodeURIComponent(m[1]);
  const astf = db.prepare('SELECT * FROM cells WHERE id = ?').get(astfId);
  if (!astf) return send(res, 404, { error: 'Not found' });
  if (astf.type !== 'aSTF Cell') return send(res, 400, { error: 'Not an aSTF cell' });
  const astfRes = astf.resolution ? JSON.parse(astf.resolution) : {};
  if (astfRes.verdict !== 'approved') return send(res, 400, { error: 'aSTF verdict not approved' });
  const existing = db.prepare("SELECT id FROM cells WHERE type = 'xSTF Cell' AND commissioned_by = ?").get(astfId);
  if (existing) return send(res, 409, { error: 'xSTF already spawned' });
  const body = await readBody(req);
  const astfSource = JSON.parse(astf.source || '{}');
  const title = String(body.title || astfSource.draftTitle || astf.title || '').replace(/^aSTF · /, '');
  const team = Array.isArray(body.team) ? body.team : [];
  const specs = body.deliverableSpecs || {};
  const xstfId = 'xstf-' + Date.now().toString(36);
  const blind = body.blind !== undefined ? (body.blind ? 1 : 0) : 1;
  const deadline = String(body.deadline || '').trim() || new Date(Date.now() + 30*86400000).toISOString().slice(0, 10);
  const deliverableSpecs = {
    name: String(specs.name || title),
    description: String(specs.description || ''),
    sections: Number(specs.sections) || 4,
    wordCount: String(specs.wordCount || 'TBD'),
    language: String(specs.language || 'Plain English'),
    reviewProcess: String(specs.reviewProcess || 'draft-circle-final'),
  };
  const defaultTasks = [
    { id: 't0', label: 'STF formulation', status: 'pending', locked: true },
    { id: 't1', label: 'Mandate comprehension', status: 'pending', locked: false },
    { id: 't2', label: 'Research & drafting', status: 'pending', locked: false },
    { id: 't3', label: 'Internal review', status: 'pending', locked: false },
    { id: 't4', label: 'Circle review cycle', status: 'pending', locked: false },
    { id: 't5', label: 'Finalisation', status: 'pending', locked: false },
    { id: 't6', label: 'Dissolve STF', status: 'pending', locked: true },
  ];
  const xstfSource = {
    type: 'xstf-execution', astfId, originCellId: astfSource.originCellId || null,
    circleName: astfSource.circleName || astf.circle || '',
    commissionedBy: user.name || user.initials, commissionedAt: new Date().toISOString(),
  };
  db.prepare(`INSERT INTO cells (id, type, title, status, participants, circle, blind, commissioned_by, source, resolution, meta, deliverable_specs, progress, deadline)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(xstfId, 'xSTF Cell', title, 'Active', team.length || 3, xstfSource.circleName, blind, astfId,
      JSON.stringify(xstfSource), JSON.stringify({ status: 'In Progress' }),
      JSON.stringify({ tasks: defaultTasks, objectives: [] }),
      JSON.stringify(deliverableSpecs), 0, deadline);
  // team members
  const insertTeam = db.prepare('INSERT INTO cell_team (cell_id, name, initials, role) VALUES (?,?,?,?)');
  for (const t of team) {
    insertTeam.run(xstfId, String(t.name || ''), String(t.initials || ''), String(t.role || 'Team Member'));
  }
  // stfs row
  const stfId = 'stf-' + xstfId;
  db.prepare(`INSERT INTO stfs (id, type, purpose, circle, bucket, status, title, deadline) VALUES (?,?,?,?,?,?,?,?)`)
    .run(stfId, 'xSTF', title, xstfSource.circleName, 'active', 'Active', title, deadline);
  return send(res, 201, { ok: true, xstfId });
}

// POST /api/cells/:id/submit-deliverable — team submits a deliverable draft
async function xstfDeliverableRoutes(req, res, reqUrl, method) {
  const m = reqUrl.match(/^\/api\/cells\/([^/]+)\/submit-deliverable$/);
  if (!m) return null;
  if (method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Unauthorized' });
  const cellId = decodeURIComponent(m[1]);
  const cell = db.prepare('SELECT * FROM cells WHERE id = ?').get(cellId);
  if (!cell) return send(res, 404, { error: 'Not found' });
  if (cell.type !== 'xSTF Cell') return send(res, 400, { error: 'Not an xSTF cell' });
  const body = await readBody(req);
  const title = String(body.title || '').trim();
  if (!title) return send(res, 400, { error: 'title required' });
  const content = String(body.content || '').trim();
  const meta = cell.meta ? JSON.parse(cell.meta) : {};
  const deliverables = meta.deliverables || [];
  deliverables.push({ id: 'del-' + Date.now(), title, content, submittedBy: user.name || user.initials, submittedAt: new Date().toISOString(), status: 'submitted' });
  meta.deliverables = deliverables;
  db.prepare('UPDATE cells SET meta = ? WHERE id = ?').run(JSON.stringify(meta), cellId);
  return send(res, 201, { ok: true, deliverableId: deliverables[deliverables.length - 1].id });
}

// POST /api/cells/:id/review-deliverable — commissioning circle reviews
async function xstfReviewRoutes(req, res, reqUrl, method) {
  const m = reqUrl.match(/^\/api\/cells\/([^/]+)\/review-deliverable$/);
  if (!m) return null;
  if (method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Unauthorized' });
  if (!db.prepare(`SELECT COUNT(*) n FROM circle_roster WHERE member_id = ? AND status = 'active'`).get(user.id).n) {
    return send(res, 403, { error: 'Steward access required' });
  }
  const cellId = decodeURIComponent(m[1]);
  const cell = db.prepare('SELECT * FROM cells WHERE id = ?').get(cellId);
  if (!cell) return send(res, 404, { error: 'Not found' });
  if (cell.type !== 'xSTF Cell') return send(res, 400, { error: 'Not an xSTF cell' });
  const body = await readBody(req);
  const deliverableId = String(body.deliverableId || '').trim();
  const decision = String(body.decision || '').trim();
  if (!['approved', 'revision'].includes(decision)) return send(res, 400, { error: 'decision must be approved or revision' });
  const meta = cell.meta ? JSON.parse(cell.meta) : {};
  const deliverables = meta.deliverables || [];
  const del = deliverables.find(function(d) { return d.id === deliverableId; });
  if (!del) return send(res, 404, { error: 'Deliverable not found' });
  if (del.status !== 'submitted') return send(res, 409, { error: 'Deliverable already reviewed' });
  del.status = decision;
  del.reviewedBy = user.name || user.initials;
  del.reviewedAt = new Date().toISOString();
  del.reviewComment = String(body.comment || '').trim();
  meta.deliverables = deliverables;
  // if approved, update cell status
  if (decision === 'approved') {
    db.prepare("UPDATE cells SET status = 'Completed', meta = ?, resolution = ? WHERE id = ?")
      .run(JSON.stringify(meta), JSON.stringify({ status: 'Delivered' }), cellId);
    // update stfs row
    const stfRow = db.prepare("SELECT id FROM stfs WHERE type = 'xSTF' AND title = ? AND status = 'Active'").get(cell.title || '');
    if (stfRow) db.prepare("UPDATE stfs SET status = 'Completed', bucket = 'completed' WHERE id = ?").run(stfRow.id);
  } else {
    db.prepare('UPDATE cells SET meta = ? WHERE id = ?').run(JSON.stringify(meta), cellId);
  }
  return send(res, 200, { ok: true, decision, deliverableId });
}

// ── vSTF verification (to_prod 2.9) ────────────────────
// POST /api/cells/:id/spawn-vstf — spawn a vSTF verification cell
// for steward candidacy or competence claim assessment.
async function vstfSpawnRoutes(req, res, reqUrl, method) {
  const m = reqUrl.match(/^\/api\/cells\/([^/]+)\/spawn-vstf$/);
  if (!m) return null;
  if (method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Unauthorized' });
  if (!db.prepare(`SELECT COUNT(*) n FROM circle_roster WHERE member_id = ? AND status = 'active'`).get(user.id).n) {
    return send(res, 403, { error: 'Steward access required' });
  }
  const cellId = decodeURIComponent(m[1]);
  const cell = db.prepare('SELECT * FROM cells WHERE id = ?').get(cellId);
  if (!cell) return send(res, 404, { error: 'Not found' });
  const body = await readBody(req);
  const vstfType = String(body.vstfType || 'steward-candidacy').trim();
  if (!['steward-candidacy', 'competence-claim'].includes(vstfType)) {
    return send(res, 400, { error: 'vstfType must be steward-candidacy or competence-claim' });
  }
  const existing = db.prepare("SELECT id FROM cells WHERE type = 'vSTF Cell' AND commissioned_by = ? AND delib_type = ?").get(cellId, vstfType);
  if (existing) return send(res, 409, { error: 'vSTF already spawned' });
  const candidateName = String(body.candidateName || '').trim();
  const candidateInitials = String(body.candidateInitials || '').trim();
  const circleName = String(body.circleName || cell.circle || '').trim();
  const minAssessors = Number(body.minAssessors) || 3;
  const vstfId = 'vstf-' + Date.now().toString(36);
  const source = {
    type: vstfType, candidateName, candidateInitials, circleName,
    sourceCellId: cellId, sourceTitle: cell.title || '',
    spawnedBy: user.name || user.initials, spawnedAt: new Date().toISOString(),
  };
  const domains = Array.isArray(body.domains) ? body.domains : [];
  db.prepare(`INSERT INTO cells (id, type, title, status, delib_type, participants, circle, commissioned_by, source, resolution, meta)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(vstfId, 'vSTF Cell', (vstfType === 'steward-candidacy' ? 'vSTF · Steward Candidacy · ' : 'vSTF · Competence · ') + candidateName,
      'Pending Assessment', vstfType, minAssessors, circleName, cellId,
      JSON.stringify(source), JSON.stringify({ status: 'Pending', score: null }),
      JSON.stringify({ candidateName, candidateInitials, domains, assessments: [] }));
  const stfId = 'stf-' + vstfId;
  db.prepare(`INSERT INTO stfs (id, type, purpose, circle, bucket, status, title, deadline) VALUES (?,?,?,?,?,?,?,?)`)
    .run(stfId, 'vSTF', vstfType === 'steward-candidacy' ? 'Steward Candidacy' : 'Competence Claims',
      circleName, 'active', 'Pending Assessment', candidateName || cell.title || '',
      new Date(Date.now() + 14*86400000).toISOString().slice(0, 10));
  return send(res, 201, { ok: true, vstfId });
}

// POST /api/cells/:id/vstf-assessment — file an assessment on a vSTF cell
async function vstfAssessmentRoutes(req, res, reqUrl, method) {
  const m = reqUrl.match(/^\/api\/cells\/([^/]+)\/vstf-assessment$/);
  if (!m) return null;
  if (method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Unauthorized' });
  const cellId = decodeURIComponent(m[1]);
  const cell = db.prepare('SELECT * FROM cells WHERE id = ?').get(cellId);
  if (!cell) return send(res, 404, { error: 'Not found' });
  if (cell.type !== 'vSTF Cell') return send(res, 400, { error: 'Not a vSTF cell' });
  if (cell.status === 'Assessment Filed') return send(res, 409, { error: 'Assessment already filed' });
  const body = await readBody(req);
  const meta = cell.meta ? JSON.parse(cell.meta) : {};
  const assessments = meta.assessments || [];
  // check duplicate by same assessor
  const already = assessments.filter(function(a) { return a.assessor === (user.name || user.initials); })[0];
  if (already) return send(res, 409, { error: 'You have already filed an assessment' });
  const vstfType = meta.type || (cell.source ? JSON.parse(cell.source).type : 'steward-candidacy');
  var assessment = { assessor: user.name || user.initials, filedAt: new Date().toISOString() };
  if (vstfType === 'steward-candidacy') {
    const score = Math.min(100, Math.max(0, Number(body.score) || 0));
    const rationale = String(body.rationale || '').trim();
    if (!rationale) return send(res, 400, { error: 'rationale required' });
    assessment.score = score;
    assessment.rationale = rationale;
  } else {
    // competence-claim: per-domain evaluations
    const domainEvals = Array.isArray(body.domainEvals) ? body.domainEvals : [];
    const comment = String(body.comment || '').trim();
    assessment.domainEvals = domainEvals;
    assessment.comment = comment;
  }
  assessments.push(assessment);
  meta.assessments = assessments;
  // if enough assessments filed, close
  const minAssessors = cell.participants || 3;
  if (assessments.length >= minAssessors) {
    var finalScore = null;
    if (vstfType === 'steward-candidacy') {
      finalScore = Math.round(assessments.reduce(function(s, a) { return s + (a.score || 0); }, 0) / assessments.length);
    } else {
      finalScore = assessments.length;
    }
    db.prepare("UPDATE cells SET status = 'Assessment Filed', meta = ?, resolution = ? WHERE id = ?")
      .run(JSON.stringify(meta), JSON.stringify({ status: 'Complete', score: finalScore }), cellId);
    const stfRow = db.prepare("SELECT id FROM stfs WHERE type = 'vSTF' AND status = 'Pending Assessment'").get();
    if (stfRow) db.prepare("UPDATE stfs SET status = 'Completed', bucket = 'completed' WHERE id = ?").run(stfRow.id);
  } else {
    db.prepare('UPDATE cells SET meta = ? WHERE id = ?').run(JSON.stringify(meta), cellId);
  }
  return send(res, 200, { ok: true, filed: assessments.length, required: minAssessors, complete: assessments.length >= minAssessors });
}

// ── p-aSTF periodic review (to_prod 2.10) ──────────────
// POST /api/cells/:id/spawn-pastf — spawn a p-aSTF periodic circle health
// review cell.  Auth + steward gate.
async function pastfSpawnRoutes(req, res, reqUrl, method) {
  const m = reqUrl.match(/^\/api\/cells\/([^/]+)\/spawn-pastf$/);
  if (!m) return null;
  if (method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Unauthorized' });
  if (!db.prepare(`SELECT COUNT(*) n FROM circle_roster WHERE member_id = ? AND status = 'active'`).get(user.id).n) {
    return send(res, 403, { error: 'Steward access required' });
  }
  const cellId = decodeURIComponent(m[1]);
  const cell = db.prepare('SELECT * FROM cells WHERE id = ?').get(cellId);
  if (!cell) return send(res, 404, { error: 'Not found' });
  const existing = db.prepare("SELECT id FROM cells WHERE type = 'p-aSTF Cell' AND commissioned_by = ?").get(cellId);
  if (existing) return send(res, 409, { error: 'p-aSTF already spawned' });
  const body = await readBody(req);
  const circleName = String(body.circleName || cell.circle || '').trim();
  const minReviewers = Number(body.minReviewers) || 3;
  const pastfId = 'pastf-' + Date.now().toString(36);
  const source = {
    type: 'periodic-review', sourceCellId: cellId, sourceTitle: cell.title || '',
    circleName, spawnedBy: user.name || user.initials, spawnedAt: new Date().toISOString(),
  };
  db.prepare(`INSERT INTO cells (id, type, title, status, delib_type, participants, circle, commissioned_by, source, resolution, meta)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(pastfId, 'p-aSTF Cell', 'p-aSTF · ' + circleName + ' Health Review', 'Pending Review', 'periodic-review',
      minReviewers, circleName, cellId,
      JSON.stringify(source), JSON.stringify({ status: 'Pending' }),
      JSON.stringify({ circleName, minReviewers, reviews: [] }));
  const stfId = 'stf-' + pastfId;
  db.prepare(`INSERT INTO stfs (id, type, purpose, circle, bucket, status, title, deadline) VALUES (?,?,?,?,?,?,?,?)`)
    .run(stfId, 'p-aSTF', 'Periodic Circle Health Review', circleName, 'active', 'Pending Review',
      circleName + ' Health', new Date(Date.now() + 30*86400000).toISOString().slice(0, 10));
  return send(res, 201, { ok: true, pastfId });
}

// POST /api/cells/:id/pastf-review — file a p-aSTF review with two-layer
// rubric (circle 30 pts + member 35 pts + 2 risk flags) + health tier.
async function pastfReviewRoutes(req, res, reqUrl, method) {
  const m = reqUrl.match(/^\/api\/cells\/([^/]+)\/pastf-review$/);
  if (!m) return null;
  if (method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Unauthorized' });
  const cellId = decodeURIComponent(m[1]);
  const cell = db.prepare('SELECT * FROM cells WHERE id = ?').get(cellId);
  if (!cell) return send(res, 404, { error: 'Not found' });
  if (cell.type !== 'p-aSTF Cell') return send(res, 400, { error: 'Not a p-aSTF cell' });
  const meta = cell.meta ? JSON.parse(cell.meta) : {};
  const reviews = meta.reviews || [];
  const already = reviews.filter(function(r) { return r.reviewer === (user.name || user.initials); })[0];
  if (already) return send(res, 409, { error: 'You have already filed a review' });
  const body = await readBody(req);
  // Layer 1: Circle rubric (30 pts)
  const circleRubric = body.circleRubric || {};
  const activity = Math.min(6, Math.max(0, Number(circleRubric.activity) || 0));
  const competenceFit = Math.min(7, Math.max(0, Number(circleRubric.competenceFit) || 0));
  const discipline = Math.min(6, Math.max(0, Number(circleRubric.discipline) || 0));
  const cohesion = Math.min(5, Math.max(0, Number(circleRubric.cohesion) || 0));
  const delivery = Math.min(6, Math.max(0, Number(circleRubric.delivery) || 0));
  const circleTotal = activity + competenceFit + discipline + cohesion + delivery;
  // Layer 2: Member rubric (35 pts + 2 risk flags)
  const memberReviews = Array.isArray(body.memberReviews) ? body.memberReviews : [];
  const processedMembers = memberReviews.map(function(mr) {
    const effectiveness = Math.min(5, Math.max(0, Number(mr.effectiveness) || 0));
    const stewardship = Math.min(7, Math.max(0, Number(mr.stewardship) || 0));
    const participation = Math.min(5, Math.max(0, Number(mr.participation) || 0));
    const investment = Math.min(8, Math.max(0, Number(mr.investment) || 0));
    const productivity = Math.min(6, Math.max(0, Number(mr.productivity) || 0));
    const roleFit = Math.min(4, Math.max(0, Number(mr.roleFit) || 0));
    const replaceability = Math.min(5, Math.max(0, Number(mr.replaceability) || 0));
    const indispensable = Math.min(5, Math.max(0, Number(mr.indispensable) || 0));
    return {
      name: mr.name || '', initials: mr.initials || '',
      effectiveness, stewardship, participation, investment, productivity, roleFit,
      memberTotal: effectiveness + stewardship + participation + investment + productivity + roleFit,
      replaceability, indispensable,
      knowledgeTransfer: replaceability > 3,
      jstfReferral: indispensable > 3,
    };
  });
  const healthTier = String(body.healthTier || 'healthy').trim();
  if (!['healthy', 'watch', 'concern'].includes(healthTier)) {
    return send(res, 400, { error: 'healthTier must be healthy, watch, or concern' });
  }
  const notes = String(body.notes || '').trim();
  reviews.push({
    reviewer: user.name || user.initials, filedAt: new Date().toISOString(),
    circleRubric: { activity, competenceFit, discipline, cohesion, delivery, total: circleTotal },
    memberReviews: processedMembers, healthTier, notes,
  });
  meta.reviews = reviews;
  const minReviewers = meta.minReviewers || 3;
  if (reviews.length >= minReviewers) {
    // compute average circleTotal and majority health tier
    const avgCircle = Math.round(reviews.reduce(function(s, r) { return s + r.circleRubric.total; }, 0) / reviews.length);
    var tierCounts = { healthy: 0, watch: 0, concern: 0 };
    reviews.forEach(function(r) { tierCounts[r.healthTier] = (tierCounts[r.healthTier] || 0) + 1; });
    var finalTier = 'healthy';
    if (tierCounts.concern > tierCounts.healthy && tierCounts.concern > tierCounts.watch) finalTier = 'concern';
    else if (tierCounts.watch >= tierCounts.healthy) finalTier = 'watch';
    db.prepare("UPDATE cells SET status = 'Review Complete', meta = ?, resolution = ? WHERE id = ?")
      .run(JSON.stringify(meta), JSON.stringify({ status: 'Complete', avgCircle, healthTier: finalTier }), cellId);
    const stfRow = db.prepare("SELECT id FROM stfs WHERE type = 'p-aSTF' AND status = 'Pending Review'").get();
    if (stfRow) db.prepare("UPDATE stfs SET status = 'Completed', bucket = 'completed' WHERE id = ?").run(stfRow.id);
  } else {
    db.prepare('UPDATE cells SET meta = ? WHERE id = ?').run(JSON.stringify(meta), cellId);
  }
  return send(res, 200, { ok: true, filed: reviews.length, required: minReviewers, complete: reviews.length >= minReviewers, circleTotal });
}

// ── jSTF judicial investigation (to_prod 2.11) ─────────
// Lifecycle: any member → anonymous report thread on target (accumulates
// as thread posts, stewards-only) → steward escalates → jSTF cell spawned →
// jSTF team live majority toggle on activity restriction (reversible) →
// single disciplinary verdict filing (policy-cited or system-bound, cited
// policy resolutions) → aSTF audit (decision only, never the jSTF members) →
// resolution applied + implementation; disapproval → same jSTF cell
// continues with a shuffled composition (revision notes, verdict re-fileable).
// Appeal: anyone → anonymous post on the case thread → steward escalation,
// same process as reporting.

function jstfReportThread(link) {
  return db.prepare("SELECT * FROM threads WHERE proposal_cell_id = ? AND badge = 'b-judicial'").get(link);
}

function jstfAppendAnonymousPost(threadId, bodyText) {
  db.prepare(`INSERT INTO thread_replies (id, thread_id, author, initials, time, body, likes)
    VALUES (?,?,?,?,?,?,0)`)
    .run('jstf-reply-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
      threadId, 'Anonymous', '?', new Date().toISOString().slice(0, 10), bodyText);
  db.prepare('UPDATE threads SET replies = replies + 1 WHERE id = ?').run(threadId);
  return db.prepare('SELECT replies FROM threads WHERE id = ?').get(threadId).replies;
}

function jstfTeamSelection() {
  return db.prepare(`SELECT DISTINCT r.member_id AS id, r.name, r.initials FROM circle_roster r
    JOIN users u ON u.id = r.member_id
    WHERE r.status = 'active' ORDER BY r.name LIMIT 3`).all();
}

function jstfIsNotSteward(userId) {
  return !db.prepare("SELECT 1 FROM circle_roster WHERE member_id = ? AND status = 'active'").get(userId);
}

// aSTF disapproval → shuffle the jSTF composition inside the same cell.
// Investigation continues where it stopped: prior verdict superseded,
// team members rotated, restriction tallies recomputed for the new team.
function jstfShuffleComposition(cellId, cell, meta, revisionNotes, by) {
  const prevTeam = (cell.source ? JSON.parse(cell.source).team : null) || [];
  const prevIds = prevTeam.map(function(t) { return t.id; });
  let stewards = jstfTeamSelection();
  let fresh = stewards.filter(function(s) { return !prevIds.includes(s.id); });
  if (fresh.length < 2) fresh = stewards.slice(1).concat(stewards.slice(0, 1));
  const team = fresh;
  const source = cell.source ? JSON.parse(cell.source) : {};
  source.team = team.map(function(t) { return { id: t.id, name: t.name, initials: t.initials }; });
  const revisions = meta.revisions || (meta.revisions = []);
  revisions.push({
    at: new Date().toISOString(), by, notes: revisionNotes,
    supersededVerdict: meta.verdict || null,
  });
  meta.verdict = null;
  db.prepare('DELETE FROM cell_team WHERE cell_id = ?').run(cellId);
  team.forEach(function(t, i) {
    db.prepare('INSERT INTO cell_team (cell_id, name, initials, role, focus) VALUES (?,?,?,?,?)')
      .run(cellId, t.name, t.initials, i === 0 ? 'Lead investigator' : 'Investigator', 'Judicial review');
  });
  const teamSize = team.length;
  const majority = Math.floor(teamSize / 2) + 1;
  const teamInitials = team.map(function(t) { return t.initials; });
  db.prepare(`DELETE FROM vote_records WHERE cell_id = ? AND domain = 'restriction'
    AND initials NOT IN (${teamInitials.map(function() { return '?'; }).join(',') || 'NULL'})`)
    .run(cellId, ...teamInitials);
  const restrictCount = db.prepare(`SELECT COUNT(*) n FROM vote_records WHERE cell_id = ? AND domain = 'restriction' AND vote = 'restrict'`).get(cellId).n;
  const cur = meta.restriction || { state: 'relaxed', restrictCount: 0, teamSize, majority, severity: null, history: [] };
  cur.restrictCount = restrictCount;
  cur.teamSize = teamSize;
  cur.majority = majority;
  cur.state = restrictCount >= majority ? 'restricted' : 'relaxed';
  if (cur.state === 'restricted') {
    cur.severity = (meta.targetIsSteward && restrictCount < teamSize) ? 'frozen' : 'readonly';
  } else {
    cur.severity = null;
  }
  cur.history = cur.history || [];
  cur.history.push({ prev: 'composition-shuffle', next: cur.state, at: new Date().toISOString(), by });
  meta.restriction = cur;
  db.prepare('UPDATE cells SET participants = ?, source = ?, meta = ? WHERE id = ?')
    .run(teamSize, JSON.stringify(source), JSON.stringify(meta), cellId);
  db.prepare("UPDATE stfs SET status = 'Under Investigation', bucket = 'active' WHERE id = ?").run('stf-' + cellId);
  const evtId = 'evt-jstf-' + Date.now().toString(36);
  db.prepare('INSERT INTO governance_events (id, type, circle, date, text, participant) VALUES (?,?,?,?,?,?)')
    .run(evtId, 'jstf-recomposition', '', new Date().toISOString().slice(0, 10),
      (meta.targetName || '') + ' case — jSTF recomposed (' + teamSize + ' investigators) after aSTF revision',
      String(by));
}

// POST /api/jstf/report — any member reports any member.  Creates (or
// appends to) an anonymous report thread on the target, stewards-only.
// Accumulated thread post count is returned (replies on same target).
async function jstfReportRoutes(req, res, reqUrl, method) {
  const m = reqUrl.match(/^\/api\/jstf\/report$/);
  if (!m) return null;
  if (method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Unauthorized' });
  const body = await readBody(req);
  const targetId = String(body.targetId || '').trim();
  const description = String(body.description || '').trim();
  if (!targetId) return send(res, 400, { error: 'targetId required' });
  if (!description) return send(res, 400, { error: 'description required' });
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
  if (!target) return send(res, 404, { error: 'Target member not found' });
  if (targetId === user.id) return send(res, 400, { error: 'Cannot report yourself' });
  const link = 'user:' + targetId;
  const existing = jstfReportThread(link);
  if (existing) {
    const replies = jstfAppendAnonymousPost(existing.id, description);
    return send(res, 200, { ok: true, threadId: existing.id, replies, accumulated: true });
  }
  const threadId = 'thread-jstf-' + Date.now().toString(36);
  db.prepare(`INSERT INTO threads (id, title, body, author, initials, badge, badge_class, replies, likes, shares, time, visibility, proposal_cell_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(threadId, 'Anonymous Report — ' + (target.name || target.initials), description,
      'Anonymous', '?', 'b-judicial', 'b-judicial', 1, 0, 0,
      new Date().toISOString().slice(0, 10), 'stewards-only', link);
  return send(res, 201, { ok: true, threadId, replies: 1, accumulated: false });
}

// POST /api/jstf/appeal — anyone can appeal a resolution.  Same machinery
// as reporting: anonymous thread on the case, visible to stewards only.
async function jstfAppealRoutes(req, res, reqUrl, method) {
  const m = reqUrl.match(/^\/api\/jstf\/appeal$/);
  if (!m) return null;
  if (method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Unauthorized' });
  const body = await readBody(req);
  const caseId = String(body.caseId || '').trim();
  const description = String(body.description || '').trim();
  if (!caseId) return send(res, 400, { error: 'caseId required' });
  if (!description) return send(res, 400, { error: 'description required' });
  const caseCell = db.prepare('SELECT * FROM cells WHERE id = ?').get(caseId);
  if (!caseCell || caseCell.type !== 'jSTF Cell') return send(res, 404, { error: 'Case not found' });
  const link = 'case:' + caseId;
  const existing = jstfReportThread(link);
  if (existing) {
    const replies = jstfAppendAnonymousPost(existing.id, description);
    return send(res, 200, { ok: true, threadId: existing.id, replies, accumulated: true });
  }
  const threadId = 'thread-appeal-' + Date.now().toString(36);
  db.prepare(`INSERT INTO threads (id, title, body, author, initials, badge, badge_class, replies, likes, shares, time, visibility, proposal_cell_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(threadId, 'Appeal — ' + (caseCell.title || caseId), description,
      'Anonymous', '?', 'b-judicial', 'b-judicial', 1, 0, 0,
      new Date().toISOString().slice(0, 10), 'stewards-only', link);
  return send(res, 201, { ok: true, threadId, replies: 1, accumulated: false });
}

// POST /api/jstf/escalate — a steward sponsors/escalates an anonymous
// report or appeal thread, spawning the jSTF cell + team composition.
async function jstfEscalateRoutes(req, res, reqUrl, method) {
  const m = reqUrl.match(/^\/api\/jstf\/escalate$/);
  if (!m) return null;
  if (method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Unauthorized' });
  if (jstfIsNotSteward(user.id)) return send(res, 403, { error: 'Steward access required' });
  const body = await readBody(req);
  const threadId = String(body.threadId || '').trim();
  if (!threadId) return send(res, 400, { error: 'threadId required' });
  const thread = db.prepare('SELECT * FROM threads WHERE id = ?').get(threadId);
  if (!thread) return send(res, 404, { error: 'Thread not found' });
  if (thread.jstf_cell_id) return send(res, 409, { error: 'Thread already escalated' });
  if (!thread.proposal_cell_id || !thread.proposal_cell_id.startsWith('user:') && !thread.proposal_cell_id.startsWith('case:')) {
    return send(res, 400, { error: 'Thread is not a judicial thread' });
  }
  const isAppeal = thread.proposal_cell_id.startsWith('case:');
  const link = thread.proposal_cell_id;
  let targetId = null, targetName = thread.title.replace(/^Anonymous Report — /, '').replace(/^Appeal — /, '');
  if (isAppeal) {
    const origCaseId = link.slice(5);
    const orig = db.prepare('SELECT * FROM cells WHERE id = ?').get(origCaseId);
    if (!orig) return send(res, 404, { error: 'Original case not found' });
    const origMeta = orig.meta ? JSON.parse(orig.meta) : {};
    targetId = origMeta.targetId || null;
    targetName = origMeta.targetName || orig.title || targetName;
  } else {
    targetId = link.slice(5);
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
    if (target) targetName = target.name || target.initials;
  }
  const cellId = 'jstf-' + Date.now().toString(36);
  // Team composition: active stewards, escalator guaranteed first.
  let team = jstfTeamSelection();
  if (!team.some(function(t) { return t.id === user.id; })) {
    team = [{ id: user.id, name: user.name, initials: user.initials }].concat(team).slice(0, 3);
  }
  const source = {
    type: 'judicial-investigation', threadId, isAppeal, targetId, targetName,
    escalatedBy: user.name || user.initials, escalatedAt: new Date().toISOString(),
    revisionOf: isAppeal ? link.slice(5) : null, team: team.map(function(t) { return { id: t.id, name: t.name, initials: t.initials }; }),
  };
  const meta = {
    targetId, targetName, threadId, isAppeal,
    targetIsSteward: targetId ? !!db.prepare("SELECT 1 FROM circle_roster WHERE member_id = ? AND status = 'active'").get(targetId) : false,
    revisionOf: source.revisionOf,
    restriction: { state: 'relaxed', restrictCount: 0, teamSize: team.length, majority: Math.floor(team.length / 2) + 1, severity: null, history: [] },
    verdict: null,
  };
  db.prepare(`INSERT INTO cells (id, type, title, status, delib_type, participants, circle, commissioned_by, source, resolution, meta)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(cellId, 'jSTF Cell', 'jSTF — ' + targetName, 'Under Investigation', 'judicial-investigation',
      team.length, '', user.id,
      JSON.stringify(source), JSON.stringify({ status: 'Under Investigation' }), JSON.stringify(meta));
  team.forEach(function(t, i) {
    db.prepare('INSERT INTO cell_team (cell_id, name, initials, role, focus) VALUES (?,?,?,?,?)')
      .run(cellId, t.name, t.initials, i === 0 ? 'Lead investigator' : 'Investigator', 'Judicial review');
  });
  db.prepare(`INSERT INTO stfs (id, type, purpose, circle, bucket, status, title, deadline) VALUES (?,?,?,?,?,?,?,?)`)
    .run('stf-' + cellId, 'jSTF', 'Judicial Investigation', targetName || '', 'active', 'Under Investigation',
      'jSTF — ' + targetName, new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  db.prepare('UPDATE threads SET jstf_cell_id = ? WHERE id = ?').run(cellId, threadId);
  const evtId = 'evt-jstf-' + Date.now().toString(36);
  db.prepare('INSERT INTO governance_events (id, type, circle, date, text, participant) VALUES (?,?,?,?,?,?)')
    .run(evtId, 'jstf-escalation', '', new Date().toISOString().slice(0, 10),
      'jSTF opened against ' + targetName + ' (' + (isAppeal ? 'appeal' : 'report') + ') — ' + team.length + ' investigators',
      String(user.name || user.initials));
  return send(res, 201, { ok: true, jstfId: cellId });
}

// POST /api/cells/:id/jstf-vote — live restriction toggle.  Each jSTF team
// member can set their stance restrict/lift at any time; the state flips to
// 'restricted' the moment the count reaches a simple majority and relaxes
// the moment it drops below — fully reversible in both directions.
async function jstfVoteRoutes(req, res, reqUrl, method) {
  const m = reqUrl.match(/^\/api\/cells\/([^/]+)\/jstf-vote$/);
  if (!m) return null;
  if (method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Unauthorized' });
  const cellId = decodeURIComponent(m[1]);
  const cell = db.prepare('SELECT * FROM cells WHERE id = ?').get(cellId);
  if (!cell) return send(res, 404, { error: 'Not found' });
  if (cell.type !== 'jSTF Cell') return send(res, 400, { error: 'Not a jSTF cell' });
  if (cell.status !== 'Under Investigation') return send(res, 400, { error: 'Not under investigation' });
  const onTeam = db.prepare('SELECT 1 FROM cell_team WHERE cell_id = ? AND initials = ?').get(cellId, user.initials);
  if (!onTeam) return send(res, 403, { error: 'Only the jSTF team may vote' });
  const body = await readBody(req);
  const stance = String(body.stance || '').trim();
  if (!['restrict', 'lift'].includes(stance)) return send(res, 400, { error: 'stance must be restrict or lift' });
  const teamSize = cell.participants || db.prepare('SELECT COUNT(*) n FROM cell_team WHERE cell_id = ?').get(cellId).n;
  const majority = Math.floor(teamSize / 2) + 1;
  db.prepare("DELETE FROM vote_records WHERE cell_id = ? AND domain = 'restriction' AND initials = ?")
    .run(cellId, user.initials);
  db.prepare("INSERT INTO vote_records (cell_id, domain, name, initials, vote) VALUES (?,?,?,?,?)")
    .run(cellId, 'restriction', user.name || user.initials, user.initials, stance);
  const restrictCount = db.prepare(`SELECT COUNT(*) n FROM vote_records WHERE cell_id = ? AND domain = 'restriction' AND vote = 'restrict'`).get(cellId).n;
  const restricted = restrictCount >= majority;
  const meta = cell.meta ? JSON.parse(cell.meta) : {};
  const cur = meta.restriction || { state: 'relaxed', restrictCount: 0, teamSize, majority, severity: null, history: [] };
  const severity = restricted
    ? (meta.targetIsSteward && restrictCount < teamSize ? 'frozen' : 'readonly')
    : null;
  const changed = cur.state !== (restricted ? 'restricted' : 'relaxed');
  const votes = db.prepare(`SELECT name, initials, vote FROM vote_records WHERE cell_id = ? AND domain = 'restriction'`).all(cellId);
  if (changed) {
    cur.history = cur.history || [];
    cur.history.push({
      prev: cur.state, next: restricted ? 'restricted' : 'relaxed',
      at: new Date().toISOString(), votedBy: user.name || user.initials,
    });
  }
  cur.state = restricted ? 'restricted' : 'relaxed';
  cur.restrictCount = restrictCount;
  cur.teamSize = teamSize;
  cur.majority = majority;
  if (severity) cur.severity = severity;
  cur.votes = votes;
  meta.restriction = cur;
  if (changed) {
    const evtId = 'evt-jstf-' + Date.now().toString(36);
    db.prepare('INSERT INTO governance_events (id, type, circle, date, text, participant) VALUES (?,?,?,?,?,?)')
      .run(evtId, 'jstf-restriction', '', new Date().toISOString().slice(0, 10),
        (meta.targetName || 'target') + ' activity ' + cur.state + ' (' + restrictCount + '/' + teamSize + ' → ' + severity + ')',
        String(user.name || user.initials));
  }
  db.prepare('UPDATE cells SET meta = ? WHERE id = ?').run(JSON.stringify(meta), cellId);
  return send(res, 200, {
    ok: true, state: cur.state, restrictCount, teamSize, majority,
    severity: cur.severity, changed,
  });
}

// POST /api/cells/:id/jstf-verdict — single filing by the jSTF (same as a
// deliberation motion / resolution draft).  Verdict cites policy
// resolutions: narrated judgements → policy-cited (non-system), system
// settings → system-bound.  Submits to a blind aSTF audit cell.
async function jstfVerdictRoutes(req, res, reqUrl, method) {
  const m = reqUrl.match(/^\/api\/cells\/([^/]+)\/jstf-verdict$/);
  if (!m) return null;
  if (method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Unauthorized' });
  if (jstfIsNotSteward(user.id)) return send(res, 403, { error: 'Steward access required' });
  const cellId = decodeURIComponent(m[1]);
  const cell = db.prepare('SELECT * FROM cells WHERE id = ?').get(cellId);
  if (!cell) return send(res, 404, { error: 'Not found' });
  if (cell.type !== 'jSTF Cell') return send(res, 400, { error: 'Not a jSTF cell' });
  const meta = cell.meta ? JSON.parse(cell.meta) : {};
  if (meta.verdict) return send(res, 409, { error: 'Verdict already filed' });
  if (cell.status !== 'Under Investigation') return send(res, 400, { error: 'Not under investigation' });
  const body = await readBody(req);
  const type = String(body.type || '').trim(); // 'system-bound' or 'policy-cited'
  const description = String(body.description || '').trim();
  const policyRefs = Array.isArray(body.policyRefs) ? body.policyRefs : [];
  const findings = String(body.findings || '').trim();
  if (!['system-bound', 'policy-cited'].includes(type)) {
    return send(res, 400, { error: 'type must be system-bound or policy-cited' });
  }
  if (!description) return send(res, 400, { error: 'description required' });
  meta.verdict = {
    type, description, policyRefs: policyRefs.map(String), findings,
    filedBy: user.name || user.initials, filedAt: new Date().toISOString(),
  };
  const source = cell.source ? JSON.parse(cell.source) : {};
  source.verdict = meta.verdict;
  db.prepare("UPDATE cells SET status = 'Finalised', meta = ?, source = ? WHERE id = ?")
    .run(JSON.stringify(meta), JSON.stringify(source), cellId);
  // aSTF audit — sees the decision, never the jSTF members.
  const astfId = 'astf-audit-' + Date.now().toString(36);
  const astfSource = {
    type: 'judicial-audit', sourceCellId: cellId, sourceTitle: 'jSTF Disciplinary Verdict',
    targetId: meta.targetId, targetName: meta.targetName,
    verdict: { type, description, policyRefs: meta.verdict.policyRefs, findings },
  };
  db.prepare(`INSERT INTO cells (id, type, title, status, delib_type, participants, circle, commissioned_by, source, resolution, meta)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(astfId, 'aSTF Cell', 'aSTF Audit — ' + (meta.targetName || ''), 'Blind Review', 'judicial-audit',
      1, '', cellId,
      JSON.stringify(astfSource), JSON.stringify({ status: 'Pending' }),
      JSON.stringify({ blind: 1, targetName: meta.targetName, verdict: meta.verdict }));
  db.prepare(`INSERT INTO stfs (id, type, purpose, circle, bucket, status, title, deadline) VALUES (?,?,?,?,?,?,?,?)`)
    .run('stf-' + astfId, 'aSTF', 'Judicial Audit', meta.targetName || '', 'active', 'Blind Review',
      'aSTF Audit — ' + (meta.targetName || ''), new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  db.prepare('UPDATE cells SET resolution_ref = ? WHERE id = ?').run(astfId, cellId);
  db.prepare("UPDATE stfs SET status = 'Finalised', bucket = 'completed' WHERE id = ?").run('stf-' + cellId);
  const evtId = 'evt-jstf-' + Date.now().toString(36);
  db.prepare('INSERT INTO governance_events (id, type, circle, date, text, participant) VALUES (?,?,?,?,?,?)')
    .run(evtId, 'jstf-verdict', '', new Date().toISOString().slice(0, 10),
      'jSTF verdict filed vs ' + (meta.targetName || '') + ' — ' + type + ' (' + policyRefs.length + ' policies cited)',
      String(user.name || user.initials));
  return send(res, 200, { ok: true, jstfId: cellId, astfId, type });
}

// ── 2.12 Membership & Stewardship ──────────────────────
// 6 ways a steward loses title: term expiry, resignation, jSTF forced
// removal, jSTF full circle flush, circle disbandment, competence drift.

async function membershipRoutes(req, res, reqUrl, method) {
  let h;
  if ((h = await membershipResignRoutes(req, res, reqUrl, method))) return h;
  if ((h = await membershipRemoveRoutes(req, res, reqUrl, method))) return h;
  if ((h = await membershipFlushRoutes(req, res, reqUrl, method))) return h;
  if ((h = await membershipDisbandRoutes(req, res, reqUrl, method))) return h;
  if ((h = await membershipDriftRoutes(req, res, reqUrl, method))) return h;
  if ((h = await membershipExpiryRoutes(req, res, reqUrl, method))) return h;
  return null;
}

function membershipMarkFormer(rosterId, reason) {
  const now = new Date().toISOString().slice(0, 10);
  db.prepare("UPDATE circle_roster SET status = 'former', left = ?, left_reason = ? WHERE id = ?")
    .run(now, reason, rosterId);
}

// POST /api/circles/:id/resign — any active member may resign.
async function membershipResignRoutes(req, res, reqUrl, method) {
  const m = reqUrl.match(/^\/api\/circles\/([^/]+)\/resign$/);
  if (!m) return null;
  if (method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Unauthorized' });
  const circleId = decodeURIComponent(m[1]);
  const row = db.prepare('SELECT * FROM circle_roster WHERE circle_id = ? AND member_id = ? AND status = ?')
    .get(circleId, user.id, 'active');
  if (!row) return send(res, 400, { error: 'Not an active member of this circle' });
  membershipMarkFormer(row.id, 'resignation');
  return send(res, 200, { ok: true, reason: 'resignation' });
}

// POST /api/circles/:id/remove-member — steward removes another member
// (jSTF forced removal).  Body: { memberId }.
async function membershipRemoveRoutes(req, res, reqUrl, method) {
  const m = reqUrl.match(/^\/api\/circles\/([^/]+)\/remove-member$/);
  if (!m) return null;
  if (method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Unauthorized' });
  const circleId = decodeURIComponent(m[1]);
  if (!db.prepare("SELECT 1 FROM circle_roster WHERE circle_id = ? AND member_id = ? AND status = 'active'").get(circleId, user.id)) {
    return send(res, 403, { error: 'Steward access required' });
  }
  const body = await readBody(req);
  const targetId = String(body.memberId || '').trim();
  if (!targetId) return send(res, 400, { error: 'memberId required' });
  if (targetId === user.id) return send(res, 400, { error: 'Cannot remove yourself' });
  const target = db.prepare("SELECT * FROM circle_roster WHERE circle_id = ? AND member_id = ? AND status = 'active'")
    .get(circleId, targetId);
  if (!target) return send(res, 404, { error: 'Target not an active member' });
  membershipMarkFormer(target.id, 'jstf-removal');
  return send(res, 200, { ok: true, reason: 'jstf-removal', memberId: targetId });
}

// POST /api/circles/:id/flush — jSTF full circle flush.  Removes all
// active members except the executing steward.  Body: { keepMemberId? }.
async function membershipFlushRoutes(req, res, reqUrl, method) {
  const m = reqUrl.match(/^\/api\/circles\/([^/]+)\/flush$/);
  if (!m) return null;
  if (method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Unauthorized' });
  const circleId = decodeURIComponent(m[1]);
  if (!db.prepare("SELECT 1 FROM circle_roster WHERE circle_id = ? AND member_id = ? AND status = 'active'").get(circleId, user.id)) {
    return send(res, 403, { error: 'Steward access required' });
  }
  const body = await readBody(req);
  const keepId = String(body.keepMemberId || user.id).trim();
  const rows = db.prepare("SELECT * FROM circle_roster WHERE circle_id = ? AND status = 'active'").all(circleId);
  let removed = 0;
  for (const r of rows) {
    if (r.member_id !== keepId) {
      membershipMarkFormer(r.id, 'jstf-circle-flush');
      removed++;
    }
  }
  return send(res, 200, { ok: true, reason: 'jstf-circle-flush', removed });
}

// POST /api/circles/:id/disband — steward disbands the circle.
// All roster members move to former, circle marked Archived.
async function membershipDisbandRoutes(req, res, reqUrl, method) {
  const m = reqUrl.match(/^\/api\/circles\/([^/]+)\/disband$/);
  if (!m) return null;
  if (method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Unauthorized' });
  const circleId = decodeURIComponent(m[1]);
  if (!db.prepare("SELECT 1 FROM circle_roster WHERE circle_id = ? AND member_id = ? AND status = 'active'").get(circleId, user.id)) {
    return send(res, 403, { error: 'Steward access required' });
  }
  const rows = db.prepare("SELECT * FROM circle_roster WHERE circle_id = ? AND status = 'active'").all(circleId);
  let removed = 0;
  for (const r of rows) {
    membershipMarkFormer(r.id, 'circle-disbandment');
    removed++;
  }
  db.prepare("UPDATE circles SET status = 'Archived' WHERE id = ?").run(circleId);
  return send(res, 200, { ok: true, reason: 'circle-disbandment', removed });
}

// POST /api/circles/:id/drift-check — check all active members against
// circle competence mandate.  Members whose top domain is not in the
// circle's primary mandate AND whose Ws < threshold (default 50) are
// moved to former for 'competence-drift'.
async function membershipDriftRoutes(req, res, reqUrl, method) {
  const m = reqUrl.match(/^\/api\/circles\/([^/]+)\/drift-check$/);
  if (!m) return null;
  if (method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Unauthorized' });
  const circleId = decodeURIComponent(m[1]);
  if (!db.prepare("SELECT 1 FROM circle_roster WHERE circle_id = ? AND member_id = ? AND status = 'active'").get(circleId, user.id)) {
    return send(res, 403, { error: 'Steward access required' });
  }
  const body = await readBody(req);
  const threshold = Number(body.threshold) || 50;
  const mandateDomains = db.prepare("SELECT domain FROM circle_domains WHERE circle_id = ? AND mandate = 'primary'").all(circleId).map(d => d.domain);
  if (!mandateDomains.length) return send(res, 400, { error: 'Circle has no primary mandate domains' });
  const rows = db.prepare("SELECT * FROM circle_roster WHERE circle_id = ? AND status = 'active'").all(circleId);
  let drifted = 0;
  for (const r of rows) {
    const topDomain = r.top_domain || '';
    const ws = r.ws || 0;
    if (ws < threshold && !mandateDomains.includes(topDomain)) {
      membershipMarkFormer(r.id, 'competence-drift');
      drifted++;
    }
  }
  return send(res, 200, { ok: true, reason: 'competence-drift', drifted, threshold, mandateDomains });
}

// POST /api/circles/:id/check-expiry — check all active members against
// steward_term_months.  Expired members moved to former for 'term-expiry'.
async function membershipExpiryRoutes(req, res, reqUrl, method) {
  const m = reqUrl.match(/^\/api\/circles\/([^/]+)\/check-expiry$/);
  if (!m) return null;
  if (method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Unauthorized' });
  const circleId = decodeURIComponent(m[1]);
  if (!db.prepare("SELECT 1 FROM circle_roster WHERE circle_id = ? AND member_id = ? AND status = 'active'").get(circleId, user.id)) {
    return send(res, 403, { error: 'Steward access required' });
  }
  const ss = db.prepare('SELECT * FROM system_settings WHERE id = 1').get() || {};
  const termMonths = ss.steward_term_months || 12;
  const now = Date.now();
  const rows = db.prepare("SELECT * FROM circle_roster WHERE circle_id = ? AND status = 'active'").all(circleId);
  let expired = 0;
  for (const r of rows) {
    if (!r.joined) continue;
    const joinedMs = new Date(r.joined).getTime();
    const termMs = termMonths * 30.44 * 86400000;
    if (now - joinedMs > termMs) {
      membershipMarkFormer(r.id, 'term-expiry');
      expired++;
    }
  }
  return send(res, 200, { ok: true, reason: 'term-expiry', expired, termMonths });
}

// ═════════════════════════════════════════════════════════
// BOOTSTRAP ENDPOINT — reassembles the full MOCK-shaped payload
// (read model for the frontend; writes stay on granular routes)
// ═════════════════════════════════════════════════════════

function parseJson(s) {
  if (s === null || s === undefined) return null;
  try { return JSON.parse(s); } catch { return null; }
}

function groupBy(rows, key) {
  const out = {};
  for (const r of rows) (out[r[key]] ||= []).push(r);
  return out;
}

function mapKeys(obj, map) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) out[map[k] ?? k] = v;
  return out;
}

async function bootstrapRoute(req, res, reqUrl, method) {
  if (!(reqUrl === '/api/bootstrap' && method === 'GET')) return null;
  const empty = new URL(req.url, 'http://x').searchParams.get('empty') === '1';

  const j = parseJson;
  const all = (sql) => db.prepare(sql).all();

  // ── identity: current user comes from the session token ──
  const users = all('SELECT * FROM users');
  const tok = ((req.headers.authorization || '').match(/^Bearer\s+(.+)$/i) || [])[1];
  const currentRow = tok
    ? db.prepare(`SELECT u.* FROM auth_tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ? AND t.expires_at > ?`)
        .get(tok, new Date().toISOString()) || null
    : null;
  const compByUser = groupBy(all('SELECT * FROM user_competence'), 'user_id');
  const cirByUser = groupBy(all('SELECT * FROM user_circles'), 'user_id');
  const orgByUser = groupBy(all('SELECT * FROM user_orgs'), 'user_id');
  const dirByUser = groupBy(all('SELECT * FROM participants'), 'user_id');
  const actByUser = groupBy(all('SELECT * FROM user_activity'), 'user_id');

  const participants = users.map(u => {
    const dir = dirByUser[u.id] ? dirByUser[u.id][0] : {};
    return {
      id: u.id, name: u.name, initials: u.initials, location: dir.location ?? u.location,
      joined: dir.joined ?? u.joined, avatar: j(u.avatar) || {},
      domains: (compByUser[u.id] || []).filter(c => c.kind === 'roster').map(c => ({ name: c.domain, ws: c.ws, color: c.color })),
      circles: (cirByUser[u.id] || []).filter(c => c.kind === 'roster').map(c => c.circle),
      orgs: (orgByUser[u.id] || []).map(o => o.org_acronym),
      bio: dir.bio ?? u.bio,
    };
  });

  let currentUser = null;
  if (currentRow) {
    currentUser = {
      id: currentRow.id, name: currentRow.name, initials: currentRow.initials,
      email: currentRow.email, location: currentRow.location, joined: currentRow.joined,
      status: currentRow.status, standing: currentRow.standing, standingDrift: currentRow.standing_drift,
      competence: currentRow.competence, competenceNote: currentRow.competence_note,
      interestScore: currentRow.interest_score, interestDrift: currentRow.interest_drift,
      activeRoles: currentRow.active_roles, rolesBreakdown: currentRow.roles_breakdown,
      bio: currentRow.bio, essay: currentRow.essay, avatar: j(currentRow.avatar) || {},
      domains: {},
      circles: (cirByUser[currentRow.id] || []).filter(c => c.kind === 'self').map(c => ({ name: c.circle, status: c.status, since: c.since })),
      activity: (actByUser[currentRow.id] || []).map(a => ({ text: a.text, time: a.time, type: a.type })),
    };
    const selfComp = (compByUser[currentRow.id] || []).filter(c => c.kind === 'self');
    // Users without a self-kind profile fall back to their directory (roster) data
    const compSrc = selfComp.length ? selfComp : (compByUser[currentRow.id] || []).filter(c => c.kind === 'roster');
    for (const c of compSrc) {
      currentUser.domains[c.domain] = { ws: c.ws, wh: c.wh, interest: c.interest, barWs: c.bar_ws, barWh: c.bar_wh, members: c.members };
    }
    if (!currentUser.circles.length) {
      currentUser.circles = (cirByUser[currentRow.id] || []).filter(c => c.kind === 'roster').map(c => ({ name: c.circle, status: 'Active', since: c.since }));
    }
  }

  // ── organisations ──
  const kdByOrg = groupBy(all('SELECT * FROM org_knowledge_domains'), 'org_id');
  const organisations = all('SELECT * FROM organisations').map(o => ({
    id: o.id, name: o.name, acronym: o.acronym, shortname: o.shortname,
    location: o.location, summary: o.summary, status: o.status, founded: o.founded,
    foundingCell: o.founding_cell, memberCount: o.member_count,
    website: o.website, logo: o.logo,
    knowledgeDomains: (kdByOrg[o.id] || []).map(d => d.domain),
  }));

  // ── domains catalog + layout ──
  const domains = {};
  for (const d of all('SELECT * FROM domains')) {
    domains[d.id] = { label: d.label, short: d.short, color: d.color, hasCircle: !!d.has_circle, type: d.type, taxonomy: d.taxonomy };
  }
  const layoutMeta = db.prepare('SELECT * FROM domain_layout_meta WHERE id = 1').get();
  const seeds = {};
  for (const l of all('SELECT * FROM domain_layout')) seeds[l.domain_id] = [l.x, l.y];
  const domainLayout = {
    worldSize: layoutMeta ? layoutMeta.world_size : 1800,
    seeds,
    camera: layoutMeta ? j(layoutMeta.camera) || { x: 900, y: 900, scale: 0.5 } : { x: 900, y: 900, scale: 0.5 },
  };

  // ── circles ──
  const cdByCircle = groupBy(all('SELECT * FROM circle_domains'), 'circle_id');
  const rosterByCircle = groupBy(all('SELECT * FROM circle_roster'), 'circle_id');
  const rdByRoster = groupBy(all('SELECT * FROM circle_roster_domains'), 'roster_id');
  const propByCircle = groupBy(all('SELECT * FROM circle_proposals'), 'circle_id');
  const resByCircle = groupBy(all('SELECT * FROM circle_resolutions'), 'circle_id');
  const actByCircle = groupBy(all('SELECT * FROM circle_activity'), 'circle_id');

  const circles = all('SELECT * FROM circles').map(c => {
    const cds = cdByCircle[c.id] || [];
    const domainsList = cds.filter(d => !d.mandate).map(d => d.domain);
    const primary = cds.filter(d => d.mandate === 'primary').map(d => d.domain);
    const secondary = cds.filter(d => d.mandate === 'secondary').map(d => d.domain);
    const desiredWs = {};
    cds.forEach(d => { if (d.desired_ws != null) desiredWs[d.domain] = d.desired_ws; });
    const roster = { active: [], former: [] };
    for (const r of (rosterByCircle[c.id] || [])) {
      const dRows = rdByRoster[r.id] || [];
      const entry = {
        id: r.member_id, name: r.name, initials: r.initials, color: r.color, ws: r.ws,
        status: r.status, joined: r.joined, lastActive: r.last_active, topDomain: r.top_domain,
        domains: dRows.map(d => d.domain), domainWs: dRows.map(d => d.ws),
      };
      if (r.status === 'former') {
        entry.left = r.left; entry.leftReason = r.left_reason;
        delete entry.lastActive;
        roster.former.push(entry);
      } else {
        roster.active.push(entry);
      }
    }
    const meta = j(c.meta) || {};
    const cMeta = {};
    if (meta.maxMembers != null) cMeta.maxMembers = meta.maxMembers;
    if (meta.archivedDate != null) cMeta.archivedDate = meta.archivedDate;
    if (meta.archiveReason != null) cMeta.archiveReason = meta.archiveReason;
    const stripCircleId = ({ circle_id, ...rest }) => rest;
    const stripDupes = ({ circle_id, id, ...rest }) => rest;
    return {
      id: c.id, name: c.name, status: c.status, members: c.members, motions: c.motions,
      description: c.description, founded: c.founded,
      termOverride: j(c.term_override), expiryOverride: j(c.expiry_override),
      domains: domainsList, mandate: { primary, secondary }, desiredWs,
      roster, proposals: (propByCircle[c.id] || []).map(stripCircleId),
      resolutions: (resByCircle[c.id] || []).map(stripCircleId),
      activity: (actByCircle[c.id] || []).map(stripDupes),
      ...cMeta,
    };
  });

  // ── cells ──
  const cellDomains = groupBy(all('SELECT * FROM cell_domains'), 'cell_id');
  const cellCircles = groupBy(all('SELECT * FROM cell_circles'), 'cell_id');
  const msgByCell = groupBy(all('SELECT * FROM cell_messages'), 'cell_id');
  const taskByCell = groupBy(all('SELECT * FROM cell_tasks'), 'cell_id');
  const objByCell = groupBy(all('SELECT * FROM cell_objectives'), 'cell_id');
  const teamByCell = groupBy(all('SELECT * FROM cell_team'), 'cell_id');
  const draftByCell = groupBy(all('SELECT * FROM draft_resolutions'), 'cell_id');
  const verByDraft = groupBy(all('SELECT * FROM resolution_versions'), 'draft_id');
  const impByDraft = groupBy(all('SELECT * FROM resolution_implementing_circles'), 'draft_id');
  const voteByCell = groupBy(all('SELECT * FROM cell_votes'), 'cell_id');
  const voterByCell = groupBy(all('SELECT * FROM vote_records'), 'cell_id');
  const vsumByCell = groupBy(all('SELECT * FROM cell_vote_summary'), 'cell_id');

  const cells = all('SELECT * FROM cells').map(c => {
    const meta = j(c.meta) || {};
    const cell = {
      id: c.id, type: c.type, title: c.title, status: c.status, delibType: c.delib_type,
      participants: c.participants, members: c.members, progress: c.progress, daysActive: c.days_active,
      lead: c.lead, circle: c.circle, created: c.created, deadline: c.deadline,
      assessors: c.assessors, commissionedBy: c.commissioned_by,
      resolutionRef: c.resolution_ref, entityType: c.entity_type,
      source: j(c.source), resolution: j(c.resolution), deliverableSpecs: j(c.deliverable_specs),
      domains: (cellDomains[c.id] || []).map(d => d.domain),
      ...Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== null && v !== undefined)),
    };
    if (c.blind) cell.blind = true;
    const ccs = cellCircles[c.id] || [];
    cell.circles = ccs.filter(cc => !cc.circle_id && !cc.votes).map(cc => ({ name: cc.name, initials: cc.initials, gradient: cc.gradient, status: cc.status, role: cc.role }));
    cell.participatingCircles = ccs.filter(cc => cc.circle_id || cc.votes).map(cc => ({ id: cc.circle_id, name: cc.name, role: cc.role, votes: cc.votes }));
    cell.messages = (msgByCell[c.id] || []).map(m => {
      const msg = { author: m.author, initials: m.initials, text: m.text, time: m.time };
      if (m.color != null) msg.color = m.color;
      return msg;
    });
    cell.tasks = (taskByCell[c.id] || []).map(t => ({ id: t.task_id || 't' + t.id, label: t.label, status: t.status, locked: !!t.locked, assignee: t.assignee }));
    cell.objectives = (objByCell[c.id] || []).map(o => ({ id: o.obj_id || 'o' + o.id, label: o.label, status: o.status }));
    cell.team = (teamByCell[c.id] || []).map(t => ({ name: t.name, initials: t.initials, role: t.role, focus: t.focus }));
    cell.draftResolutions = (draftByCell[c.id] || []).map(d => ({
      id: d.res_id ?? d.id, rowId: d.id, status: d.status || 'draft', title: d.title, text: d.text, action: d.action, votesNullified: !!d.votes_nullified,
      versions: (verByDraft[d.id] || []).map(v => ({ title: v.title, text: v.text, action: v.action, author: v.author, ts: v.ts })),
      implementingCircles: (impByDraft[d.id] || []).map(i => i.circle_name),
    }));
    const vs = voteByCell[c.id] || [];
    if (vs.length || vsumByCell[c.id]) {
      cell.votes = {
        domains: vs.map(v => ({
          name: v.domain, yea: v.yea, nay: v.nay, total: v.total,
          voters: (voterByCell[c.id] || []).filter(vr => vr.domain === v.domain).map(vr => ({ name: vr.name, initials: vr.initials, ws: vr.ws, vote: vr.vote })),
        })),
        summary: vsumByCell[c.id] ? j(vsumByCell[c.id][0].summary) : undefined,
      };
    }
    return Object.fromEntries(Object.entries(cell).filter(([, v]) => v !== null && v !== undefined));
  });

  // ── stfs + candidates ──
  const stfShape = { pending: [], active: [], completed: [] };
  for (const s of all('SELECT * FROM stfs')) {
    const obj = { id: s.id, type: s.type, purpose: s.purpose, circle: s.circle, deadline: s.deadline, status: s.status };
    if (s.bucket === 'pending') obj.candidate = s.title;
    else obj.title = s.title;
    stfShape[s.bucket] = stfShape[s.bucket] || [];
    stfShape[s.bucket].push(obj);
  }
  const cdByCand = groupBy(all('SELECT * FROM stf_candidate_domains'), 'candidate_id');
  const stfCandidates = all('SELECT * FROM stf_candidates').map(c => ({
    id: c.id, stfId: c.stf_id, name: c.name, initials: c.initials, matchScore: c.match_score,
    matchedDomains: (cdByCand[c.id] || []).map(d => d.domain), interestScore: c.interest_score, competenceScore: c.competence_score,
    status: c.status, invitedDate: c.invited_date,
  }));

  // ── threads / inbox / publications / projects ──
  const replyByThread = groupBy(all('SELECT * FROM thread_replies'), 'thread_id');
  const threads = all('SELECT * FROM threads').map(t => ({
    id: t.id, title: t.title, body: t.body, author: t.author, initials: t.initials, avatar: j(t.avatar) || {},
    domain: t.domain, domainColor: t.domain_color, badge: t.badge, badgeClass: t.badge_class,
    replies: t.replies, likes: t.likes, shares: t.shares, time: t.time, pinned: !!t.pinned,
    endorsements: t.endorsements || 0, proposalCellId: t.proposal_cell_id || null,
    visibility: t.visibility || 'public', jstfCellId: t.jstf_cell_id || null,
    repliesList: (replyByThread[t.id] || []).map(r => ({
      id: r.id, author: r.author, initials: r.initials, avatar: j(r.avatar) || {},
      time: r.time, body: r.body, likes: r.likes,
    })),
  }));

  const actByInbox = groupBy(all('SELECT * FROM inbox_actions'), 'inbox_id');
  const metaByInbox = groupBy(all('SELECT * FROM inbox_meta'), 'inbox_id');
  const inbox = all('SELECT * FROM inbox').map(i => ({
    id: i.id, type: i.type, title: i.title, desc: i.desc, time: i.time, badge: i.badge,
    unread: !!i.unread, detail: i.detail, nav: i.nav,
    actions: (actByInbox[i.id] || []).map(a => ({ label: a.label, style: a.style, action: a.action })),
    meta: (metaByInbox[i.id] || []).map(m => ({ label: m.label, value: m.value })),
  }));

  const authorByPub = groupBy(all('SELECT * FROM publication_authors'), 'publication_id');
  const publications = all('SELECT * FROM publications').map(p => ({
    id: p.id, title: p.title, journal: p.journal, date: p.date, views: p.views, downloads: p.downloads,
    type: p.type, abstract: p.abstract, tags: j(p.tags) || [],
    authors: (authorByPub[p.id] || []).map(a => a.author),
  }));

  const news = all('SELECT * FROM news').map(n => ({ title: n.title, time: n.time, source: n.source }));
  const events = all('SELECT * FROM events').map(e => ({ title: e.title, date: e.date, location: e.location }));
  const opportunities = all('SELECT * FROM opportunities').map(o => ({ title: o.title, deadline: o.deadline, type: o.type }));
  const domByProject = groupBy(all('SELECT * FROM project_domains'), 'project_id');
  const projects = all('SELECT * FROM projects').map(p => ({
    id: p.id, title: p.title, lead: p.lead, progress: p.progress, role: p.role,
    domains: (domByProject[p.id] || []).map(d => d.domain),
  }));

  // ── config & misc ──
  const exitReasonLabels = {};
  for (const r of all('SELECT * FROM exit_reason_labels')) exitReasonLabels[r.key] = r.label;

  const ss = db.prepare('SELECT * FROM system_settings WHERE id = 1').get() || {};
  const systemSettings = {
    stewardTermMonths: ss.steward_term_months ?? null,
    maxConsecutiveTerms: ss.max_consecutive_terms ?? null,
    cooloffMonths: ss.cooloff_months ?? null,
    pAstfCycleMonths: ss.p_astf_cycle_months ?? null,
    autoExpireCircles: !!ss.auto_expire_circles,
    defaultCircleExpiryMonths: ss.default_circle_expiry_months ?? null,
  };
  const stats = j(db.prepare('SELECT stats FROM stats WHERE id = 1').get()?.stats) || {};

  const regRows = all('SELECT * FROM registration_domains');
  const regMeta = db.prepare('SELECT * FROM registration_meta WHERE id = 1').get();
  const registration = {
    domains: regRows.map(r => ({ name: r.name, type: r.type })),
    eloMap: regMeta ? j(regMeta.elo_map) : {},
    knowledgeLevels: regMeta ? j(regMeta.knowledge_levels) : [],
    experientialLevels: regMeta ? j(regMeta.experiential_levels) : [],
    defaultInterests: regMeta ? j(regMeta.default_interests) : [],
  };

  const integrityRecords = all('SELECT * FROM integrity_records');
  const governanceEvents = all('SELECT * FROM governance_events').map(g => {
    const o = { id: g.id, type: g.type, circle: g.circle, date: g.date, text: g.text };
    if (g.participant != null) o.participant = g.participant;
    return o;
  });

  const domByApp = groupBy(all('SELECT * FROM circle_application_domains'), 'app_id');
  const circleApplications = all('SELECT * FROM circle_applications').map(a => ({
    id: a.id, circleId: a.circle_id, circleName: a.circle_name, applicant: a.applicant, initials: a.initials,
    motivation: a.motivation, relevantDomains: (domByApp[a.id] || []).map(d => d.domain), status: a.status,
    appliedDate: a.applied_date, queuePosition: a.queue_position,
  }));

  const projectApplications = all('SELECT * FROM project_applications').map(p => ({
    id: p.id, cellId: p.cell_id, projectName: p.project_name, applicant: p.applicant, initials: p.initials,
    motivation: p.motivation, status: p.status, appliedDate: p.applied_date, proposedRole: p.proposed_role,
  }));

  const governanceLedger = all('SELECT * FROM governance_ledger').map(l => ({
    id: l.id, type: l.type, target: l.target, settings: j(l.settings), appliedBy: l.applied_by,
    appliedAt: l.applied_at, status: l.status,
  }));

  const myEngagements = currentRow
    ? db.prepare(
        `SELECT t.id, (SELECT COUNT(*) FROM thread_endorsements e WHERE e.thread_id = t.id AND e.user_id = ?) AS endorsed,
                 (SELECT COUNT(*) FROM thread_bookmarks b WHERE b.thread_id = t.id AND b.user_id = ?) AS bookmarked
         FROM threads t`).all(String(currentRow.id), String(currentRow.id))
        .map(r => ({ threadId: r.id, endorsed: r.endorsed > 0, bookmarked: r.bookmarked > 0 }))
    : [];

  const payload = {
    currentUser, participants, organisations, domains, domainLayout,
    circles, cells, stfs: stfShape, stfCandidates, threads, inbox, publications,
    news, events, opportunities, projects, exitReasonLabels, systemSettings, stats, registration,
    integrityRecords, governanceEvents, circleApplications, projectApplications, governanceLedger,
    myEngagements,
  };

  // ?empty=1 — same shape, no data: for exploring the platform's empty state.
  if (empty) {
    for (const k of ['participants', 'organisations', 'circles', 'cells', 'threads', 'inbox',
      'publications', 'news', 'events', 'opportunities', 'projects', 'integrityRecords',
      'governanceEvents', 'circleApplications', 'projectApplications', 'governanceLedger',
      'stfCandidates', 'myEngagements']) {
      payload[k] = [];
    }
    payload.stfs = { pending: [], active: [], completed: [] };
    payload.domains = {};
    payload.stats = {};
  }

  return send(res, 200, payload);
}

// ═════════════════════════════════════════════════════════
// CONFIG ENDPOINTS
// ═════════════════════════════════════════════════════════

async function configRoutes(req, res, reqUrl, method) {
  if (reqUrl === '/api/system-settings' && method === 'GET') {
    return send(res, 200, db.prepare('SELECT * FROM system_settings WHERE id = 1').get() || {});
  }
  if (reqUrl === '/api/system-settings' && (method === 'PATCH' || method === 'PUT')) {
    const body = await readBody(req);
    const cols = db.prepare('PRAGMA table_info(system_settings)').all().map(c => c.name).filter(c => c !== 'id');
    const entries = Object.entries(body).filter(([k]) => cols.includes(k));
    if (!entries.length) return send(res, 200, db.prepare('SELECT * FROM system_settings WHERE id = 1').get());
    const sets = entries.map(([k]) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE system_settings SET ${sets} WHERE id = 1`).run(...entries.map(([, v]) => v));
    return send(res, 200, db.prepare('SELECT * FROM system_settings WHERE id = 1').get());
  }
  if (reqUrl === '/api/stats' && method === 'GET') {
    const row = db.prepare('SELECT stats FROM stats WHERE id = 1').get();
    return send(res, 200, row ? JSON.parse(row.stats) : {});
  }
  if (reqUrl === '/api/registration' && method === 'GET') {
    const reg = db.prepare('SELECT * FROM registration_domains').all();
    const meta = db.prepare('SELECT * FROM registration_meta WHERE id = 1').get();
    return send(res, 200, {
      domains: reg,
      eloMap: meta ? JSON.parse(meta.elo_map || '{}') : {},
      knowledgeLevels: meta ? JSON.parse(meta.knowledge_levels || '[]') : [],
      experientialLevels: meta ? JSON.parse(meta.experiential_levels || '[]') : [],
      defaultInterests: meta ? JSON.parse(meta.default_interests || '[]') : [],
    });
  }
  if (reqUrl === '/api/current-user' && method === 'GET') {
    const u = db.prepare('SELECT * FROM users WHERE is_current = 1').get();
    if (!u) return send(res, 404, { error: 'No current user' });
    delete u.password_hash;
    return send(res, 200, u);
  }
  return null;
}

// ═════════════════════════════════════════════════════════
// STATIC FILES
// ═════════════════════════════════════════════════════════

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

function staticFile(reqUrl) {
  const urlPath = reqUrl.split('?')[0];
  if (urlPath === '/shared/' || urlPath.startsWith('/shared/')) {
    const rel = urlPath.slice('/shared/'.length);
    const full = normalize(join(SHARED_DIR, rel));
    if (!full.startsWith(SHARED_DIR + sep)) return null;
    if (!existsSync(full) || statSync(full).isDirectory()) return null;
    return full;
  }
  let rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const full = normalize(join(PLATFORM_DIR, rel));
  if (!full.startsWith(PLATFORM_DIR + sep)) return null;
  if (!existsSync(full) || statSync(full).isDirectory()) return null;
  return full;
}

// ═════════════════════════════════════════════════════════
// REQUEST HANDLER
// ═════════════════════════════════════════════════════════

const CORS_ORIGIN = process.env.SOLIS_ORIGIN || '*';

const server = createServer(async (req, res) => {
  const reqUrl = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const method = req.method;

  // API routes
  if (reqUrl.startsWith('/api/')) {
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
    if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    let handled = await authRoutes(req, res, reqUrl, method);
    if (handled) return;
    handled = await bootstrapRoute(req, res, reqUrl, method);
    if (handled) return;
    handled = await voteRoutes(req, res, reqUrl, method);
    if (!handled) handled = await governanceRoutes(req, res, reqUrl, method);
    if (!handled) handled = await astfVerdictRoutes(req, res, reqUrl, method);
    if (!handled) handled = await xstfSpawnRoutes(req, res, reqUrl, method);
    if (!handled) handled = await xstfDeliverableRoutes(req, res, reqUrl, method);
    if (!handled) handled = await xstfReviewRoutes(req, res, reqUrl, method);
    if (!handled) handled = await vstfSpawnRoutes(req, res, reqUrl, method);
    if (!handled) handled = await vstfAssessmentRoutes(req, res, reqUrl, method);
    if (!handled) handled = await pastfSpawnRoutes(req, res, reqUrl, method);
    if (!handled) handled = await pastfReviewRoutes(req, res, reqUrl, method);
    if (!handled) handled = await jstfReportRoutes(req, res, reqUrl, method);
    if (!handled) handled = await jstfAppealRoutes(req, res, reqUrl, method);
    if (!handled) handled = await jstfEscalateRoutes(req, res, reqUrl, method);
    if (!handled) handled = await jstfVoteRoutes(req, res, reqUrl, method);
    if (!handled) handled = await jstfVerdictRoutes(req, res, reqUrl, method);
    if (!handled) handled = await membershipRoutes(req, res, reqUrl, method);
    if (handled) return;
    handled = await resourceRoutes(req, res, reqUrl, method);
    if (handled) return;
    handled = await childRoutes(req, res, reqUrl, method);
    if (handled) return;
    handled = await draftChildRoutes(req, res, reqUrl, method);
    if (handled) return;
    handled = await engagementRoutes(req, res, reqUrl, method);
    if (handled) return;
    handled = await pinRoutes(req, res, reqUrl, method);
    if (handled) return;
    handled = await raiseProposalRoutes(req, res, reqUrl, method);
    if (handled) return;
    handled = await directProposalRoutes(req, res, reqUrl, method);
    if (handled) return;
    handled = await settingsProposalRoutes(req, res, reqUrl, method);
    if (handled) return;
    handled = await configRoutes(req, res, reqUrl, method);
    if (handled) return;
    return send(res, 404, { error: 'Not found' });
  }

  // Static
  const file = staticFile(reqUrl);
  if (file) {
    const ext = extname(file);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    createReadStream(file).pipe(res);
    return;
  }

  send(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`Solis database prototype → http://localhost:${PORT}`);
  console.log(`  static root: ${PLATFORM_DIR}`);
  console.log(`  database:    ${DB_PATH}`);
});
