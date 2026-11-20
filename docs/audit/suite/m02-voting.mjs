// M2 — Voting & crystallisation audit
// Participation follows domains: a member votes only where they hold
// standing, and the weight is their own recorded standing. The vote
// aggregates then drive the panel and the crystallisation decision.
import { AUDIT, DB_AUDIT, req, login, sql, sqlRows, count, Report, spaSource, extractFn } from './lib.mjs';
import vm from 'vm';

const r = new Report('m02-voting');

function uiSandbox(bs, cellId) {
  const rendered = {};
  const els = {};
  const doc = {
    getElementById(id) {
      if (!els[id]) els[id] = { textContent: '', style: {}, innerHTML: '' };
      return els[id];
    }
  };
  const sandbox = {
    document: doc,
    setText: (id, v) => { rendered[id] = String(v); els[id] = els[id] || { textContent: '', style: {} }; els[id].textContent = String(v); },
    setHtml: (id, v) => { rendered[id] = String(v); },
    escapeHtml: s => s,
    fmt: n => String(n),
    getMandateMultiplier: () => 1,
    MOCK: bs.j,
    delibResolutions: [{ domainShares: {} }],
    currentDelibCellId: cellId,
    cellsById: Object.fromEntries((bs.j.cells || []).map(c => [c.id, c])),
    Number: Number, Math: Math, String: String, Array: Array, Object: Object,
    console: console
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFn(spaSource(), 'updateVoteSummary'), sandbox);
  return { sandbox, rendered };
}

async function main() {
  const sd = await login(AUDIT, 'sd@solis.local');    // Space Law 900, Policy 760
  const zk = await login(AUDIT, 'zk@solis.local');    // Remote Sensing 1300, Data Analysis 1050
  const mt = await login(AUDIT, 'mt@solis.local');    // Remote Sensing 1200, Events 890
  const bo = await login(AUDIT, 'bo@solis.local');    // Remote Sensing 1150, GIS 900
  const aj = await login(AUDIT, 'aj@solis.local');    // Space Law 1800, Astrophysics 1240
  const dm = await login(AUDIT, 'dm@solis.local');    // sanctioned (Restricted) member
  const os = await login(AUDIT, 'os@solis.local');    // member of no circle (not a steward)

  // ── 1. set up a deliberation with a submitted draft ────────────────────
  const direct = await req(AUDIT, 'POST', '/proposals/direct', sd, {
    title: 'Audit M2 Voting Cell', description: 'vote probe', domain: 'Space Law'
  });
  const cellId = direct.j.cellId;
  // This cell has no participating circles, so the quorum falls back to its
  // participant count. Keep the scenario quorate: four voters of three.
  sql(DB_AUDIT, `UPDATE cells SET participants=3 WHERE id='${cellId}';`);
  const draft = await req(AUDIT, 'POST', `/cells/${cellId}/draft-resolutions`, sd, {
    res_id: 9100, title: 'Audit M2 Draft', text: 'MOTION: probe', action: 'Policy', votes_nullified: 0
  });
  const rowId = draft.j.id;
  const submit = await req(AUDIT, 'POST', `/cells/${cellId}/draft-resolutions/${rowId}/submit`, sd);
  r.check('setup: draft submitted', submit.status === 200, submit);

  // ── 2. cast votes ─────────────────────────────────────────────────────
  // Each voter votes in a domain where they hold standing; the client asks
  // for a small weight, the server keeps the member's real standing.
  const votes = [
    { token: zk, domain: 'Remote Sensing', vote: 'nay', ws: 500 },
    { token: mt, domain: 'Remote Sensing', vote: 'nay', ws: 400 },
    { token: bo, domain: 'Remote Sensing', vote: 'nay', ws: 100 },
    { token: aj, domain: 'Space Law', vote: 'yea', ws: 100 }
  ];
  const responses = [];
  for (const v of votes) {
    responses.push(await req(AUDIT, 'POST', `/cells/${cellId}/vote-records`, v.token, {
      domain: v.domain, vote: v.vote, ws: v.ws
    }));
  }
  r.check('member can cast a vote -> 200 with record + domains + summary',
    responses.every(x => x.status === 200 && x.j && x.j.record && x.j.domains && x.j.summary), responses);
  r.check('the vote response carries the domains and summary the client renders',
    responses.every(x => x.j && Array.isArray(x.j.domains) && x.j.summary),
    responses.map(x => x.j && Object.keys(x.j)));

  const restricted = await req(AUDIT, 'POST', `/cells/${cellId}/vote-records`, dm, { domain: 'Space Law', vote: 'yea', ws: 100 });
  r.check('sanctioned (Restricted) member cannot vote -> 403', restricted.status === 403, restricted);

  const recRows = sqlRows(DB_AUDIT, `SELECT domain,vote,ws,user_id,initials FROM vote_records WHERE cell_id='${cellId}';`);
  r.check('vote_records persisted for every voter', recRows.length === 4, recRows);
  r.check('vote rows are stamped with the voter identity',
    recRows.every(x => !!x.user_id && !!x.initials), recRows);
  r.check('the stored weights are effective (Ws x share x mandate)',
    recRows.find(x => x.user_id === 'zk').ws === '325' &&
    recRows.find(x => x.user_id === 'mt').ws === '300' &&
    recRows.find(x => x.user_id === 'bo').ws === '288' &&
    recRows.find(x => x.user_id === 'aj').ws === '450', recRows);
  r.check('the nay weight outweighs the yea weight',
    recRows.filter(x => x.vote === 'nay').reduce((s, x) => s + Number(x.ws), 0) === 913 &&
    recRows.filter(x => x.vote === 'yea').reduce((s, x) => s + Number(x.ws), 0) === 450, recRows);

  // ── 3. one member one vote ────────────────────────────────────────────
  const revote = await req(AUDIT, 'POST', `/cells/${cellId}/vote-records`, zk, {
    domain: 'Remote Sensing', vote: 'abstain', ws: 700
  });
  const afterRevote = sqlRows(DB_AUDIT, `SELECT vote,ws,user_id FROM vote_records WHERE cell_id='${cellId}';`);
  r.check('re-voting replaces the previous vote (one member one vote)',
    afterRevote.length === 4 && afterRevote.find(x => x.user_id === 'zk').vote === 'abstain' &&
    afterRevote.find(x => x.user_id === 'zk').ws === '325', afterRevote);

  // ── 4. aggregates ─────────────────────────────────────────────────────
  const aggVotes = count(DB_AUDIT, 'cell_votes', `cell_id='${cellId}'`);
  const aggSummary = count(DB_AUDIT, 'cell_vote_summary', `cell_id='${cellId}'`);
  r.check('cell_votes aggregate written for the cell', aggVotes >= 1, { aggVotes });
  r.check('cell_vote_summary aggregate written for the cell', aggSummary === 1, { aggSummary });

  // ── 5. bootstrap read-back (what the UI actually loads) ───────────────
  const bs = await req(AUDIT, 'GET', '/bootstrap', sd);
  const bsCell = (bs.j.cells || []).find(c => c.id === cellId);
  r.check('bootstrap exposes cell.votes for the cell', !!(bsCell && bsCell.votes), bsCell && bsCell.votes);
  r.check('bootstrap cell.votes carries the cast domains',
    !!(bsCell && bsCell.votes && Array.isArray(bsCell.votes.domains) && bsCell.votes.domains.length >= 1),
    bsCell && bsCell.votes);
  r.check('bootstrap cell.votes carries the yea/nay summary',
    !!(bsCell && bsCell.votes && bsCell.votes.summary && typeof bsCell.votes.summary.yea === 'number'),
    bsCell && bsCell.votes && bsCell.votes.summary);
  r.check('the bootstrap summary reflects the derived weights',
    bsCell && bsCell.votes && bsCell.votes.summary.yea === 450 && bsCell.votes.summary.nay === 588 &&
    bsCell.votes.summary.abstain === 325,
    bsCell && bsCell.votes && bsCell.votes.summary);

  // ── 6. UI layer: does the real vote panel render the cast votes? ──────
  const { sandbox, rendered } = uiSandbox(bs, cellId);
  try { sandbox.updateVoteSummary(); } catch (e) { r.note('updateVoteSummary threw: ' + e.message); }
  r.check('UI vote panel renders the yea percentage',
    rendered['vs-yea-pct'] && rendered['vs-yea-pct'] !== '0%',
    { 'vs-yea-pct': rendered['vs-yea-pct'], 'vs-nay-pct': rendered['vs-nay-pct'] });
  r.check('UI vote panel renders the nay percentage',
    rendered['vs-nay-pct'] && rendered['vs-nay-pct'] !== '0%',
    { 'vs-nay-pct': rendered['vs-nay-pct'] });

  // ── 7. crystallisation must reflect the votes (nay 2350 > yea 1800 → failed) ─
  const close = await req(AUDIT, 'POST', `/cells/${cellId}/debate/close`, sd);
  r.check('steward can close the debate -> 200', close.status === 200, close);
  r.check('crystallisation outcome reflects the cast votes (nay > yea → failed)',
    close.j && close.j.outcome === 'failed', close.j);
  r.check('crystallisation reports the real yea/nay totals',
    close.j && Number(close.j.yea) === 450 && Number(close.j.nay) === 588, close.j);
  const cellAfter = sqlRows(DB_AUDIT, `SELECT status,resolution FROM cells WHERE id='${cellId}';`)[0];
  r.check('cell becomes crystallised', cellAfter && cellAfter.status === 'crystallised', cellAfter);
  const draftAfter = sqlRows(DB_AUDIT, `SELECT status FROM draft_resolutions WHERE id=${rowId};`)[0];
  r.check('draft resolution marked failed when nay outweighs yea',
    draftAfter && draftAfter.status === 'failed', draftAfter);
  const evt = sqlRows(DB_AUDIT, `SELECT text FROM governance_events WHERE type='cell-crystallisation' ORDER BY date DESC LIMIT 1;`)[0];
  const evtText = (evt && evt.text) || '';
  r.check('governance event records the vote weights', /yea 450 Ws \/ nay 588 Ws/.test(evtText), evtText);

  // A member of no circle is not a steward under the platform's model
  // (the circle roster is the steward body) — see finding F3.
  const close2 = await req(AUDIT, 'POST', `/cells/${cellId}/debate/close`, os);
  r.check('a non-roster member cannot close a debate -> 403', close2.status === 403, close2);

  r.save();
  process.exit(r.failures.length ? 1 : 0);
}
main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });


