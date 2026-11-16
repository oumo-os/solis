// M7 — p-aSTF periodic circle health review audit
// spawn review → reviewer rubrics (circle 30pt + member 35pt) → quorum →
// health tier, lastPastfReview, jSTF referral.
import { AUDIT, DB_AUDIT, req, login, sql, sqlRows, count, Report } from './lib.mjs';

const r = new Report('m07-pastf');

async function main() {
  const sd = await login(AUDIT, 'sd@solis.local');
  const os = await login(AUDIT, 'os@solis.local');
  const host = sqlRows(DB_AUDIT, "SELECT id FROM cells WHERE type='Circle Cell' LIMIT 1;")[0];
  const hostId = host && host.id;

  // ── 1. spawn ──────────────────────────────────────────────────────────
  r.check('non-steward cannot spawn a health review -> 403',
    (await req(AUDIT, 'POST', `/cells/${hostId}/spawn-pastf`, os, { circleName: 'Space Law Circle' })).status === 403);
  const archived = sqlRows(DB_AUDIT, "SELECT name FROM circles WHERE status='Archived' LIMIT 1;")[0];
  if (archived) {
    const archRes = await req(AUDIT, 'POST', `/cells/${hostId}/spawn-pastf`, sd, { circleName: archived.name });
    r.check('an archived circle cannot be reviewed -> 403', archRes.status === 403, archRes);
  } else {
    r.note('no archived circle in the seed to test the archived-circle guard');
  }

  const spawn = await req(AUDIT, 'POST', `/cells/${hostId}/spawn-pastf`, sd, { circleName: 'Space Law Circle', minReviewers: 2 });
  r.check('steward spawns a health review -> 201', spawn.status === 201 && !!spawn.j.pastfId, spawn);
  const pId = spawn.j.pastfId;
  const pRow = sqlRows(DB_AUDIT, `SELECT type,status,delib_type,circle,meta FROM cells WHERE id='${pId}';`)[0];
  r.check('review opens as a pending p-aSTF cell',
    pRow && pRow.type === 'p-aSTF Cell' && pRow.status === 'Pending Review' && pRow.circle === 'Space Law Circle', pRow);
  r.check('reviewing twice from the same host -> 409',
    (await req(AUDIT, 'POST', `/cells/${hostId}/spawn-pastf`, sd, { circleName: 'Space Law Circle' })).status === 409);

  // ── 2. reviews ────────────────────────────────────────────────────────
  const member = sqlRows(DB_AUDIT, "SELECT u.name FROM circle_roster cr JOIN users u ON u.id=cr.member_id WHERE cr.circle_id='space-law' AND cr.status='active' LIMIT 1;")[0];
  const reviewer2 = await login(AUDIT, 'mt@solis.local');
  const circleRubric = { activity: 5, competenceFit: 6, discipline: 5, cohesion: 4, delivery: 5 };
  const memberReviews = [{
    name: member.name, initials: 'MT',
    effectiveness: 4, stewardship: 5, participation: 4, investment: 5, productivity: 4, roleFit: 3,
    replaceability: 2, indispensable: 5
  }];

  r.check('an invalid health tier -> 400',
    (await req(AUDIT, 'POST', `/cells/${pId}/pastf-review`, sd, { circleRubric, memberReviews, healthTier: 'bad' })).status === 400);

  const v1 = await req(AUDIT, 'POST', `/cells/${pId}/pastf-review`, sd, { circleRubric, memberReviews, healthTier: 'concern', notes: 'M7 review one' });
  r.check('first review is filed but the review is not complete', v1.status === 200 && v1.j.complete === false, v1);
  r.check('the member rubric total is computed', v1.j && v1.j.circleTotal === 25, v1.j);
  const dup = await req(AUDIT, 'POST', `/cells/${pId}/pastf-review`, sd, { circleRubric, memberReviews, healthTier: 'concern' });
  r.check('a reviewer cannot file twice -> 409', dup.status === 409, dup);

  const v2 = await req(AUDIT, 'POST', `/cells/${pId}/pastf-review`, reviewer2, { circleRubric, memberReviews, healthTier: 'concern', notes: 'M7 review two' });
  r.check('quorum reviews complete the review', v2.status === 200 && v2.j.complete === true, v2);
  const pAfter = sqlRows(DB_AUDIT, `SELECT status,resolution FROM cells WHERE id='${pId}';`)[0];
  r.check('review completes with the agreed health tier',
    pAfter && pAfter.status === 'Review Complete' && /"healthTier":"concern"/.test(pAfter.resolution || ''), pAfter);
  const circleMeta = sqlRows(DB_AUDIT, "SELECT meta FROM circles WHERE id='space-law';")[0];
  r.check('the circle records its last health review date',
    /lastPastfReview/.test(circleMeta.meta || ''), circleMeta && circleMeta.meta);
  const pastfStf = sqlRows(DB_AUDIT, `SELECT status,bucket FROM stfs WHERE id='stf-${pId}';`)[0];
  r.check('the p-aSTF row is completed', pastfStf && pastfStf.bucket === 'completed', pastfStf);

  // ── 3. jSTF referral for an indispensable member ──────────────────────
  const intake = sqlRows(DB_AUDIT, `SELECT id,title,proposal_cell_id FROM threads WHERE proposal_cell_id LIKE 'user:%' ORDER BY id DESC LIMIT 5;`);
  const referral = intake.find(t => /Anonymous Report/.test(t.title || ''));
  r.check('an indispensable member is referred to the jSTF intake', !!referral, intake.map(t => t.title));

  r.save();
  process.exit(r.failures.length ? 1 : 0);
}
main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
