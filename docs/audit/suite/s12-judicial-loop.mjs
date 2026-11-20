// S12 — the judicial loop (jSTF)
// report -> thread -> escalation -> seating -> restriction vote -> questions ->
// xSTF probes -> findings -> draft + endorsement -> verdict -> aSTF audit ->
// closeout. Against the sequence in docs_v2/judicial-loop.md.
import { AUDIT, DB_AUDIT, req, login, sql, sqlRows, count, Report } from './lib.mjs';

const r = new Report('s12-judicial-loop');

async function main() {
  const sd = await login(AUDIT, 'sd@solis.local');   // steward: escalates
  const os = await login(AUDIT, 'os@solis.local');   // petitioner: reports
  const mt = await login(AUDIT, 'mt@solis.local');   // target of the report

  // 1. report -> sealed thread
  const rep = await req(AUDIT, 'POST', '/jstf/report', os, { targetId: 'mt', description: 'S12 probe' });
  r.check('a report opens a judicial intake thread', rep.status === 201 && !!rep.j.threadId, rep);
  const thr = sqlRows(DB_AUDIT, `SELECT badge,visibility,author,proposal_cell_id FROM threads WHERE id='${rep.j.threadId}';`)[0];
  r.check('the thread is sealed, anonymous and linked to the target',
    thr && thr.badge === 'b-judicial' && thr.visibility === 'stewards-only' && thr.proposal_cell_id === 'user:mt' && thr.author !== 'Oumo Samuel', thr);
  const anon = await req(AUDIT, 'GET', `/threads/${rep.j.threadId}`);
  r.check('a non-party cannot read the sealed thread', anon.status === 404, anon);

  // 2. escalation -> vacancy + quorum+2 invitations, target/petitioner excluded
  const esc = await req(AUDIT, 'POST', '/jstf/escalate', sd, { threadId: rep.j.threadId });
  r.check('a steward escalates the report into a case', esc.status === 201 && !!esc.j.jstfId, esc);
  const caseId = esc.j.jstfId;
  const c = sqlRows(DB_AUDIT, `SELECT type,status,blind,meta,source FROM cells WHERE id='${caseId}';`)[0];
  const formation = JSON.parse(c.meta || '{}').formation || {};
  const cands = sqlRows(DB_AUDIT, `SELECT user_id FROM stf_candidates WHERE stf_id='stf-${caseId}';`);
  r.check('the case is blind and under investigation', c && c.type === 'jSTF Cell' && c.status === 'Under Investigation' && String(c.blind) === '1', c);
  r.check('invitations are quorum + 2', cands.length === formation.quorum + 2, { cands: cands.length, quorum: formation.quorum });
  r.check('the target and the petitioner are excluded',
    !cands.some(x => x.user_id === 'mt') && !cands.some(x => x.user_id === 'os'), cands.map(x => x.user_id));

  // 3. seating -> first quorum acceptances lock the team
  const pool = cands.slice(0, formation.quorum);
  const tokens = [];
  for (const cand of pool) {
    const tok = await login(AUDIT, `${cand.user_id}@solis.local`);
    await req(AUDIT, 'POST', `/cells/${caseId}/jstf-membership`, tok, { decision: 'accept' });
    tokens.push(tok);
  }
  const late = await req(AUDIT, 'POST', `/cells/${caseId}/jstf-membership`,
    await login(AUDIT, `${cands[formation.quorum].user_id}@solis.local`), { decision: 'accept' });
  r.check('the invitations lock at quorum', late.status === 409, late);

  // 4. restriction vote -> a real effect on the target's standing
  const rv = await req(AUDIT, 'POST', `/cells/${caseId}/jstf-vote`, tokens[0], { stance: 'restrict' });
  r.check('the team votes to restrict the target', rv.status === 200, rv);
  await req(AUDIT, 'POST', `/cells/${caseId}/jstf-vote`, tokens[1], { stance: 'restrict' });
  const mtStatus = sqlRows(DB_AUDIT, "SELECT status FROM users WHERE id='mt';")[0];
  r.check('the restriction changes the target\'s directory status',
    mtStatus && ['Restricted', 'Suspended'].includes(mtStatus.status), mtStatus);

  // 5. question + probe + findings
  const q = await req(AUDIT, 'POST', `/cells/${caseId}/questions`, tokens[0], { label: 'S12 question', assessors: 1, deadline: '2026-12-31' });
  r.check('the team records an investigation question', q.status === 201, q);
  const comm = await req(AUDIT, 'POST', `/cells/${caseId}/commission-xstf`, tokens[0], {
    questionId: q.j.objId, brief: 'S12 brief', mode: 'siloed'
  });
  r.check('the team commissions a sealed probe', comm.status === 201 || comm.status === 200, comm);
  const xstfId = comm.j.xstfId;
  const xs = sqlRows(DB_AUDIT, `SELECT source FROM cells WHERE id='${xstfId}';`)[0];
  r.check('the probe is tied to the case and the question',
    xs && /jstf-investigation/.test(xs.source || '') && xs.source.indexOf(q.j.objId) !== -1, xs && xs.source);
  const del = await req(AUDIT, 'POST', `/cells/${xstfId}/submit-deliverable`, tokens[0], { title: 'S12 finding', content: 'evidence' });
  await req(AUDIT, 'POST', `/cells/${xstfId}/review-deliverable`, tokens[0], { deliverableId: del.j.deliverableId, decision: 'approved' });
  const acc = await req(AUDIT, 'POST', `/cells/${caseId}/accept-findings`, tokens[0], { xstfId, deliverableId: del.j.deliverableId });
  r.check('approved findings enter the case and close the question', acc.status === 200 && acc.j.questionMet === q.j.objId, acc);

  // 6. draft -> endorsement -> verdict -> judicial aSTF
  await req(AUDIT, 'POST', `/cells/${caseId}/resolution-draft`, tokens[0], {
    type: 'policy-cited', description: 'S12 verdict', policyRefs: ['PR-007'], executingCircles: ['Space Law Circle']
  });
  const noEnd = await req(AUDIT, 'POST', `/cells/${caseId}/jstf-verdict`, tokens[0], { description: 'early' });
  r.check('the verdict needs team endorsement first', noEnd.status === 403, noEnd);
  for (const t of tokens) await req(AUDIT, 'POST', `/cells/${caseId}/draft-vote`, t, { stance: 'endorse' });
  const verdict = await req(AUDIT, 'POST', `/cells/${caseId}/jstf-verdict`, tokens[0], {
    description: 'S12 verdict', policyRefs: ['PR-007'], executingCircles: ['Space Law Circle']
  });
  r.check('the endorsed verdict is filed', verdict.status === 200 && !!verdict.j.astfId, verdict);
  const audit = sqlRows(DB_AUDIT, `SELECT type,status,source FROM cells WHERE id='${verdict.j.astfId}';`)[0];
  r.check('a judicial aSTF audit is spawned for the verdict',
    audit && /judicial-audit/.test(audit.source || '') && audit.status === 'Blind Review', audit);
  // the audit has its own invitation pool and needs its own quorum of filings
  const auditCands = sqlRows(DB_AUDIT, `SELECT user_id FROM stf_candidates WHERE stf_id='stf-${verdict.j.astfId}';`);
  const auditTokens = [];
  for (const cand of auditCands.slice(0, 3)) {
    const tok = await login(AUDIT, `${cand.user_id}@solis.local`);
    await req(AUDIT, 'POST', `/cells/${verdict.j.astfId}/astf-membership`, tok, { decision: 'accept' });
    auditTokens.push(tok);
  }
  for (const tok of auditTokens) {
    await req(AUDIT, 'POST', `/cells/${verdict.j.astfId}/astf-verdict`, tok, {
      verdict: 'approved', rubric: { jurisdiction: 9, depth: 5, alignment: 10, competence: 6 }, rationale: 'S12 audit'
    });
  }

  // 7. closeout
  const closed = sqlRows(DB_AUDIT, `SELECT status,resolution FROM cells WHERE id='${caseId}';`)[0];
  r.check('the case is closed with a cited policy resolution and a minted ref',
    closed && closed.status === 'Resolution Applied' && /jrRef/.test(closed.resolution || '') && /PR-007/.test(closed.resolution || ''), closed);
  const restored = sqlRows(DB_AUDIT, "SELECT status FROM users WHERE id='mt';")[0];
  r.check('the closeout lifts the target\'s restriction',
    restored && !['Restricted', 'Suspended'].includes(restored.status), restored);
  const appeal = await req(AUDIT, 'POST', '/jstf/appeal', os, { caseId, description: 'S12 appeal' });
  r.check('the verdict can be appealed into a new intake thread', appeal.status === 201 || appeal.status === 200, appeal);

  r.save();
  process.exit(r.failures.length ? 1 : 0);
}
main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
