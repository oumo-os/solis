// M14 — Competence, profile & governance records audit
// standings → endorsement → drift → settings read/write → governance record
// CRUD boundaries.
import { AUDIT, DB_AUDIT, req, login, sql, sqlRows, count, Report } from './lib.mjs';

const r = new Report('m14-competence-settings');

async function main() {
  const sd = await login(AUDIT, 'sd@solis.local');   // steward
  const zk = await login(AUDIT, 'zk@solis.local');   // member
  const os = await login(AUDIT, 'os@solis.local');   // member of no circle

  // ── 1. competence standings ───────────────────────────────────────────
  const anon = await req(AUDIT, 'GET', '/competence/standing');
  r.check('anonymous standings read -> 401', anon.status === 401, anon);
  const st = await req(AUDIT, 'GET', '/competence/standing', zk);
  r.check('a member can read the standings', st.status === 200 && Array.isArray(st.j.standings), st);
  const sdStanding = (st.j.standings || []).find(s => s.id === 'sd');
  r.check('the standings carry a per-domain breakdown',
    sdStanding && Array.isArray(sdStanding.domains) && sdStanding.domains.length > 0, sdStanding);
  r.check('the standing total is derived from the domain rows',
    sdStanding && Number(sdStanding.standing) === sdStanding.domains.reduce((s, d) => s + Number(d.ws || 0), 0),
    sdStanding && { standing: sdStanding.standing, domains: sdStanding.domains.length });

  // ── 2. self-declaration and endorsement ───────────────────────────────
  const decl = await req(AUDIT, 'POST', '/competence/declare-wh', zk, { domain: 'Policy', wh: 700, evidence: 'M14 evidence' });
  r.check('a member can declare a hard competence', decl.status === 200 || decl.status === 201, decl);
  const declRow = sqlRows(DB_AUDIT, "SELECT domain,wh,verified FROM user_competence WHERE user_id='zk' AND domain='Policy';")[0];
  r.check('the declaration is stored as unverified', declRow && Number(declRow.wh) === 700 && Number(declRow.verified) === 0, declRow);

  const before = sqlRows(DB_AUDIT, "SELECT ws FROM user_competence WHERE user_id='zk' AND domain='Policy';")[0];
  const endorse = await req(AUDIT, 'POST', '/competence/endorse', sd, { targetId: 'zk', domain: 'Policy' });
  const after = sqlRows(DB_AUDIT, "SELECT ws FROM user_competence WHERE user_id='zk' AND domain='Policy';")[0];
  r.check('a steward can endorse a member (+50 Ws)',
    endorse.status === 200 && Number(after.ws) === Number(before.ws) + 50, { endorse, before, after });
  const endorseDenied = await req(AUDIT, 'POST', '/competence/endorse', os, { userId: 'zk', domain: 'Policy' });
  r.check('a member of no circle cannot endorse -> 403', endorseDenied.status === 403, endorseDenied);

  const drift = await req(AUDIT, 'POST', '/competence/ws-drift', sd);
  r.check('a steward can run the competence drift pass', drift.status === 200, drift);
  r.check('a member of no circle cannot run the drift pass -> 403',
    (await req(AUDIT, 'POST', '/competence/ws-drift', os)).status === 403);

  // ── 3. system settings ────────────────────────────────────────────────
  const get = await req(AUDIT, 'GET', '/system-settings');
  r.check('system settings are readable anonymously', get.status === 200, get);
  const beforeVal = sqlRows(DB_AUDIT, 'SELECT jstf_duration_days FROM system_settings WHERE id=1;')[0];
  const anonWrite = await req(AUDIT, 'PATCH', '/system-settings', null, { jstf_duration_days: 99 });
  const afterVal = sqlRows(DB_AUDIT, 'SELECT jstf_duration_days FROM system_settings WHERE id=1;')[0];
  r.check('system settings cannot be changed without a token -> 401/403',
    !(anonWrite.status === 200 && String(afterVal.jstf_duration_days) === '99'),
    { status: anonWrite.status, error: anonWrite.j && anonWrite.j.error, beforeVal, afterVal });

  // ── 4. governance records ─────────────────────────────────────────────
  for (const table of ['policies', 'integrity-records', 'governance-events', 'governance-ledger', 'exit-reason-labels']) {
    const res = await req(AUDIT, 'GET', '/' + table, zk);
    r.check(`${table} are listable for a member`, res.status === 200 && Array.isArray(res.j), { table, status: res.status });
  }
  const pol = (await req(AUDIT, 'GET', '/policies', zk)).j[0];
  const editPol = await req(AUDIT, 'PATCH', '/policies/' + pol.id, os, { status: 'Revoked' });
  const polAfter = sqlRows(DB_AUDIT, `SELECT status FROM policies WHERE id='${pol.id}';`)[0];
  r.check('an ordinary member cannot rewrite a policy record -> 403',
    !(editPol.status === 200 && polAfter && polAfter.status === 'Revoked'),
    { status: editPol.status, error: editPol.j && editPol.j.error, polAfter });

  // ── 5. the stats endpoint serves a seeded fixture ─────────────────────
  const stats = await req(AUDIT, 'GET', '/stats');
  r.check('the stats endpoint responds', stats.status === 200, stats.status);
  const statBlob = JSON.stringify(stats.j || {});
  r.note('GET /stats returns: ' + statBlob.slice(0, 220));

  r.save();
  process.exit(r.failures.length ? 1 : 0);
}
main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
