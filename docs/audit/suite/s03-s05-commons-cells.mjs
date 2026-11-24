// S3 + S5 — the Commons feed and the cell workspaces
// S3: thread composition, engagement and raising a proposal.
// S5: project cell workspaces and the now-wired composer posting through the SPA.
import { AUDIT, DB_AUDIT, req, login, sql, sqlRows, count, Report, bootApp } from './lib.mjs';

const s03 = new Report('s03-commons');
const s05 = new Report('s05-cells');

async function main() {
  const sd = await login(AUDIT, 'sd@solis.local');
  const os = await login(AUDIT, 'os@solis.local');

  // ── S3: composition and engagement ───────────────────────────────────
  const th = await req(AUDIT, 'POST', '/threads', os, {
    id: 's03-thread', title: 'S03 Discussion', body: 'A discussion body',
    author: 'Oumo Samuel', initials: 'OS', badge: '', badge_class: '',
    replies: 0, likes: 0, shares: 0, time: 'now'
  });
  s03.check('a member opens a discussion thread', th.status === 201, th);
  const rep = await req(AUDIT, 'POST', '/threads/s03-thread/replies', sd, {
    author: 'Ssempa David', initials: 'SD', text: 'S03 reply', time: 'now', likes: 0
  });
  s03.check('a steward replies to the thread', rep.status === 201, rep);
  const end = await req(AUDIT, 'POST', '/threads/s03-thread/endorsement', sd);
  s03.check('endorsement is recorded and the counter is refreshed',
    end.status === 200 && end.j.endorsed === true && end.j.endorsements === 1, end);
  const bm = await req(AUDIT, 'POST', '/threads/s03-thread/bookmark', sd);
  s03.check('bookmarking works', bm.status === 200 && bm.j.bookmarked === true, bm);
  const pin = await req(AUDIT, 'POST', '/threads/s03-thread/pin', sd);
  s03.check('a steward may pin a thread', pin.status === 200 && pin.j.pinned === true, pin);
  const bs0 = await req(AUDIT, 'GET', '/bootstrap', sd);
  s03.check('the new thread reaches the bootstrap feed',
    (bs0.j.threads || []).some(t => t.id === 's03-thread'), (bs0.j.threads || []).map(t => t.id));
  const proposal = await req(AUDIT, 'POST', '/threads/s03-thread/raise-proposal', sd);
  s03.check('a stewarded thread can be raised into a deliberation cell',
    proposal.status === 201 && !!proposal.j.cellId, proposal);
  s03.check('raising it twice is refused', (await req(AUDIT, 'POST', '/threads/s03-thread/raise-proposal', sd)).status === 409);

  // ── S5: the workspaces and the wired composer ─────────────────────────
  const proj = sqlRows(DB_AUDIT, "SELECT id FROM cells WHERE type='Project Cell' AND status='Active' LIMIT 1;")[0];
  s05.check('an active project cell exists', !!proj, proj);
  s05.check('the project cell has objectives', count(DB_AUDIT, 'cell_objectives', `cell_id='${proj.id}'`) > 0,
    count(DB_AUDIT, 'cell_objectives', `cell_id='${proj.id}'`));
  s05.check('the project cell has tasks', count(DB_AUDIT, 'cell_tasks', `cell_id='${proj.id}'`) > 0,
    count(DB_AUDIT, 'cell_tasks', `cell_id='${proj.id}'`));

  const bs = await req(AUDIT, 'GET', '/bootstrap', sd);
  const { sandbox } = bootApp(sd, AUDIT);
  sandbox.MOCK = bs.j;   // the SPA has currentUser from the bootstrap
  const before = count(DB_AUDIT, 'cell_messages', `cell_id='${proj.id}'`);
  sandbox.document.getElementById('s05-composer').value = 'Posted through the cell composer';
  sandbox.postCellMessage(proj.id, 's05-composer', function() {});
  await new Promise(res => setTimeout(res, 600));
  const after = count(DB_AUDIT, 'cell_messages', `cell_id='${proj.id}'`);
  s05.check('the composer posts through the real SPA handler into the API', after === before + 1, { before, after });
  const row = sqlRows(DB_AUDIT, `SELECT author,text FROM cell_messages WHERE cell_id='${proj.id}' ORDER BY id DESC LIMIT 1;`)[0];
  s05.check('the posted message carries the signed-in member',
    row && row.author === 'Ssempa David' && /composer/.test(row.text || ''), row);

  s03.save();
  s05.save();
  process.exit((s03.failures.length + s05.failures.length) ? 1 : 0);
}
main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
