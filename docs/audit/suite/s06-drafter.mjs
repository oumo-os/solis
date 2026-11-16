// S6 — Deliberation & the AI drafter
// The drafter's output must derive from the cell's own record; its guards
// (max drafts, cooldown, confirmation quorum) are documented as configurable —
// check whether the settings are read and whether the server enforces them.
import { AUDIT, DB_AUDIT, req, login, sql, sqlRows, count, Report, REPO, extractFn, bootApp } from './lib.mjs';
import { readFileSync } from 'fs';
import vm from 'vm';

const r = new Report('s06-drafter');

async function main() {
  const sd = await login(AUDIT, 'sd@solis.local');
  const aj = await login(AUDIT, 'aj@solis.local');
  const zk = await login(AUDIT, 'zk@solis.local');

  // ── 1. the drafter derives from the cell record (client side) ─────────
  const spa = readFileSync(REPO + '/platform/index.html', 'utf8');
  const genFn = extractFn(spa, 'generateResolution');
  const canFn = extractFn(spa, 'canRedraft');

  // ── 2. the guards are hardcoded, not read from the settings ──────────
  r.check('the drafter hardcodes its draft cap instead of reading the settings',
    /maxDrafts:\s*3/.test(genFn) && !/aiMaxRedrafts/.test(genFn), 'settings not wired');
  r.check('the drafter hardcodes its cooldown instead of reading the settings',
    /cooldownMs:\s*300000/.test(canFn) && !/aiRedraftCooldown/.test(canFn), 'cooldown not wired');
  r.check('the confirmation quorum is hardcoded to a third of the participants',
    /confirmQuorum:\s*Math\.ceil\(delibParticipants\.length \/ 3\)/.test(genFn) && !/aiConfirmQuorum/.test(genFn),
    'quorum not wired');
  r.check('the settings modal does collect the values (they exist, unused)',
    /aiMaxRedrafts/.test(spa) && /aiRedraftCooldown/.test(spa) && /aiConfirmQuorum/.test(spa), 'settings missing');

  // ── 3. the server enforces no redraft cap or cooldown ───────────────
  const direct = await req(AUDIT, 'POST', '/proposals/direct', sd, {
    title: 'Audit S6 Drafting Cell', description: 'drafter probe', domain: 'Space Law'
  });
  const cellId = direct.j.cellId;
  const draft = await req(AUDIT, 'POST', `/cells/${cellId}/draft-resolutions`, sd, {
    res_id: 9600, title: 'Audit S6 Draft', text: 'MOTION: probe', action: 'Policy', votes_nullified: 0
  });
  const rowId = draft.j.id;
  const versions = [];
  for (let i = 1; i <= 5; i++) {
    const res = await req(AUDIT, 'POST', `/cells/${cellId}/draft-resolutions/${rowId}/versions`, sd, {
      title: 'Audit S6 Draft v' + i, text: 'MOTION: v' + i, action: 'Policy', author: 'AI Drafter', ts: 'now'
    });
    versions.push(res.status);
  }
  r.check('the server accepts every version append (no cap enforced)',
    versions.every(s => s === 201 || s === 200), versions);
  r.check('five redraft versions were stored against one draft',
    count(DB_AUDIT, 'resolution_versions', `draft_id=${rowId}`) === 5,
    count(DB_AUDIT, 'resolution_versions', `draft_id=${rowId}`));

  // ── 4. the confirmation quorum lives only in the browser ──────────────
  const draftCols = sqlRows(DB_AUDIT, 'SHOW COLUMNS FROM draft_resolutions;').map(c => c.Field);
  r.check('the draft row stores no confirmation state (quorum is client-side only)',
    !draftCols.some(c => /confirm/i.test(c)), draftCols.join(','));

  // ── 5. the drafted resolution derives from the cell's own record ──────
  // give the deliberation a real record first
  const msg = await req(AUDIT, 'POST', `/cells/${cellId}/messages`, aj, {
    author: 'Akello Jane', initials: 'AJ', text: 'The deliberation must establish proportional liability.', time: 'now'
  });
  r.check('the deliberation accepts a message from a member with standing', msg.status === 201, msg);
  const bs = await req(AUDIT, 'GET', '/bootstrap', sd);
  const cell = (bs.j.cells || []).find(c => c.id === cellId);
  const { sandbox } = bootApp(sd, AUDIT);
  sandbox.currentDelibCellId = cellId;
  sandbox.delibResolutions = [];
  sandbox.delibParticipants = 6;
  sandbox.MOCK = bs.j;
  sandbox.cellsById = Object.fromEntries((bs.j.cells || []).map(c => [c.id, c]));
  sandbox.generateResolution();
  await new Promise(res => setTimeout(res, 2200));
  const res = (sandbox.delibResolutions || [])[0];
  r.check('the drafter produces a resolution', !!res, sandbox.delibResolutions);
  r.check('the drafted title comes from the cell, not a fixture',
    !!res && res.title === cell.title, { drafted: res && res.title, cell: cell && cell.title });
  r.check('the drafted text starts from the cell\'s own motion line',
    !!res && String(res.text).indexOf('MOTION: ' + cell.title) === 0, res && String(res.text).slice(0, 90));
  r.check('the drafted points come from the cell\'s deliberation record',
    !!res && /deliberation record/i.test(String(res.text)) && /proportional liability/.test(String(res.text)),
    res && String(res.text).slice(-160));

  // the guards: the settings say 1 redraft, the drafter still allows 3
  sandbox.MOCK.systemSettings = { deliberation: { aiMaxRedrafts: 1, aiRedraftCooldown: 60 } };
  const res2 = sandbox.canRedraft({ aiDraftMeta: { draftCount: 2, cooldownMs: 300000, lastDraftTs: null } });
  r.check('the drafter ignores the configured redraft cap',
    res2.ok === true, res2);

  r.save();
  process.exit(r.failures.length ? 1 : 0);
}
main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
