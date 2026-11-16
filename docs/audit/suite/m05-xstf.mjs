// M5 — xSTF execution audit
// approved aSTF → spawn execution cell → task ladder → deliverable → review.
import { AUDIT, DB_AUDIT, req, login, sql, sqlRows, count, Report } from './lib.mjs';

const r = new Report('m05-xstf');

async function approvedAstf(sd) {
  const direct = await req(AUDIT, 'POST', '/proposals/direct', sd, { title: 'Audit M5 Motion', description: 'xstf probe', domain: 'Space Law' });
  const cellId = direct.j.cellId;
  const draft = await req(AUDIT, 'POST', `/cells/${cellId}/draft-resolutions`, sd, {
    res_id: 9800, title: 'M5 draft', text: 'MOTION: x', action: 'Policy', votes_nullified: 0
  });
  const sub = await req(AUDIT, 'POST', `/cells/${cellId}/draft-resolutions/${draft.j.id}/submit`, sd);
  const astfId = sub.j.astfId;
  const cands = sqlRows(DB_AUDIT, `SELECT user_id FROM stf_candidates WHERE stf_id='stf-${astfId}';`);
  for (const c of cands.slice(0, 3)) {
    const tok = await login(AUDIT, `${c.user_id}@solis.local`);
    await req(AUDIT, 'POST', `/cells/${astfId}/astf-membership`, tok, { decision: 'accept' });
  }
  const rubric = { jurisdiction: 9, depth: 5, alignment: 10, competence: 6 };
  for (const c of cands.slice(0, 3)) {
    const tok = await login(AUDIT, `${c.user_id}@solis.local`);
    await req(AUDIT, 'POST', `/cells/${astfId}/astf-verdict`, tok, { verdict: 'approved', rubric, rationale: 'M5 probe' });
  }
  return { cellId, astfId };
}

async function main() {
  const sd = await login(AUDIT, 'sd@solis.local');
  const os = await login(AUDIT, 'os@solis.local');

  // ── 1. an unapproved audit cannot spawn an execution cell ─────────────
  const direct = await req(AUDIT, 'POST', '/proposals/direct', sd, { title: 'Audit M5 Unapproved', description: 'x', domain: 'Space Law' });
  const draftU = await req(AUDIT, 'POST', `/cells/${direct.j.cellId}/draft-resolutions`, sd, {
    res_id: 9801, title: 'M5 draft', text: 'MOTION: x', action: 'Policy', votes_nullified: 0
  });
  const subU = await req(AUDIT, 'POST', `/cells/${direct.j.cellId}/draft-resolutions/${draftU.j.id}/submit`, sd);
  r.check('spawn-xstf before the audit approves -> 400',
    (await req(AUDIT, 'POST', `/cells/${subU.j.astfId}/spawn-xstf`, sd, { title: 'x' })).status === 400);

  // ── 2. spawn from an approved audit ───────────────────────────────────
  const { astfId } = await approvedAstf(sd);
  r.check('non-steward cannot spawn an execution cell -> 403',
    (await req(AUDIT, 'POST', `/cells/${astfId}/spawn-xstf`, os, { title: 'x' })).status === 403);

  const spawn = await req(AUDIT, 'POST', `/cells/${astfId}/spawn-xstf`, sd, {
    title: 'Audit M5 Execution', blind: true,
    team: [{ name: 'Akello Jane', initials: 'AJ', role: 'Team Member' }],
    deliverableSpecs: { name: 'Audit M5 Report', sections: 3 }
  });
  r.check('approved audit spawns an execution cell -> 201', spawn.status === 201 && !!spawn.j.xstfId, spawn);
  const xId = spawn.j.xstfId;
  const xRow = sqlRows(DB_AUDIT, `SELECT type,status,blind,source,deliverable_specs,progress FROM cells WHERE id='${xId}';`)[0];
  r.check('execution cell is blind and active', xRow && xRow.type === 'xSTF Cell' && xRow.status === 'Active' && String(xRow.blind) === '1', xRow);
  r.check('execution cell carries the aSTF resolution as authority',
    /astf-resolution/.test(xRow.source || '') && String(xRow.source || '').includes('"' + astfId + '"'),
    xRow && xRow.source);
  const tasks = count(DB_AUDIT, 'cell_tasks', `cell_id='${xId}'`);
  r.check('default task ladder is seeded', tasks === 7, { tasks });
  const team = count(DB_AUDIT, 'cell_team', `cell_id='${xId}'`);
  r.check('named team is seated', team === 1, { team });
  r.check('spawning twice -> 409', (await req(AUDIT, 'POST', `/cells/${astfId}/spawn-xstf`, sd, { title: 'again' })).status === 409);

  // ── 3. deliverables ───────────────────────────────────────────────────
  const del = await req(AUDIT, 'POST', `/cells/${xId}/submit-deliverable`, sd, { title: 'Audit M5 deliverable', content: 'content' });
  r.check('a deliverable can be filed -> 201', del.status === 201 && !!del.j.deliverableId, del);
  const rev = await req(AUDIT, 'POST', `/cells/${xId}/review-deliverable`, sd, { deliverableId: del.j.deliverableId, decision: 'revision', comment: 'needs work' });
  r.check('a deliverable can be sent back for revision -> 200', rev.status === 200, rev);
  const afterRev = sqlRows(DB_AUDIT, `SELECT status FROM cells WHERE id='${xId}';`)[0];
  r.check('a revision leaves the execution cell active', afterRev && afterRev.status === 'Active', afterRev);
  const reread = await req(AUDIT, 'POST', `/cells/${xId}/review-deliverable`, sd, { deliverableId: del.j.deliverableId, decision: 'approved' });
  r.check('an already-reviewed deliverable cannot be re-reviewed -> 409', reread.status === 409, reread);

  const del2 = await req(AUDIT, 'POST', `/cells/${xId}/submit-deliverable`, sd, { title: 'Audit M5 deliverable v2', content: 'content v2' });
  const appr = await req(AUDIT, 'POST', `/cells/${xId}/review-deliverable`, sd, { deliverableId: del2.j.deliverableId, decision: 'approved' });
  r.check('approval is accepted -> 200', appr.status === 200, appr);
  const done = sqlRows(DB_AUDIT, `SELECT status,resolution FROM cells WHERE id='${xId}';`)[0];
  r.check('approving a deliverable completes the execution cell',
    done && done.status === 'Completed' && /Delivered/.test(done.resolution || ''), done);
  const xstf = sqlRows(DB_AUDIT, `SELECT status,bucket FROM stfs WHERE id='stf-${xId}';`)[0];
  r.check('the xSTF row is completed', xstf && xstf.bucket === 'completed', xstf);
  const afterDone = await req(AUDIT, 'POST', `/cells/${xId}/submit-deliverable`, sd, { title: 'late', content: 'late' });
  r.check('a completed execution cell accepts no further deliverables -> 400', afterDone.status === 400, afterDone);

  r.save();
  process.exit(r.failures.length ? 1 : 0);
}
main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
