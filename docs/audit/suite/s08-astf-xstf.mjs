// S8 + S9 — aSTF adjudication and xSTF execution
// S8: invitations (pool, quorum+2, proposer excluded), sealed parallel filings,
//     majority decision (and the split -> revision rule).
// S9: steward-created execution from an approved verdict, the task ladder,
//     blind optional, and the deliverable review.
import { AUDIT, DB_AUDIT, req, login, sql, sqlRows, count, Report, REPO } from './lib.mjs';
import { readFileSync } from 'fs';

const s08 = new Report('s08-astf');
const s09 = new Report('s09-xstf');

async function makeAudit(sd, title, snapshot) {
  const prop = await req(AUDIT, 'POST', '/proposals/system', sd, {
    delibType: 'system-settings', title, snapshot: snapshot || { type: 'system', settings: { stf: { jstfDurationDays: 31 } } },
    sourceType: 'settings-proposal'
  });
  const cellId = prop.j.cellId;
  const draft = await req(AUDIT, 'POST', `/cells/${cellId}/draft-resolutions`, sd, {
    res_id: 9800 + Math.floor(Math.random() * 100), title: title + ' draft', text: 'MOTION: probe', action: 'Policy', votes_nullified: 0
  });
  const sub = await req(AUDIT, 'POST', `/cells/${cellId}/draft-resolutions/${draft.j.id}/submit`, sd);
  return { cellId, astfId: sub.j.astfId };
}

async function seatAndFile(astfId, verdicts) {
  const cands = sqlRows(DB_AUDIT, `SELECT user_id FROM stf_candidates WHERE stf_id='stf-${astfId}';`);
  const tokens = [];
  for (const c of cands.slice(0, 3)) {
    const tok = await login(AUDIT, `${c.user_id}@solis.local`);
    await req(AUDIT, 'POST', `/cells/${astfId}/astf-membership`, tok, { decision: 'accept' });
    tokens.push(tok);
  }
  const rubric = { jurisdiction: 9, depth: 5, alignment: 10, competence: 6 };
  const out = [];
  for (let i = 0; i < verdicts.length; i++) {
    out.push(await req(AUDIT, 'POST', `/cells/${astfId}/astf-verdict`, tokens[i], {
      verdict: verdicts[i], rubric, rationale: 'S8 probe ' + i
    }));
  }
  return { cands, tokens, out };
}

async function main() {
  const sd = await login(AUDIT, 'sd@solis.local');
  const aj = await login(AUDIT, 'aj@solis.local');

  // ── S8: invitations ──────────────────────────────────────────────────
  const { cellId, astfId } = await makeAudit(sd, 'S8 Motion Audit');
  const astf = sqlRows(DB_AUDIT, `SELECT type,status,blind,meta FROM cells WHERE id='${astfId}';`)[0];
  s08.check('the motion audit is a blind cell', astf && astf.type === 'aSTF Cell' && astf.status === 'Blind Review' && String(astf.blind) === '1', astf);
  const formation = JSON.parse(astf.meta || '{}').formation || {};
  const cands = sqlRows(DB_AUDIT, `SELECT user_id FROM stf_candidates WHERE stf_id='stf-${astfId}';`);
  s08.check('invitations are quorum + 2', cands.length === formation.quorum + 2, { cands: cands.length, quorum: formation.quorum });
  s08.check('the motion proposer is excluded from the pool', !cands.some(c => c.user_id === 'sd'), cands.map(c => c.user_id));

  // ── S8: sealed filings ───────────────────────────────────────────────
  const pool = cands.slice(0, 3);
  const tokens = [];
  for (const c of pool) {
    const tok = await login(AUDIT, `${c.user_id}@solis.local`);
    await req(AUDIT, 'POST', `/cells/${astfId}/astf-membership`, tok, { decision: 'accept' });
    tokens.push(tok);
  }
  const fourth = await req(AUDIT, 'POST', `/cells/${astfId}/astf-membership`, await login(AUDIT, `${cands[3].user_id}@solis.local`), { decision: 'accept' });
  s08.check('the invitations lock once quorum is seated', fourth.status === 409, fourth);
  const rubric = { jurisdiction: 9, depth: 5, alignment: 10, competence: 6 };
  const f1 = await req(AUDIT, 'POST', `/cells/${astfId}/astf-verdict`, tokens[0], { verdict: 'approved', rubric, rationale: 'sealed 1' });
  const mid = sqlRows(DB_AUDIT, `SELECT status,resolution FROM cells WHERE id='${astfId}';`)[0];
  s08.check('a filing is sealed until quorum (cell unchanged)',
    f1.j.complete === false && mid.status === 'Blind Review' && /Pending/.test(mid.resolution || ''), { f1: f1.j, mid });
  await req(AUDIT, 'POST', `/cells/${astfId}/astf-verdict`, tokens[1], { verdict: 'approved', rubric, rationale: 'sealed 2' });
  const f3 = await req(AUDIT, 'POST', `/cells/${astfId}/astf-verdict`, tokens[2], { verdict: 'approved', rubric, rationale: 'sealed 3' });
  s08.check('the majority decides when quorum files', f3.j.verdict === 'approved', f3.j);
  const done = sqlRows(DB_AUDIT, `SELECT status,resolution FROM cells WHERE id='${astfId}';`)[0];
  s08.check('the audit is decided and unblinded', done.status === 'Verdict Filed' && /approved/.test(done.resolution || ''), done);

  // a split (1 approved / 1 rejected / 1 revision) must fall through to revision
  const split = await makeAudit(sd, 'S8 Split Audit');
  const seated = await seatAndFile(split.astfId, ['approved', 'rejected', 'revision']);
  const final = seated.out[2];
  s08.check('a split falls through to revision', final.j && final.j.verdict === 'revision', final);

  // ── S9: xSTF ─────────────────────────────────────────────────────────
  const noVerdict = await makeAudit(sd, 'S9 Unapproved Source');
  const early = await req(AUDIT, 'POST', `/cells/${noVerdict.astfId}/spawn-xstf`, sd, { title: 'too early' });
  s09.check('an xSTF cannot spawn before an approved verdict', early.status === 400, early);

  const spawn = await req(AUDIT, 'POST', `/cells/${astfId}/spawn-xstf`, sd, {
    title: 'S9 Execution', team: [{ name: 'Akello Jane', initials: 'AJ', role: 'Team Member' }],
    deliverableSpecs: { name: 'S9 Deliverable', sections: 3 }, blind: true
  });
  s09.check('an approved aSTF can spawn an execution cell', spawn.status === 201, spawn);
  const xId = spawn.j.xstfId;
  const x = sqlRows(DB_AUDIT, `SELECT type,status,blind,source FROM cells WHERE id='${xId}';`)[0];
  s09.check('the execution cell is blind when the steward chooses', x && String(x.blind) === '1', x);
  s09.check('the execution cell carries the approved verdict as authority',
    x && astfId && x.source && x.source.indexOf(astfId) !== -1, x && x.source);
  s09.check('the seven-step task ladder is seeded', count(DB_AUDIT, 'cell_tasks', `cell_id='${xId}'`) === 7,
    count(DB_AUDIT, 'cell_tasks', `cell_id='${xId}'`));
  const team = sqlRows(DB_AUDIT, `SELECT name,initials,role FROM cell_team WHERE cell_id='${xId}';`);
  s09.check('the steward-selected team is stored', team.length === 1 && team[0].initials === 'AJ', team);
  const del = await req(AUDIT, 'POST', `/cells/${xId}/submit-deliverable`, aj, { title: 'S9 output', content: 'delivered' });
  s09.check('the team files a deliverable', del.status === 201, del);
  const approved = await req(AUDIT, 'POST', `/cells/${xId}/review-deliverable`, sd, { deliverableId: del.j.deliverableId, decision: 'approved' });
  s09.check('a steward reviews and approves the deliverable', approved.status === 200, approved);
  const xDone = sqlRows(DB_AUDIT, `SELECT status FROM cells WHERE id='${xId}';`)[0];
  s09.check('the execution cell completes on approval', xDone && xDone.status === 'Completed', xDone);

  s08.save();
  s09.save();
  process.exit((s08.failures.length + s09.failures.length) ? 1 : 0);
}
main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
