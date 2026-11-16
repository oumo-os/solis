// M6 — vSTF verification audit
// spawn claim (candidacy / competence) → assessments → quorum decision →
// candidacy approval + competence verification.
import { AUDIT, DB_AUDIT, req, login, sql, sqlRows, count, Report } from './lib.mjs';

const r = new Report('m06-vstf');

async function main() {
  const sd = await login(AUDIT, 'sd@solis.local');
  const os = await login(AUDIT, 'os@solis.local');
  const host = sqlRows(DB_AUDIT, "SELECT id FROM cells WHERE type='Circle Cell' LIMIT 1;")[0];
  const hostId = host && host.id;
  r.check('a circle cell exists to host vSTF claims', !!hostId, host);

  // ── 1. spawn ──────────────────────────────────────────────────────────
  r.check('non-steward cannot spawn a vSTF -> 403',
    (await req(AUDIT, 'POST', `/cells/${hostId}/spawn-vstf`, os, { vstfType: 'steward-candidacy', candidateName: 'Akello Jane' })).status === 403);
  r.check('unknown claim type -> 400',
    (await req(AUDIT, 'POST', `/cells/${hostId}/spawn-vstf`, sd, { vstfType: 'nonsense', candidateName: 'Akello Jane' })).status === 400);

  const spawn = await req(AUDIT, 'POST', `/cells/${hostId}/spawn-vstf`, sd, {
    vstfType: 'steward-candidacy', candidateName: 'Akello Jane', candidateInitials: 'AJ',
    circleName: 'Space Law Circle', minAssessors: 2, domains: ['Space Law']
  });
  r.check('steward spawns a candidacy claim -> 201', spawn.status === 201 && !!spawn.j.vstfId, spawn);
  const vId = spawn.j.vstfId;
  const vRow = sqlRows(DB_AUDIT, `SELECT type,status,delib_type,participants,source FROM cells WHERE id='${vId}';`)[0];
  r.check('claim opens as a pending vSTF assessment',
    vRow && vRow.type === 'vSTF Cell' && vRow.status === 'Pending Assessment' && vRow.delib_type === 'steward-candidacy', vRow);
  r.check('the claim records the candidate and host', /Akello Jane/.test(vRow.source || '') && /Space Law Circle/.test(vRow.source || ''), vRow && vRow.source);
  r.check('a second open claim for the same candidate -> 409',
    (await req(AUDIT, 'POST', `/cells/${hostId}/spawn-vstf`, sd, { vstfType: 'steward-candidacy', candidateName: 'Akello Jane' })).status === 409);

  // ── 2. assessments ────────────────────────────────────────────────────
  const aj = await login(AUDIT, 'aj@solis.local');
  const selfAssess = await req(AUDIT, 'POST', `/cells/${vId}/vstf-assessment`, aj, { score: 90, rationale: 'self' });
  r.check('a candidate cannot assess their own claim -> 403', selfAssess.status === 403, selfAssess);
  r.check('a candidacy assessment without rationale -> 400',
    (await req(AUDIT, 'POST', `/cells/${vId}/vstf-assessment`, sd, { score: 70 })).status === 400);

  const a1 = await req(AUDIT, 'POST', `/cells/${vId}/vstf-assessment`, sd, { score: 70, rationale: 'M6 first assessment' });
  r.check('first assessment is filed but the claim is not complete', a1.status === 200 && a1.j.complete === false, a1);
  const dupA = await req(AUDIT, 'POST', `/cells/${vId}/vstf-assessment`, sd, { score: 70, rationale: 'again' });
  r.check('an assessor cannot file twice -> 409', dupA.status === 409, dupA);

  const assessor2 = await login(AUDIT, 'mt@solis.local');
  const a2 = await req(AUDIT, 'POST', `/cells/${vId}/vstf-assessment`, assessor2, { score: 80, rationale: 'M6 second assessment' });
  r.check('quorum assessments complete the claim', a2.status === 200 && a2.j.complete === true, a2);
  const vAfter = sqlRows(DB_AUDIT, `SELECT status,resolution FROM cells WHERE id='${vId}';`)[0];
  r.check('the claim records the averaged score and approval',
    vAfter && vAfter.status === 'Assessment Filed' && /"score":75/.test(vAfter.resolution || '') && /"approved":true/.test(vAfter.resolution || ''),
    vAfter);
  const evt = sqlRows(DB_AUDIT, `SELECT text FROM governance_events WHERE type='vstf-candidacy' ORDER BY date DESC LIMIT 1;`)[0];
  r.check('candidacy decision is recorded as a governance event', /Steward candidacy for Akello Jane approved/.test((evt && evt.text) || ''), evt && evt.text);
  const vstf = sqlRows(DB_AUDIT, `SELECT status,bucket FROM stfs WHERE id='stf-${vId}';`)[0];
  r.check('the vSTF row is completed', vstf && vstf.bucket === 'completed', vstf);

  // ── 3. competence claim verifies domains for real ─────────────────────
  const cand = sqlRows(DB_AUDIT, "SELECT id,name FROM users WHERE name='Mwenda Thomas';")[0];
  const before = sqlRows(DB_AUDIT, `SELECT verified FROM user_competence WHERE user_id='${cand.id}' AND domain='Remote Sensing';`);
  const cSpawn = await req(AUDIT, 'POST', `/cells/${hostId}/spawn-vstf`, sd, {
    vstfType: 'competence-claim', candidateName: cand.name, candidateInitials: 'MT',
    circleName: 'Remote Sensing Circle', minAssessors: 2, domains: ['Remote Sensing']
  });
  r.check('steward spawns a competence claim -> 201', cSpawn.status === 201, cSpawn);
  const cId = cSpawn.j.vstfId;
  const evals = [{ domain: 'Remote Sensing', evaluated: true }];
  const assessor3 = await login(AUDIT, 'nc@solis.local');   // not the candidate
  await req(AUDIT, 'POST', `/cells/${cId}/vstf-assessment`, sd, { domainEvals: evals, comment: 'M6 competence' });
  const cAss2 = await req(AUDIT, 'POST', `/cells/${cId}/vstf-assessment`, assessor3, { domainEvals: evals, comment: 'M6 competence 2' });
  r.check('a second (non-candidate) assessor completes the competence claim', cAss2.status === 200 && cAss2.j.complete === true, cAss2);
  const cAfter = sqlRows(DB_AUDIT, `SELECT status,resolution FROM cells WHERE id='${cId}';`)[0];
  r.check('competence claim completes with verified domains',
    cAfter && cAfter.status === 'Assessment Filed' && /Remote Sensing/.test(cAfter.resolution || ''), cAfter);
  const verified = sqlRows(DB_AUDIT, `SELECT verified FROM user_competence WHERE user_id='${cand.id}' AND domain='Remote Sensing';`);
  r.check('the claimed domain is marked verified in the directory',
    verified.length > 0 && Number(verified[0].verified) === 1, { before, verified });
  const cEvt = sqlRows(DB_AUDIT, `SELECT text FROM governance_events WHERE type='vstf-competence' AND text LIKE '%Mwenda Thomas%' ORDER BY date DESC LIMIT 1;`)[0];
  r.check('competence verification is recorded as a governance event', /Competence verified for Mwenda Thomas/.test((cEvt && cEvt.text) || ''), cEvt && cEvt.text);

  r.save();
  process.exit(r.failures.length ? 1 : 0);
}
main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
