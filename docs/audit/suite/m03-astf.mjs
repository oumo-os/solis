// M3 — aSTF adjudication audit
// submit → aSTF motion-audit spawn → assessor invitations → seating →
// parallel sealed filings → majority decision → origin resolution + snapshot.
import { AUDIT, DB_AUDIT, req, login, sql, sqlRows, count, Report } from './lib.mjs';

const r = new Report('m03-astf');

async function spawnAudit(sd, title, extra = {}) {
  const direct = await req(AUDIT, 'POST', '/proposals/direct', sd, { title, description: 'astf probe', domain: 'Space Law' });
  const cellId = direct.j.cellId;
  const draft = await req(AUDIT, 'POST', `/cells/${cellId}/draft-resolutions`, sd, {
    res_id: Math.floor(90000 + Math.random() * 9000), title: title + ' Draft',
    text: 'MOTION: probe', action: 'Policy', votes_nullified: 0
  });
  const rowId = draft.j.id;
  const sub = await req(AUDIT, 'POST', `/cells/${cellId}/draft-resolutions/${rowId}/submit`, sd);
  return { cellId, rowId, astfId: sub.j.astfId };
}

async function seatAssessors(astfId, howMany = 3) {
  const cands = sqlRows(DB_AUDIT, `SELECT user_id, initials, status FROM stf_candidates WHERE stf_id='stf-${astfId}';`);
  const tokens = [];
  for (const c of cands.slice(0, howMany)) {
    const tok = await login(AUDIT, `${c.user_id}@solis.local`);
    const res = await req(AUDIT, 'POST', `/cells/${astfId}/astf-membership`, tok, { decision: 'accept' });
    tokens.push({ userId: c.user_id, token: tok, res });
  }
  return { cands, tokens };
}

async function main() {
  const sd = await login(AUDIT, 'sd@solis.local');
  const mt = await login(AUDIT, 'mt@solis.local');   // not an invited assessor

  // ── 1. spawn an aSTF motion audit ─────────────────────────────────────
  const { cellId, rowId, astfId } = await spawnAudit(sd, 'Audit M3 Motion');
  r.check('draft submit spawns an aSTF cell', !!astfId, { cellId, astfId });
  const astfRow = sqlRows(DB_AUDIT, `SELECT status,type,meta,blind FROM cells WHERE id='${astfId}';`)[0];
  r.check('aSTF cell starts as a Blind Review', astfRow && astfRow.status === 'Blind Review' && String(astfRow.blind) === '1', astfRow);
  const formation = JSON.parse(astfRow.meta || '{}').formation || {};
  r.check('aSTF formation opens in inviting state with a quorum', formation.state === 'inviting' && formation.quorum >= 1, formation);

  const cands = sqlRows(DB_AUDIT, `SELECT user_id, status FROM stf_candidates WHERE stf_id='stf-${astfId}';`);
  r.check('assessors are invited on spawn', cands.length >= 2, cands);
  r.check('the proposer is excluded from the assessor pool',
    !cands.some(c => c.user_id === 'sd'), cands.map(c => c.user_id));

  // ── 2. seating ────────────────────────────────────────────────────────
  // Pick a member who was NOT invited (the pool is sampled, so this is data-driven).
  const invitedIds = cands.map(c => c.user_id);
  const outsiderId = ['bo', 'ok', 'nc', 'ao', 'as', 'ld', 'mn', 'nk', 'ts', 'yd'].find(u => !invitedIds.includes(u));
  const outsiderTok = await login(AUDIT, `${outsiderId}@solis.local`);
  const nonInvited = await req(AUDIT, 'POST', `/cells/${astfId}/astf-membership`, outsiderTok, { decision: 'accept' });
  r.check('non-invited member cannot take a seat', nonInvited.status === 404 || nonInvited.status === 403, nonInvited);

  const { tokens } = await seatAssessors(astfId, 3);
  r.check('invited assessors can accept a seat', tokens.every(t => t.res.status === 200), tokens.map(t => t.res));
  const seated = count(DB_AUDIT, 'cell_team', `cell_id='${astfId}'`);
  r.check('accepted assessors are seated in the cell team', seated >= 1, { seated });
  const afterSeat = sqlRows(DB_AUDIT, `SELECT meta,participants FROM cells WHERE id='${astfId}';`)[0];
  const formation2 = JSON.parse(afterSeat.meta || '{}').formation || {};
  r.check('formation flips to seated once quorum is reached', formation2.state === 'seated', formation2);

  // ── 3. filings ────────────────────────────────────────────────────────
  const anonFile = await req(AUDIT, 'POST', `/cells/${astfId}/astf-verdict`, null, { verdict: 'approved', rubric: {} });
  r.check('anonymous verdict filing -> 401', anonFile.status === 401, anonFile);
  const outsiderFile = await req(AUDIT, 'POST', `/cells/${astfId}/astf-verdict`, sd, { verdict: 'approved', rubric: { jurisdiction: 9, depth: 5, alignment: 10, competence: 6 } });
  r.check('non-seated member cannot file a verdict -> 403', outsiderFile.status === 403, outsiderFile);

  const rubric = { jurisdiction: 9, depth: 5, alignment: 10, competence: 6 };
  const f1 = await req(AUDIT, 'POST', `/cells/${astfId}/astf-verdict`, tokens[0].token, { verdict: 'approved', rubric, rationale: 'probe A' });
  r.check('first filing is recorded but the audit is not complete', f1.status === 200 && f1.j.complete === false, f1);
  const dup = await req(AUDIT, 'POST', `/cells/${astfId}/astf-verdict`, tokens[0].token, { verdict: 'approved', rubric, rationale: 'probe A again' });
  r.check('an assessor cannot file twice -> 409', dup.status === 409, dup);
  const f2 = await req(AUDIT, 'POST', `/cells/${astfId}/astf-verdict`, tokens[1].token, { verdict: 'approved', rubric, rationale: 'probe B' });
  r.check('second filing recorded', f2.status === 200 && f2.j.filed === 2, f2);
  const f3 = await req(AUDIT, 'POST', `/cells/${astfId}/astf-verdict`, tokens[2].token, { verdict: 'approved', rubric, rationale: 'probe C' });
  r.check('quorum filing decides the audit', f3.status === 200 && f3.j.verdict === 'approved', f3);

  const decided = sqlRows(DB_AUDIT, `SELECT status,resolution FROM cells WHERE id='${astfId}';`)[0];
  r.check('aSTF cell records the verdict', decided && decided.status === 'Verdict Filed' && /"verdict":"approved"/.test(decided.resolution || ''), decided);
  const stfRow = sqlRows(DB_AUDIT, `SELECT status,bucket FROM stfs WHERE id='stf-${astfId}';`)[0];
  r.check('aSTF stf row moves to completed', stfRow && stfRow.status === 'Verdict Filed' && stfRow.bucket === 'completed', stfRow);
  const origin = sqlRows(DB_AUDIT, `SELECT status,resolution FROM cells WHERE id='${cellId}';`)[0];
  r.check('origin deliberation is marked Approved', origin && /"status":"Approved"/.test(origin.resolution || ''), origin);
  const draftAfter = sqlRows(DB_AUDIT, `SELECT status FROM draft_resolutions WHERE id=${rowId};`)[0];
  r.check('origin draft resolution is marked passed', draftAfter && draftAfter.status === 'passed', draftAfter);
  const evt = sqlRows(DB_AUDIT, `SELECT text FROM governance_events WHERE type='astf-verdict' ORDER BY date DESC LIMIT 1;`)[0];
  r.check('governance event records the aSTF verdict', /aSTF verdict: approved/.test((evt && evt.text) || ''), evt && evt.text);
  const refile = await req(AUDIT, 'POST', `/cells/${astfId}/astf-verdict`, tokens[0].token, { verdict: 'rejected', rubric });
  r.check('filing on a decided audit -> 409', refile.status === 409, refile);

  // ── 4. rejection path ─────────────────────────────────────────────────
  const rej = await spawnAudit(sd, 'Audit M3 Rejected Motion');
  const seat2 = await seatAssessors(rej.astfId, 3);
  for (const t of seat2.tokens) {
    await req(AUDIT, 'POST', `/cells/${rej.astfId}/astf-verdict`, t.token, { verdict: 'rejected', rubric, rationale: 'reject probe' });
  }
  const rejOrigin = sqlRows(DB_AUDIT, `SELECT resolution FROM cells WHERE id='${rej.cellId}';`)[0];
  r.check('rejected verdict marks the origin Rejected', rejOrigin && /"status":"Rejected"/.test(rejOrigin.resolution || ''), rejOrigin);
  const rejDraft = sqlRows(DB_AUDIT, `SELECT status FROM draft_resolutions WHERE id=${rej.rowId};`)[0];
  r.check('rejected verdict marks the draft failed', rejDraft && rejDraft.status === 'failed', rejDraft);

  // ── 5. settings snapshot apply ────────────────────────────────────────
  const before = sqlRows(DB_AUDIT, 'SELECT jstf_duration_days FROM system_settings WHERE id=1;')[0];
  const sysProp = await req(AUDIT, 'POST', '/proposals/system', sd, {
    delibType: 'system-settings', title: 'Audit M3 Snapshot Motion',
    snapshot: { type: 'system', settings: { stf: { jstfDurationDays: 45, astfAssessors: 4 } } }
  });
  const sysCell = sysProp.j.cellId;
  const sysDraft = await req(AUDIT, 'POST', `/cells/${sysCell}/draft-resolutions`, sd, {
    res_id: 9500, title: 'Audit M3 Snapshot Draft', text: 'MOTION: snapshot', action: 'Policy', votes_nullified: 0
  });
  const sysSubmit = await req(AUDIT, 'POST', `/cells/${sysCell}/draft-resolutions/${sysDraft.j.id}/submit`, sd);
  const seat3 = await seatAssessors(sysSubmit.j.astfId, 3);
  for (const t of seat3.tokens) {
    await req(AUDIT, 'POST', `/cells/${sysSubmit.j.astfId}/astf-verdict`, t.token, { verdict: 'approved', rubric, rationale: 'snapshot approval' });
  }
  const after = sqlRows(DB_AUDIT, 'SELECT jstf_duration_days, astf_assessors FROM system_settings WHERE id=1;')[0];
  r.check('approved snapshot applies to system_settings',
    Number(after.jstf_duration_days) === 45 && Number(after.astf_assessors) === 4,
    { before, after });
  const snapEvt = sqlRows(DB_AUDIT, `SELECT text FROM governance_events WHERE type='settings-applied' ORDER BY date DESC LIMIT 1;`)[0];
  r.check('settings-applied governance event recorded', /settings applied/i.test((snapEvt && snapEvt.text) || ''), snapEvt && snapEvt.text);
  const ledger = count(DB_AUDIT, 'governance_ledger', "status='applied'");
  r.check('governance ledger records the applied snapshot', ledger >= 1, { ledger });

  r.save();
  process.exit(r.failures.length ? 1 : 0);
}
main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
