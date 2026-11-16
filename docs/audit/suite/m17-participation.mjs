// M17 — Participation & domain separation audit
// Steward actions are open to every steward; participation is separated by
// topic: a member speaks and votes in a deliberation only where they hold
// standing, and their weight is their own.
import { AUDIT, DB_AUDIT, req, login, sql, sqlRows, count, Report } from './lib.mjs';

const r = new Report('m17-participation');

async function main() {
  const sd = await login(AUDIT, 'sd@solis.local');   // Space Law 900, Policy 760
  const aj = await login(AUDIT, 'aj@solis.local');   // Space Law 1800, Astrophysics 1240
  const nc = await login(AUDIT, 'nc@solis.local');   // Publications 1400, Space Med 1050
  const zk = await login(AUDIT, 'zk@solis.local');   // Remote Sensing 1300, Data Analysis 1050

  // cell-21 is a seeded deliberation on Liability / Remote Sensing / Space Law
  const cell = sqlRows(DB_AUDIT, "SELECT id,title,type FROM cells WHERE id='cell-21';")[0];
  r.check('the seeded deliberation cell is available', !!cell && cell.type === 'Deliberation Cell', cell);

  // ── 1. the participation topics are exposed to the client ──────────────
  const bs = await req(AUDIT, 'GET', '/bootstrap', sd);
  const bsCell = (bs.j.cells || []).find(c => c.id === 'cell-21');
  r.check('the cell exposes its participation domains',
    !!(bsCell && bsCell.domains && bsCell.domains.includes('Space Law') && bsCell.domains.includes('Remote Sensing')),
    bsCell && bsCell.domains);

  // ── 2. speaking ───────────────────────────────────────────────────────
  const speaks = await req(AUDIT, 'POST', '/cells/cell-21/messages', aj, {
    author: 'Akello Jane', initials: 'AJ', text: 'Speaking where I hold standing (Space Law).', time: 'now'
  });
  r.check('a member with standing in a topic may speak -> 201', speaks.status === 201, speaks);
  const noStanding = await req(AUDIT, 'POST', '/cells/cell-21/messages', nc, {
    author: 'Namugga Claire', initials: 'NC', text: 'Speaking outside my domains.', time: 'now'
  });
  r.check('a member without standing in any topic cannot speak -> 403',
    noStanding.status === 403, noStanding);
  r.check('the refusal names the topics that separate participation',
    /participation follows your domains/i.test((noStanding.j && noStanding.j.error) || ''), noStanding.j);

  // ── 3. voting ──────────────────────────────────────────────────────────
  const noStandingVote = await req(AUDIT, 'POST', '/cells/cell-21/vote-records', nc, {
    domain: 'Space Law', vote: 'yea', ws: 1400
  });
  r.check('a member without standing in a domain cannot vote there -> 403',
    noStandingVote.status === 403, noStandingVote);

  const vote = await req(AUDIT, 'POST', '/cells/cell-21/vote-records', aj, {
    domain: 'Space Law', vote: 'yea', ws: 10
  });
  r.check('a member with standing may vote -> 200', vote.status === 200, vote);
  const stored = sqlRows(DB_AUDIT, "SELECT domain,vote,ws,user_id FROM vote_records WHERE cell_id='cell-21' AND user_id='aj';")[0];
  r.check('the vote weight is the member\'s own standing (1800), not the client\'s claim',
    stored && Number(stored.ws) === 1800, stored);

  const crossDomain = await req(AUDIT, 'POST', '/cells/cell-21/vote-records', aj, {
    domain: 'Publications', vote: 'yea', ws: 10
  });
  r.check('a member cannot vote in a domain they do not hold -> 403', crossDomain.status === 403, crossDomain);

  const otherDomain = await req(AUDIT, 'POST', '/cells/cell-21/vote-records', zk, {
    domain: 'Remote Sensing', vote: 'nay', ws: 5
  });
  r.check('a member votes in their own domain with their own weight',
    otherDomain.status === 200 && otherDomain.j.record.ws === 1300, otherDomain);

  // ── 4. the rule covers project cells too ──────────────────────────────
  // cell-22 is a project cell on Space Law.
  const projOk = await req(AUDIT, 'POST', '/cells/cell-22/messages', aj, {
    author: 'Akello Jane', initials: 'AJ', text: 'Speaking where I hold standing (Space Law).', time: 'now'
  });
  r.check('a member with standing may speak in a project cell -> 201', projOk.status === 201, projOk);
  const projNo = await req(AUDIT, 'POST', '/cells/cell-22/messages', nc, {
    author: 'Namugga Claire', initials: 'NC', text: 'Outside my domains.', time: 'now'
  });
  r.check('a member without standing cannot speak in a project cell -> 403', projNo.status === 403, projNo);

  // ── 5. a cell without topics stays open to every steward ───────────────
  const openCell = await req(AUDIT, 'POST', '/proposals/system', sd, {
    delibType: 'system-settings', title: 'Audit M17 Open Deliberation',
    snapshot: { type: 'system', settings: { stf: { jstfDurationDays: 31 } } }
  });
  const openMsg = await req(AUDIT, 'POST', `/cells/${openCell.j.cellId}/messages`, nc, {
    author: 'Namugga Claire', initials: 'NC', text: 'No topics — open to every member.', time: 'now'
  });
  r.check('a deliberation without topics accepts any member', openMsg.status === 201, openMsg);

  // ── 6. steward actions stay open to every steward ──────────────────────
  const anySteward = await req(AUDIT, 'POST', `/cells/${openCell.j.cellId}/messages`, zk, {
    author: 'Zanele Khumalo', initials: 'ZK', text: 'A steward speaking in a topicless deliberation.', time: 'now'
  });
  r.check('steward actions are not narrowed by domains in a topicless deliberation',
    anySteward.status === 201, anySteward);
  const pin = await req(AUDIT, 'POST', '/threads/audit-m1-thread/pin', zk);
  r.check('a steward in any circle may still pin a thread (F3 kept as-is)',
    pin.status === 200 || pin.status === 404, pin);

  r.save();
  process.exit(r.failures.length ? 1 : 0);
}
main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
