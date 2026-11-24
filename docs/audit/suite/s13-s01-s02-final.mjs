// S13 + S1 + S2 — publishing/records, the public site, and onboarding.
import { AUDIT, DB_AUDIT, LIVE, req, login, sql, sqlRows, count, Report, REPO } from './lib.mjs';
import { readFileSync } from 'fs';

const s13 = new Report('s13-publishing-records');
const s01 = new Report('s01-public-site');
const s02 = new Report('s02-onboarding');

async function main() {
  const sd = await login(AUDIT, 'sd@solis.local');
  const os = await login(AUDIT, 'os@solis.local');

  // ── S13: publication review flow ──────────────────────────────────────
  const pub = await req(AUDIT, 'POST', '/observatory/publications', os, {
    title: 'S13 Essay', type: 'Essay', abstract: 'S13 abstract', authors: ['Oumo Samuel']
  });
  s13.check('a member submits a publication for approval', pub.status === 201, pub);
  const pend = await req(AUDIT, 'GET', '/observatory/publications/pending', sd);
  s13.check('the pending queue holds the submission', pend.status === 200 && pend.j.pending.some(p => p.id === pub.j.id), pend.j);
  const publicBefore = await req(AUDIT, 'GET', '/observatory/publications');
  s13.check('a pending publication stays out of the public list', !publicBefore.j.publications.some(p => p.id === pub.j.id));
  const ok = await req(AUDIT, 'POST', `/observatory/publications/${pub.j.id}/approve`, sd);
  s13.check('a steward approves the publication', ok.status === 200 && ok.j.status === 'approved', ok);
  const publicAfter = await req(AUDIT, 'GET', '/observatory/publications');
  s13.check('the approved publication reaches the public list', publicAfter.j.publications.some(p => p.id === pub.j.id));

  // news / events / library / organisations
  const news = await req(AUDIT, 'POST', '/observatory/news', sd, { title: 'S13 News', body: 'A body', source: 'Audit' });
  s13.check('a steward posts news', news.status === 201 || news.status === 200, news);
  const ev = await req(AUDIT, 'POST', '/observatory/events', sd, { title: 'S13 Event', date: 'Dec 12', location: 'Kampala' });
  s13.check('a steward posts an event', ev.status === 201 || ev.status === 200, ev);
  const lib = await req(AUDIT, 'POST', '/observatory/library', sd, { title: 'S13 Book', link: 'https://example.org/s13' });
  s13.check('a steward adds a library item', lib.status === 201 || lib.status === 200, lib);
  const pubOrgs = await req(AUDIT, 'GET', '/public/organisations');
  s13.check('the public organisation feed serves live rows with derived member counts',
    pubOrgs.status === 200 && pubOrgs.j.organisations.length >= 3 &&
    pubOrgs.j.organisations.every(o => o.memberCount != null), pubOrgs.j && pubOrgs.j.organisations.length);

  // governance records
  for (const t of ['policies', 'integrity-records', 'governance-events', 'governance-ledger', 'exit-reason-labels']) {
    const res = await req(AUDIT, 'GET', '/' + t, sd);
    s13.check(`${t} are readable`, res.status === 200 && Array.isArray(res.j), res.status);
  }

  // ── S1: the public site ───────────────────────────────────────────────
  const html = readFileSync(REPO + '/index.html', 'utf8');
  s01.check('the homepage renders its data containers',
    ['stats','sector-news','commons-activity','opportunities'].every(id => html.includes(`id="${id}"`)), 'containers');
  s01.check('the public site has no hardcoded fixture figures',
    !/200\+|\b38 events\b|\b12 open\b/.test(html), 'fixture figures remain');
  const live = await req(LIVE, 'GET', '/bootstrap');
  s01.check('the live public bootstrap is readable with no token', live.status === 200 && !!live.j.circles, live.status);

  // ── S2: onboarding ────────────────────────────────────────────────────
  const reg = await req(AUDIT, 'POST', '/auth/register', null, {
    name: 'S02 Member', email: 's02@solis.local', password: 'solis123', location: 'Kampala', bio: 'S02 bio', essay: 'S02 essay'
  });
  s02.check('a new member registers and receives a token', reg.status === 201 && !!reg.j.token, reg);
  const fresh = reg.j.token;
  const me = await req(AUDIT, 'GET', '/auth/me', fresh);
  s02.check('the new session reads back its own record',
    me.status === 200 && me.j.user.name === 'S02 Member', me.j);
  const claim = await req(AUDIT, 'POST', '/competence/declare-wh', fresh, { domain: 'Space Law', wh: 500, evidence: 'S02 evidence' });
  s02.check('the member declares a competence claim', claim.status === 200 || claim.status === 201, claim);
  const interest = await req(AUDIT, 'POST', '/competence/interest', fresh, { ranks: [{ domain: 'Space Law', rank: 1 }] });
  s02.check('the member ranks interests', interest.status === 200, interest);
  const row = sqlRows(DB_AUDIT, "SELECT domain,wh,verified FROM user_competence WHERE user_id='s02-member';");
  s02.check('the declaration is stored unverified (vSTF verifies it later)',
    row.some(r => r.domain === 'Space Law' && Number(r.verified) === 0), row);
  const standing = await req(AUDIT, 'GET', '/competence/standing', fresh);
  s02.check('the standing endpoint lists the new member',
    standing.status === 200 && standing.j.standings.some(s => s.id === 's02-member'), standing.status);

  s13.save(); s01.save(); s02.save();
  process.exit((s13.failures.length + s01.failures.length + s02.failures.length) ? 1 : 0);
}
main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });

