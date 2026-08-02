#!/usr/bin/env node
// seed.js — load mock.json into the SQLite database (normalized).
// Usage: node db/seed.js  (or server auto-runs on first boot)
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.SOLIS_DB || join(__dirname, '..', 'solis.db');
const SCHEMA = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
const MOCK = JSON.parse(readFileSync(join(__dirname, '..', 'mock.json'), 'utf8'));

const db = new DatabaseSync(DB_PATH);
db.exec(SCHEMA);
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA synchronous = NORMAL');
db.exec('BEGIN');

const N = (v) => (v === undefined ? null : v);
const run = (sql, params = []) => db.prepare(sql).run(...params.map(N));
const get = (sql, params = []) => db.prepare(sql).get(...params.map(N));
const all = (sql, params = []) => db.prepare(sql).all(...params.map(N));

// ── helpers ─────────────────────────────────────────────
const hashPassword = (pw) => createHash('sha256').update(String(pw)).digest('hex');

// ════════════════════════════════════════════════════════
// IDENTITY
// ════════════════════════════════════════════════════════

// users: merge currentUser + participants (currentUser wins)
const cu = MOCK.currentUser || {};
const participants = MOCK.participants || [];

const userMap = {}; // id -> user row
for (const p of participants) {
  userMap[p.id] = {
    id: p.id, name: p.name, initials: p.initials,
    email: (p.id || '').toLowerCase() + '@solis.local',
    location: p.location, joined: p.joined, status: 'Active',
    standing: null, competence: null, bio: p.bio, essay: null,
    avatar: JSON.stringify(p.avatar || {}),
    password_hash: hashPassword('solis123'),
  };
}
// currentUser fields override
if (cu.id && userMap[cu.id]) {
  Object.assign(userMap[cu.id], {
    location: cu.location ?? userMap[cu.id].location,
    joined: cu.joined ?? userMap[cu.id].joined,
    status: cu.status ?? 'Active',
    standing: cu.standing ?? null,
    standing_drift: cu.standingDrift ?? null,
    competence: cu.competence ?? null,
    competence_note: cu.competenceNote ?? null,
    interest_score: cu.interestScore ?? null,
    interest_drift: cu.interestDrift ?? null,
    active_roles: cu.activeRoles ?? null,
    roles_breakdown: cu.rolesBreakdown ?? null,
    bio: cu.bio ?? userMap[cu.id].bio,
    essay: cu.essay ?? null,
    email: 'os@solis.local',
    is_current: 1,
    password_hash: hashPassword('solis123'),
  });
}

for (const u of Object.values(userMap)) {
  run(`INSERT OR REPLACE INTO users
    (id,name,initials,email,location,joined,status,standing,standing_drift,competence,competence_note,
     interest_score,interest_drift,active_roles,roles_breakdown,bio,essay,avatar,is_current,password_hash)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [u.id, u.name, u.initials, u.email, u.location, u.joined, u.status,
     u.standing, u.standing_drift, u.competence, u.competence_note,
     u.interest_score, u.interest_drift, u.active_roles, u.roles_breakdown,
     u.bio, u.essay, u.avatar, u.is_current ?? 0, u.password_hash ?? null]);
}

// user_competence: from participants[].domains (name/ws/color)
for (const p of participants) {
  for (const d of (p.domains || [])) {
    run(`INSERT INTO user_competence (user_id, domain, ws, color, kind) VALUES (?,?,?,?,'roster')
         ON CONFLICT(user_id,domain) DO NOTHING`,
      [p.id, d.name, d.ws ?? null, d.color ?? null]);
  }
}
// currentUser domains: richer shape keyed by domain slug
if (cu.domains) {
  for (const [slug, d] of Object.entries(cu.domains)) {
    run(`INSERT INTO user_competence (user_id, domain, ws, wh, interest, bar_ws, bar_wh, members, kind)
         VALUES (?,?,?,?,?,?,?,?,'self') ON CONFLICT(user_id,domain) DO UPDATE SET
         ws=excluded.ws, wh=excluded.wh, interest=excluded.interest,
         bar_ws=excluded.bar_ws, bar_wh=excluded.bar_wh, members=excluded.members`,
      [cu.id, slug, d.ws ?? null, d.wh ?? null, d.interest ?? null,
       d.barWs ?? null, d.barWh ?? null, d.members ?? null]);
  }
}

// user_circles
if (cu.circles) {
  for (const c of cu.circles) {
    run(`INSERT INTO user_circles (user_id, circle, status, since, kind) VALUES (?,?,?,?,'self')
         ON CONFLICT(user_id,circle) DO NOTHING`,
      [cu.id, c.name, c.status ?? null, c.since ?? null]);
  }
}
for (const p of participants) {
  for (const c of (p.circles || [])) {
    run(`INSERT INTO user_circles (user_id, circle, kind) VALUES (?,?,'roster') ON CONFLICT DO NOTHING`, [p.id, c]);
  }
}
// user_orgs
for (const p of participants) {
  for (const o of (p.orgs || [])) {
    run(`INSERT INTO user_orgs (user_id, org_acronym) VALUES (?,?) ON CONFLICT DO NOTHING`, [p.id, o]);
  }
}
// participants: directory cards (location/joined/bio differ from login profile)
for (const p of participants) {
  run(`INSERT INTO participants (user_id, location, joined, bio) VALUES (?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET location=excluded.location, joined=excluded.joined, bio=excluded.bio`,
    [p.id, p.location ?? null, p.joined ?? null, p.bio ?? null]);
}
// user_activity: currentUser.activity feed
(cu.activity || []).forEach((a, i) => {
  run(`INSERT INTO user_activity (user_id, seq, text, time, type) VALUES (?,?,?,?,?)`,
    [cu.id, i, a.text, a.time, a.type]);
});

// organisations
for (const o of (MOCK.organisations || [])) {
  run(`INSERT OR REPLACE INTO organisations
    (id,name,acronym,shortname,location,summary,status,founded,founding_cell,member_count,website,logo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [o.id, o.name, o.acronym, o.shortname, o.location, o.summary,
     o.status, o.founded, o.foundingCell ?? null, o.memberCount ?? null,
     o.website ?? null, o.logo ?? null]);
  for (const d of (o.knowledgeDomains || [])) {
    run(`INSERT INTO org_knowledge_domains (org_id, domain) VALUES (?,?) ON CONFLICT DO NOTHING`, [o.id, d]);
  }
}

// domains catalog + layout
for (const [id, d] of Object.entries(MOCK.domains || {})) {
  run(`INSERT OR REPLACE INTO domains (id,label,short,color,has_circle,type,taxonomy)
       VALUES (?,?,?,?,?,?,?)`,
    [id, d.label ?? null, d.short ?? null, d.color ?? null,
     d.hasCircle ? 1 : 0, d.type ?? null, d.taxonomy ?? null]);
}
const layout = MOCK.domainLayout || {};
for (const [id, pos] of Object.entries(layout.seeds || {})) {
  if (Array.isArray(pos)) {
    run(`INSERT INTO domain_layout (domain_id, x, y) VALUES (?,?,?) ON CONFLICT(domain_id) DO UPDATE SET x=excluded.x, y=excluded.y`,
      [id, pos[0], pos[1]]);
  }
}
if (layout.worldSize) {
  run(`INSERT INTO domain_layout_meta (id, world_size, seeds, camera) VALUES (1,?,?,?)
       ON CONFLICT(id) DO UPDATE SET world_size=excluded.world_size, seeds=excluded.seeds, camera=excluded.camera`,
    [layout.worldSize, JSON.stringify(layout.seeds || {}), JSON.stringify(layout.camera || { x: 900, y: 900, scale: 0.5 })]);
}

// ════════════════════════════════════════════════════════
// CIRCLES
// ════════════════════════════════════════════════════════

for (const c of (MOCK.circles || [])) {
  run(`INSERT OR REPLACE INTO circles (id,name,status,members,motions,description,founded,term_override,expiry_override,meta)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [c.id, c.name, c.status, c.members, c.motions, c.description,
     c.founded ?? null,
     c.termOverride !== undefined && c.termOverride !== null ? JSON.stringify(c.termOverride) : null,
     c.expiryOverride !== undefined && c.expiryOverride !== null ? JSON.stringify(c.expiryOverride) : null,
     JSON.stringify({ maxMembers: c.maxMembers ?? null, archivedDate: c.archivedDate ?? null, archiveReason: c.archiveReason ?? null })]);

  const mandate = c.mandate || {};
  for (const d of (c.domains || [])) {
    run(`INSERT INTO circle_domains (circle_id, domain, mandate, desired_ws) VALUES (?,?,?,?)
         ON CONFLICT(circle_id,domain,mandate) DO NOTHING`,
      [c.id, d, null, null]);
  }
  for (const d of (mandate.primary || [])) {
    run(`INSERT INTO circle_domains (circle_id, domain, mandate, desired_ws) VALUES (?,?,?,?)
         ON CONFLICT(circle_id,domain,mandate) DO NOTHING`,
      [c.id, d, 'primary', (c.desiredWs || {})[d] ?? null]);
  }
  for (const d of (mandate.secondary || [])) {
    run(`INSERT INTO circle_domains (circle_id, domain, mandate, desired_ws) VALUES (?,?,?,?)
         ON CONFLICT(circle_id,domain,mandate) DO NOTHING`,
      [c.id, d, 'secondary', (c.desiredWs || {})[d] ?? null]);
  }

  const roster = c.roster || {};
  for (const m of (roster.active || [])) {
    const rid = run(`INSERT INTO circle_roster (circle_id,member_id,name,initials,color,ws,status,joined,last_active,top_domain)
                     VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [c.id, m.id ?? m.name, m.name, m.initials ?? null, m.color ?? null,
       m.ws ?? null, m.status ?? 'active', m.joined ?? null, m.lastActive ?? null, m.topDomain ?? null]).lastInsertRowid;
    (m.domains || []).forEach((d, i) => {
      run(`INSERT INTO circle_roster_domains (roster_id, domain, ws) VALUES (?,?,?)`,
        [rid, d, (m.domainWs || [])[i] ?? null]);
    });
  }
  for (const m of (roster.former || [])) {
    const rid = run(`INSERT INTO circle_roster (circle_id,member_id,name,initials,color,ws,status,joined,left,left_reason,top_domain)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [c.id, m.id ?? m.name, m.name, m.initials ?? null, m.color ?? null,
       m.ws ?? null, 'former', m.joined ?? null, m.left ?? null, m.leftReason ?? null, m.topDomain ?? null]).lastInsertRowid;
    (m.domains || []).forEach((d, i) => {
      run(`INSERT INTO circle_roster_domains (roster_id, domain, ws) VALUES (?,?,?)`,
        [rid, d, (m.domainWs || [])[i] ?? null]);
    });
  }

  for (const p of (c.proposals || [])) {
    run(`INSERT OR REPLACE INTO circle_proposals (id,circle_id,title,status,date) VALUES (?,?,?,?,?)`,
      [p.id, c.id, p.title, p.status, p.date ?? null]);
  }
  for (const r of (c.resolutions || [])) {
    run(`INSERT OR REPLACE INTO circle_resolutions (id,circle_id,title,date,type) VALUES (?,?,?,?,?)`,
      [r.id, c.id, r.title, r.date ?? null, r.type ?? null]);
  }
  for (const a of (c.activity || [])) {
    run(`INSERT INTO circle_activity (circle_id,text,time,type) VALUES (?,?,?,?)`,
      [c.id, a.text, a.time ?? null, a.type ?? null]);
  }
}

for (const [k, label] of Object.entries(MOCK.exitReasonLabels || {})) {
  run(`INSERT OR REPLACE INTO exit_reason_labels (key,label) VALUES (?,?)`, [k, label]);
}

// ════════════════════════════════════════════════════════
// CELLS
// ════════════════════════════════════════════════════════

for (const c of (MOCK.cells || [])) {
  run(`INSERT OR REPLACE INTO cells
    (id,type,title,status,delib_type,participants,members,progress,days_active,lead,circle,created,deadline,
     blind,assessors,commissioned_by,resolution_ref,entity_type,source,resolution,deliverable_specs,meta)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [c.id, c.type, c.title, c.status, c.delibType ?? null,
     c.participants ?? null, c.members ?? null, c.progress ?? null,
     c.daysActive ?? null, c.lead ?? null, c.circle ?? null,
     c.created ?? null, c.deadline ?? null,
     c.blind ? 1 : 0, c.assessors ?? null, c.commissionedBy ?? null,
     c.resolutionRef ?? null, c.entityType ?? null,
     c.source ? JSON.stringify(c.source) : null,
     c.resolution ? JSON.stringify(c.resolution) : null,
     c.deliverableSpecs ? JSON.stringify(c.deliverableSpecs) : null,
     JSON.stringify({
       settingsSnapshot: c.settingsSnapshot ?? null,
       settingsChanges: c.settingsChanges ?? null,
       circleDetails: c.circleDetails ?? null,
       orgDetails: c.orgDetails ?? null,
       projectDetails: c.projectDetails ?? null,
       publicationDetails: c.publicationDetails ?? null,
       archivedDate: c.archivedDate ?? null,
       deliverables: c.deliverables ?? null,
       supervisingCircle: c.supervisingCircle ?? null,
       cellType: c.cellType ?? null,
       proposalType: c.proposalType ?? null,
     })]);

  for (const d of (c.domains || [])) {
    run(`INSERT INTO cell_domains (cell_id, domain) VALUES (?,?) ON CONFLICT DO NOTHING`, [c.id, d]);
  }
  for (const cc of (c.circles || [])) {
    run(`INSERT INTO cell_circles (cell_id,name,initials,gradient,status,role) VALUES (?,?,?,?,?,?)`,
      [c.id, cc.name, cc.initials ?? null, cc.gradient ?? null, cc.status ?? null, cc.role ?? null]);
  }
  for (const cc of (c.participatingCircles || [])) {
    run(`INSERT INTO cell_circles (cell_id,circle_id,name,role,votes) VALUES (?,?,?,?,?)`,
      [c.id, cc.id ?? null, cc.name, cc.role ?? null, cc.votes ?? null]);
  }
  for (const m of (c.messages || [])) {
    run(`INSERT INTO cell_messages (cell_id,author,initials,text,time,color) VALUES (?,?,?,?,?,?)`,
      [c.id, m.author, m.initials ?? null, m.text, m.time ?? null, m.color ?? null]);
  }
  for (const t of (c.tasks || [])) {
    run(`INSERT INTO cell_tasks (cell_id,task_id,label,status,locked,assignee) VALUES (?,?,?,?,?,?)`,
      [c.id, t.id, t.label, t.status ?? null, t.locked ? 1 : 0, t.assignee ?? null]);
  }
  for (const o of (c.objectives || [])) {
    run(`INSERT INTO cell_objectives (cell_id,obj_id,label,status) VALUES (?,?,?,?)`,
      [c.id, o.id, o.label, o.status ?? null]);
  }
  for (const tm of (c.team || [])) {
    run(`INSERT INTO cell_team (cell_id,name,initials,role,focus) VALUES (?,?,?,?,?)`,
      [c.id, tm.name, tm.initials ?? null, tm.role ?? null, tm.focus ?? null]);
  }

  // draft resolutions + versions + implementing circles
  for (const dr of (c.draftResolutions || [])) {
    const did = run(`INSERT INTO draft_resolutions (cell_id,res_id,title,text,action,votes_nullified)
                     VALUES (?,?,?,?,?,?)`,
      [c.id, dr.id, dr.title, dr.text ?? null, dr.action ?? null,
       dr.votesNullified ? 1 : 0]).lastInsertRowid;
    for (const v of (dr.versions || [])) {
      run(`INSERT INTO resolution_versions (draft_id,title,text,action,author,ts) VALUES (?,?,?,?,?,?)`,
        [did, v.title ?? dr.title, v.text ?? '', v.action ?? '', v.author ?? null, v.ts ?? null]);
    }
    for (const ic of (dr.implementingCircles || [])) {
      run(`INSERT INTO resolution_implementing_circles (draft_id,circle_name) VALUES (?,?) ON CONFLICT DO NOTHING`,
        [did, ic]);
    }
  }

  // votes (object with domains[] + summary)
  const votes = c.votes;
  if (votes) {
    if (Array.isArray(votes.domains)) {
      for (const vd of votes.domains) {
        run(`INSERT INTO cell_votes (cell_id,domain,yea,nay,total) VALUES (?,?,?,?,?) ON CONFLICT(cell_id,domain) DO UPDATE SET
             yea=excluded.yea, nay=excluded.nay, total=excluded.total`,
          [c.id, vd.name, vd.yea ?? null, vd.nay ?? null, vd.total ?? null]);
        for (const vr of (vd.voters || [])) {
          run(`INSERT INTO vote_records (cell_id,domain,name,initials,ws,vote) VALUES (?,?,?,?,?,?)`,
            [c.id, vd.name, vr.name, vr.initials ?? null, vr.ws ?? null, vr.vote ?? null]);
        }
      }
    }
    if (votes.summary !== undefined) {
      run(`INSERT OR REPLACE INTO cell_vote_summary (cell_id,summary) VALUES (?,?)`,
        [c.id, JSON.stringify(votes.summary)]);
    }
  }
}

// ════════════════════════════════════════════════════════
// STFs
// ════════════════════════════════════════════════════════

for (const [bucket, list] of Object.entries(MOCK.stfs || {})) {
  for (const s of (list || [])) {
    run(`INSERT OR REPLACE INTO stfs (id,type,purpose,title,circle,deadline,status,bucket)
         VALUES (?,?,?,?,?,?,?,?)`,
      [s.id, s.type, s.purpose ?? null, s.title ?? s.candidate, s.circle ?? null,
       s.deadline ?? null, s.status ?? null, bucket]);
  }
}
for (const c of (MOCK.stfCandidates || [])) {
  run(`INSERT OR REPLACE INTO stf_candidates
    (id,stf_id,name,initials,match_score,interest_score,competence_score,status,invited_date)
    VALUES (?,?,?,?,?,?,?,?,?)`,
    [c.id, c.stfId, c.name, c.initials ?? null, c.matchScore ?? null,
     c.interestScore ?? null, c.competenceScore ?? null, c.status ?? null,
     c.invitedDate ?? null]);
  for (const d of (c.matchedDomains || [])) {
    run(`INSERT INTO stf_candidate_domains (candidate_id,domain) VALUES (?,?) ON CONFLICT DO NOTHING`, [c.id, d]);
  }
}

// ════════════════════════════════════════════════════════
// THREADS / INBOX / PUBLICATIONS / NEWS / EVENTS / OPPORTUNITIES / PROJECTS
// ════════════════════════════════════════════════════════

for (const t of (MOCK.threads || [])) {
  run(`INSERT OR REPLACE INTO threads
    (id,title,body,author,initials,avatar,domain,domain_color,badge,badge_class,replies,likes,shares,time,pinned)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [t.id, t.title, t.body ?? null, t.author, t.initials ?? null,
     t.avatar ? JSON.stringify(t.avatar) : null, t.domain ?? null,
     t.domainColor ?? null, t.badge ?? null, t.badgeClass ?? null,
     t.replies ?? 0, t.likes ?? 0, t.shares ?? 0, t.time ?? null, t.pinned ? 1 : 0]);
}

for (const i of (MOCK.inbox || [])) {
  run(`INSERT OR REPLACE INTO inbox (id,type,title,desc,time,badge,unread,detail,nav)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    [i.id, i.type, i.title, i.desc ?? null, i.time ?? null, i.badge ?? null,
     i.unread ? 1 : 0, i.detail ?? null, i.nav ?? null]);
  for (const a of (i.actions || [])) {
    run(`INSERT INTO inbox_actions (inbox_id,label,style,action) VALUES (?,?,?,?)`,
      [i.id, a.label, a.style ?? null, a.action ?? null]);
  }
  for (const m of (i.meta || [])) {
    run(`INSERT INTO inbox_meta (inbox_id,label,value) VALUES (?,?,?)`,
      [i.id, m.label, m.value ?? null]);
  }
}

for (const p of (MOCK.publications || [])) {
  const pid = run(`INSERT INTO publications (title,journal,date,views,downloads) VALUES (?,?,?,?,?)`,
    [p.title, p.journal ?? null, p.date ?? null, p.views ?? 0, p.downloads ?? 0]).lastInsertRowid;
  for (const a of (p.authors || [])) {
    run(`INSERT INTO publication_authors (publication_id,author) VALUES (?,?)`, [pid, a]);
  }
}

for (const n of (MOCK.news || [])) {
  run(`INSERT INTO news (title,time,source) VALUES (?,?,?)`, [n.title, n.time ?? null, n.source ?? null]);
}
for (const e of (MOCK.events || [])) {
  run(`INSERT INTO events (title,date,location) VALUES (?,?,?)`, [e.title, e.date ?? null, e.location ?? null]);
}
for (const o of (MOCK.opportunities || [])) {
  run(`INSERT INTO opportunities (title,deadline,type) VALUES (?,?,?)`, [o.title, o.deadline ?? null, o.type ?? null]);
}
for (const p of (MOCK.projects || [])) {
  run(`INSERT OR REPLACE INTO projects (id,title,lead,progress,role) VALUES (?,?,?,?,?)`,
    [p.id, p.title, p.lead ?? null, p.progress ?? null, p.role ?? null]);
  for (const d of (p.domains || [])) {
    run(`INSERT INTO project_domains (project_id,domain) VALUES (?,?) ON CONFLICT DO NOTHING`, [p.id, d]);
  }
}

// ════════════════════════════════════════════════════════
// CONFIG & MISC
// ════════════════════════════════════════════════════════

const ss = MOCK.systemSettings || {};
run(`INSERT OR REPLACE INTO system_settings
  (id,steward_term_months,max_consecutive_terms,cooloff_months,p_astf_cycle_months,auto_expire_circles,default_circle_expiry_months)
  VALUES (1,?,?,?,?,?,?)`,
  [ss.stewardTermMonths ?? null, ss.maxConsecutiveTerms ?? null,
   ss.cooloffMonths ?? null, ss.pAstfCycleMonths ?? null,
   ss.autoExpireCircles ? 1 : 0, ss.defaultCircleExpiryMonths ?? null]);

run(`INSERT OR REPLACE INTO stats (id,stats) VALUES (1,?)`, [JSON.stringify(MOCK.stats || {})]);

const reg = MOCK.registration || {};
for (const d of (reg.domains || [])) {
  run(`INSERT INTO registration_domains (name,type) VALUES (?,?)`,
    [d.name, d.type ?? null]);
}
run(`INSERT OR REPLACE INTO registration_meta (id,elo_map,knowledge_levels,experiential_levels,default_interests)
     VALUES (1,?,?,?,?)`,
  [JSON.stringify(reg.eloMap || {}),
   JSON.stringify(reg.knowledgeLevels || []),
   JSON.stringify(reg.experientialLevels || []),
   JSON.stringify(reg.defaultInterests || [])]);

for (const ir of (MOCK.integrityRecords || [])) {
  run(`INSERT OR REPLACE INTO integrity_records (id,type,subject,purpose,circle,date,verdict,text)
       VALUES (?,?,?,?,?,?,?,?)`,
    [ir.id, ir.type, ir.subject ?? null, ir.purpose ?? null, ir.circle ?? null,
     ir.date ?? null, ir.verdict ?? null, ir.text ?? null]);
}
for (const ge of (MOCK.governanceEvents || [])) {
  run(`INSERT OR REPLACE INTO governance_events (id,type,circle,date,text,participant)
       VALUES (?,?,?,?,?,?)`,
    [ge.id, ge.type, ge.circle ?? null, ge.date ?? null, ge.text ?? null, ge.participant ?? null]);
}
for (const ca of (MOCK.circleApplications || [])) {
  run(`INSERT OR REPLACE INTO circle_applications
    (id,circle_id,circle_name,applicant,initials,motivation,status,applied_date,queue_position)
    VALUES (?,?,?,?,?,?,?,?,?)`,
    [ca.id, ca.circleId ?? null, ca.circleName ?? null, ca.applicant,
     ca.initials ?? null, ca.motivation ?? null, ca.status ?? null,
     ca.appliedDate ?? null, ca.queuePosition ?? null]);
  for (const d of (ca.relevantDomains || [])) {
    run(`INSERT INTO circle_application_domains (app_id,domain) VALUES (?,?) ON CONFLICT DO NOTHING`, [ca.id, d]);
  }
}
for (const pa of (MOCK.projectApplications || [])) {
  run(`INSERT OR REPLACE INTO project_applications
    (id,cell_id,project_name,applicant,initials,motivation,status,applied_date,proposed_role)
    VALUES (?,?,?,?,?,?,?,?,?)`,
    [pa.id, pa.cellId ?? null, pa.projectName ?? null, pa.applicant,
     pa.initials ?? null, pa.motivation ?? null, pa.status ?? null,
     pa.appliedDate ?? null, pa.proposedRole ?? null]);
}
for (const gl of (MOCK.governanceLedger || [])) {
  run(`INSERT OR REPLACE INTO governance_ledger (id,type,target,settings,applied_by,applied_at,status)
       VALUES (?,?,?,?,?,?,?)`,
    [gl.id, gl.type, gl.target ?? null,
     gl.settings ? JSON.stringify(gl.settings) : null,
     gl.appliedBy ?? null, gl.appliedAt ?? null, gl.status ?? null]);
}

// ── summary ─────────────────────────────────────────────
db.exec('COMMIT');
const counts = {};
for (const t of ['users','circles','cells','stfs','threads','inbox','publications']) {
  counts[t] = all(`SELECT COUNT(*) AS n FROM ${t}`)[0].n;
}
console.log('Seeded', DB_PATH, '=>', JSON.stringify(counts));
db.close();
