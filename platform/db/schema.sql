PRAGMA foreign_keys = ON;

-- ═══════════════════════════════════════════════════════════════
-- IDENTITY
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  initials       TEXT,
  email          TEXT UNIQUE,
  location       TEXT,
  joined         TEXT,
  status         TEXT,
  standing       INTEGER,
  standing_drift TEXT,
  competence     INTEGER,
  competence_note TEXT,
  interest_score INTEGER,
  interest_drift TEXT,
  active_roles   INTEGER,
  roles_breakdown TEXT,
  bio            TEXT,
  essay          TEXT,
  avatar         TEXT,          -- JSON: { gold: bool, gradient: string }
  is_current     INTEGER DEFAULT 0,  -- 1 = the signed-in mock user
  password_hash  TEXT,               -- for auth; seeded users may be null
  created_at     TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_competence (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain     TEXT NOT NULL,       -- display name e.g. 'Space Law'
  ws         INTEGER,
  wh         INTEGER,
  interest   INTEGER,
  bar_ws     INTEGER,
  bar_wh     INTEGER,
  members    INTEGER,
  color      TEXT,
  rank       INTEGER,
  kind       TEXT DEFAULT 'roster', -- 'roster' = participants[].domains; 'self' = currentUser.domains
  UNIQUE(user_id, domain)
);

CREATE TABLE IF NOT EXISTS user_circles (
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  circle   TEXT NOT NULL,          -- display name e.g. 'SL Circle'
  status   TEXT,
  since    TEXT,
  kind     TEXT DEFAULT 'roster',  -- 'roster' = participants[].circles; 'self' = currentUser.circles
  PRIMARY KEY (user_id, circle)
);

CREATE TABLE IF NOT EXISTS user_orgs (
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_acronym TEXT NOT NULL,
  PRIMARY KEY (user_id, org_acronym)
);

CREATE TABLE IF NOT EXISTS participants (
  user_id  TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  location TEXT,               -- directory card (differs from login profile)
  joined   TEXT,
  bio      TEXT
);

CREATE TABLE IF NOT EXISTS user_activity (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seq     INTEGER NOT NULL DEFAULT 0,
  text    TEXT,
  time    TEXT,
  type    TEXT
);

CREATE TABLE IF NOT EXISTS domains (
  id         TEXT PRIMARY KEY,     -- e.g. 'astronomy-astrophysics'
  label      TEXT,
  short      TEXT,
  color      TEXT,
  has_circle INTEGER DEFAULT 0,
  type       TEXT,
  taxonomy   TEXT
);

CREATE TABLE IF NOT EXISTS domain_layout (
  domain_id TEXT PRIMARY KEY REFERENCES domains(id) ON DELETE CASCADE,
  x         INTEGER,
  y         INTEGER
);

CREATE TABLE IF NOT EXISTS organisations (
  id              TEXT PRIMARY KEY,
  name            TEXT,
  acronym         TEXT,
  shortname       TEXT,
  location        TEXT,
  summary         TEXT,
  status          TEXT,
  founded         TEXT,
  founding_cell   TEXT,
  member_count    INTEGER,
  website         TEXT,
  logo            TEXT
);

CREATE TABLE IF NOT EXISTS org_knowledge_domains (
  org_id   TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  domain   TEXT NOT NULL,
  PRIMARY KEY (org_id, domain)
);

-- ═══════════════════════════════════════════════════════════════
-- CIRCLES
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS circles (
  id              TEXT PRIMARY KEY,
  name            TEXT,
  status          TEXT,
  members         INTEGER,
  motions         INTEGER,
  description     TEXT,
  founded         TEXT,
  term_override   TEXT,
  expiry_override TEXT,
  meta            TEXT            -- JSON catch-all (maxMembers, archivedDate, ...)
);

CREATE TABLE IF NOT EXISTS circle_domains (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  circle_id   TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  domain      TEXT NOT NULL,
  mandate     TEXT,        -- 'primary' | 'secondary' | NULL (general)
  desired_ws  INTEGER,
  UNIQUE(circle_id, domain, mandate)
);

CREATE TABLE IF NOT EXISTS circle_roster (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  circle_id  TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  member_id  TEXT NOT NULL,       -- from roster entries (may be id or name)
  name       TEXT,
  initials   TEXT,
  color      TEXT,
  ws         INTEGER,
  status     TEXT,                -- 'active' | 'former'
  joined     TEXT,
  last_active TEXT,
  left       TEXT,
  left_reason TEXT,
  top_domain  TEXT
);

CREATE TABLE IF NOT EXISTS circle_roster_domains (
  roster_id  INTEGER NOT NULL REFERENCES circle_roster(id) ON DELETE CASCADE,
  domain     TEXT NOT NULL,
  ws         INTEGER,
  PRIMARY KEY (roster_id, domain)
);

CREATE TABLE IF NOT EXISTS circle_proposals (
  id       TEXT NOT NULL,
  circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  title    TEXT,
  status   TEXT,
  date     TEXT,
  PRIMARY KEY (id, circle_id)
);

CREATE TABLE IF NOT EXISTS circle_resolutions (
  id       TEXT NOT NULL,
  circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  title    TEXT,
  date     TEXT,
  type     TEXT,
  PRIMARY KEY (id, circle_id)
);

CREATE TABLE IF NOT EXISTS circle_activity (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  text      TEXT,
  time      TEXT,
  type      TEXT
);

CREATE TABLE IF NOT EXISTS exit_reason_labels (
  key   TEXT PRIMARY KEY,
  label TEXT
);

-- ═══════════════════════════════════════════════════════════════
-- CELLS (all 6 types unified) + sub-tables
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cells (
  id               TEXT PRIMARY KEY,
  type             TEXT,           -- Project|Circle|Deliberation|aSTF|xSTF|Founding Cell
  title            TEXT,
  status           TEXT,
  delib_type       TEXT,
  participants     INTEGER,
  members          INTEGER,
  progress         INTEGER,
  days_active      INTEGER,
  lead             TEXT,
  circle           TEXT,
  created          TEXT,
  deadline         TEXT,
  blind            INTEGER DEFAULT 0,
  assessors        INTEGER,
  commissioned_by  TEXT,
  resolution_ref   TEXT,
  entity_type      TEXT,
  source           TEXT,           -- JSON { type, proposer }
  resolution       TEXT,           -- JSON { status }
  deliverable_specs TEXT,          -- JSON for xSTF cells
  meta             TEXT            -- JSON catch-all
);

CREATE TABLE IF NOT EXISTS cell_domains (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  cell_id  TEXT NOT NULL REFERENCES cells(id) ON DELETE CASCADE,
  domain   TEXT NOT NULL,
  UNIQUE(cell_id, domain)
);

CREATE TABLE IF NOT EXISTS cell_circles (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  cell_id   TEXT NOT NULL REFERENCES cells(id) ON DELETE CASCADE,
  circle_id TEXT,
  name      TEXT,
  initials  TEXT,
  gradient  TEXT,
  status    TEXT,               -- 'active' | 'self-disqualified' ...
  role      TEXT,               -- 'Lead' | 'Contributing' | 'Withdrew'
  votes     INTEGER
);

CREATE TABLE IF NOT EXISTS cell_messages (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  cell_id  TEXT NOT NULL REFERENCES cells(id) ON DELETE CASCADE,
  author   TEXT,
  initials TEXT,
  text     TEXT,
  time     TEXT,
  color    TEXT
);

CREATE TABLE IF NOT EXISTS cell_tasks (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  cell_id  TEXT NOT NULL REFERENCES cells(id) ON DELETE CASCADE,
  task_id  TEXT,
  label    TEXT,
  status   TEXT,
  locked   INTEGER DEFAULT 0,
  assignee TEXT
);

CREATE TABLE IF NOT EXISTS cell_objectives (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  cell_id  TEXT NOT NULL REFERENCES cells(id) ON DELETE CASCADE,
  obj_id   TEXT,
  label    TEXT,
  status   TEXT
);

CREATE TABLE IF NOT EXISTS cell_team (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  cell_id  TEXT NOT NULL REFERENCES cells(id) ON DELETE CASCADE,
  name     TEXT,
  initials TEXT,
  role     TEXT,
  focus    TEXT
);

CREATE TABLE IF NOT EXISTS draft_resolutions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  cell_id       TEXT NOT NULL REFERENCES cells(id) ON DELETE CASCADE,
  res_id        INTEGER,
  title         TEXT,
  text          TEXT,
  action        TEXT,
  votes_nullified INTEGER DEFAULT 0,
  UNIQUE(cell_id, res_id)
);

CREATE TABLE IF NOT EXISTS resolution_versions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_id    INTEGER NOT NULL REFERENCES draft_resolutions(id) ON DELETE CASCADE,
  title       TEXT,
  text        TEXT,
  action      TEXT,
  author      TEXT,
  ts          TEXT
);

CREATE TABLE IF NOT EXISTS resolution_implementing_circles (
  draft_id    INTEGER NOT NULL REFERENCES draft_resolutions(id) ON DELETE CASCADE,
  circle_name TEXT NOT NULL,
  PRIMARY KEY (draft_id, circle_name)
);

CREATE TABLE IF NOT EXISTS cell_votes (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  cell_id  TEXT NOT NULL REFERENCES cells(id) ON DELETE CASCADE,
  domain   TEXT NOT NULL,
  yea      INTEGER,
  nay      INTEGER,
  total    INTEGER,
  UNIQUE(cell_id, domain)
);

CREATE TABLE IF NOT EXISTS vote_records (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  cell_id  TEXT NOT NULL REFERENCES cells(id) ON DELETE CASCADE,
  domain   TEXT NOT NULL,
  name     TEXT,
  initials TEXT,
  ws       INTEGER,
  vote     TEXT
);

CREATE TABLE IF NOT EXISTS cell_vote_summary (
  cell_id   TEXT PRIMARY KEY REFERENCES cells(id) ON DELETE CASCADE,
  summary   TEXT                 -- JSON
);

-- ═══════════════════════════════════════════════════════════════
-- STFs
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS stfs (
  id       TEXT PRIMARY KEY,
  type     TEXT,               -- vSTF|aSTF|jSTF|xSTF|p-aSTF
  purpose  TEXT,
  title    TEXT,
  circle   TEXT,
  deadline TEXT,
  status   TEXT,
  bucket   TEXT                -- pending|active|completed
);

CREATE TABLE IF NOT EXISTS stf_candidates (
  id              TEXT PRIMARY KEY,
  stf_id          TEXT NOT NULL REFERENCES stfs(id) ON DELETE CASCADE,
  name            TEXT,
  initials        TEXT,
  match_score     INTEGER,
  interest_score  INTEGER,
  competence_score INTEGER,
  status          TEXT,
  invited_date    TEXT
);

CREATE TABLE IF NOT EXISTS stf_candidate_domains (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id TEXT NOT NULL REFERENCES stf_candidates(id) ON DELETE CASCADE,
  domain       TEXT NOT NULL,
  UNIQUE(candidate_id, domain)
);

-- ═══════════════════════════════════════════════════════════════
-- THREADS / INBOX / PUBLICATIONS / NEWS / EVENTS / OPPORTUNITIES
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS threads (
  id           TEXT PRIMARY KEY,
  title        TEXT,
  body         TEXT,
  author       TEXT,
  initials     TEXT,
  avatar       TEXT,          -- JSON
  domain       TEXT,
  domain_color TEXT,
  badge        TEXT,
  badge_class  TEXT,
  replies      INTEGER,
  likes        INTEGER,
  shares       INTEGER,
  time         TEXT,
  pinned       INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS inbox (
  id     TEXT PRIMARY KEY,
  type   TEXT,
  title  TEXT,
  desc   TEXT,
  time   TEXT,
  badge  TEXT,
  unread INTEGER DEFAULT 1,
  detail TEXT,
  nav    TEXT
);

CREATE TABLE IF NOT EXISTS inbox_actions (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  inbox_id TEXT NOT NULL REFERENCES inbox(id) ON DELETE CASCADE,
  label    TEXT,
  style    TEXT,
  action   TEXT
);

CREATE TABLE IF NOT EXISTS inbox_meta (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  inbox_id TEXT NOT NULL REFERENCES inbox(id) ON DELETE CASCADE,
  label    TEXT,
  value    TEXT
);

CREATE TABLE IF NOT EXISTS publications (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  title     TEXT,
  journal   TEXT,
  date      TEXT,
  views     INTEGER,
  downloads INTEGER
);

CREATE TABLE IF NOT EXISTS publication_authors (
  publication_id INTEGER NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  author         TEXT NOT NULL,
  PRIMARY KEY (publication_id, author)
);

CREATE TABLE IF NOT EXISTS news (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  title  TEXT,
  time   TEXT,
  source TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  title    TEXT,
  date     TEXT,
  location TEXT
);

CREATE TABLE IF NOT EXISTS opportunities (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  title    TEXT,
  deadline TEXT,
  type     TEXT
);

CREATE TABLE IF NOT EXISTS projects (
  id       TEXT PRIMARY KEY,
  title    TEXT,
  lead     TEXT,
  progress INTEGER,
  role     TEXT
);

CREATE TABLE IF NOT EXISTS project_domains (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  domain     TEXT NOT NULL,
  PRIMARY KEY (project_id, domain)
);

-- ═══════════════════════════════════════════════════════════════
-- CONFIG & MISC COLLECTIONS
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS system_settings (
  id                        INTEGER PRIMARY KEY CHECK (id = 1),
  steward_term_months       INTEGER,
  max_consecutive_terms     INTEGER,
  cooloff_months            INTEGER,
  p_astf_cycle_months       INTEGER,
  auto_expire_circles       INTEGER DEFAULT 0,
  default_circle_expiry_months INTEGER
);

CREATE TABLE IF NOT EXISTS stats (
  id      INTEGER PRIMARY KEY CHECK (id = 1),
  stats   TEXT              -- JSON blob mirroring mock stats object
);

CREATE TABLE IF NOT EXISTS registration_domains (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT,
  type  TEXT
);

CREATE TABLE IF NOT EXISTS registration_meta (
  id       INTEGER PRIMARY KEY CHECK (id = 1),
  elo_map  TEXT,             -- JSON
  knowledge_levels TEXT,     -- JSON
  experiential_levels TEXT,  -- JSON
  default_interests TEXT     -- JSON
);

CREATE TABLE IF NOT EXISTS integrity_records (
  id      TEXT PRIMARY KEY,
  type    TEXT,
  subject TEXT,
  purpose TEXT,
  circle  TEXT,
  date    TEXT,
  verdict TEXT,
  text    TEXT
);

CREATE TABLE IF NOT EXISTS governance_events (
  id          TEXT PRIMARY KEY,
  type        TEXT,
  circle      TEXT,
  date        TEXT,
  text        TEXT,
  participant TEXT
);

CREATE TABLE IF NOT EXISTS circle_applications (
  id               TEXT PRIMARY KEY,
  circle_id        TEXT,
  circle_name      TEXT,
  applicant        TEXT,
  initials         TEXT,
  motivation       TEXT,
  status           TEXT,
  applied_date     TEXT,
  queue_position   INTEGER
);

CREATE TABLE IF NOT EXISTS circle_application_domains (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id  TEXT NOT NULL REFERENCES circle_applications(id) ON DELETE CASCADE,
  domain  TEXT NOT NULL,
  UNIQUE(app_id, domain)
);

CREATE TABLE IF NOT EXISTS project_applications (
  id           TEXT PRIMARY KEY,
  cell_id      TEXT,
  project_name TEXT,
  applicant    TEXT,
  initials     TEXT,
  motivation   TEXT,
  status       TEXT,
  applied_date TEXT,
  proposed_role TEXT
);

CREATE TABLE IF NOT EXISTS governance_ledger (
  id         TEXT PRIMARY KEY,
  type       TEXT,
  target     TEXT,
  settings   TEXT,           -- JSON
  applied_by TEXT,
  applied_at TEXT,
  status     TEXT
);

CREATE TABLE IF NOT EXISTS domain_layout_meta (
  id        INTEGER PRIMARY KEY CHECK (id = 1),
  world_size INTEGER,
  seeds     TEXT,            -- JSON
  camera    TEXT             -- JSON: { x, y, scale }
);

-- ═══════════════════════════════════════════════════════════════
-- AUTH
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS auth_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
