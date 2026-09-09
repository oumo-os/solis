#!/usr/bin/env node
/**
 * seed-mysql.js — Create tables + seed data from mock.json into MySQL/MariaDB.
 *
 * Usage:  node db/seed-mysql.js                 # seeds from mock.json
 *         SOLIS_DB=solis_custom node db/seed-mysql.js
 *
 * Requires XAMPP MySQL running on localhost:3306, user root, no password.
 */
import mysql from 'mysql2/promise';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_NAME = process.env.SOLIS_MYSQL_DB || 'solis';
const MOCK_PATH = join(__dirname, '..', 'mock.json');
const hashPassword = (pw) => createHash('sha256').update(String(pw)).digest('hex');

// ═══════════════════════════════════════════════════════════════
// Table definitions — MariaDB-compatible DDL
// ═══════════════════════════════════════════════════════════════

const TABLES = [
  // ── IDENTITY ──
  `CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY, name VARCHAR(255) NOT NULL, initials VARCHAR(10),
    email VARCHAR(255) UNIQUE, location TEXT, joined TEXT, status TEXT,
    standing INT, standing_drift TEXT, competence INT, competence_note TEXT,
    interest_score INT, interest_drift TEXT, active_roles INT, roles_breakdown TEXT,
    bio TEXT, essay TEXT, avatar TEXT, is_current INT DEFAULT 0,
    password_hash TEXT, failed_attempts INT DEFAULT 0, created_at TEXT DEFAULT (NOW())
  )`,

  `CREATE TABLE IF NOT EXISTS user_competence (
    id INT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(255) NOT NULL, domain VARCHAR(255) NOT NULL,
    ws INT, wh INT, interest INT, bar_ws INT, bar_wh INT, members INT, color TEXT,
    rank INT, kind TEXT DEFAULT 'roster', evidence TEXT, verified INT DEFAULT 0,
    UNIQUE(user_id, domain)
  )`,

  `CREATE TABLE IF NOT EXISTS user_circles (
    user_id VARCHAR(255) NOT NULL, circle VARCHAR(255) NOT NULL, status TEXT, since TEXT,
    kind TEXT DEFAULT 'roster', PRIMARY KEY (user_id, circle)
  )`,

  `CREATE TABLE IF NOT EXISTS user_orgs (
    user_id VARCHAR(255) NOT NULL, org_acronym VARCHAR(255) NOT NULL, PRIMARY KEY (user_id, org_acronym)
  )`,

  `CREATE TABLE IF NOT EXISTS participants (
    user_id VARCHAR(255) PRIMARY KEY, location TEXT, joined TEXT, bio TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS user_activity (
    id INT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(255) NOT NULL,
    seq INT NOT NULL DEFAULT 0, text TEXT, time TEXT, type TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS domains (
    id VARCHAR(255) PRIMARY KEY, label TEXT, short TEXT, color TEXT,
    has_circle INT DEFAULT 0, type TEXT, taxonomy TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS domain_layout (
    domain_id VARCHAR(255) PRIMARY KEY, x INT, y INT
  )`,

  `CREATE TABLE IF NOT EXISTS organisations (
    id VARCHAR(255) PRIMARY KEY, name TEXT, acronym TEXT, shortname TEXT,
    location TEXT, summary TEXT, status TEXT, founded TEXT, founding_cell TEXT,
    member_count INT, website TEXT, logo TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS org_knowledge_domains (
    org_id VARCHAR(255) NOT NULL, domain VARCHAR(255) NOT NULL, PRIMARY KEY (org_id, domain)
  )`,

  // ── CIRCLES ──
  `CREATE TABLE IF NOT EXISTS circles (
    id VARCHAR(255) PRIMARY KEY, name TEXT, status TEXT, members INT, motions INT,
    description TEXT, founded TEXT, term_override TEXT, expiry_override TEXT, meta TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS circle_domains (
    id INT AUTO_INCREMENT PRIMARY KEY, circle_id VARCHAR(255) NOT NULL, domain VARCHAR(255) NOT NULL,
    mandate TEXT, desired_ws INT, UNIQUE(circle_id, domain, mandate)
  )`,

  `CREATE TABLE IF NOT EXISTS circle_roster (
    id INT AUTO_INCREMENT PRIMARY KEY, circle_id VARCHAR(255) NOT NULL, member_id VARCHAR(255) NOT NULL,
    name TEXT, initials TEXT, color TEXT, ws INT, status TEXT, joined TEXT,
    last_active TEXT, \`left\` TEXT, left_reason TEXT, top_domain TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS circle_roster_domains (
    roster_id INT NOT NULL, domain VARCHAR(255) NOT NULL, ws INT, PRIMARY KEY (roster_id, domain)
  )`,

  `CREATE TABLE IF NOT EXISTS circle_proposals (
    id VARCHAR(255) NOT NULL, circle_id VARCHAR(255) NOT NULL, title TEXT, status TEXT, date TEXT,
    PRIMARY KEY (id, circle_id)
  )`,

  `CREATE TABLE IF NOT EXISTS circle_resolutions (
    id VARCHAR(255) NOT NULL, circle_id VARCHAR(255) NOT NULL, title TEXT, date TEXT, type TEXT,
    PRIMARY KEY (id, circle_id)
  )`,

  `CREATE TABLE IF NOT EXISTS circle_activity (
    id INT AUTO_INCREMENT PRIMARY KEY, circle_id VARCHAR(255) NOT NULL, text TEXT, time TEXT, type TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS exit_reason_labels (
    \`key\` VARCHAR(255) PRIMARY KEY, label TEXT
  )`,

  // ── CELLS ──
  `CREATE TABLE IF NOT EXISTS cells (
    id VARCHAR(255) PRIMARY KEY, type TEXT, title TEXT, status TEXT, delib_type TEXT,
    participants INT, members INT, progress INT, days_active INT, lead TEXT, circle TEXT,
    created TEXT, deadline TEXT, blind INT DEFAULT 0, assessors INT, commissioned_by TEXT,
    resolution_ref TEXT, entity_type TEXT, source TEXT, resolution TEXT,
    deliverable_specs TEXT, meta TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS cell_domains (
    id INT AUTO_INCREMENT PRIMARY KEY, cell_id VARCHAR(255) NOT NULL, domain VARCHAR(255) NOT NULL,
    UNIQUE(cell_id, domain)
  )`,

  `CREATE TABLE IF NOT EXISTS cell_circles (
    id INT AUTO_INCREMENT PRIMARY KEY, cell_id VARCHAR(255) NOT NULL, circle_id TEXT,
    name TEXT, initials TEXT, gradient TEXT, status TEXT, role TEXT, votes INT
  )`,

  `CREATE TABLE IF NOT EXISTS cell_messages (
    id INT AUTO_INCREMENT PRIMARY KEY, cell_id VARCHAR(255) NOT NULL,
    author TEXT, initials TEXT, text TEXT, time TEXT, color TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS cell_tasks (
    id INT AUTO_INCREMENT PRIMARY KEY, cell_id VARCHAR(255) NOT NULL,
    task_id TEXT, label TEXT, status TEXT, locked INT DEFAULT 0, assignee TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS cell_objectives (
    id INT AUTO_INCREMENT PRIMARY KEY, cell_id VARCHAR(255) NOT NULL,
    obj_id TEXT, label TEXT, status TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS cell_team (
    id INT AUTO_INCREMENT PRIMARY KEY, cell_id VARCHAR(255) NOT NULL,
    name TEXT, initials TEXT, role TEXT, focus TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS draft_resolutions (
    id INT AUTO_INCREMENT PRIMARY KEY, cell_id VARCHAR(255) NOT NULL,
    res_id INT, title TEXT, text TEXT, action TEXT,
    votes_nullified INT DEFAULT 0, status TEXT DEFAULT 'draft',
    UNIQUE(cell_id, res_id)
  )`,

  `CREATE TABLE IF NOT EXISTS resolution_versions (
    id INT AUTO_INCREMENT PRIMARY KEY, draft_id INT NOT NULL,
    title TEXT, text TEXT, action TEXT, author TEXT, ts TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS resolution_implementing_circles (
    draft_id INT NOT NULL, circle_name VARCHAR(255) NOT NULL, PRIMARY KEY (draft_id, circle_name)
  )`,

  `CREATE TABLE IF NOT EXISTS cell_votes (
    id INT AUTO_INCREMENT PRIMARY KEY, cell_id VARCHAR(255) NOT NULL, domain VARCHAR(255) NOT NULL,
    yea INT, nay INT, total INT, UNIQUE(cell_id, domain)
  )`,

  `CREATE TABLE IF NOT EXISTS vote_records (
    id INT AUTO_INCREMENT PRIMARY KEY, cell_id VARCHAR(255) NOT NULL, domain VARCHAR(255) NOT NULL,
    name TEXT, initials TEXT, ws INT, vote TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS cell_vote_summary (
    cell_id VARCHAR(255) PRIMARY KEY, summary TEXT
  )`,

  // ── STFs ──
  `CREATE TABLE IF NOT EXISTS stfs (
    id VARCHAR(255) PRIMARY KEY, type TEXT, purpose TEXT, title TEXT,
    circle TEXT, deadline TEXT, status TEXT, bucket TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS stf_candidates (
    id VARCHAR(255) PRIMARY KEY, stf_id VARCHAR(255) NOT NULL, name TEXT, initials TEXT,
    match_score INT, interest_score INT, competence_score INT, status TEXT, invited_date TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS stf_candidate_domains (
    id INT AUTO_INCREMENT PRIMARY KEY, candidate_id VARCHAR(255) NOT NULL,
    domain VARCHAR(255) NOT NULL, UNIQUE(candidate_id, domain)
  )`,

  `CREATE TABLE IF NOT EXISTS stf_evidence (
    id INT AUTO_INCREMENT PRIMARY KEY, cell_id VARCHAR(255) NOT NULL,
    candidate TEXT, title TEXT NOT NULL, detail TEXT, link TEXT,
    status TEXT DEFAULT 'pending', submitted_by TEXT, submitted_at TEXT
  )`,

  // ── THREADS / INBOX / PUBLICATIONS / NEWS / EVENTS ──
  `CREATE TABLE IF NOT EXISTS threads (
    id VARCHAR(255) PRIMARY KEY, title TEXT, body TEXT, author TEXT, initials TEXT,
    avatar TEXT, domain TEXT, domain_color TEXT, badge TEXT, badge_class TEXT,
    replies INT, likes INT, shares INT, time TEXT, pinned INT DEFAULT 0,
    endorsements INT DEFAULT 0, proposal_cell_id TEXT, visibility TEXT DEFAULT 'public',
    jstf_cell_id TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS thread_endorsements (
    user_id VARCHAR(255) NOT NULL, thread_id VARCHAR(255) NOT NULL,
    created_at TEXT DEFAULT (NOW()), PRIMARY KEY (user_id, thread_id)
  )`,

  `CREATE TABLE IF NOT EXISTS thread_bookmarks (
    user_id VARCHAR(255) NOT NULL, thread_id VARCHAR(255) NOT NULL,
    created_at TEXT DEFAULT (NOW()), PRIMARY KEY (user_id, thread_id)
  )`,

  `CREATE TABLE IF NOT EXISTS thread_replies (
    id VARCHAR(255) PRIMARY KEY, thread_id VARCHAR(255) NOT NULL,
    author TEXT, initials TEXT, avatar TEXT, time TEXT, body TEXT, likes INT DEFAULT 0
  )`,

  `CREATE TABLE IF NOT EXISTS inbox (
    id VARCHAR(255) PRIMARY KEY, type TEXT, title TEXT, \`desc\` TEXT,
    time TEXT, badge TEXT, unread INT DEFAULT 1, detail TEXT, nav TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS inbox_actions (
    id INT AUTO_INCREMENT PRIMARY KEY, inbox_id VARCHAR(255) NOT NULL,
    label TEXT, style TEXT, action TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS inbox_meta (
    id INT AUTO_INCREMENT PRIMARY KEY, inbox_id VARCHAR(255) NOT NULL, label TEXT, value TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS publications (
    id INT AUTO_INCREMENT PRIMARY KEY, title TEXT, journal TEXT, date TEXT,
    views INT, downloads INT, type TEXT, abstract TEXT, tags TEXT, domain TEXT,
    status TEXT DEFAULT 'approved', author TEXT, created_at TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS publication_authors (
    publication_id INT NOT NULL, author VARCHAR(255) NOT NULL, PRIMARY KEY (publication_id, author)
  )`,

  `CREATE TABLE IF NOT EXISTS library_items (
    id INT AUTO_INCREMENT PRIMARY KEY, title TEXT, category TEXT, item_type TEXT,
    domain TEXT, link TEXT, curated_by TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS news (
    id INT AUTO_INCREMENT PRIMARY KEY, title TEXT, time TEXT, source TEXT,
    domain TEXT, body TEXT, curated_by TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS events (
    id INT AUTO_INCREMENT PRIMARY KEY, title TEXT, date TEXT, location TEXT,
    domain TEXT, type TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS opportunities (
    id INT AUTO_INCREMENT PRIMARY KEY, title TEXT, deadline TEXT, type TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(255) PRIMARY KEY, title TEXT, lead TEXT, progress INT, role TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS project_domains (
    project_id VARCHAR(255) NOT NULL, domain VARCHAR(255) NOT NULL, PRIMARY KEY (project_id, domain)
  )`,

  // ── CONFIG & MISC ──
  `CREATE TABLE IF NOT EXISTS system_settings (
    id INT PRIMARY KEY, steward_term_months INT, max_consecutive_terms INT,
    cooloff_months INT, p_astf_cycle_months INT, auto_expire_circles INT DEFAULT 0,
    default_circle_expiry_months INT
  )`,

  `CREATE TABLE IF NOT EXISTS stats (
    id INT PRIMARY KEY, stats TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS registration_domains (
    id INT AUTO_INCREMENT PRIMARY KEY, name TEXT, type TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS registration_meta (
    id INT PRIMARY KEY, elo_map TEXT, knowledge_levels TEXT,
    experiential_levels TEXT, default_interests TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS integrity_records (
    id VARCHAR(255) PRIMARY KEY, type TEXT, subject TEXT, purpose TEXT,
    circle TEXT, date TEXT, verdict TEXT, text TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS governance_events (
    id VARCHAR(255) PRIMARY KEY, type TEXT, circle TEXT, date TEXT,
    text TEXT, participant TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS circle_applications (
    id VARCHAR(255) PRIMARY KEY, circle_id TEXT, circle_name TEXT, applicant TEXT,
    initials TEXT, motivation TEXT, status TEXT, applied_date TEXT, queue_position INT
  )`,

  `CREATE TABLE IF NOT EXISTS circle_application_domains (
    id INT AUTO_INCREMENT PRIMARY KEY, app_id VARCHAR(255) NOT NULL,
    domain VARCHAR(255) NOT NULL, UNIQUE(app_id, domain)
  )`,

  `CREATE TABLE IF NOT EXISTS project_applications (
    id VARCHAR(255) PRIMARY KEY, cell_id TEXT, project_name TEXT, applicant TEXT,
    initials TEXT, motivation TEXT, status TEXT, applied_date TEXT, proposed_role TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS governance_ledger (
    id VARCHAR(255) PRIMARY KEY, type TEXT, target TEXT, settings TEXT,
    applied_by TEXT, applied_at TEXT, status TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS domain_layout_meta (
    id INT PRIMARY KEY, world_size INT, seeds TEXT, camera TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS auth_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(255) NOT NULL,
    token VARCHAR(255) NOT NULL UNIQUE, expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (NOW())
  )`,
];

// ═══════════════════════════════════════════════════════════════
// Seed data mapping — mock.json shape → MySQL tables
// ═══════════════════════════════════════════════════════════════

function j(v) { return v == null ? null : JSON.stringify(v); }
function esc(s) { return String(s || '').replace(/'/g, "''"); }

async function seed(pool, mock) {
  const all = async (sql, params) => { await pool.query(sql, params); };

  // ── Helper: batch insert with ON DUPLICATE KEY UPDATE (upsert) ──
  async function upsert(table, rows, cols) {
    if (!rows || !rows.length) return;
    const placeholders = cols.map(() => '?').join(',');
    const updates = cols.filter(c => c !== 'id' && !c.includes('UNIQUE')).map(c => `\`${c}\` = VALUES(\`${c}\`)`).join(',');
    const sql = `INSERT INTO \`${table}\` (${cols.map(c => '`' + c + '`').join(',')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates || 'id=id'}`;
    for (const row of rows) {
      const vals = cols.map(c => {
        let v = row[c] === undefined ? null : row[c];
        if (typeof v === 'boolean') v = v ? 1 : 0;
        if (typeof v === 'object' && v !== null) v = JSON.stringify(v);
        return v;
      });
      try { await pool.query(sql, vals); } catch (e) { /* skip duplicates or bad data */ }
    }
  }

  // ── Helper: raw insert (for tables with auto-increment IDs) ──
  async function insert(table, rows, cols) {
    if (!rows || !rows.length) return;
    const placeholders = cols.map(() => '?').join(',');
    const sql = `INSERT INTO \`${table}\` (${cols.map(c => '`' + c + '`').join(',')}) VALUES (${placeholders})`;
    for (const row of rows) {
      const vals = cols.map(c => {
        let v = row[c] === undefined ? null : row[c];
        if (typeof v === 'boolean') v = v ? 1 : 0;
        if (typeof v === 'object' && v !== null) v = JSON.stringify(v);
        return v;
      });
      try { await pool.query(sql, vals); } catch (e) { /* skip */ }
    }
  }

  // Users
  const users = mock.participants || [];
  await upsert('users', users.map(u => ({
    id: u.id, name: u.name, initials: u.initials,
    email: (u.id || '').toLowerCase() + '@solis.local',
    location: u.location, joined: u.joined, status: u.status || 'Active',
    standing: u.standing, competence: u.competence, bio: u.bio, essay: u.essay,
    avatar: j(u.avatar), is_current: u.is_current ? 1 : 0,
    password_hash: hashPassword('solis123'),
  })), ['id','name','initials','email','location','joined','status','standing','competence','bio','essay','avatar','is_current','password_hash']);

  // Participants (directory cards)
  await insert('participants', users.map(u => ({
    user_id: u.id, location: u.location, joined: u.joined, bio: u.bio,
  })), ['user_id','location','joined','bio']);

  // Domains
  const domains = mock.domains || {};
  const domainRows = Object.entries(domains).map(([id, d]) => ({
    id, label: d.label || id, short: d.short, color: d.color,
    has_circle: d.has_circle ? 1 : 0, type: d.type, taxonomy: d.taxonomy,
  }));
  await upsert('domains', domainRows, ['id','label','short','color','has_circle','type','taxonomy']);

  // Organisations
  const orgs = (mock.organisations || []).map(o => ({
    id: o.id, name: o.name, acronym: o.acronym, shortname: o.shortname,
    location: o.location, summary: o.summary, status: o.status,
    founded: o.founded, founding_cell: o.founding_cell,
    member_count: o.member_count, website: o.website, logo: j(o.logo),
  }));
  await upsert('organisations', orgs, ['id','name','acronym','shortname','location','summary','status','founded','founding_cell','member_count','website','logo']);

  // Circles
  const circles = mock.circles || [];
  await upsert('circles', circles.map(c => ({
    id: c.id, name: c.name, status: c.status, members: c.members,
    motions: c.motions, description: c.description, founded: c.founded,
    meta: j(c.meta),
  })), ['id','name','status','members','motions','description','founded','meta']);

  // Circle domains
  for (const c of circles) {
    if (c.domains && Array.isArray(c.domains)) {
      await insert('circle_domains', c.domains.map(d => ({
        circle_id: c.id, domain: typeof d === 'string' ? d : d.domain,
        mandate: typeof d === 'object' ? d.mandate : null,
      })), ['circle_id','domain','mandate']);
    }
  }

  // Circle roster
  for (const c of circles) {
    if (c.roster) {
      const rosterArray = Array.isArray(c.roster) ? c.roster
        : [...(c.roster.active || []), ...(c.roster.former || [])];
      await insert('circle_roster', rosterArray.map(r => ({
        circle_id: c.id, member_id: r.member_id || r.id, name: r.name,
        initials: r.initials, color: r.color, ws: r.ws, status: r.status,
        joined: r.joined, last_active: r.lastActive || r.last_active, top_domain: r.topDomain || r.top_domain,
      })), ['circle_id','member_id','name','initials','color','ws','status','joined','last_active','top_domain']);
    }
  }

  // Cells
  const cells = mock.cells || [];
  await upsert('cells', cells.map(c => ({
    id: c.id, type: c.type, title: c.title, status: c.status,
    delib_type: c.delib_type, participants: c.participants, members: c.members,
    progress: c.progress, days_active: c.days_active, lead: c.lead,
    circle: c.circle, created: c.created, deadline: c.deadline,
    blind: c.blind ? 1 : 0, assessors: c.assessors,
    commissioned_by: c.commissioned_by, resolution_ref: c.resolution_ref,
    source: j(c.source), resolution: j(c.resolution),
    deliverable_specs: j(c.deliverable_specs), meta: j(c.meta),
  })), ['id','type','title','status','delib_type','participants','members','progress','days_active','lead','circle','created','deadline','blind','assessors','commissioned_by','resolution_ref','source','resolution','deliverable_specs','meta']);

  // Cell domains
  for (const c of cells) {
    if (c.domains && Array.isArray(c.domains)) {
      await insert('cell_domains', c.domains.map(d => ({
        cell_id: c.id, domain: typeof d === 'string' ? d : d.domain || d,
      })), ['cell_id','domain']);
    }
  }

  // Cell team
  for (const c of cells) {
    if (c.team && Array.isArray(c.team)) {
      await insert('cell_team', c.team.map(t => ({
        cell_id: c.id, name: t.name, initials: t.initials, role: t.role, focus: t.focus,
      })), ['cell_id','name','initials','role','focus']);
    }
  }

  // STFs
  const stfs = mock.stfs || { pending: [], active: [], completed: [] };
  const allStfs = [...(stfs.pending || []), ...(stfs.active || []), ...(stfs.completed || [])];
  await upsert('stfs', allStfs.map(s => ({
    id: s.id, type: s.type, purpose: s.purpose, title: s.title,
    circle: s.circle, deadline: s.deadline, status: s.status,
    bucket: s.bucket || (stfs.pending.includes(s) ? 'pending' : stfs.active.includes(s) ? 'active' : 'completed'),
  })), ['id','type','purpose','title','circle','deadline','status','bucket']);

  // STF candidates
  for (const s of allStfs) {
    if (s.candidates && Array.isArray(s.candidates)) {
      await upsert('stf_candidates', s.candidates.map(c => ({
        id: c.id, stf_id: s.id, name: c.name, initials: c.initials,
        match_score: c.match_score, interest_score: c.interest_score,
        competence_score: c.competence_score, status: c.status,
        invited_date: c.invited_date,
      })), ['id','stf_id','name','initials','match_score','interest_score','competence_score','status','invited_date']);
    }
  }

  // Threads
  const threads = mock.threads || [];
  await upsert('threads', threads.map(t => ({
    id: t.id, title: t.title, body: t.body, author: t.author,
    initials: t.initials, avatar: j(t.avatar), domain: t.domain,
    domain_color: t.domain_color, badge: t.badge, badge_class: t.badge_class,
    replies: t.replies, likes: t.likes, shares: t.shares, time: t.time,
    pinned: t.pinned ? 1 : 0, endorsements: t.endorsements || 0,
    proposal_cell_id: t.proposal_cell_id, visibility: t.visibility || 'public',
    jstf_cell_id: t.jstf_cell_id,
  })), ['id','title','body','author','initials','avatar','domain','domain_color','badge','badge_class','replies','likes','shares','time','pinned','endorsements','proposal_cell_id','visibility','jstf_cell_id']);

  // Inbox
  const inbox = mock.inbox || [];
  await upsert('inbox', inbox.map(i => ({
    id: i.id, type: i.type, title: i.title, desc: i.desc,
    time: i.time, badge: i.badge, unread: i.unread ? 1 : 0,
    detail: j(i.detail), nav: i.nav,
  })), ['id','type','title','desc','time','badge','unread','detail','nav']);

  // Publications
  const pubs = mock.publications || [];
  await insert('publications', pubs.map(p => ({
    title: p.title, journal: p.journal, date: p.date, views: p.views,
    downloads: p.downloads, type: p.type, abstract: p.abstract,
    tags: j(p.tags), domain: p.domain, status: p.status || 'approved',
    author: p.author, created_at: p.created_at,
  })), ['title','journal','date','views','downloads','type','abstract','tags','domain','status','author','created_at']);

  // News
  const news = mock.news || [];
  await insert('news', news.map(n => ({
    title: n.title, time: n.time, source: n.source,
    domain: n.domain, body: n.body, curated_by: n.curated_by,
  })), ['title','time','source','domain','body','curated_by']);

  // Events
  const events = mock.events || [];
  await insert('events', events.map(e => ({
    title: e.title, date: e.date, location: e.location,
    domain: e.domain, type: e.type,
  })), ['title','date','location','domain','type']);

  // Opportunities
  const opps = mock.opportunities || [];
  await insert('opportunities', opps.map(o => ({
    title: o.title, deadline: o.deadline, type: o.type,
  })), ['title','deadline','type']);

  // Projects
  const projects = mock.projects || [];
  await upsert('projects', projects.map(p => ({
    id: p.id, title: p.title, lead: p.lead, progress: p.progress, role: p.role,
  })), ['id','title','lead','progress','role']);

  // Stats
  if (mock.stats) {
    await upsert('stats', [{ id: 1, stats: j(mock.stats) }], ['id','stats']);
  }

  // System settings
  if (mock.systemSettings) {
    const s = mock.systemSettings;
    await pool.query(
      `INSERT INTO system_settings (id, steward_term_months, max_consecutive_terms, cooloff_months, p_astf_cycle_months, auto_expire_circles, default_circle_expiry_months)
       VALUES (1, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE steward_term_months=VALUES(steward_term_months)`,
      [s.steward_term_months, s.max_consecutive_terms, s.cooloff_months,
       s.p_astf_cycle_months, s.auto_expire_circles ? 1 : 0, s.default_circle_expiry_months]
    );
  }

  // Registration
  if (mock.registration) {
    const r = mock.registration;
    if (r.domains) {
      await insert('registration_domains', r.domains.map(d => ({ name: d.name, type: d.type })), ['name','type']);
    }
    await pool.query(
      `INSERT INTO registration_meta (id, elo_map, knowledge_levels, experiential_levels, default_interests)
       VALUES (1, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE elo_map=VALUES(elo_map)`,
      [j(r.eloMap), j(r.knowledgeLevels), j(r.experientialLevels), j(r.defaultInterests)]
    );
  }

  // Governance events
  const govEvents = mock.governanceEvents || [];
  await upsert('governance_events', govEvents.map(g => ({
    id: g.id, type: g.type, circle: g.circle, date: g.date,
    text: g.text, participant: g.participant,
  })), ['id','type','circle','date','text','participant']);

  // Circle applications
  const circleApps = mock.circleApplications || [];
  await upsert('circle_applications', circleApps.map(a => ({
    id: a.id, circle_id: a.circleId, circle_name: a.circleName,
    applicant: a.applicant, initials: a.initials, motivation: a.motivation,
    status: a.status, applied_date: a.appliedDate, queue_position: a.queuePosition,
  })), ['id','circle_id','circle_name','applicant','initials','motivation','status','applied_date','queue_position']);

  // Integrity records
  const ir = mock.integrityRecords || [];
  await upsert('integrity_records', ir.map(r => ({
    id: r.id, type: r.type, subject: r.subject, purpose: r.purpose,
    circle: r.circle, date: r.date, verdict: r.verdict, text: r.text,
  })), ['id','type','subject','purpose','circle','date','verdict','text']);

  // Governance ledger
  const gl = mock.governanceLedger || [];
  await upsert('governance_ledger', gl.map(l => ({
    id: l.id, type: l.type, target: l.target, settings: j(l.settings),
    applied_by: l.appliedBy, applied_at: l.appliedAt, status: l.status,
  })), ['id','type','target','settings','applied_by','applied_at','status']);

  console.log('  ✓ Seed complete');
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log(`Connecting to MySQL at localhost:3306…`);

  // Connect without database first to create it
  const conn = await mysql.createConnection({
    host: 'localhost', port: 3306, user: 'root', charset: 'utf8mb4',
  });

  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${DB_NAME}\``);
  console.log(`  ✓ Database "${DB_NAME}" ready`);

  // Create tables
  console.log('  Creating tables…');
  for (const ddl of TABLES) {
    try { await conn.query(ddl); } catch (e) {
      if (!e.message.includes('Duplicate')) console.error('  ⚠ Table error:', e.message.substring(0, 120));
    }
  }
  console.log(`  ✓ ${TABLES.length} tables created`);

  // Load mock data
  console.log('  Loading mock.json…');
  const mock = JSON.parse(readFileSync(MOCK_PATH, 'utf-8'));

  // Create a pool for seeding (reuses the connection)
  const pool = conn;
  await seed(pool, mock);

  await conn.end();
  console.log('Done!');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
