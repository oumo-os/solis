// S02 — the unified Personal/Profile page with directed action centres.
import { AUDIT, DB_AUDIT, req, login, Report, bootApp } from './lib.mjs';

const r = new Report('s02-unified-profile');

async function main() {
  const tok = await login(AUDIT, 'sd@solis.local');
  const bs = await req(AUDIT, 'GET', '/bootstrap', tok);
  const { sandbox, els, errs } = bootApp(tok, AUDIT);
  await new Promise(res => setTimeout(res, 900));
  if (errs.length) r.note('boot errors: ' + errs.slice(0, 3).join(' | '));
  const me = bs.j.currentUser;
  const html = els.get('view-personal').innerHTML;
  const all = els.get('view-personal').innerHTML;

  r.check('the app boots without errors', errs.length === 0, errs.slice(0, 3));
  r.check('the unified view is rendered', html.length > 1000, html.length);
  r.check('the old profile view is gone', !els.has('view-profile'), [...els.keys()].filter(k => k.includes('profile')));
  r.check('the single header shows the member', html.includes(me.name), me.name);
  r.check('there is no meaningless standing progress bar', !/progress-fill[^>]*width:\d+%/.test(html), 'bar found');
  r.check('no duplicated static Profile title', (html.match(/Your competence declarations and standing/g) || []).length === 0);

  // action centres
  const myCircles = (bs.j.circles || []).filter(c => ((c.roster && c.roster.active) || []).some(m => m.id === me.id)
    || (me.circles || []).some(m => (typeof m === 'string' ? m : m.name) === c.name));
  r.check('My Circles shows the member\'s circles', myCircles.every(c => html.includes(c.name)), myCircles.map(c => c.name));
  const myStfs = (bs.j.stfCandidates || []).filter(c => (c.userId && c.userId === me.id) || (!c.userId && c.initials === me.initials));
  r.check('My STFs renders the member\'s invitations/assignments',
    myStfs.every(c => html.includes(String(c.stfId || '').replace(/^stf-/, ''))), myStfs.map(c => c.stfId));
  const myThreads = (bs.j.threads || []).filter(t => (t.authorId && t.authorId === me.id) || t.author === me.name || t.initials === me.initials
    || (t.repliesList || []).some(x => (x.authorId && x.authorId === me.id) || x.initials === me.initials));
  r.check('My Discussions shows the member\'s threads', myThreads.every(t => html.includes(t.title)), myThreads.map(t => t.title));
  const myCells = (bs.j.cells || []).filter(c => (c.team || []).some(t => t.self) || c.lead === me.name);
  r.check('My Cells shows the member\'s cells', myCells.every(c => html.includes(c.title)), myCells.map(c => c.title));

  // teaser
  const unread = (bs.j.inbox || []).filter(i => i.unread);
  if (unread.length) {
    r.check('the inbox teaser shows the unread count', html.includes(String(unread.length) + ' unread notification'), unread.length);
    r.check('the teaser links to the inbox', html.includes('Open inbox'), 'link missing');
  } else {
    r.note('no unread items in the seed — teaser not rendered (expected empty state)');
  }

  // badges and navigation
  r.check('the STF badge is scoped to the viewer', els.get('stf-badge').textContent === String(myStfs.filter(c => c.status === 'invited').length || ''),
    els.get('stf-badge').textContent);
  sandbox.nav('profile');
  r.check('#profile aliases to the unified personal view', sandbox.currentNav === 'personal', sandbox.currentNav);
  sandbox.nav('registration');
  r.check('registration from a signed-in user opens edit mode', sandbox.regIsEdit === true, sandbox.regIsEdit);

  r.save();
  process.exit(r.failures.length ? 1 : 0);
}
main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
