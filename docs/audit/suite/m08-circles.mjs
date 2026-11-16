// M8 — Circles & membership audit
// A) roster management and the member-count contract
// B) applications
// C) judicial guards (forced removal / flush need a live case)
// D) resignation, drift, expiry
// E) staffing a newly created circle (F8)
// F) disbandment
import { AUDIT, DB_AUDIT, req, login, sql, sqlRows, count, Report } from './lib.mjs';

const r = new Report('m08-circles');

async function main() {
  const sd = await login(AUDIT, 'sd@solis.local');   // steward of space-law
  const zk = await login(AUDIT, 'zk@solis.local');   // steward of remote-sensing
  const os = await login(AUDIT, 'os@solis.local');   // active member, no circle
  const yd = await login(AUDIT, 'yd@solis.local');   // member of policy circle

  // ── A. roster management ──────────────────────────────────────────────
  const activeBefore = count(DB_AUDIT, 'circle_roster', "circle_id='remote-sensing' AND status='active'");
  const add = await req(AUDIT, 'POST', '/circles/remote-sensing/roster', zk, { member_id: 'ld', name: 'Lerato Dlamini', status: 'active' });
  r.check('a steward of that circle can add a roster row -> 201', add.status === 201, add);
  const activeAfter = count(DB_AUDIT, 'circle_roster', "circle_id='remote-sensing' AND status='active'");
  r.check('the roster grows by one', activeAfter === activeBefore + 1, { activeBefore, activeAfter });
  const membersCol = sqlRows(DB_AUDIT, "SELECT members FROM circles WHERE id='remote-sensing';")[0];
  r.check('circle.members is recomputed when a member is added',
    Number(membersCol.members) === activeAfter, { membersCol: membersCol.members, activeAfter });
  const ldTok = await login(AUDIT, 'ld@solis.local');
  const memberView = await req(AUDIT, 'GET', '/circles/remote-sensing/roster', zk);
  r.check('a member can read the roster', memberView.status === 200 && memberView.j.length > 0, memberView);
  const outsiderView = await req(AUDIT, 'GET', '/circles/remote-sensing/roster', os);
  r.check('a non-member sees an empty roster', outsiderView.status === 200 && outsiderView.j.length === 0, outsiderView);
  const anonView = await req(AUDIT, 'GET', '/circles/remote-sensing/roster');
  r.check('an anonymous roster read -> 401', anonView.status === 401, anonView);
  const notSteward = await req(AUDIT, 'POST', '/circles/remote-sensing/roster', os, { member_id: 'mn', name: 'Mensah Naa', status: 'active' });
  r.check('a non-steward cannot write that roster -> 403', notSteward.status === 403, notSteward);

  // ── B. applications ───────────────────────────────────────────────────
  const app = await req(AUDIT, 'POST', '/circle-applications', yd, { circle_id: 'remote-sensing', motivation: 'M8 apply' });
  r.check('a member can apply to a circle -> 201 + queue position',
    app.status === 201 && !!app.j.id && app.j.queuePosition >= 1, app);
  const appRow = sqlRows(DB_AUDIT, `SELECT status,queue_position,applicant FROM circle_applications WHERE id='${app.j.id}';`)[0];
  r.check('the application is stored as pending with a server queue number',
    appRow && appRow.status === 'pending' && Number(appRow.queue_position) === app.j.queuePosition, appRow);
  r.check('a duplicate application -> 409',
    (await req(AUDIT, 'POST', '/circle-applications', yd, { circle_id: 'remote-sensing', motivation: 'again' })).status === 409);
  r.check('an existing member cannot apply again -> 409',
    (await req(AUDIT, 'POST', '/circle-applications', zk, { circle_id: 'remote-sensing', motivation: 'already in' })).status === 409);
  const wrongWithdraw = await req(AUDIT, 'PATCH', `/circle-applications/${app.j.id}`, sd, { status: 'withdrawn' });
  r.check('only the applicant may withdraw an application -> 403', wrongWithdraw.status === 403, wrongWithdraw);
  const withdraw = await req(AUDIT, 'PATCH', `/circle-applications/${app.j.id}`, yd, { status: 'withdrawn' });
  r.check('the applicant can withdraw their own application -> 200', withdraw.status === 200, withdraw);
  const appAfter = sqlRows(DB_AUDIT, `SELECT status FROM circle_applications WHERE id='${app.j.id}';`)[0];
  r.check('the withdrawn application is stored as withdrawn', appAfter && appAfter.status === 'withdrawn', appAfter);

  // ── C. judicial guards ────────────────────────────────────────────────
  const noCaseRemove = await req(AUDIT, 'POST', '/circles/remote-sensing/remove-member', zk, { memberId: 'ld' });
  r.check('forced removal without a live jSTF case -> 403', noCaseRemove.status === 403, noCaseRemove);
  const noCaseFlush = await req(AUDIT, 'POST', '/circles/remote-sensing/flush', zk, { keepMemberId: 'zk' });
  r.check('circle flush without a live jSTF case -> 403', noCaseFlush.status === 403, noCaseFlush);
  const selfRemove = await req(AUDIT, 'POST', '/circles/remote-sensing/remove-member', zk, { memberId: 'zk' });
  r.check('a steward cannot force-remove themselves -> 400', selfRemove.status === 400, selfRemove);

  // ── D. resignation, drift, expiry ─────────────────────────────────────
  const resign = await req(AUDIT, 'POST', '/circles/remote-sensing/resign', ldTok);
  r.check('a member can resign -> 200', resign.status === 200, resign);
  const former = sqlRows(DB_AUDIT, "SELECT status,left_reason FROM circle_roster WHERE circle_id='remote-sensing' AND member_id='ld';")[0];
  r.check('the resigned member becomes a former roster row',
    former && former.status === 'former' && /resignation/.test(former.left_reason || ''), former);
  const membersNow = count(DB_AUDIT, 'circle_roster', "circle_id='remote-sensing' AND status='active'");
  const circleMembers = sqlRows(DB_AUDIT, "SELECT members FROM circles WHERE id='remote-sensing';")[0];
  r.check('circle.members is recomputed after a departure', Number(circleMembers.members) === membersNow, { circleMembers, membersNow });
  const meta = sqlRows(DB_AUDIT, "SELECT meta FROM circles WHERE id='remote-sensing';")[0];
  r.check('a succession vacancy is recorded', /vacancies/.test(meta.meta || '') && /resignation/.test(meta.meta || ''), meta && meta.meta);
  const act = sqlRows(DB_AUDIT, "SELECT text,type FROM circle_activity WHERE circle_id='remote-sensing';");
  r.check('the departure is written to the circle activity feed',
    act.some(a => /departed/.test(a.text || '') && a.type === 'membership'), act.slice(-3));

  await req(AUDIT, 'POST', '/circles/space-law/roster', sd, { member_id: 'ld', name: 'Lerato Dlamini', status: 'active' });
  const drift = await req(AUDIT, 'POST', '/circles/space-law/drift-check', sd, { threshold: 999999 });
  r.check('the drift check reports the expellitions it performed',
    drift.status === 200 && drift.j.threshold === 999999 && Array.isArray(drift.j.mandateDomains), drift);
  const driftedRow = sqlRows(DB_AUDIT, "SELECT status,left_reason FROM circle_roster WHERE circle_id='space-law' AND member_id='ld';")[0];
  r.check('a member below the bar is marked former',
    driftedRow && driftedRow.status === 'former' && /drift/.test(driftedRow.left_reason || ''), driftedRow);
  const expiry = await req(AUDIT, 'POST', '/circles/space-law/check-expiry', sd);
  r.check('the expiry sweep reports the effective term', expiry.status === 200 && expiry.j.termMonths >= 1, expiry);

  // ── E. staffing a newly created circle (F8) ───────────────────────────
  const create = await req(AUDIT, 'POST', '/circles', os, {
    id: 'audit-m8-circle', name: 'Audit M8 Circle', description: 'staffing probe', status: 'Suggested', members: 0
  });
  r.check('a member can create a circle -> 200/201', create.status === 200 || create.status === 201, create);
  const newCircle = sqlRows(DB_AUDIT, "SELECT id,status,members,meta FROM circles WHERE id='audit-m8-circle';")[0];
  r.check('the new circle starts with its founding steward seated',
    newCircle && Number(newCircle.members) === 1, newCircle);
  const founderRow = sqlRows(DB_AUDIT, "SELECT member_id,status FROM circle_roster WHERE circle_id='audit-m8-circle' AND status='active';");
  r.check('the founder is on the new circle roster',
    founderRow.length === 1 && founderRow[0].member_id === 'os', founderRow);
  const creatorRoster = await req(AUDIT, 'POST', '/circles/audit-m8-circle/roster', os, { member_id: 'os', name: 'Oumo Samuel', status: 'active' });
  r.check('the founder can seat themselves on the new circle -> 201', creatorRoster.status === 201, creatorRoster);
  const app2 = await req(AUDIT, 'POST', '/circle-applications', yd, { circle_id: 'audit-m8-circle', motivation: 'M8 join' });
  r.check('another member can apply to the new circle', app2.status === 201, app2);
  for (let i = 0; i < 3; i++) await req(AUDIT, 'GET', '/bootstrap', sd);   // runs the integrity engine
  const seated = count(DB_AUDIT, 'circle_roster', "circle_id='audit-m8-circle' AND status='active'");
  r.check('the new circle gains stewards (founder or vetted applicant)', seated >= 1,
    { seated, founderStatus: creatorRoster.status, applicantStatus: app2.status, meta: newCircle.meta });

  // ── F. disbandment ─────────────────────────────────────────────────────
  const disband = await req(AUDIT, 'POST', '/circles/remote-sensing/disband', zk, { reason: 'M8 audit disbandment' });
  r.check('a steward can disband the circle -> 200', disband.status === 200, disband);
  const archived = sqlRows(DB_AUDIT, "SELECT status,meta FROM circles WHERE id='remote-sensing';")[0];
  r.check('the circle is archived with a reason', archived && archived.status === 'Archived' && /M8 audit disbandment/.test(archived.meta || ''), archived);
  const archivedRoster = sqlRows(DB_AUDIT, "SELECT status FROM circle_roster WHERE circle_id='remote-sensing' AND status='active';");
  r.check('the roster is swept on disbandment', archivedRoster.length === 0, archivedRoster);
  const archivedWrite = await req(AUDIT, 'POST', '/circles/remote-sensing/roster', zk, { member_id: 'mn', name: 'Mensah Naa', status: 'active' });
  r.check('an archived circle rejects roster writes -> 403', archivedWrite.status === 403, archivedWrite);
  const archivedApp = await req(AUDIT, 'POST', '/circle-applications', os, { circle_id: 'remote-sensing', motivation: 'late' });
  r.check('an archived circle rejects applications -> 403', archivedApp.status === 403, archivedApp);
  const del = await req(AUDIT, 'DELETE', '/circles/remote-sensing', zk);
  r.check('a circle cannot be deleted, only disbanded -> 403', del.status === 403, del);

  r.save();
  process.exit(r.failures.length ? 1 : 0);
}

async function awaitLogin(email) {
  return await login(AUDIT, `${email}@solis.local`);
}
main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
