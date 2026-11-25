// S14 — Inbox audit (after the per-user rebuild).
import { AUDIT, DB_AUDIT, req, login, sql, sqlRows, count, Report, bootApp } from './lib.mjs';

const r = new Report('s14-inbox');

async function main() {
  const os = await login(AUDIT, 'os@solis.local');
  const aj = await login(AUDIT, 'aj@solis.local');
  // The live seed has all items marked read; restore a realistic unread mix
  // in the isolated database for the badge/teaser checks.
  sql(DB_AUDIT, "UPDATE inbox SET unread=1 WHERE user_id='os' AND id IN ('ib-1','ib-2','ib-3');");

  // ── 1. per-user scoping ───────────────────────────────────────────────
  const mine = await req(AUDIT, 'GET', '/bootstrap', os);
  const theirs = await req(AUDIT, 'GET', '/bootstrap', aj);
  const anon = await req(AUDIT, 'GET', '/bootstrap');
  r.check('the owner sees their inbox', mine.j.inbox.length === 6, mine.j.inbox.length);
  r.check('another member sees an empty inbox', theirs.j.inbox.length === 0, theirs.j.inbox.length);
  r.check('anonymous sees no inbox', anon.j.inbox.length === 0, anon.j.inbox.length);
  r.check('detail is decoded (no JSON quotes)', !/^"/.test(String(mine.j.inbox[0].detail || '')) && mine.j.inbox[0].detail.indexOf('You have been selected') === 0,
    String(mine.j.inbox[0].detail).slice(0, 60));
  r.check('unread flags are per item', mine.j.inbox.some(i => i.unread) && mine.j.inbox.some(i => !i.unread),
    mine.j.inbox.map(i => i.unread));

  // ── 2. ownership of writes ────────────────────────────────────────────
  const foreign = await req(AUDIT, 'PATCH', '/inbox/ib-1', aj, { badge: 'Hacked' });
  r.check('a non-owner cannot read/patch an inbox item -> 404', foreign.status === 404, foreign);
  const own = await req(AUDIT, 'PATCH', '/inbox/ib-1', os, { badge: 'Read' });
  r.check('the owner can patch their item', own.status === 200, own.status);

  // ── 3. child actions/meta persist ─────────────────────────────────────
  const actions = await req(AUDIT, 'GET', '/inbox/ib-1/actions', os);
  r.check('the actions child route returns an array', actions.status === 200 && Array.isArray(actions.j), actions);
  const meta = await req(AUDIT, 'GET', '/inbox/ib-1/meta', os);
  r.check('the meta child route returns an array', meta.status === 200 && Array.isArray(meta.j), meta.status);
  const foreignChild = await req(AUDIT, 'GET', '/inbox/ib-1/actions', aj);
  r.check('child routes are scoped to the owner', foreignChild.status === 404, foreignChild.status);

  // ── 4. UI: one renderer, empty state, escaping, refresh ───────────────
  const { sandbox, els, errs } = bootApp(os, AUDIT);
  await new Promise(res => setTimeout(res, 900));
  r.check('the SPA boots without errors', errs.length === 0, errs.slice(0, 3));
  r.check('the single inbox list renderer is used', !sandbox.renderInboxItems && typeof sandbox.renderInboxList === 'function',
    !!sandbox.renderInboxItems);
  const teaser = els.get('inbox-teaser');
  r.check('the personal teaser renders unread items', teaser && /unread notification/.test(teaser.innerHTML), teaser && teaser.innerHTML.slice(0, 100));
  const unreadBefore = mine.j.inbox.filter(i => i.unread).length;
  const badgeBefore = els.get('inbox-badge').textContent;
  r.check('the nav badge matches unread count', Number(badgeBefore) === unreadBefore, { badgeBefore, unreadBefore });

  sandbox.selectInboxItem(mine.j.inbox.find(i => i.unread).id);
  await new Promise(res => setTimeout(res, 300));
  const unreadAfter = count(DB_AUDIT, 'inbox', "unread=1 AND user_id='os'");
  const badgeAfter = els.get('inbox-badge').textContent;
  r.check('marking an item read updates the DB', unreadAfter === unreadBefore - 1, { unreadBefore, unreadAfter });
  r.check('the nav badge refreshes immediately', Number(badgeAfter) === unreadAfter, { badgeAfter, unreadAfter });
  r.check('the personal teaser refreshes immediately',
    /unread notification/.test(els.get('inbox-teaser').innerHTML) === (unreadAfter > 0), els.get('inbox-teaser').innerHTML.slice(0, 90));

  sandbox.nav('inbox');
  r.check('nav to inbox resets the detail pane',
    /Select a message/.test(els.get('inbox-detail').innerHTML), els.get('inbox-detail').innerHTML.slice(0, 80));
  r.check('nav to inbox renders the list', els.get('inbox-list').innerHTML.includes('inbox-item'), els.get('inbox-list').innerHTML.slice(0, 80));

  // empty state for a member with no items
  const { sandbox: s2, els: e2 } = bootApp(aj, AUDIT);
  s2.renderInboxList('all');
  r.check('the empty inbox has a proper empty state', /No notifications/.test(e2.get('inbox-list').innerHTML),
    e2.get('inbox-list').innerHTML.slice(0, 90));

  r.save();
  process.exit(r.failures.length ? 1 : 0);
}
main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
