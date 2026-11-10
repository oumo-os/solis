# Wave 4–5 — Account, competence, application boot & security (M13–M16)

Account and permission surfaces: auth & registration → competence, profile and governance
records → the whole-application boot → the authorization matrix.

---

## M13 — Auth, session & registration · 20/21 · ⚠️ one finding

**Working correctly:** login returns a token; wrong password, unknown email and missing
credentials all answer 401 (no user enumeration); `/auth/me` returns the signed-in user and
never exposes the password hash; a bogus token is rejected; **logout invalidates the
token** (the next `/auth/me` answers 401); the login limiter engages and returns a
retry-after; registration creates the user row with server-derived initials and slug id,
issues a token, and rejects a duplicate email (409) and a short password (400); the new
member can declare a competence (stored unverified with its evidence) and rank interests
(stored with the derived scores).

### F14 (Minor) — two members with the same name cannot both register

The user id is derived from the name (`preg_replace('[^a-z0-9]+', '-', strtolower($name))`,
`api.php:124`), so the second registration collides on the primary key and the request
dies with an unhandled 500:

```
POST /auth/register  {"name":"Audit Member Thirteen","email":"second@solis.local", …}
→ 500 (no body)
```

**Fix** — make the id unique (append a short suffix when the slug is taken) or return a
clean 409.

---

## M14 — Competence, profile & governance records · 17/19 · ⚠️ two findings

**Working correctly:** standings are derived from the per-domain rows (the returned total
equals the sum of its domains); self-declared competences are stored unverified; a steward
can endorse (+50 Ws, persisted) while a member of no circle is refused (403); the drift
pass is steward-only; system settings are readable anonymously; the governance record
tables (policies, integrity records, governance events, ledger, exit-reason labels) are
listable.

### F15 (Blocker — security) — global settings can be changed without a token

`PATCH /system-settings` performs no authentication (`api.php:2973`):

```
PATCH /system-settings  {"jstf_duration_days": 99}      (no Authorization header)
→ 200 — the value is written to the live settings row
```

This changes the judicial durations, adjudicator counts and pool mode that the jSTF/aSTF
engines read at runtime.

### F16 (Blocker — security) — governance records are member-writable

`PATCH /policies/:id` succeeded for an ordinary member and rewrote an enacted policy's
status to `Revoked`. The generic resource router applies `assertActiveMember` to every
write but never checks *who* may write which table, so policies, integrity records,
governance events, the ledger and exit-reason labels are all editable by any member.

---

## M15 — Whole-application boot & render · 23/23 · ✅ works

The complete SPA (external scripts + the 10k-line inline script) is loaded into a sandboxed
DOM and booted against the live `/api/bootstrap` payload with a real session token.

**Working correctly:** the external scripts and the inline script load without an
uncaught error; the application boots; and every surface renders live content —
the personal dashboard, the discussions feed, the participants directory, the observatory
library shelf, the projects table, the circles grid, the cells grid, the STF table, the
governance tab, the profile, the inbox, the thread detail, the publication detail and the
domain-map summary. The sidebar shows the signed-in member ("Ssempa David", initials
`SD`), the compose avatar shows the same initials, the participant count matches the
payload, and **no fabricated fixture figure appears anywhere in the rendered DOM**.

---

## M16 — Authorization matrix · 9/17 · ❌ four blocker-level gaps

Systematic probe of the endpoint surface as anonymous / ordinary member / steward.

| Probe | Result |
|---|---|
| `POST /cells/:id/draft-resolutions/:did/versions` — anonymous | **201, row persisted** ❌ |
| `POST /cells/:id/draft-resolutions/:did/implementing-circles` — anonymous | **201** ❌ |
| `PATCH /system-settings` — anonymous | **200, value written** ❌ |
| `DELETE /users/mt` — ordinary member | **200, user deleted** ❌ |
| `POST /users` — ordinary member | **201, arbitrary user row created** ❌ |
| `PATCH /policies/:id` — ordinary member | **200, status rewritten** ❌ |
| `POST /competence/verify-wh` — anonymous | 410 (retired endpoint, by design) ✅ |
| `GET /cells/:id/messages/:mid` | 405 (collection reads only) ✅ |
| Anonymous `GET /users, /stfs, /cells, /threads, /inbox, /circle-applications, /project-applications` | no leaks ✅ |

### F15 (Blocker — security) — three unauthenticated write paths

The resolution-version route (`api.php:825-838`) and the system-settings route
(`api.php:2973`) never call `authUser()`. An anonymous client can therefore rewrite the
version history of any resolution and change the platform's judicial settings.

**Fix**

```php
// api.php:825 (draft child routes)
$user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);

// api.php:2973 (system settings)
$user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
if (!isSteward($user['id'])) send(403, ['error' => 'Steward access required']);
```

### F16 (Blocker — security) — the generic CRUD has no ownership or role gate

Because `users`, `policies`, `integrity_records`, `governance_events`, `governance_ledger`
and `exit_reason_labels` are handled by the generic router, **any active member** can
create, rewrite or delete rows in them — including deleting another participant or
revoking an enacted policy.

**Fix** — put these tables behind explicit rules in the generic router:

| Table | Write rule |
|---|---|
| `users` | Self-service only: a user may edit their own row (name, location, bio, essay). `status`, `initials`, `id` and standing are never client-writable. `DELETE` is steward-only and restricted to `Former` members. |
| `policies` | Steward-only writes (the judicial verdict path writes them server-side, not through this route). |
| `integrity_records`, `governance_events`, `governance_ledger` | Read-only over HTTP — they are written by the governance engines. |
| `exit_reason_labels` | Steward-only. |

---

## Additional observation

### F17 (Minor) — the fabricated `stats` snapshot is still published

`GET /stats` and the `stats` key of the bootstrap payload still return the seeded fixture
with invented figures (`"observatory":{"resources":"200+","publications":14,"events":38}`).
Nothing in the SPA reads it any more — the counters are derived — so it is dead weight
that is published publicly. Either derive it from the live tables or drop it from the
payload.
