// M12 — Participants & organisations audit
// user listing (credential hygiene) → participant projection → organisation
// writes → the authorization boundary on the generic user CRUD.
import {AUDIT, DB_AUDIT, req, login, sql, sqlRows, count, Report, spaSource, extractFn, REPO } from './lib.mjs';
import { readFileSync } from 'fs';
import vm from 'vm';

const r = new Report('m12-participants');

async function main() {
  const sd = await login(AUDIT, 'sd@solis.local');
  const zk = await login(AUDIT, 'zk@solis.local');
  const os = await login(AUDIT, 'os@solis.local');   // active member, no circle

  // ── 1. user listing and credential hygiene ────────────────────────────
  const anon = await req(AUDIT, 'GET', '/users');
  r.check('anonymous user listing -> 401', anon.status === 401, anon);
  const users = await req(AUDIT, 'GET', '/users', zk);
  r.check('a member can list participants', users.status === 200 && Array.isArray(users.j), users);
  const withHash = (users.j || []).filter(u => u.password_hash || u.passwordHash);
  r.check('no password hashes are exposed in the user list', withHash.length === 0,
    withHash.map(u => u.id));
  const one = await req(AUDIT, 'GET', '/users/sd', zk);
  r.check('a single user can be read', one.status === 200 && one.j.id === 'sd', one);
  r.check('the single-user payload carries no password hash',
    one.j && !one.j.password_hash && !one.j.passwordHash, one.j);

  // ── 2. the participant projection the UI renders ──────────────────────
  const bs = await req(AUDIT, 'GET', '/bootstrap', zk);
  const p = (bs.j.participants || []).find(x => x.id === 'sd');
  r.check('participants expose their circle membership', !!(p && p.circles && p.circles.length), p && p.circles);
  r.check('participants expose their domain competence', !!(p && p.domains && p.domains.length), p && p.domains);
  const sandbox = {
    document: { getElementById: () => ({ textContent: '', style: {}, innerHTML: '' }), querySelectorAll: () => [] },
    setText: (id, v) => { sandbox.__t[id] = String(v); },
    setHtml: (id, v) => { sandbox.__t[id] = String(v); },
    escapeHtml: s => s,
    MOCK: bs.j,
    __t: {},
    Number: Number, Math: Math, String: String, Array: Array, Object: Object, console: console
  };
  vm.createContext(sandbox);
  const loaderSrc = readFileSync(REPO + '/platform/mock-loader.js', 'utf8');
  vm.runInContext(extractFn(loaderSrc, 'renderParticipantCards'), sandbox);
  const cards = sandbox.renderParticipantCards();
  r.check('the participant grid renders names from the payload',
    /Ssempa David/.test(cards), cards.slice(0, 200));

  // ── 3. organisations ──────────────────────────────────────────────────
  const orgs = await req(AUDIT, 'GET', '/organisations', zk);
  r.check('organisations are listable', orgs.status === 200 && Array.isArray(orgs.j), orgs);
  const orgPatch = await req(AUDIT, 'PATCH', '/organisations/gss', sd, { summary: 'Audit M12 summary' });
  r.check('an organisation summary can be updated -> 200', orgPatch.status === 200, orgPatch);
  const orgRow = sqlRows(DB_AUDIT, "SELECT summary FROM organisations WHERE id='gss';")[0];
  r.check('the organisation change is persisted', orgRow && orgRow.summary === 'Audit M12 summary', orgRow);
  const countPatch = await req(AUDIT, 'PATCH', '/organisations/gss', zk, { member_count: 999999 });
  const countRow = sqlRows(DB_AUDIT, "SELECT member_count FROM organisations WHERE id='gss';")[0];
  r.check('the organisation member count is not client-writable',
    countRow && Number(countRow.member_count) !== 999999,
    { status: countPatch.status, member_count: countRow && countRow.member_count });

  // ── 4. the generic user CRUD authorization boundary ────────────────────
  const dmBefore = sqlRows(DB_AUDIT, "SELECT status FROM users WHERE id='dm';")[0];
  r.check('the seeded sanctioned member starts Restricted', dmBefore && dmBefore.status === 'Restricted', dmBefore);
  const lift = await req(AUDIT, 'PATCH', '/users/dm', os, { status: 'Active' });
  const dmAfter = sqlRows(DB_AUDIT, "SELECT status FROM users WHERE id='dm';")[0];
  r.check('an ordinary member cannot change another member\'s standing',
    !(lift.status === 200 && dmAfter && dmAfter.status === 'Active'),
    { status: lift.status, error: lift.j && lift.j.error, dmAfter });

  const rename = await req(AUDIT, 'PATCH', '/users/sd', os, { name: 'Audit Renamed' });
  const renamed = sqlRows(DB_AUDIT, "SELECT name FROM users WHERE id='sd';")[0];
  r.check('an ordinary member cannot rewrite another member\'s record',
    !(rename.status === 200 && renamed && renamed.name === 'Audit Renamed'),
    { status: rename.status, error: rename.j && rename.j.error, renamed });

  r.save();
  process.exit(r.failures.length ? 1 : 0);
}
main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
