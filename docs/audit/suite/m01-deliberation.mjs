// M1 — Deliberation lifecycle audit
// proposal creation (direct / thread / system) → deliberation → objectives →
// draft resolution → versions → submit → aSTF motion-audit spawn.
import { AUDIT, DB_AUDIT, req, login, sql, sqlRows, count, Report } from './lib.mjs';

const r = new Report('m01-deliberation');

async function main() {
  const sd = await login(AUDIT, 'sd@solis.local');   // steward of space-law
  const os = await login(AUDIT, 'os@solis.local');   // no circle roster (non-steward)
  const zk = await login(AUDIT, 'zk@solis.local');   // active member (remote-sensing)

  // ── 1. direct proposal ────────────────────────────────────────────────
  const direct = await req(AUDIT, 'POST', '/proposals/direct', sd, {
    title: 'Audit M1 Direct Proposal', description: 'lifecycle probe', domain: 'Space Law'
  });
  r.check('steward POST /proposals/direct -> 201 + cellId', direct.status === 201 && !!direct.j.cellId, direct);
  const cellId = direct.j.cellId;
  const cellRow = sqlRows(DB_AUDIT, `SELECT type,status,delib_type,participants,resolution,source FROM cells WHERE id='${cellId}';`)[0];
  r.check('direct proposal persists a Deliberation Cell',
    cellRow && cellRow.type === 'Deliberation Cell' && cellRow.status === 'Active' && cellRow.delib_type === 'direct-proposal',
    cellRow);
  r.check('direct proposal starts with a Draft resolution', cellRow && /"status":"Draft"/.test(cellRow.resolution || ''), cellRow && cellRow.resolution);
  r.check('direct proposal records proposer in source', cellRow && /direct-proposal/.test(cellRow.source || ''), cellRow && cellRow.source);

  const anonDirect = await req(AUDIT, 'POST', '/proposals/direct', null, { title: 'x' });
  r.check('anonymous POST /proposals/direct -> 401', anonDirect.status === 401, anonDirect);
  const nonStewardDirect = await req(AUDIT, 'POST', '/proposals/direct', os, { title: 'x' });
  r.check('non-steward POST /proposals/direct -> 403', nonStewardDirect.status === 403, nonStewardDirect);

  // ── 2. thread → proposal ──────────────────────────────────────────────
  const th = await req(AUDIT, 'POST', '/threads', sd, {
    id: 'audit-m1-thread', title: 'Audit M1 Thread', body: 'probe body',
    author: 'Audit Steward', initials: 'AS', replies: 0, likes: 0, shares: 0, time: 'now'
  });
  r.check('POST /threads -> 201', th.status === 201, th);
  const raise = await req(AUDIT, 'POST', '/threads/audit-m1-thread/raise-proposal', sd);
  r.check('steward raise-proposal -> 201 + cellId', raise.status === 201 && !!raise.j.cellId, raise);
  const raised = sqlRows(DB_AUDIT, 'SELECT proposal_cell_id FROM threads WHERE id=\'audit-m1-thread\';')[0];
  r.check('thread back-links to the created deliberation cell',
    raised && raised.proposal_cell_id === (raise.j.cellId || ''), raised);
  const raiseTwice = await req(AUDIT, 'POST', '/threads/audit-m1-thread/raise-proposal', sd);
  r.check('raise-proposal twice -> 409', raiseTwice.status === 409, raiseTwice);

  // ── 3. system proposal ────────────────────────────────────────────────
  const sys = await req(AUDIT, 'POST', '/proposals/system', sd, {
    delibType: 'system-settings', title: 'Audit M1 Settings Proposal',
    sourceType: 'settings-proposal', snapshot: { stewardTermMonths: 18 }
  });
  r.check('steward POST /proposals/system (system-settings) -> 201', sys.status === 201, sys);
  const sysRow = sqlRows(DB_AUDIT, `SELECT delib_type,meta FROM cells WHERE id='${sys.j.cellId}';`)[0];
  r.check('system proposal stores the settings snapshot',
    sysRow && /stewardTermMonths/.test(sysRow.meta || ''), sysRow && sysRow.meta);
  const csTarget = await req(AUDIT, 'POST', '/proposals/system', sd, {
    delibType: 'circle-settings', title: 'Audit M1 Circle Settings', snapshot: { target: 'freq' }
  });
  r.check('circle-settings proposal for a non-stewarded circle -> 403', csTarget.status === 403, csTarget);
  const csOk = await req(AUDIT, 'POST', '/proposals/system', sd, {
    delibType: 'circle-settings', title: 'Audit M1 Circle Settings', snapshot: { target: 'space-law' }
  });
  r.check('circle-settings proposal for a stewarded circle -> 201', csOk.status === 201, csOk);
  const badType = await req(AUDIT, 'POST', '/proposals/system', sd, { delibType: 'nonsense', title: 'x' });
  r.check('proposals/system rejects unknown delibType -> 400', badType.status === 400, badType);

  // ── 4. deliberation content (messages + objectives) ───────────────────
  // Participation follows domains: the deliberation's topic is Space Law, so
  // a member with standing there speaks and one without is refused.
  const aj = await login(AUDIT, 'aj@solis.local');   // Space Law 1800
  const nc = await login(AUDIT, 'nc@solis.local');   // Publications, Space Med
  const msg = await req(AUDIT, 'POST', `/cells/${cellId}/messages`, aj, {
    author: 'Akello Jane', initials: 'AJ', text: 'Deliberation input for the audit.', time: 'now'
  });
  r.check('a member with standing in the topic can post a deliberation message -> 201', msg.status === 201, msg);
  r.check('message persisted', count(DB_AUDIT, 'cell_messages', `cell_id='${cellId}'`) === 1,
    count(DB_AUDIT, 'cell_messages', `cell_id='${cellId}'`));
  const offTopic = await req(AUDIT, 'POST', `/cells/${cellId}/messages`, nc, {
    author: 'Namugga Claire', initials: 'NC', text: 'Outside my domains.', time: 'now'
  });
  r.check('a member without standing in the topic cannot post -> 403', offTopic.status === 403, offTopic);
  const obj = await req(AUDIT, 'POST', `/cells/${cellId}/objectives`, zk, { label: 'Audit objective', status: 'open' });
  r.check('objective can be added -> 201', obj.status === 201, obj);
  const msgsGet = await req(AUDIT, 'GET', `/cells/${cellId}/messages`, zk);
  r.check('GET messages returns the stored row',
    msgsGet.status === 200 && Array.isArray(msgsGet.j) && msgsGet.j.length === 1, msgsGet);

  // ── 5. draft resolution ───────────────────────────────────────────────
  const draft = await req(AUDIT, 'POST', `/cells/${cellId}/draft-resolutions`, sd, {
    res_id: 9001, title: 'Audit M1 Draft Resolution',
    text: 'MOTION: audit probe', action: 'Policy', votes_nullified: 0
  });
  r.check('steward can create a draft resolution -> 201', draft.status === 201, draft);
  const rowId = draft.j && draft.j.id;
  const draftRow = sqlRows(DB_AUDIT, `SELECT status,title,res_id FROM draft_resolutions WHERE id=${rowId};`)[0];
  r.check('draft persisted with status draft', draftRow && draftRow.status === 'draft', draftRow);
  const draftGet = await req(AUDIT, 'GET', `/cells/${cellId}/draft-resolutions`, sd);
  r.check('draft list returns the draft',
    draftGet.status === 200 && draftGet.j.some(d => String(d.id) === String(rowId)), draftGet);
  const draftPatch = await req(AUDIT, 'PATCH', `/cells/${cellId}/draft-resolutions/${rowId}`, sd, { title: 'Audit M1 Draft (edited)' });
  r.check('draft can be edited -> 200', draftPatch.status === 200 && /edited/.test(draftPatch.j.title || ''), draftPatch);

  // versions + implementing circles (dedicated child route)
  const ver = await req(AUDIT, 'POST', `/cells/${cellId}/draft-resolutions/${rowId}/versions`, sd, {
    title: 'Audit M1 Draft Resolution', text: 'MOTION: v1', action: 'Policy', author: 'AI Drafter', ts: 'now'
  });
  r.check('version append -> 201', ver.status === 201, ver);
  r.check('version persisted', count(DB_AUDIT, 'resolution_versions', `draft_id=${rowId}`) === 1,
    count(DB_AUDIT, 'resolution_versions', `draft_id=${rowId}`));
  const impl = await req(AUDIT, 'POST', `/cells/${cellId}/draft-resolutions/${rowId}/implementing-circles`, sd, { circle_name: 'Space Law Circle' });
  r.check('implementing-circle link -> 201', impl.status === 201, impl);
  r.check('implementing circle persisted', count(DB_AUDIT, 'resolution_implementing_circles', `draft_id=${rowId}`) === 1,
    count(DB_AUDIT, 'resolution_implementing_circles', `draft_id=${rowId}`));

  // ── 6. submit → aSTF motion-audit spawn ───────────────────────────────
  const before = {
    cells: count(DB_AUDIT, 'cells'), stfs: count(DB_AUDIT, 'stfs'), cands: count(DB_AUDIT, 'stf_candidates')
  };
  const submit = await req(AUDIT, 'POST', `/cells/${cellId}/draft-resolutions/${rowId}/submit`, sd);
  r.check('steward submits the draft -> 200 + astfId', submit.status === 200 && !!submit.j.astfId, submit);
  const after = { cells: count(DB_AUDIT, 'cells'), stfs: count(DB_AUDIT, 'stfs'), cands: count(DB_AUDIT, 'stf_candidates') };
  r.check('submit creates exactly one aSTF cell', after.cells === before.cells + 1, { before, after });
  r.check('submit creates one stf row', after.stfs === before.stfs + 1, { before, after });
  r.check('submit invites assessors (candidate rows)', after.cands > before.cands, { before, after });
  const astfRow = sqlRows(DB_AUDIT, `SELECT type,status,source,blind FROM cells WHERE id='${submit.j.astfId}';`)[0];
  r.check('aSTF cell is a Blind Review cell', astfRow && astfRow.type === 'aSTF Cell' && astfRow.status === 'Blind Review' && String(astfRow.blind) === '1', astfRow);
  const stfRow = sqlRows(DB_AUDIT, `SELECT type,status,purpose FROM stfs WHERE id='stf-${submit.j.astfId}';`)[0];
  r.check('stf row created for the aSTF', stfRow && stfRow.type === 'aSTF', stfRow);
  const draftAfter = sqlRows(DB_AUDIT, `SELECT status FROM draft_resolutions WHERE id=${rowId};`)[0];
  r.check('draft status becomes submitted', draftAfter && draftAfter.status === 'submitted', draftAfter);
  const resubmit = await req(AUDIT, 'POST', `/cells/${cellId}/draft-resolutions/${rowId}/submit`, sd);
  r.check('resubmitting a submitted draft -> 409', resubmit.status === 409, resubmit);

  // ── 7. inputs the client-side AI drafter needs ────────────────────────
  const bs = await req(AUDIT, 'GET', '/bootstrap', sd);
  const bsCell = (bs.j.cells || []).find(c => c.id === cellId);
  r.check('bootstrap exposes the cell title for the drafter', !!(bsCell && bsCell.title), bsCell && bsCell.title);
  r.check('bootstrap exposes delib_type for the drafter', !!(bsCell && bsCell.delibType), bsCell && bsCell.delibType);
  r.check('bootstrap exposes cell messages for the drafter',
    !!(bsCell && Array.isArray(bsCell.messages) && bsCell.messages.length >= 0), bsCell && bsCell.messages);

  r.save();
  process.exit(r.failures.length ? 1 : 0);
}
main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
