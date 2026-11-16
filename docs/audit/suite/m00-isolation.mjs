// m00 — harness isolation proof: writes through the audit API must land in
// solis_audit only, never in the live solis database.
import { AUDIT, LIVE, DB_LIVE, DB_AUDIT, req, login, sql, sqlRows, count, Report } from './lib.mjs';

const r = new Report('m00-isolation');

async function main() {
  // 1. both APIs answer
  const liveBs = await req(LIVE, 'GET', '/bootstrap');
  const auditBs = await req(AUDIT, 'GET', '/bootstrap');
  r.check('live bootstrap 200', liveBs.status === 200, liveBs.status);
  r.check('audit bootstrap 200', auditBs.status === 200, auditBs.status);

  // 2. identical data at start
  const same = ['users', 'circles', 'cells', 'threads', 'vote_records', 'cell_votes'].every(t =>
    count(DB_LIVE, t) === count(DB_AUDIT, t));
  r.check('live and audit DBs start identical', same, {
    live: ['users', 'circles', 'cells', 'threads', 'vote_records', 'cell_votes'].map(t => t + '=' + count(DB_LIVE, t)),
    audit: ['users', 'circles', 'cells', 'threads', 'vote_records', 'cell_votes'].map(t => t + '=' + count(DB_AUDIT, t))
  });

  // 3. login writes an auth_token row -> must land in audit DB only
  const beforeLive = count(DB_LIVE, 'auth_tokens');
  const beforeAudit = count(DB_AUDIT, 'auth_tokens');
  const tok = await login(AUDIT, 'sd@solis.local');
  r.check('audit login returns token', !!tok, 'no token');
  const afterLive = count(DB_LIVE, 'auth_tokens');
  const afterAudit = count(DB_AUDIT, 'auth_tokens');
  r.check('login leaves live DB token table untouched', afterLive === beforeLive,
    { beforeLive, afterLive });
  r.check('login touches audit DB token table (prunes expired / adds row)', afterAudit !== beforeAudit,
    { beforeAudit, afterAudit });

  // 4. a domain write through the audit API lands only in audit DB
  const probeId = 'audit-probe-circle';
  const mk = await req(AUDIT, 'POST', '/circles', tok, {
    id: probeId, name: 'Audit Probe Circle', description: 'isolation probe', status: 'Active', members: 0
  });
  r.check('POST /circles via audit API succeeds', mk.status === 201 || mk.status === 200, mk);
  r.check('probe circle exists in audit DB', count(DB_AUDIT, 'circles', `id='${probeId}'`) === 1,
    count(DB_AUDIT, 'circles', `id='${probeId}'`));
  r.check('probe circle absent from live DB', count(DB_LIVE, 'circles', `id='${probeId}'`) === 0,
    count(DB_LIVE, 'circles', `id='${probeId}'`));

  // 5. cleanup
  sql(DB_AUDIT, `DELETE FROM circles WHERE id='${probeId}';`);
  r.check('probe circle cleaned up', count(DB_AUDIT, 'circles', `id='${probeId}'`) === 0, 'still present');

  // 6. live API still points at the live DB
  const liveProbe = await req(LIVE, 'POST', '/circles', tok, { id: 'audit-probe-circle', name: 'x' });
  r.note('live POST /circles with audit token -> ' + liveProbe.status + ' (expect 401: token not valid in live DB)');
  r.check('audit token rejected by live API', liveProbe.status === 401, liveProbe);

  r.save();
  process.exit(r.failures.length ? 1 : 0);
}
main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
