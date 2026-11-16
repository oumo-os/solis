// S7 — Vote weight system
// effectiveWeight = Ws x domain share x mandate multiplier; quorum 2/3 of
// members; pass = yea > 50% of (yea + nay); abstain is a Ws sum added to the
// button denominator only. The panel and the server must agree on the outcome.
import { AUDIT, DB_AUDIT, req, login, sql, sqlRows, count, Report, REPO, extractFn, bootApp } from './lib.mjs';
import { readFileSync } from 'fs';

const r = new Report('s07-vote-weight');

async function main() {
  const sd = await login(AUDIT, 'sd@solis.local');
  const mt = await login(AUDIT, 'mt@solis.local');

  const spa = readFileSync(REPO + '/platform/index.html', 'utf8');
  const multFn = extractFn(spa, 'getMandateMultiplier');
  const sumFn = extractFn(spa, 'updateVoteSummary');

  // ── 1. the documented constants ───────────────────────────────────────
  r.check('the mandate multipliers are 1.5 / 1.0 / 0.25',
    /return 1\.5/.test(multFn) && /return 1\.0/.test(multFn) && /return 0\.25/.test(multFn), 'multipliers differ');
  r.check('the quorum is two thirds of the members',
    /Math\.ceil\(totalMembers \* requiredFraction\)/.test(sumFn) && /requiredFraction = 2\/3/.test(sumFn), 'quorum differs');
  r.check('the pass rule is a yea ratio above fifty percent of yea plus nay',
    /passRatio > 50/.test(sumFn), 'pass rule differs');
  r.check('the button percentages and the pass ratio use different denominators',
    /totalWeight = effYea \+ effNay \+ absTotal/.test(sumFn) && /effYN > 0 \? Math\.round\(effYea \/ effYN \* 100\)/.test(sumFn),
    'denominators collapsed');

  // ── 2. the server's totals are raw Ws sums, not effective weights ────
  const apiSrc = readFileSync(REPO + '/platform/api.php', 'utf8');
  r.check('the server aggregates raw Ws (no share, no mandate multiplier)',
    /SUM\(CASE WHEN vote='yea' THEN ws END\)/.test(apiSrc) && !/mandateMultiplier/.test(apiSrc), 'server weighting differs');

  // ── 3. a case where the two disagree ─────────────────────────────────
  // cell-21: domains Liability / Remote Sensing / Space Law, participants 12.
  //   sd (Space Law 900, primary mandate) votes yea
  //   mt (Remote Sensing 1200, no mandate there) votes nay
  // raw      : yea 900  vs nay 1200  -> the server crystallises "failed"
  // effective: yea 900x0.5x1.5 = 675 vs nay 1200x0.5x0.25 = 150 -> the panel
  //            reads it as a clear yea, but the quorum (8 of 12) is not met.
  const v1 = await req(AUDIT, 'POST', '/cells/cell-21/vote-records', sd, { domain: 'Space Law', vote: 'yea', ws: 900 });
  const v2 = await req(AUDIT, 'POST', '/cells/cell-21/vote-records', mt, { domain: 'Remote Sensing', vote: 'nay', ws: 1200 });
  r.check('both votes are recorded', v1.status === 200 && v2.status === 200, { v1, v2 });

  const summary = sqlRows(DB_AUDIT, "SELECT summary FROM cell_vote_summary WHERE cell_id='cell-21';")[0];
  const sum = JSON.parse(summary.summary || '{}');
  r.check('the server stores the raw sums', sum.yea === 900 && sum.nay === 1200, sum);

  // the panel's own arithmetic on the same votes
  const bs = await req(AUDIT, 'GET', '/bootstrap', sd);
  const { sandbox } = bootApp(sd, AUDIT);
  const cell = (bs.j.cells || []).find(c => c.id === 'cell-21');
  sandbox.MOCK = bs.j;
  sandbox.cellsById = Object.fromEntries((bs.j.cells || []).map(c => [c.id, c]));
  sandbox.currentDelibCellId = 'cell-21';
  sandbox.delibResolutions = [{ domainShares: {} }];   // equal share over the voted domains
  sandbox.delibParticipants = 12;
  sandbox.updateVoteSummary();
  const box = id => {
    const el = sandbox.__els.get(id);
    return el ? el.textContent : undefined;
  };
  r.check('the panel reads a yea majority from the same votes',
    box('vs-yea-pct') && box('vs-yea-pct') !== '0%' && Number(String(box('vs-yea-pct')).replace('%', '')) > 50,
    { yea: box('vs-yea-pct'), nay: box('vs-nay-pct') });
  r.check('the panel holds the verdict pending because the quorum is not met',
    box('vs-pass-status') === 'pending', box('vs-pass-status'));
  r.check('the quorum it applies is two thirds of the participating members',
    box('vs-qrm-req') !== undefined && Number(box('vs-qrm-req')) === 6, box('vs-qrm-req'));

  // the server decides anyway
  const close = await req(AUDIT, 'POST', '/cells/cell-21/debate/close', sd);
  r.check('the server still crystallises the resolution', close.status === 200, close);
  r.check('the server\'s outcome differs from the panel\'s reading',
    close.j && close.j.outcome === 'failed' && box('vs-pass-status') === 'pending',
    { server: close.j, panel: box['vs-pass-status'] && box['vs-pass-status'].textContent });

  r.save();
  process.exit(r.failures.length ? 1 : 0);
}
main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
