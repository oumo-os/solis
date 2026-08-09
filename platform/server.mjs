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
