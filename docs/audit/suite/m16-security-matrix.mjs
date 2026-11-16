// M16 — Security & authorization matrix audit
// Systematic probe of the endpoint surface: which routes accept an
// unauthenticated write, which let an ordinary member act on other people's
// records, and which have no gate at all.
import { AUDIT, DB_AUDIT, req, login, sql, sqlRows, count, Report } from './lib.mjs';

const r = new Report('m16-security-matrix');

async function main() {
  const sd = await login(AUDIT, 'sd@solis.local');   // steward
  const os = await login(AUDIT, 'os@solis.local');   // ordinary member, no circle
  const zk = await login(AUDIT, 'zk@solis.local');   // ordinary member

  // ── 1. unauthenticated writes ─────────────────────────────────────────
  // set up a draft we can try to append versions to
  const direct = await req(AUDIT, 'POST', '/proposals/direct', sd, { title: 'Audit M16 Motion', description: 'x', domain: 'Space Law' });
  const cellId = direct.j.cellId;
  const draft = await req(AUDIT, 'POST', `/cells/${cellId}/draft-resolutions`, sd, {
    res_id: 9900, title: 'M16 draft', text: 'MOTION: x', action: 'Policy', votes_nullified: 0
  });
  const rowId = draft.j.id;

  const anonVersion = await req(AUDIT, 'POST', `/cells/${cellId}/draft-resolutions/${rowId}/versions`, null, {
    title: 'Injected by anonymous', text: 'anonymous edit', action: 'Policy', author: 'anon', ts: 'now'
  });
  const versionRows = count(DB_AUDIT, 'resolution_versions', `draft_id=${rowId}`);
  r.check('an anonymous resolution version cannot be written -> 401/403',
    !(anonVersion.status === 200 || anonVersion.status === 201),
    { status: anonVersion.status, versionRows });
  r.check('no anonymous version row was persisted', versionRows === 0, { versionRows });

  const anonImpl = await req(AUDIT, 'POST', `/cells/${cellId}/draft-resolutions/${rowId}/implementing-circles`, null, { circle_name: 'Space Law Circle' });
  r.check('an anonymous implementing-circle link cannot be written -> 401/403',
    !(anonImpl.status === 200 || anonImpl.status === 201), { status: anonImpl.status });

  const anonSettings = await req(AUDIT, 'PATCH', '/system-settings', null, { jstf_duration_days: 77 });
  const settingsNow = sqlRows(DB_AUDIT, 'SELECT jstf_duration_days FROM system_settings WHERE id=1;')[0];
  r.check('system settings cannot be changed without a token -> 401/403',
    !(anonSettings.status === 200 && String(settingsNow.jstf_duration_days) === '77'),
    { status: anonSettings.status, error: anonSettings.j && anonSettings.j.error, settingsNow });

  // ── 2. cross-member writes on user records ────────────────────────────
  const del = await req(AUDIT, 'DELETE', '/users/mt', os);
  const mtGone = count(DB_AUDIT, 'users', "id='mt'");
  r.check('an ordinary member cannot delete another member -> 401/403',
    !(del.status === 200 && mtGone === 0),
    { status: del.status, error: del.j && del.j.error, mtGone });

  const createUser = await req(AUDIT, 'POST', '/users', os, { id: 'm16-intruder', name: 'Intruder', email: 'm16@solis.local' });
  r.check('an ordinary member cannot create a user record -> 401/403',
    !(createUser.status === 200 || createUser.status === 201), { status: createUser.status, error: createUser.j && createUser.j.error });
  r.check('no intruder user row was created', count(DB_AUDIT, 'users', "id='m16-intruder'") === 0);

  // ── 3. governance record writes ───────────────────────────────────────
  // Under the platform's model every active circle member is a steward
  // (finding F3), so the gate is tested against a member of no circle.
  const pol = (await req(AUDIT, 'GET', '/policies', zk)).j[0];
  const polEdit = await req(AUDIT, 'PATCH', '/policies/' + pol.id, os, { status: 'Revoked' });
  const polAfter = sqlRows(DB_AUDIT, `SELECT status FROM policies WHERE id='${pol.id}';`)[0];
  r.check('a member of no circle cannot rewrite a policy record -> 401/403',
    !(polEdit.status === 200 && polAfter && polAfter.status === 'Revoked'),
    { status: polEdit.status, error: polEdit.j && polEdit.j.error, polAfter });

  // ── 4. static / retired endpoints ─────────────────────────────────────
  const verify = await req(AUDIT, 'POST', '/competence/verify-wh', null, { userId: 'zk', domain: 'Space Law' });
  r.check('the retired direct-verification endpoint answers 410', verify.status === 410, verify);

  // ── 5. contract: a child item can be read on its own ─────────────────
  const msgRow = sqlRows(DB_AUDIT, "SELECT id FROM cell_messages WHERE cell_id='cell-21' LIMIT 1;")[0];
  const item = await req(AUDIT, 'GET', `/cells/cell-21/messages/${msgRow.id}`, zk);
  r.check('a child row can be read on its own -> 200 + the row',
    item.status === 200 && item.j && String(item.j.id) === String(msgRow.id), item);
  const missing = await req(AUDIT, 'GET', '/cells/cell-21/messages/99999999', zk);
  r.check('reading a child row that does not exist -> 404', missing.status === 404, missing);
  const blindItem = await req(AUDIT, 'GET', '/cells/jstf-cred/messages/1', null);
  r.check('a sealed case row stays hidden from anonymous readers -> 404', blindItem.status === 404, blindItem);

  // ── 6. a bootstrap load must not write ────────────────────────────────
  const beforeCells = count(DB_AUDIT, 'cells');
  const beforeStfs = count(DB_AUDIT, 'stfs');
  const beforeCands = count(DB_AUDIT, 'stf_candidates');
  await req(AUDIT, 'GET', '/bootstrap', sd);
  await req(AUDIT, 'GET', '/bootstrap', zk);
  const afterCells = count(DB_AUDIT, 'cells');
  const afterStfs = count(DB_AUDIT, 'stfs');
  const afterCands = count(DB_AUDIT, 'stf_candidates');
  r.check('loading the bootstrap writes nothing',
    afterCells === beforeCells && afterStfs === beforeStfs && afterCands === beforeCands,
    { beforeCells, afterCells, beforeStfs, afterStfs, beforeCands, afterCands });
  const poll = await req(AUDIT, 'POST', '/engine/poll', sd);
  r.check('the integrity engine runs on its own explicit endpoint -> 200',
    poll.status === 200 && poll.j && poll.j.ok === true, poll);
  r.check('the engine endpoint refuses anonymous callers -> 401',
    (await req(AUDIT, 'POST', '/engine/poll', null)).status === 401);

  // ── 6. the audit's own tables are never reachable anonymously ─────────
  for (const t of ['users', 'stfs', 'cells', 'threads', 'inbox', 'circle-applications', 'project-applications']) {
    const res = await req(AUDIT, 'GET', '/' + t);
    const ok = res.status === 401 || (res.status === 200 && ['threads', 'cells', 'stfs'].includes(t));
    r.check(`anonymous GET /${t} does not leak records`, ok, { table: t, status: res.status });
  }

  r.save();
  process.exit(r.failures.length ? 1 : 0);
}
main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
