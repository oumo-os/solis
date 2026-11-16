// M10 — Publications & Observatory audit
// publication submit → steward approve/reject → public list; news, events,
// library, organisations; plus the authorization boundaries.
import { AUDIT, DB_AUDIT, req, login, sql, sqlRows, count, Report } from './lib.mjs';

function list(res) { const j = res.j; if (Array.isArray(j)) return j; if (!j) return []; return j.publications || j.pending || j.news || j.events || j.library || j.organisations || []; }
const r = new Report('m10-observatory');

async function main() {
  const sd = await login(AUDIT, 'sd@solis.local');   // steward
  const zk = await login(AUDIT, 'zk@solis.local');   // member
  const dm = await login(AUDIT, 'dm@solis.local');   // sanctioned (Restricted) member
  const os = await login(AUDIT, 'os@solis.local');   // active member, no circle roster

  // ── 1. publication submission ─────────────────────────────────────────
  r.check('anonymous publication submit -> 401',
    (await req(AUDIT, 'POST', '/observatory/publications', null, { title: 'x' })).status === 401);
  const pub = await req(AUDIT, 'POST', '/observatory/publications', zk, {
    title: 'Audit M10 Essay', type: 'Essay', abstract: 'An abstract for the audit.',
    tags: ['Audit'], authors: ['Zanele Khumalo'], journal: 'Audit Journal', date: 'Nov 2026'
  });
  r.check('a member can submit a publication for approval -> 200/201',
    pub.status === 200 || pub.status === 201, pub);
  const pubId = pub.j.id || pub.j.res_id;
  const pubRow = sqlRows(DB_AUDIT, `SELECT id,title,status,type FROM publications WHERE id='${pubId}';`)[0];
  r.check('the submission is stored as pending', pubRow && pubRow.status === 'pending', pubRow);

  const pubList = await req(AUDIT, 'GET', '/observatory/publications');
  r.check('a pending publication is not in the public list',
    pubList.status === 200 && !list(pubList).some(p => String(p.id) === String(pubId)), list(pubList).map(p => p.title));
  const pending = await req(AUDIT, 'GET', '/observatory/publications/pending', sd);
  r.check('the steward sees the pending queue',
    pending.status === 200 && list(pending).some(p => String(p.id) === String(pubId)), pending);
  const pendingDenied = await req(AUDIT, 'GET', '/observatory/publications/pending', os);
  r.check('a member of no circle cannot read the pending queue -> 403', pendingDenied.status === 403, pendingDenied);
  const approveDenied = await req(AUDIT, 'POST', `/observatory/publications/${pubId}/approve`, os);
  r.check('a member of no circle cannot approve -> 403', approveDenied.status === 403, approveDenied);
  const approve = await req(AUDIT, 'POST', `/observatory/publications/${pubId}/approve`, sd);
  r.check('a steward can approve -> 200', approve.status === 200, approve);
  const pubList2 = await req(AUDIT, 'GET', '/observatory/publications');
  r.check('the approved publication appears in the public list',
    pubList2.status === 200 && list(pubList2).some(p => String(p.id) === String(pubId)), list(pubList2).map(p => p.title));

  // a second submission is rejected by the steward
  const pub2 = await req(AUDIT, 'POST', '/observatory/publications', zk, {
    title: 'Audit M10 Report', type: 'Report', abstract: 'Rejected by the audit.', tags: ['Audit'], authors: ['Zanele Khumalo']
  });
  const pub2Id = pub2.j.id || pub2.j.res_id;
  const reject = await req(AUDIT, 'POST', `/observatory/publications/${pub2Id}/reject`, sd);
  r.check('a steward can reject -> 200', reject.status === 200, reject);
  const pubList3 = await req(AUDIT, 'GET', '/observatory/publications');
  r.check('the rejected publication stays out of the public list',
    !list(pubList3).some(p => String(p.id) === String(pub2Id)), list(pubList3).map(p => p.title));

  // ── 2. news, events, library ──────────────────────────────────────────
  const news = await req(AUDIT, 'POST', '/observatory/news', sd, { title: 'Audit M10 News', body: 'Body for the audit.', source: 'Audit', time: '1h ago' });
  r.check('a steward can post news -> 200/201', news.status === 200 || news.status === 201, news);
  const newsList = await req(AUDIT, 'GET', '/observatory/news');
  r.check('the news item is publicly listed',
    newsList.status === 200 && list(newsList).some(n => n.title === 'Audit M10 News'), newsList);
  r.check('a member of no circle cannot post news -> 403',
    (await req(AUDIT, 'POST', '/observatory/news', os, { title: 'x', body: 'y' })).status === 403);

  const ev = await req(AUDIT, 'POST', '/observatory/events', sd, { title: 'Audit M10 Event', date: 'Dec 01', location: 'Kampala' });
  r.check('a steward can create an event -> 200/201', ev.status === 200 || ev.status === 201, ev);
  const evList = await req(AUDIT, 'GET', '/observatory/events');
  r.check('the event is publicly listed',
    evList.status === 200 && list(evList).some(e => e.title === 'Audit M10 Event'), evList);
  const imp = await req(AUDIT, 'POST', '/observatory/events/import', sd, {
    events: [{ title: 'Audit M10 Imported', date: 'Dec 05', location: 'Nairobi' }]
  });
  r.check('a steward can bulk-import events -> 200/201', imp.status === 200 || imp.status === 201, imp);
  const evList2 = await req(AUDIT, 'GET', '/observatory/events');
  r.check('the imported event is listed',
    list(evList2).some(e => e.title === 'Audit M10 Imported'), evList2);

  const lib = await req(AUDIT, 'POST', '/observatory/library', sd, { title: 'Audit M10 Book', link: 'https://example.org/audit' });
  r.check('a steward can add a library item -> 200/201', lib.status === 200 || lib.status === 201, lib);
  const libList = await req(AUDIT, 'GET', '/observatory/library');
  r.check('the library item is publicly listed',
    libList.status === 200 && list(libList).some(l => l.title === 'Audit M10 Book'), libList);

  // ── 3. organisations ──────────────────────────────────────────────────
  const org = await req(AUDIT, 'POST', '/observatory/organisations', sd, {
    id: 'audit-m10-org', name: 'Audit M10 Organisation', acronym: 'AM10',
    location: 'Kampala', summary: 'An organisation created by the audit.'
  });
  r.check('a steward can create an organisation -> 200/201', org.status === 200 || org.status === 201, org);
  const orgList = await req(AUDIT, 'GET', '/observatory/organisations');
  r.check('the organisation is publicly listed',
    orgList.status === 200 && list(orgList).some(o => o.name === 'Audit M10 Organisation'), orgList);
  const pubOrgs = await req(AUDIT, 'GET', '/public/organisations');
  r.check('the public organisation feed lists it with domain labels',
    pubOrgs.status === 200 && list(pubOrgs).some(o => o.name === 'Audit M10 Organisation'), pubOrgs);

  // ── 4. authorization boundary: restricted members ─────────────────────
  const restrictedPub = await req(AUDIT, 'POST', '/observatory/publications', dm, {
    title: 'Audit M10 Restricted Submission', type: 'Essay', abstract: 'from a restricted member'
  });
  r.check('a sanctioned (Restricted) member cannot submit for publication -> 403',
    restrictedPub.status === 403, restrictedPub);

  r.save();
  process.exit(r.failures.length ? 1 : 0);
}
main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
