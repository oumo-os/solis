// S6 — Deliberation & the AI drafter (after the F-D fix)
// The settings are persisted and read, and the server enforces the cap,
// cooldown and confirmation quorum where the version is recorded.
import { AUDIT, DB_AUDIT, req, login, sql, sqlRows, count, Report, REPO, extractFn, bootApp } from './lib.mjs';
import { readFileSync } from 'fs';

const r = new Report('s06-drafter');

async function main() {
  const sd = await login(AUDIT, 'sd@solis.local');
  const aj = await login(AUDIT, 'aj@solis.local');
  const spa = readFileSync(REPO + '/platform/index.html', 'utf8');
  const genFn = extractFn(spa, 'generateResolution');

  // ── 1. the guards are wired to the settings ───────────────────────────
  r.check('the drafter reads its cap from the settings',
    /drafterSettings\(\)/.test(genFn) && /aiMaxRedrafts/.test(spa) && !/maxDrafts:\s*3[\s,.]/.test(genFn), 'cap still hardcoded');
  r.check('the drafter reads its cooldown from the settings',
    /cooldownMs:\s*_cfg\.cooldownMs/.test(genFn) && !/cooldownMs:\s*300000/.test(genFn), 'cooldown still hardcoded');
  r.check('the confirmation quorum is configurable',
    /confirmQuorum:\s*_cfg\.confirmQuorum/.test(genFn) && /aiConfirmQuorum/.test(spa), 'quorum still hardcoded');
  r.check('confirmations are persisted through the API',
    /confirmRedraft/.test(spa) && /\/confirm'/.test(readFileSync(REPO + '/platform/api-client.js', 'utf8')), 'confirm endpoint missing');

  // ── 2. the server enforces the cap and quorum ────────────────────────
  const direct = await req(AUDIT, 'POST', '/proposals/direct', sd, {
    title: 'Audit S6 Drafting Cell', description: 'drafter probe', domain: 'Space Law'
  });
  const cellId = direct.j.cellId;
  sql(DB_AUDIT, `UPDATE cells SET participants=3 WHERE id='${cellId}';`);
  const draft = await req(AUDIT, 'POST', `/cells/${cellId}/draft-resolutions`, sd, {
    res_id: 9600, title: 'Audit S6 Draft', text: 'MOTION: probe', action: 'Policy', votes_nullified: 0
  });
  const rowId = draft.j.id;
  const early = await req(AUDIT, 'POST', `/cells/${cellId}/draft-resolutions/${rowId}/versions`, sd, {
    title: 'v1', text: 'MOTION: v1', action: 'Policy', author: 'AI Drafter', ts: 'now'
  });
  r.check('the server rejects a redraft without confirmations -> 409', early.status === 409, early);
  r.check('the refusal names the missing quorum', /confirmations/.test((early.j && early.j.error) || ''), early.j);

  const need = (await req(AUDIT, 'GET', '/system-settings', sd)).j.ai_confirm_quorum;
  for (let i = 0; i < 3; i++) {
    const tok = i === 0 ? sd : await login(AUDIT, ['sd', 'aj', 'mt', 'nc'][i] + '@solis.local');
    await req(AUDIT, 'POST', `/cells/${cellId}/draft-resolutions/${rowId}/confirm`, tok);
  }
  const persist = sqlRows(DB_AUDIT, `SELECT confirmations FROM draft_resolutions WHERE id=${rowId};`)[0];
  r.check('confirmations are persisted on the draft',
    !!persist && JSON.parse(persist.confirmations || '[]').length >= 1, persist);

  const versions = [];
  for (let i = 1; i <= 5; i++) {
    // simulate the configured cooldown elapsing between redrafts
    if (i > 1) sql(DB_AUDIT, `UPDATE draft_resolutions SET last_draft_ts = ${Date.now() - 6 * 60000}, confirmations = '["sd"]' WHERE id=${rowId};`);
    const res = await req(AUDIT, 'POST', `/cells/${cellId}/draft-resolutions/${rowId}/versions`, sd, {
      title: 'Audit S6 Draft v' + i, text: 'MOTION: v' + i, action: 'Policy', author: 'AI Drafter', ts: 'now'
    });
    versions.push(res.status);
  }
  r.check('the cap is enforced: only three versions are accepted',
    versions.slice(0, 3).every(s => s === 201) && versions.slice(3).every(s => s === 409), versions);
  r.check('exactly three redraft versions were stored',
    count(DB_AUDIT, 'resolution_versions', `draft_id=${rowId}`) === 3,
    count(DB_AUDIT, 'resolution_versions', `draft_id=${rowId}`));

  // ── 3. the drafter still derives from the cell record ─────────────────
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
  r.check('the drafted title comes from the cell', !!res && res.title === cell.title, res && res.title);
  r.check('the drafted points come from the deliberation record',
    !!res && /proportional liability/.test(String(res.text)), res && String(res.text).slice(-140));

  // settings are read by the client
  r.check('the collected settings are exposed in the bootstrap',
    !!(bs.j.systemSettings && bs.j.systemSettings.aiMaxRedrafts), bs.j.systemSettings);
  sandbox.MOCK.systemSettings = { aiMaxRedrafts: 1, aiRedraftCooldown: 60 };
  const blocked = sandbox.canRedraft({ aiDraftMeta: { draftCount: 2, cooldownMs: 300000, lastDraftTs: null } });
  r.check('the browser honours the configured cap', blocked.ok === false, blocked);

  r.save();
  process.exit(r.failures.length ? 1 : 0);
}
main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
