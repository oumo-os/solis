// M4 — jSTF judicial investigation audit
// report → escalate → seat → restriction vote → questions → xSTF probe →
// findings → resolution draft → endorsement poll → verdict → aSTF audit.
import { AUDIT, DB_AUDIT, req, login, sql, sqlRows, count, Report } from './lib.mjs';

const r = new Report('m04-jstf');

async function seatCase(caseId, n = 3) {
  const cands = sqlRows(DB_AUDIT, `SELECT user_id, initials FROM stf_candidates WHERE stf_id='stf-${caseId}';`);
  const out = [];
  for (const c of cands.slice(0, n)) {
    const tok = await login(AUDIT, `${c.user_id}@solis.local`);
    const res = await req(AUDIT, 'POST', `/cells/${caseId}/jstf-membership`, tok, { decision: 'accept' });
    out.push({ userId: c.user_id, token: tok, res });
  }
  return { cands, out };
}

async function main() {
  const sd = await login(AUDIT, 'sd@solis.local');   // steward (escalates)
  const os = await login(AUDIT, 'os@solis.local');   // active member, no roster
  const mt = await login(AUDIT, 'mt@solis.local');   // target of the report

  // ── 1. anonymous report ───────────────────────────────────────────────
  r.check('anonymous report -> 401', (await req(AUDIT, 'POST', '/jstf/report', null, { targetId: 'mt', description: 'x' })).status === 401);
  r.check('report without description -> 400', (await req(AUDIT, 'POST', '/jstf/report', os, { targetId: 'mt' })).status === 400);
  r.check('report of unknown member -> 404', (await req(AUDIT, 'POST', '/jstf/report', os, { targetId: 'nobody', description: 'x' })).status === 404);
  r.check('self-report -> 400', (await req(AUDIT, 'POST', '/jstf/report', os, { targetId: 'os', description: 'x' })).status === 400);

  const rep = await req(AUDIT, 'POST', '/jstf/report', os, { targetId: 'mt', description: 'Audit M4 probe report' });
  r.check('member can file an anonymous report -> 201 + threadId', rep.status === 201 && !!rep.j.threadId, rep);
  const thr = sqlRows(DB_AUDIT, `SELECT badge,badge_class,visibility,proposal_cell_id,author FROM threads WHERE id='${rep.j.threadId}';`)[0];
  r.check('report creates a sealed judicial thread',
    thr && thr.badge === 'b-judicial' && thr.visibility === 'stewards-only' && thr.proposal_cell_id === 'user:mt', thr);

  // ── 2. escalation ─────────────────────────────────────────────────────
  r.check('non-steward cannot escalate -> 403', (await req(AUDIT, 'POST', '/jstf/escalate', os, { threadId: rep.j.threadId })).status === 403);
  const esc = await req(AUDIT, 'POST', '/jstf/escalate', sd, { threadId: rep.j.threadId });
  r.check('steward escalates -> 201 + jstfId', esc.status === 201 && !!esc.j.jstfId, esc);
  const caseId = esc.j.jstfId;
  const caseRow = sqlRows(DB_AUDIT, `SELECT type,status,blind,delib_type,meta FROM cells WHERE id='${caseId}';`)[0];
  r.check('case opens as a blind jSTF cell under investigation',
    caseRow && caseRow.type === 'jSTF Cell' && caseRow.status === 'Under Investigation' && String(caseRow.blind) === '1', caseRow);
  const formation = JSON.parse(caseRow.meta || '{}').formation || {};
  r.check('case opens with an inviting formation and a quorum', formation.state === 'inviting' && formation.quorum >= 2, formation);
  const invited = sqlRows(DB_AUDIT, `SELECT user_id FROM stf_candidates WHERE stf_id='stf-${caseId}';`);
  r.check('adjudicators are invited on escalation', invited.length >= 2, invited);
  r.check('the target is excluded from the adjudicator pool', !invited.some(c => c.user_id === 'mt'), invited.map(c => c.user_id));
  r.check('escalating twice -> 409', (await req(AUDIT, 'POST', '/jstf/escalate', sd, { threadId: rep.j.threadId })).status === 409);

  const dup = await req(AUDIT, 'POST', '/jstf/report', os, { targetId: 'mt', description: 'second report' });
  const dupEsc = await req(AUDIT, 'POST', '/jstf/escalate', sd, { threadId: dup.j.threadId });
  r.check('a second open case against the same member -> 409', dupEsc.status === 409, dupEsc);

  // ── 3. seating ────────────────────────────────────────────────────────
  const outsider = ['bo', 'ok', 'nc', 'ao', 'as', 'ld', 'mn', 'nk', 'ts', 'yd'].find(u => !invited.some(c => c.user_id === u));
  const outsiderTok = await login(AUDIT, `${outsider}@solis.local`);
  const badSeat = await req(AUDIT, 'POST', `/cells/${caseId}/jstf-membership`, outsiderTok, { decision: 'accept' });
  r.check('non-invited member cannot take a seat on the case', badSeat.status === 404 || badSeat.status === 403, badSeat);

  const seated = await seatCase(caseId, 3);
  r.check('invited adjudicators can accept a seat', seated.out.every(x => x.res.status === 200), seated.out.map(x => x.res));
  const afterSeat = sqlRows(DB_AUDIT, `SELECT meta FROM cells WHERE id='${caseId}';`)[0];
  const formation2 = JSON.parse(afterSeat.meta || '{}').formation || {};
  r.check('formation flips to seated once quorum is reached', formation2.state === 'seated', formation2);

  // ── 4. restriction vote ───────────────────────────────────────────────
  r.check('non-team member cannot vote on restriction -> 403',
    (await req(AUDIT, 'POST', `/cells/${caseId}/jstf-vote`, sd, { stance: 'restrict' })).status === 403);
  r.check('invalid stance -> 400',
    (await req(AUDIT, 'POST', `/cells/${caseId}/jstf-vote`, seated.out[0].token, { stance: 'maybe' })).status === 400);

  const v1 = await req(AUDIT, 'POST', `/cells/${caseId}/jstf-vote`, seated.out[0].token, { stance: 'restrict' });
  r.check('first restriction vote is recorded', v1.status === 200 && v1.j.state === 'relaxed', v1);
  const v2 = await req(AUDIT, 'POST', `/cells/${caseId}/jstf-vote`, seated.out[1].token, { stance: 'restrict' });
  r.check('majority restriction flips the case to restricted', v2.status === 200 && v2.j.state === 'restricted', v2);
  const mtStatus = sqlRows(DB_AUDIT, "SELECT status FROM users WHERE id='mt';")[0];
  // A steward target restricted by a non-unanimous vote is frozen -> Suspended
  // (syncTargetRestriction: severity 'frozen' => Suspended, 'readonly' => Restricted).
  r.check('the target member is restricted in the directory',
    mtStatus && ['Restricted', 'Suspended'].includes(mtStatus.status), mtStatus);
  const sev = v2.j.severity;
  r.note(`restriction severity for a steward target: ${sev} -> user status ${mtStatus && mtStatus.status}`);
  const evt = sqlRows(DB_AUDIT, `SELECT text FROM governance_events WHERE type='jstf-restriction' ORDER BY date DESC LIMIT 1;`)[0];
  r.check('restriction is recorded as a governance event', /activity restricted/.test((evt && evt.text) || ''), evt && evt.text);

  const vl = await req(AUDIT, 'POST', `/cells/${caseId}/jstf-vote`, seated.out[0].token, { stance: 'lift' });
  r.check('lifting the restriction relaxes the case', vl.status === 200 && vl.j.state === 'relaxed', vl);
  const mtStatus2 = sqlRows(DB_AUDIT, "SELECT status FROM users WHERE id='mt';")[0];
  r.check('the target member is restored to Active', mtStatus2 && mtStatus2.status === 'Active', mtStatus2);

  // ── 5. investigation questions ────────────────────────────────────────
  r.check('non-team member cannot add a question -> 403',
    (await req(AUDIT, 'POST', `/cells/${caseId}/questions`, sd, { label: 'x' })).status === 403);
  const q = await req(AUDIT, 'POST', `/cells/${caseId}/questions`, seated.out[0].token, { label: 'Audit M4 question', assessors: 1, deadline: '2026-12-31' });
  r.check('team can add an investigation question -> 201', q.status === 201 && !!q.j.objId, q);
  const qRow = sqlRows(DB_AUDIT, `SELECT label,status,assessors,deadline FROM cell_objectives WHERE cell_id='${caseId}' AND obj_id='${q.j.objId}';`)[0];
  r.check('question persists with status open', qRow && qRow.status === 'open' && Number(qRow.assessors) === 1, qRow);
  const qPatch = await req(AUDIT, 'PATCH', `/cells/${caseId}/questions/${q.j.objId}`, seated.out[0].token, { status: 'at-risk' });
  r.check('question status can be updated', qPatch.status === 200, qPatch);

  // ── 6. xSTF probe commission ──────────────────────────────────────────
  const commission = await req(AUDIT, 'POST', `/cells/${caseId}/commission-xstf`, seated.out[0].token, {
    questionId: q.j.objId, mode: 'siloed', brief: 'Audit M4 mandate brief: establish what happened.',
    objectives: ['Establish the facts'], tasks: ['Interview', 'Report']
  });
  r.check('team can commission an xSTF probe -> 200/201', commission.status === 200 || commission.status === 201, commission);
  const xstfId = commission.j.xstfId || (commission.j && commission.j.id);
  const xRow = sqlRows(DB_AUDIT, `SELECT type,status,commissioned_by,source FROM cells WHERE id='${xstfId}';`)[0];
  r.check('probe is an xSTF cell commissioned by the case',
    xRow && xRow.type === 'xSTF Cell' && xRow.commissioned_by === caseId, xRow);
  r.check('probe records the investigation source', /jstf/.test(xRow.source || ''), xRow && xRow.source);

  // ── 7. deliverable → review → findings ───────────────────────────────
  const del = await req(AUDIT, 'POST', `/cells/${xstfId}/submit-deliverable`, seated.out[0].token, { title: 'Audit M4 findings', content: 'probe content' });
  r.check('investigator can file a deliverable -> 201', del.status === 201 && !!del.j.deliverableId, del);
  const offCase = await req(AUDIT, 'POST', `/cells/${xstfId}/review-deliverable`, sd, { deliverableId: del.j.deliverableId, decision: 'approved' });
  r.check('off-case steward cannot review a judicial probe deliverable -> 403', offCase.status === 403, offCase);
  const rev = await req(AUDIT, 'POST', `/cells/${xstfId}/review-deliverable`, seated.out[0].token, { deliverableId: del.j.deliverableId, decision: 'approved' });
  r.check('case team can approve the deliverable -> 200', rev.status === 200, rev);
  const accept = await req(AUDIT, 'POST', `/cells/${caseId}/accept-findings`, seated.out[0].token, { xstfId, deliverableId: del.j.deliverableId });
  r.check('case team can accept findings -> 200', accept.status === 200, accept);

  // ── 8. resolution draft + endorsement poll ───────────────────────────
  const draft = await req(AUDIT, 'POST', `/cells/${caseId}/resolution-draft`, seated.out[0].token, {
    type: 'policy-cited', description: 'Audit M4 verdict text', policyRefs: ['PR-007'], executingCircles: ['Space Law Circle']
  });
  r.check('team can save the working resolution draft -> 200', draft.status === 200, draft);
  r.check('saved draft is stored on the case',
    JSON.parse(sqlRows(DB_AUDIT, `SELECT meta FROM cells WHERE id='${caseId}';`)[0].meta).resolutionDraft.description === 'Audit M4 verdict text',
    'resolutionDraft missing');

  const verdictNoEndorse = await req(AUDIT, 'POST', `/cells/${caseId}/jstf-verdict`, seated.out[0].token, { description: 'no endorsement yet' });
  r.check('verdict without team endorsement -> 403', verdictNoEndorse.status === 403, verdictNoEndorse);

  const e1 = await req(AUDIT, 'POST', `/cells/${caseId}/draft-vote`, seated.out[0].token, { stance: 'endorse' });
  r.check('first endorsement recorded', e1.status === 200 && e1.j.endorse === 1, e1);
  const e2 = await req(AUDIT, 'POST', `/cells/${caseId}/draft-vote`, seated.out[1].token, { stance: 'endorse' });
  r.check('majority endorsement approves the draft', e2.status === 200 && e2.j.approved === true, e2);
  const badRef = await req(AUDIT, 'POST', `/cells/${caseId}/jstf-verdict`, seated.out[0].token, { description: 'bad ref', policyRefs: ['NOPE-999'] });
  r.check('verdict citing an unknown policy -> 400', badRef.status === 400, badRef);

  // ── 9. verdict → judicial audit ───────────────────────────────────────
  const verdict = await req(AUDIT, 'POST', `/cells/${caseId}/jstf-verdict`, seated.out[0].token, {
    description: 'Audit M4 verdict', policyRefs: ['PR-007'], executingCircles: ['Space Law Circle']
  });
  r.check('endorsed verdict is filed -> 200 + astfId', verdict.status === 200 && !!verdict.j.astfId, verdict);
  r.check('verdict type is policy-cited (policies cited)', verdict.j && verdict.j.type === 'policy-cited', verdict.j);
  const caseAfter = sqlRows(DB_AUDIT, `SELECT status,meta FROM cells WHERE id='${caseId}';`)[0];
  r.check('case is finalised with the verdict recorded',
    caseAfter && caseAfter.status === 'Finalised' && /"verdict"/.test(caseAfter.meta || ''), caseAfter && caseAfter.status);
  const auditRow = sqlRows(DB_AUDIT, `SELECT type,status,source FROM cells WHERE id='${verdict.j.astfId}';`)[0];
  r.check('a blind judicial aSTF audit is spawned',
    auditRow && auditRow.type === 'aSTF Cell' && auditRow.status === 'Blind Review' && /judicial-audit/.test(auditRow.source || ''), auditRow);
  const jstfStf = sqlRows(DB_AUDIT, `SELECT status,bucket FROM stfs WHERE id='stf-${caseId}';`)[0];
  r.check('the jSTF row is completed', jstfStf && jstfStf.bucket === 'completed', jstfStf);
  const verdictEvt = sqlRows(DB_AUDIT, `SELECT text FROM governance_events WHERE type='jstf-verdict' ORDER BY date DESC LIMIT 1;`)[0];
  r.check('verdict is recorded as a governance event', /jSTF verdict filed/.test((verdictEvt && verdictEvt.text) || ''), verdictEvt && verdictEvt.text);
  const twice = await req(AUDIT, 'POST', `/cells/${caseId}/jstf-verdict`, seated.out[0].token, { description: 'again' });
  r.check('filing twice -> 409', twice.status === 409, twice);

  // ── 10. sealed thread visibility ──────────────────────────────────────
  const anonThreads = await req(AUDIT, 'GET', '/threads');
  const visible = (anonThreads.j || []).some(t => t.id === rep.j.threadId);
  r.check('the judicial thread is not publicly visible', !visible, 'judicial thread exposed');

  r.save();
  process.exit(r.failures.length ? 1 : 0);
}
main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
