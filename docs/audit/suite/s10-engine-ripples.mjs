// S10 + S11 — the integrity engine's three ripples, and the p-aSTF health review
// S10: unverified claims are verified (ripple A), vacancies are vetted and seated
//      (B — covered by S4), and every circle gets a periodic review (C).
// S11: the review's rubrics, the tier it decides, the circle's review date and
//      the referrals it sends to the judiciary.
import { AUDIT, DB_AUDIT, req, login, sql, sqlRows, count, Report } from './lib.mjs';

const s10 = new Report('s10-engine-ripples');
const s11 = new Report('s11-pastf-health');

async function main() {
  const sd = await login(AUDIT, 'sd@solis.local');
  const aj = await login(AUDIT, 'aj@solis.local');
  const mt = await login(AUDIT, 'mt@solis.local');
  const nc = await login(AUDIT, 'nc@solis.local');

  // The seed already occupies every ripple: a member with no claim does not
  // exist, and all active circles have a recent or open health review.
  const seedPoll = await req(AUDIT, 'POST', '/engine/poll', sd);
  s10.check('the engine is inert when nothing is due', seedPoll.status === 200 && seedPoll.j.acted === 0, seedPoll);

  // ── S10 / ripple A: a fresh member's unverified claim is picked up ────
  const email = 'engine.probe@solis.local';
  const reg = await req(AUDIT, 'POST', '/auth/register', null, {
    name: 'Audit Engine Member', email, password: 'solis123'
  });
  s10.check('a fresh member can register', reg.status === 201, reg);
  const fresh = reg.j.token;
  const decl = await req(AUDIT, 'POST', '/competence/declare-wh', fresh, {
    domain: 'Space Law', wh: 700, evidence: 'S10 probe'
  });
  s10.check('the fresh member declares an unverified claim', decl.status === 200 || decl.status === 201, decl);

  const poll1 = await req(AUDIT, 'POST', '/engine/poll', sd);
  s10.check('the engine commissions a verification for that claim', poll1.status === 200 && poll1.j.acted >= 1, poll1);
  const claims = sqlRows(DB_AUDIT, "SELECT id,source,status FROM cells WHERE type='vSTF Cell' AND delib_type='competence-claim';");
  const mine = claims.filter(c => /Audit Engine Member/.test(c.source || ''));
  s10.check('a competence-claim cell was spawned for the fresh member', mine.length >= 1,
    claims.map(c => (JSON.parse(c.source || '{}').candidateName || '?')).slice(-4));
  const claim = mine.length ? mine[0] : null;
  const claimId = claim && claim.id;
  const claimSrc = claim ? JSON.parse(claim.source || '{}') : {};
  const claimRow = claim ? sqlRows(DB_AUDIT, `SELECT source,meta FROM cells WHERE id='${claimId}';`)[0] : null;
  const claimMeta = claimRow ? JSON.parse(claimRow.meta || '{}') : {};
  s10.check('the claim carries the domain to verify in its meta',
    /Space Law/.test(JSON.stringify(claimMeta.domains || [])), claimMeta.domains);
  const poll2 = await req(AUDIT, 'POST', '/engine/poll', sd);
  const dupClaims = sqlRows(DB_AUDIT, "SELECT id FROM cells WHERE type='vSTF Cell' AND delib_type='competence-claim';").filter(c => /Audit Engine Member/.test((sqlRows(DB_AUDIT, `SELECT source FROM cells WHERE id='${c.id}';`)[0] || {}).source || ''));
  s10.check('the engine does not commission the same claim twice', dupClaims.length === 1, { after: dupClaims.length });

  if (claimId) {
    const evals = [{ domain: 'Space Law', evaluated: true, adjusted: 700 }];
    for (const a of [aj, mt, nc]) {
      const res = await req(AUDIT, 'POST', `/cells/${claimId}/vstf-assessment`, a, { domainEvals: evals, comment: 'S10 verification' });
      s10.check('an assessor files a competence evaluation', res.status === 200, res);
    }
    const row = sqlRows(DB_AUDIT, `SELECT status,resolution FROM cells WHERE id='${claimId}';`)[0];
    s10.check('the claim completes with the domain recorded',
      row && row.status === 'Assessment Filed' && /Space Law/.test(row.resolution || ''), row);
    const verified = sqlRows(DB_AUDIT, "SELECT domain,verified FROM user_competence WHERE user_id='audit-engine-member' AND domain='Space Law';");
    s10.check('the domain flips to verified in the directory',
      verified.length === 1 && Number(verified[0].verified) === 1, verified);
  }

  // ── S10 / ripple C: make a circle due for a health review ─────────────
  // (the seed leaves them all recent or open)
  sql(DB_AUDIT, "UPDATE circles SET meta=JSON_REMOVE(meta,'$.lastPastfReview') WHERE id='policy';");
  sql(DB_AUDIT, "UPDATE cells SET status='Review Complete' WHERE type='p-aSTF Cell' AND circle='Policy & Advocacy Circle';");
  const pastfBefore = count(DB_AUDIT, 'cells', "type='p-aSTF Cell'");
  await req(AUDIT, 'POST', '/engine/poll', sd);
  const pastfAfter = count(DB_AUDIT, 'cells', "type='p-aSTF Cell'");
  s10.check('the engine commissions a periodic review when one is due', pastfAfter > pastfBefore, { pastfBefore, pastfAfter });
  const review = sqlRows(DB_AUDIT, "SELECT id,circle,status,source FROM cells WHERE type='p-aSTF Cell' AND source LIKE '%integrity-engine%' ORDER BY id DESC LIMIT 1;")[0];
  s10.check('the review is opened on the circle that was due',
    review && /Policy/.test(review.circle || '') && review.status === 'Pending Review', review);

  // ── S11: the health review ────────────────────────────────────────────
  if (review) {
    const member = sqlRows(DB_AUDIT, "SELECT u.name FROM circle_roster cr JOIN users u ON u.id=cr.member_id WHERE cr.circle_id='policy' AND cr.status='active' LIMIT 1;")[0];
    const circleRubric = { activity: 5, competenceFit: 6, discipline: 5, cohesion: 4, delivery: 5 };
    const memberReviews = [{
      name: member.name, initials: 'XX', effectiveness: 4, stewardship: 5, participation: 4,
      investment: 5, productivity: 4, roleFit: 3, replaceability: 2, indispensable: 5
    }];
    const r1 = await req(AUDIT, 'POST', `/cells/${review.id}/pastf-review`, sd, { circleRubric, memberReviews, healthTier: 'concern', notes: 'S11 first review' });
    s11.check('a reviewer files the circle and member rubrics', r1.status === 200 && r1.j.filed === 1, r1);
    s11.check('the circle rubric total is computed', r1.j && r1.j.circleTotal === 25, r1.j);
    const dup = await req(AUDIT, 'POST', `/cells/${review.id}/pastf-review`, sd, { circleRubric, memberReviews, healthTier: 'concern' });
    s11.check('a reviewer cannot file twice -> 409', dup.status === 409, dup);
    await req(AUDIT, 'POST', `/cells/${review.id}/pastf-review`, mt, { circleRubric, memberReviews, healthTier: 'concern', notes: 'S11 second' });
    const r3 = await req(AUDIT, 'POST', `/cells/${review.id}/pastf-review`, nc, { circleRubric, memberReviews, healthTier: 'healthy', notes: 'S11 third' });
    s11.check('the review completes at the reviewer quorum', r3.j && r3.j.complete === true, r3.j);
    const done = sqlRows(DB_AUDIT, `SELECT status,resolution FROM cells WHERE id='${review.id}';`)[0];
    s11.check('the review records the agreed tier and the averaged circle score',
      done && done.status === 'Review Complete' && /"healthTier":"concern"/.test(done.resolution || '') && /"avgCircle":25/.test(done.resolution || ''), done);
    const circleMeta = sqlRows(DB_AUDIT, "SELECT meta FROM circles WHERE id='policy';")[0];
    s11.check('the reviewed circle records the date of its last health review',
      /lastPastfReview/.test(circleMeta.meta || ''), circleMeta && circleMeta.meta);
    const referral = sqlRows(DB_AUDIT, "SELECT id,title FROM threads ORDER BY id DESC LIMIT 5;");
    s11.check('an indispensable member is referred to the judiciary',
      referral.some(t => /Anonymous Report/.test(t.title || '')), referral.map(t => t.title));
  }

  s10.save();
  s11.save();
  process.exit((s10.failures.length + s11.failures.length) ? 1 : 0);
}
main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
