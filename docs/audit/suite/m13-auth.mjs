// M13 — Auth, session & registration audit
// login → /auth/me → logout → rate limiting → registration (user row,
// competence claims, interest ranking).
import { AUDIT, DB_AUDIT, req, login, sql, sqlRows, count, Report } from './lib.mjs';

const r = new Report('m13-auth');

async function main() {
  // ── 1. login ──────────────────────────────────────────────────────────
  const ok = await req(AUDIT, 'POST', '/auth/login', null, { email: 'sd@solis.local', password: 'solis123' });
  r.check('valid credentials return a token', ok.status === 200 && !!ok.j.token, ok);
  const badPw = await req(AUDIT, 'POST', '/auth/login', null, { email: 'sd@solis.local', password: 'wrong' });
  r.check('a wrong password -> 401', badPw.status === 401, badPw);
  const noUser = await req(AUDIT, 'POST', '/auth/login', null, { email: 'nobody@solis.local', password: 'solis123' });
  r.check('an unknown email -> 401', noUser.status === 401, noUser);
  const noCreds = await req(AUDIT, 'POST', '/auth/login', null, {});
  r.check('missing credentials -> 401 (no user enumeration)', noCreds.status === 401, noCreds);

  // ── 2. session ────────────────────────────────────────────────────────
  const tok = ok.j.token;
  const me = await req(AUDIT, 'GET', '/auth/me', tok);
  r.check('/auth/me returns the signed-in user', me.status === 200 && me.j.user && me.j.user.id === 'sd', me);
  r.check('/auth/me never exposes the password hash',
    me.j.user && !me.j.user.password_hash, me.j.user);
  r.check('/auth/me without a token -> 401', (await req(AUDIT, 'GET', '/auth/me')).status === 401);
  r.check('/auth/me with a bogus token -> 401', (await req(AUDIT, 'GET', '/auth/me', 'not-a-token')).status === 401);

  const throwaway = await login(AUDIT, 'zk@solis.local');
  const out = await req(AUDIT, 'POST', '/auth/logout', throwaway);
  r.check('logout succeeds -> 200', out.status === 200, out);
  const afterOut = await req(AUDIT, 'GET', '/auth/me', throwaway);
  r.check('the token stops working after logout -> 401', afterOut.status === 401, afterOut);

  // ── 3. rate limiting ──────────────────────────────────────────────────
  let limited = null;
  for (let i = 0; i < 12; i++) {
    const res = await req(AUDIT, 'POST', '/auth/login', null, { email: 'sd@solis.local', password: 'solis123' });
    if (res.status === 429) { limited = res; break; }
  }
  r.check('repeated logins are rate limited -> 429', !!limited, limited);
  r.check('the rate limit response carries a retry-after', !!(limited && limited.j && limited.j.retryAfter), limited);

  // ── 4. registration ───────────────────────────────────────────────────
  const email = 'audit.m13@solis.local';
  const reg = await req(AUDIT, 'POST', '/auth/register', null, {
    name: 'Audit Member Thirteen', email, password: 'solis123', location: 'Kampala', bio: 'Audit bio', essay: 'Audit essay'
  });
  r.check('registration returns 201 with a token and user', reg.status === 201 && !!reg.j.token && !!reg.j.user, reg);
  const newRow = sqlRows(DB_AUDIT, "SELECT id,name,initials,email,status,joined FROM users WHERE email='audit.m13@solis.local';")[0];
  r.check('the user row is created with derived initials and id',
    newRow && newRow.initials === 'AM' && /audit-member-thirteen/.test(newRow.id) && newRow.status === 'Active', newRow);
  const dupEmail = await req(AUDIT, 'POST', '/auth/register', null, { name: 'Another Name', email, password: 'solis123' });
  r.check('a duplicate email -> 409', dupEmail.status === 409, dupEmail);
  const shortPw = await req(AUDIT, 'POST', '/auth/register', null, { name: 'Short Pass', email: 'short@solis.local', password: 'abc' });
  r.check('a password under 6 characters -> 400', shortPw.status === 400, shortPw);
  const dupName = await req(AUDIT, 'POST', '/auth/register', null, { name: 'Audit Member Thirteen', email: 'second@solis.local', password: 'solis123' });
  r.check('a second member with the same name registers cleanly -> 201', dupName.status === 201, dupName);
  // ── 5. the new member's claims and interests ──────────────────────────
  const newTok = reg.j.token;
  const claim = await req(AUDIT, 'POST', '/competence/declare-wh', newTok, {
    domain: 'Space Law', wh: 900, evidence: 'M13 evidence'
  });
  r.check('the new member can declare a competence', claim.status === 200 || claim.status === 201, claim);
  const comp = sqlRows(DB_AUDIT, "SELECT domain,wh,verified,evidence,user_id FROM user_competence WHERE user_id='audit-member-thirteen';");
  r.check('the declaration is stored as unverified with its evidence',
    comp.length === 1 && Number(comp[0].wh) === 900 && Number(comp[0].verified) === 0 && /M13 evidence/.test(comp[0].evidence || ''), comp);
  const interest = await req(AUDIT, 'POST', '/competence/interest', newTok, {
    ranks: [{ domain: 'Space Law', rank: 1 }, { domain: 'Remote Sensing', rank: 2 }]
  });
  r.check('the new member can rank interests', interest.status === 200 || interest.status === 201, interest);
  const intRows = sqlRows(DB_AUDIT, "SELECT domain,rank,interest,kind FROM user_competence WHERE user_id='audit-member-thirteen' AND kind='self';");
  r.check('the interest ranking is stored with its scores',
    intRows.length === 2 && intRows.every(x => Number(x.rank) >= 1 && Number(x.interest) > 0), intRows);

  r.save();
  process.exit(r.failures.length ? 1 : 0);
}
main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
