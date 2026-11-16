// M9 — Commons threads & engagement audit
// create → reply → endorse → bookmark → pin → visibility, plus the F2 fix
// (endorse/bookmark previously 500'd on MariaDB).
import { AUDIT, DB_AUDIT, req, login, sql, sqlRows, count, Report } from './lib.mjs';

const r = new Report('m09-threads');

async function main() {
  const sd = await login(AUDIT, 'sd@solis.local');   // steward
  const zk = await login(AUDIT, 'zk@solis.local');   // active member
  const os = await login(AUDIT, 'os@solis.local');   // active member, no circle

  // ── 1. create ─────────────────────────────────────────────────────────
  const th = await req(AUDIT, 'POST', '/threads', zk, {
    id: 'audit-m9-thread', title: 'Audit M9 Discussion', body: 'A discussion body',
    author: 'Zanele Khumalo', initials: 'ZK', replies: 0, likes: 0, shares: 0, time: 'now', pinned: 0
  });
  r.check('a member can create a thread -> 201', th.status === 201, th);
  const thRow = sqlRows(DB_AUDIT, "SELECT id,title,author,visibility,badge FROM threads WHERE id='audit-m9-thread';")[0];
  r.check('the thread is stored with its author', thRow && thRow.title === 'Audit M9 Discussion' && thRow.author === 'Zanele Khumalo', thRow);
  r.check('a new thread is public by default', thRow && (!thRow.visibility || thRow.visibility === 'public'), thRow);

  // ── 2. replies ────────────────────────────────────────────────────────
  const rep = await req(AUDIT, 'POST', '/threads/audit-m9-thread/replies', os, {
    author: 'Oumo Samuel', initials: 'OS', text: 'Audit M9 reply', time: 'now', likes: 0
  });
  r.check('a member can reply -> 201', rep.status === 201, rep);
  r.check('the reply is stored', count(DB_AUDIT, 'thread_replies', "thread_id='audit-m9-thread'") === 1,
    count(DB_AUDIT, 'thread_replies', "thread_id='audit-m9-thread'"));
  const replies = await req(AUDIT, 'GET', '/threads/audit-m9-thread/replies');
  r.check('replies are readable', replies.status === 200 && replies.j.length === 1, replies);
  const edit = await req(AUDIT, 'PATCH', '/threads/audit-m9-thread/replies/' + (replies.j[0] && replies.j[0].id), os, { text: 'Audit M9 reply (edited)' });
  r.check('the author can edit their reply -> 200', edit.status === 200, edit);

  // ── 3. endorsement (regression for F2) ────────────────────────────────
  const end = await req(AUDIT, 'POST', '/threads/audit-m9-thread/endorsement', sd);
  r.check('endorsing a thread succeeds (F2 regression)', end.status === 200 && end.j.endorsed === true, end);
  r.check('the endorsement is stored', count(DB_AUDIT, 'thread_endorsements', "thread_id='audit-m9-thread'") === 1,
    count(DB_AUDIT, 'thread_endorsements', "thread_id='audit-m9-thread'"));
  r.check('the thread endorsement counter is refreshed',
    end.j.endorsements === 1, end);
  const endTwice = await req(AUDIT, 'POST', '/threads/audit-m9-thread/endorsement', sd);
  r.check('endorsing twice does not duplicate the row',
    endTwice.status === 200 && count(DB_AUDIT, 'thread_endorsements', "thread_id='audit-m9-thread'") === 1, endTwice);
  const unend = await req(AUDIT, 'DELETE', '/threads/audit-m9-thread/endorsement', sd);
  r.check('endorsing can be withdrawn', unend.status === 200 && unend.j.endorsed === false, unend);
  r.check('the withdrawn endorsement is gone',
    count(DB_AUDIT, 'thread_endorsements', "thread_id='audit-m9-thread'") === 0,
    count(DB_AUDIT, 'thread_endorsements', "thread_id='audit-m9-thread'"));

  // ── 4. bookmarks (regression for F2) ──────────────────────────────────
  const bm = await req(AUDIT, 'POST', '/threads/audit-m9-thread/bookmark', sd);
  r.check('bookmarking a thread succeeds (F2 regression)', bm.status === 200 && bm.j.bookmarked === true, bm);
  r.check('the bookmark is stored', count(DB_AUDIT, 'thread_bookmarks', "thread_id='audit-m9-thread'") === 1,
    count(DB_AUDIT, 'thread_bookmarks', "thread_id='audit-m9-thread'"));
  const bmOff = await req(AUDIT, 'DELETE', '/threads/audit-m9-thread/bookmark', sd);
  r.check('a bookmark can be removed', bmOff.status === 200 && bmOff.j.bookmarked === false, bmOff);

  // ── 5. pinning is a steward act ───────────────────────────────────────
  const pinDenied = await req(AUDIT, 'POST', '/threads/audit-m9-thread/pin', os);
  r.check('a non-steward cannot pin -> 403', pinDenied.status === 403, pinDenied);
  const pin = await req(AUDIT, 'POST', '/threads/audit-m9-thread/pin', sd);
  r.check('a steward can pin -> 200', pin.status === 200 && pin.j.pinned === true, pin);
  const pinned = sqlRows(DB_AUDIT, "SELECT pinned FROM threads WHERE id='audit-m9-thread';")[0];
  r.check('the pinned flag is stored', pinned && Number(pinned.pinned) === 1, pinned);
  const unpin = await req(AUDIT, 'DELETE', '/threads/audit-m9-thread/pin', sd);
  r.check('unpinning works', unpin.status === 200 && unpin.j.pinned === false, unpin);

  // ── 6. visibility ─────────────────────────────────────────────────────
  const anon = await req(AUDIT, 'GET', '/threads/audit-m9-thread');
  r.check('a public thread is readable anonymously', anon.status === 200, anon);
  const bs = await req(AUDIT, 'GET', '/bootstrap', sd);
  const inFeed = (bs.j.threads || []).some(t => t.id === 'audit-m9-thread');
  r.check('the thread appears in the bootstrap feed', inFeed, (bs.j.threads || []).map(t => t.id));

  // ── 7. stewards-only threads stay private ─────────────────────────────
  const priv = await req(AUDIT, 'POST', '/threads', sd, {
    id: 'audit-m9-private', title: 'Stewards only', body: 'private',
    author: 'Ssempa David', initials: 'SD', badge: 'b-judicial', badge_class: 'b-judicial',
    visibility: 'stewards-only', replies: 0, likes: 0, shares: 0, time: 'now'
  });
  r.check('a stewards-only thread can be created', priv.status === 201, priv);
  const anonPriv = await req(AUDIT, 'GET', '/threads/audit-m9-private');
  r.check('a stewards-only thread is not readable anonymously -> 404', anonPriv.status === 404, anonPriv);
  const memberPriv = await req(AUDIT, 'GET', '/threads/audit-m9-private', os);
  r.check('a non-party member cannot read a stewards-only thread -> 404', memberPriv.status === 404, memberPriv);

  r.save();
  process.exit(r.failures.length ? 1 : 0);
}
main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
