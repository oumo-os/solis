// S4 — Circles & organisations: workflow probes
// Founding flows (circle + organisation), the double-apply, the succession
// chain (apply → vacancy → vetting → seat), and settings persistence.
import { AUDIT, DB_AUDIT, req, login, sql, sqlRows, count, Report, REPO, extractFn } from './lib.mjs';
import { readFileSync } from 'fs';

const r = new Report('s04-circles-organisations');

// Raise a settings proposal, take it through aSTF approval, and let the
// server apply the snapshot — exactly what the client's approval flow does.
async function approveSnapshot(sd, title, snapshot, delibType) {
  const prop = await req(AUDIT, 'POST', '/proposals/system', sd, {
    delibType, title, snapshot, sourceType: delibType === 'circle-creation' ? 'circle-proposal' : 'settings-proposal'
  });
  const cellId = prop.j.cellId;
  const draft = await req(AUDIT, 'POST', `/cells/${cellId}/draft-resolutions`, sd, {
    res_id: 9700 + Math.floor(Math.random() * 200), title: title + ' draft', text: 'MOTION: approve', action: 'Policy', votes_nullified: 0
  });
  const sub = await req(AUDIT, 'POST', `/cells/${cellId}/draft-resolutions/${draft.j.id}/submit`, sd);
  const astfId = sub.j.astfId;
  const cands = sqlRows(DB_AUDIT, `SELECT user_id FROM stf_candidates WHERE stf_id='stf-${astfId}';`);
  const rubric = { jurisdiction: 9, depth: 5, alignment: 10, competence: 6 };
  for (const c of cands.slice(0, 3)) {
    const tok = await login(AUDIT, `${c.user_id}@solis.local`);
    await req(AUDIT, 'POST', `/cells/${astfId}/astf-membership`, tok, { decision: 'accept' });
  }
  for (const c of cands.slice(0, 3)) {
    const tok = await login(AUDIT, `${c.user_id}@solis.local`);
    await req(AUDIT, 'POST', `/cells/${astfId}/astf-verdict`, tok, { verdict: 'approved', rubric, rationale: 'S4 probe' });
  }
  return { cellId, astfId };
}

async function main() {
  const sd = await login(AUDIT, 'sd@solis.local');   // steward of space-law
  const zk = await login(AUDIT, 'zk@solis.local');   // remote-sensing steward
  const os = await login(AUDIT, 'os@solis.local');   // member of no circle
  const ok = await login(AUDIT, 'ok@solis.local');   // applicant in the succession probe

  // ── 1. circle founding (the server's half) ───────────────────────────
  const circlesBefore = count(DB_AUDIT, 'circles');
  const circleSnapshot = {
    type: 'circle', target: 'new', status: 'pending',
    settings: {
      name: 'Audit S4 Circle', status: 'Suggested', description: 'founded by the S4 probe', maxMembers: 15,
      stewardTermOverride: '', expiryOverride: '',
      mandateDomains: { primary: [{ name: 'Space Law', desiredWs: 1000 }], secondary: [] }
    }
  };
  const ledgerBefore = count(DB_AUDIT, 'governance_ledger');
  const founded = await approveSnapshot(sd, 'Circle: Audit S4 Circle Founding', circleSnapshot, 'circle-creation');
  const circlesAfter = count(DB_AUDIT, 'circles');
  r.check('an approved founding creates exactly one circle', circlesAfter === circlesBefore + 1,
    { circlesBefore, circlesAfter });
  const newCircle = sqlRows(DB_AUDIT, "SELECT id,name,status,members,meta FROM circles WHERE name='Audit S4 Circle';");
  r.check('the founded circle exists with its mandate', newCircle.length === 1 && newCircle[0].status === 'Suggested',
    newCircle);
  const founder = sqlRows(DB_AUDIT, `SELECT member_id,status FROM circle_roster WHERE circle_id='${newCircle[0] && newCircle[0].id}';`);
  r.check('the proposer is seated as the founding steward',
    founder.length === 1 && founder[0].member_id === 'sd' && founder[0].status === 'active', founder);
  const ledgerAfter = count(DB_AUDIT, 'governance_ledger');
  r.check('the founding is recorded in the governance ledger', ledgerAfter === ledgerBefore + 1,
    { ledgerBefore, ledgerAfter });
  const mandate = sqlRows(DB_AUDIT, `SELECT domain,mandate,desired_ws FROM circle_domains WHERE circle_id='${newCircle[0] && newCircle[0].id}';`);
  r.check('the mandate domains are stored on the circle', mandate.length === 1 && mandate[0].mandate === 'primary', mandate);

  // ── 2. the browser must not apply the snapshot itself ─────────────────
  // (the server is the single writer: it creates the circle, seats the
  // founder and writes the ledger entry)
  const spa = readFileSync(REPO + '/platform/index.html', 'utf8');
  const applyFn = extractFn(spa, 'applySettingsSnapshot');
  r.check('the browser does not create the circle itself', !/saveCircle\(/.test(applyFn), 'saveCircle still called');
  r.check('the browser does not write a governance ledger row', !/saveGovernanceEntry\(/.test(applyFn), 'saveGovernanceEntry still called');
  r.check('the browser does not write the system settings', !/saveSystemSettings\(/.test(applyFn), 'saveSystemSettings still called');
  const dupes = sqlRows(DB_AUDIT, "SELECT id,status,members FROM circles WHERE name='Audit S4 Circle';");
  r.check('exactly one circle carries the founded name', dupes.length === 1, dupes);
  const dupLedger = count(DB_AUDIT, 'governance_ledger');
  r.check('the founding writes exactly one ledger entry', dupLedger === ledgerAfter, { dupLedger, ledgerAfter });

  // ── 3. organisation founding ─────────────────────────────────────────
  const orgsBefore = count(DB_AUDIT, 'organisations');
  const orgSnapshot = {
    type: 'org', target: 'new', status: 'pending',
    settings: { name: 'Audit S4 Organisation', acronym: 'AS4', shortname: 'Audit S4', location: 'Kampala', summary: 'probe', website: '', domains: ['remote-sensing'] }
  };
  await approveSnapshot(sd, 'Org: Audit S4 Organisation Affiliation', orgSnapshot, 'org-creation');
  const orgsAfter = count(DB_AUDIT, 'organisations');
  r.check('an approved organisation founding creates the organisation',
    orgsAfter === orgsBefore + 1, { orgsBefore, orgsAfter });
  const orgRow = sqlRows(DB_AUDIT, "SELECT id,name,acronym,location,status FROM organisations WHERE name='Audit S4 Organisation';");
  r.check('the organisation row is stored', orgRow.length === 1, orgRow);
  const orgKd = orgRow.length ? sqlRows(DB_AUDIT, `SELECT domain FROM org_knowledge_domains WHERE org_id='${orgRow[0].id}';`) : [];
  r.check('the organisation carries its knowledge domain', orgKd.length === 1 && orgKd[0].domain === 'remote-sensing', orgKd);
  const orgLedger = count(DB_AUDIT, 'governance_ledger', "type='org'");
  r.check('the organisation founding is written to the governance ledger', orgLedger >= 1, { orgLedger });

  // ── 4. organisation settings change (existing org) ────────────────────
  const gssBefore = sqlRows(DB_AUDIT, "SELECT summary FROM organisations WHERE id='gss';")[0];
  await approveSnapshot(sd, 'Org: Ghana Space Society [GSS] Settings Change', {
    type: 'org', target: 'gss', status: 'pending',
    settings: { name: 'Ghana Space Society', acronym: 'GSS', location: 'Accra', summary: 'S4 probe summary', website: '', domains: ['Remote Sensing'] }
  }, 'org-settings');
  const gssAfter = sqlRows(DB_AUDIT, "SELECT summary FROM organisations WHERE id='gss';")[0];
  r.check('an approved organisation settings change is persisted',
    gssAfter && gssAfter.summary !== gssBefore.summary, { before: gssBefore, after: gssAfter });

  // ── 5. circle settings change (existing circle) ───────────────────────
  const slBefore = sqlRows(DB_AUDIT, "SELECT description FROM circles WHERE id='space-law';")[0];
  await approveSnapshot(sd, 'Circle: Space Law Circle Settings Change', {
    type: 'circle', target: 'space-law', status: 'pending',
    settings: { name: 'Space Law Circle', status: 'Active', description: 'S4 probe description', maxMembers: 15, stewardTermOverride: '', expiryOverride: '', mandateDomains: { primary: [{ name: 'Space Law', desiredWs: 2500 }], secondary: [] } }
  }, 'circle-settings');
  const slAfter = sqlRows(DB_AUDIT, "SELECT description FROM circles WHERE id='space-law';")[0];
  r.check('an approved circle settings change is persisted',
    slAfter && slAfter.description !== slBefore.description, { before: slBefore, after: slAfter });

  // ── 6. the succession chain ──────────────────────────────────────────
  // Rule: a seat opens → the engine vets the pending applicants → the top
  // APPROVED candidate takes the seat. Proven on the circle this probe
  // founded (no pre-vetted claims), and against space-law where the seed
  // already carries an approved candidacy.
  const newCircleId = newCircle[0].id;
  const app = await req(AUDIT, 'POST', '/circle-applications', ok, { circle_id: newCircleId, motivation: 'S4 succession probe' });
  r.check('an application enters the succession queue', app.status === 201 && app.j.queuePosition >= 1, app);
  const resign = await req(AUDIT, 'POST', `/circles/${newCircleId}/resign`, sd);
  r.check('a resignation opens a succession vacancy', resign.status === 200, resign);
  const vac = sqlRows(DB_AUDIT, `SELECT meta FROM circles WHERE id='${newCircleId}';`)[0];
  r.check('the vacancy is recorded on the circle', /vacancies/.test(vac.meta || ''), vac && vac.meta);

  const poll1 = await req(AUDIT, 'POST', '/engine/poll', sd);
  r.check('the integrity engine vets the pending applicant', poll1.status === 200 && poll1.j.acted >= 1, poll1);
  const claims = sqlRows(DB_AUDIT, "SELECT id,source,status FROM cells WHERE type='vSTF Cell' AND delib_type='steward-candidacy';");
  const mine = claims.filter(c => /Osei Kwame/.test(c.source || ''));
  r.check('a steward-candidacy claim was spawned for the applicant', mine.length >= 1,
    claims.map(c => (JSON.parse(c.source || '{}').candidateName || '?')));
  const claimId = mine.length ? mine[0].id : null;
  const claimSrc = mine.length ? JSON.parse(mine[0].source || '{}') : {};
  r.check('the claim names the applicant and the circle',
    claimSrc.candidateName === 'Osei Kwame' && claimSrc.vacancyFor === newCircleId, claimSrc);
  if (claimId) {
    // engine-spawned claims carry the default quorum of three assessors
    for (const a of ['aj', 'mt', 'nc']) {
      const tok = await login(AUDIT, `${a}@solis.local`);
      const res = await req(AUDIT, 'POST', `/cells/${claimId}/vstf-assessment`, tok, { score: 80, rationale: 'S4 vetting' });
      r.check(`assessor ${a} files a candidacy assessment`, res.status === 200, res);
    }
    const claimRow = sqlRows(DB_AUDIT, `SELECT status,resolution FROM cells WHERE id='${claimId}';`)[0];
    r.check('the claim reaches Assessment Filed at quorum',
      claimRow && claimRow.status === 'Assessment Filed' && /"approved":true/.test(claimRow.resolution || ''), claimRow);
    const poll2 = await req(AUDIT, 'POST', '/engine/poll', sd);
    r.check('the engine seats the approved applicant', poll2.status === 200, poll2);
    const seated = sqlRows(DB_AUDIT, `SELECT member_id,status FROM circle_roster WHERE circle_id='${newCircleId}' AND member_id='ok';`);
    r.check('the applicant is seated on the circle',
      seated.length >= 1 && seated[0].status === 'active', seated);
    const appAfter = sqlRows(DB_AUDIT, `SELECT status FROM circle_applications WHERE id='${app.j.id}';`)[0];
    r.check('the application is marked accepted once seated',
      appAfter && appAfter.status === 'accepted', appAfter);
  }

  // the seeded pre-vetted candidacy takes precedence when a seat opens
  const slApp = await req(AUDIT, 'POST', '/circle-applications', zk, { circle_id: 'space-law', motivation: 'S4 second applicant' });
  const sdResign = await req(AUDIT, 'POST', '/circles/space-law/resign', sd);
  r.check('space-law: a second seat opens', sdResign.status === 200, sdResign);
  const poll3 = await req(AUDIT, 'POST', '/engine/poll', sd);
  r.check('the engine fills the seat with the top approved candidate', poll3.status === 200, poll3);
  const osSeated = sqlRows(DB_AUDIT, "SELECT member_id,status FROM circle_roster WHERE circle_id='space-law' AND member_id='os';");
  r.check('the pre-vetted candidate (score 75, seed) takes the open seat',
    osSeated.length >= 1 && osSeated[0].status === 'active', osSeated);

  r.save();
  process.exit(r.failures.length ? 1 : 0);
}
main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
