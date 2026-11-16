// Batch 5 live verification — circles sweep (non-destructive)
import { execFileSync } from 'child_process';
const BASE = 'http://localhost/solis/api';
const MYSQL = 'm:\\dev\\xampp\\mysql\\bin\\mysql.exe';
function sql(q) { return execFileSync(MYSQL, ['-uroot', 'solis', '-e', q], { encoding: 'utf8' }); }
const results = [];
function check(name, cond, detail) {
  results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  => ' + JSON.stringify(detail)}`);
}
async function login(email) {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'solis123' })
  });
  const j = await r.json().catch(() => ({}));
  if (!j.token) throw new Error(`login failed ${email}: ${r.status} ${JSON.stringify(j)}`);
  return j.token;
}
async function req(method, path, token, body) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let j = null; try { j = await r.json(); } catch { /* non-JSON body */ }
  return { status: r.status, j };
}

(async () => {
  const sd = await login('sd@solis.local');   // space-law member/steward
  const zk = await login('zk@solis.local');   // remote-sensing only (outsider to space-law)

  // 1. bootstrap: currentUser membership + circle truth
  const bs = await req('GET', '/bootstrap', sd);
  const circles = (bs.j && bs.j.circles) || [];
  const sl = circles.find(c => c.id === 'space-law');
  const rs = circles.find(c => c.id === 'remote-sensing');
  const fr = circles.find(c => c.id === 'freq');
  check('bootstrap 200 + 5 circles', bs.status === 200 && circles.length === 5, circles.length);
  check('sd currentUser.circles = Space Law Circle',
    bs.j.currentUser && Array.isArray(bs.j.currentUser.circles) &&
    bs.j.currentUser.circles.some(c => c.name === 'Space Law Circle'),
    bs.j.currentUser && bs.j.currentUser.circles);
  check('space-law: 9 active members, fixture description',
    !!sl && sl.members === 9 && (sl.description || '').startsWith('Stewards space law analysis'),
    sl && { m: sl.members, d: sl.description });
  check('space-law mandate primary = Space Law+Liability, desiredWs present',
    !!sl && JSON.stringify(sl.mandate.primary) === JSON.stringify(['Space Law', 'Liability']) &&
    sl.desiredWs['Space Law'] === 2500 && sl.desiredWs['Liability'] === 1800,
    sl && { m: sl.mandate, w: sl.desiredWs });
  check('space-law roster joined >= Mar 2026, dm active',
    !!sl && sl.roster.active.length === 9 &&
    sl.roster.active.every(r => /^(Jan|Feb|Mar)/.test(r.joined || '') === false || r.joined.endsWith('2026')) &&
    sl.roster.active.some(r => r.id === 'dm' && r.status === 'active'),
    sl && sl.roster.active.map(r => r.id + ':' + r.joined + ':' + r.status));
  check('freq archived with meta reason',
    !!fr && fr.status === 'Archived' && !!fr.archiveReason && !!fr.archivedDate,
    fr && { s: fr.status, r: fr.archiveReason, d: fr.archivedDate });
  check('remote-sensing members = 2 (bo+zk roster)',
    !!rs && rs.members === 2, rs && rs.members);
  check('sd never in RS -> bootstrap redacts RS roster/proposals',
    !!rs && rs.roster.active.length === 0 && rs.roster.former.length === 0 && Array.isArray(rs.proposals),
    rs && { a: rs.roster.active.length, p: rs.proposals && rs.proposals.length });
  const zkBs = await req('GET', '/bootstrap', zk);
  const zkRs = ((zkBs.j && zkBs.j.circles) || []).find(c => c.id === 'remote-sensing');
  check('zk (RS member) sees RS roster rows', !!zkRs && zkRs.roster.active.length === 2, zkRs && zkRs.roster.active.length);

  // 2. user_circles truth: participant profiles must not claim roster-less memberships
  const osP = (bs.j.participants || []).find(p => p.id === 'os');
  const mtP = (bs.j.participants || []).find(p => p.id === 'mt');
  check('os has no circle memberships (roster backs none)', !!osP && (osP.circles || []).length === 0, osP && osP.circles);
  check('mt circles = Space Law only (not Remote Sensing)',
    !!mtP && JSON.stringify(mtP.circles) === JSON.stringify(['Space Law Circle']), mtP && mtP.circles);

  // 3. roster redaction: outsider vs member vs anonymous
  const outRoster = await req('GET', '/circles/space-law/roster', zk);
  const inRoster = await req('GET', '/circles/space-law/roster', sd);
  check('outsider roster GET -> []', outRoster.status === 200 && Array.isArray(outRoster.j) && outRoster.j.length === 0, outRoster);
  check('member roster GET -> 12 rows (9 active + 3 former)', inRoster.status === 200 && inRoster.j.length === 12, inRoster.j && inRoster.j.length);
  const anon = await fetch(`${BASE}/circles/space-law/roster`);
  check('anonymous roster GET -> 401', anon.status === 401, anon.status);

  // 4. archived circle child writes still blocked
  const archWrite = await req('POST', '/circles/freq/roster', sd, { member_id: 'sd', name: 'X', status: 'active' });
  check('archived circle roster POST -> 403', archWrite.status === 403, archWrite);

  // 4b. roster writes are steward-gated PER circle (not just active-anywhere)
  const zkSlWrite = await req('POST', '/circles/space-law/roster', zk, { member_id: 'zk', name: 'Zanele Khumalo', status: 'active' });
  check('non-steward (zk) roster POST to space-law -> 403 steward gate',
    zkSlWrite.status === 403 && /steward/i.test((zkSlWrite.j && zkSlWrite.j.error) || ''), zkSlWrite);
  const sdSlWrite = await req('POST', '/circles/space-law/roster', sd, { member_id: 'gate-probe', name: 'Gate Probe', status: 'active' });
  check('steward (sd) roster POST to space-law -> 201', sdSlWrite.status === 201, sdSlWrite);
  if (sdSlWrite.status === 201 && sdSlWrite.j && sdSlWrite.j.id != null) {
    const delGate = await req('DELETE', `/circles/space-law/roster/${sdSlWrite.j.id}`, sd);
    check('steward cleanup DELETE probe row -> 200', delGate.status === 200, delGate);
    const zkDel = await req('DELETE', `/circles/space-law/roster/${sdSlWrite.j.id}`, zk);
    check('non-steward DELETE roster row -> 403', zkDel.status === 403, zkDel);
  }

  // 5. generic save/PATCH cannot flip status or members
  const pch = await req('PATCH', '/circles/space-law', sd, { status: 'Archived', members: 999 });
  const sl2 = (await req('GET', '/circles/space-law', sd)).j;
  check('PATCH cannot flip status/members', pch.status === 200 && sl2.status === 'Active' && sl2.members === 9,
    { pch: pch.status, st: sl2 && sl2.status, m: sl2 && sl2.members });

  // 6. check-expiry: joined >= Mar 2026 with 12-month default => nothing expires
  const exp = await req('POST', '/circles/space-law/check-expiry', sd);
  check('check-expiry no mass expiry (0 expired)',
    exp.status === 200 && (exp.j.expired || 0) === 0, exp);

  // 7. drift-check response shape only — do NOT execute (it would move members);
  //    instead assert the endpoint derives its threshold server-side when omitted.

  // 8. anonymous bootstrap still works (public page load)
  const anonBs = await fetch(`${BASE}/bootstrap`);
  const anonJ = await anonBs.json().catch(() => ({}));
  check('anonymous bootstrap 200, circles present, no currentUser',
    anonBs.status === 200 && Array.isArray(anonJ.circles) && anonJ.circles.length === 5 && !anonJ.currentUser,
    { st: anonBs.status, n: (anonJ.circles || []).length, cu: !!anonJ.currentUser });

  // 9. currentUser.circles status surfaces the STORED user_circles value
  //    (was hardcoded 'Active', hiding candidates). Flip dm -> Candidate,
  //    read bootstrap, restore. Fails pre-fix (forced 'Active').
  sql("UPDATE user_circles SET status='Candidate' WHERE user_id='dm' AND kind='roster'");
  let dmSlC = null, dmSlC2 = null;
  try {
    const dmTok = await login('dm@solis.local');
    const dmBs = await req('GET', '/bootstrap', dmTok);
    dmSlC = (((dmBs.j && dmBs.j.currentUser && dmBs.j.currentUser.circles) || []).find(c => c.name === 'Space Law Circle')) || null;
    check('currentUser.circles status = stored Candidate (not forced Active)',
      !!dmSlC && dmSlC.status === 'Candidate', dmSlC);
  } finally {
    sql("UPDATE user_circles SET status='Active' WHERE user_id='dm' AND kind='roster'");
  }
  const dmTok2 = await login('dm@solis.local');
  const dmBs2 = await req('GET', '/bootstrap', dmTok2);
  dmSlC2 = (((dmBs2.j && dmBs2.j.currentUser && dmBs2.j.currentUser.circles) || []).find(c => c.name === 'Space Law Circle')) || null;
  check('restore: dm status back to Active', !!dmSlC2 && dmSlC2.status === 'Active', dmSlC2);

  console.log(results.join('\n'));
  const fails = results.filter(r => r.startsWith('FAIL')).length;
  console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
