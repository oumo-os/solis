# Wave 2–3 — Circles, content & participation (M8–M12)

Module results for the circle lifecycle and the content/participation surface:
circles & membership → threads & engagement → publications & observatory →
projects & undertakings → participants & organisations.

Write-path checks ran against the isolated `solis_audit` database; every module run
starts from a pristine restore of the seed.

---

## M8 — Circles & membership · 33/36 · ⚠️ two findings

**Working correctly:** roster writes are gated on being a steward *of that circle*;
`circle.members` is recomputed after a departure; applications are server-authoritative
(pending, one per member per circle, per-circle queue numbering, own-application-only
withdrawal, no duplicate); forced removal and circle flush are refused without a live
jSTF case; resignation marks the member former, drops the count, records a succession
vacancy and writes the departure to the activity feed; the drift check derives its bar
from the circle's own mandate domains and expels members below it; the expiry sweep
reports the effective term; disbandment archives the circle with a reason, sweeps the
roster, and the archived circle then refuses roster writes and applications; a circle can
never be deleted, only disbanded.

### F8 (Blocker) — a newly created circle can never be staffed

A circle is created empty (`members = 0`, no roster rows). From that point:

- **Roster writes are refused** — `POST /circles/:id/roster` requires the caller to be a
  steward *of that circle*, and nobody is:
  `{"error":"Only a steward of that circle may modify its roster"}` (403)
- **The founder cannot seat themselves** — same gate.
- **Applications are never processed** — the integrity engine only seats applicants into
  circles that have a recorded **vacancy** (`api.php:1420`: `if (!$vacs) continue;`), and
  vacancies are only ever created by *departures* (resignation, jSTF removal, flush,
  competence drift, term expiry). A brand-new circle has none, so its application queue
  sits untouched. Three engine passes over `/bootstrap` changed nothing.
- **Every circle-management route is unreachable** — `drift-check`, `check-expiry` and
  `disband` all require roster membership of that circle, so they all answer 403.

Net effect: a circle created through `POST /circles` — or through the sanctioned
circle-creation path (aSTF-approved snapshot → `applySettingsSnapshotServer` creates it
as `Suggested`) — is permanently inert. The seed hides this: the shipped circles carry
rosters because the seeder writes them directly ("members always reflects the active
roster — fixture counts are never trusted", `seed-mysql.php:667`), and the fixture
governance log carries the event *"Circle suggested, awaiting founding members."*

**Fix options**

| Option | Effect |
|---|---|
| **(a) Seat the founder at creation** | `POST /circles` and the `circle` snapshot path add the proposer to `circle_roster` (active) and recompute `members`. Immediate, minimal, matches "anyone may start one". |
| **(b) Record an opening vacancy** | New circles get `meta.vacancies = [{since, reason:'circle-founded'}]`; the existing integrity engine then vets the application pool through vSTF and seats the approved founder. Consistent with the governance model, but the circle stays empty until vetting completes. |

Option (a) is the smaller change and does not depend on the engine running; option (b)
keeps a single staffing path. A hybrid — seat the founder directly *and* record the
vacancy for the remaining seats — is also possible.

### F9 (Major) — `circle.members` is not recomputed when a member is added

`markFormer()` recomputes the count on departure, but the roster **insert** path does not.
Adding a member to a circle leaves the stored count stale:

```
after POST /circles/remote-sensing/roster  →  circle.members = 2, active roster = 3
```

The count is user-visible everywhere: `/bootstrap` exposes `'members' => $c['members']`
(`api.php:227`) and every circle card renders `c.members + ' members'`
(`mock-loader.js:48`). The seeder gets this right at seed time; the runtime does not.

**Fix** — recompute on every roster write, next to the existing insert:

```php
if ($d['child'] === 'circle_roster') dbRun(
  "UPDATE circles SET members = (SELECT COUNT(*) FROM circle_roster WHERE circle_id = ? AND status = 'active') WHERE id = ?",
  [$parentId, $parentId]);
```

---

## M9 — Threads & engagement · 25/25 · ✅ works

Thread creation, replies (create, read, edit by the author), the endorsement toggle
(including the counter refresh and withdrawal), the bookmark toggle, steward-only
pinning, public read access, feed inclusion in `/bootstrap`, and the sealing of
`stewards-only` threads (404 for anonymous and for non-party members).

This module also **re-verifies the F2 fix**: endorsement and bookmark previously returned
500 on MariaDB because of `ON DUPLICATE KEY UPDATE 1=1`; both now round-trip correctly,
including the double-endorse case (no duplicate row) and the withdrawal case.

---

## M10 — Publications & Observatory · 23/24 · ⚠️ one finding

**Working correctly:** submissions land as `pending` and stay out of the public list;
the steward pending queue lists them; approve/reject flips the status and only approved
publications reach the public feed; news, events (including bulk import) and library items
are steward-published and publicly listed; organisations are steward-created and appear in
both the observatory list and the public organisation feed with their knowledge-domain
labels; a member of no circle cannot reach the steward-only routes.

### F10 (Major) — publication submission skips the member-status check

`POST /observatory/publications` authenticates but never calls `assertActiveMember`
(`api.php:2938-2943`), so a member whose standing has been suspended by the jSTF can
still submit publications for approval:

```
POST /observatory/publications  (as a Restricted member)  →  201 {"status":"pending"}
```

The same gap exists on `circle_application_domains` writes (omitted from the
`assertActiveMember` list at `api.php:720`).

**Fix** — add `assertActiveMember($user);` to the publication submit handler (and add
`circle_application_domains` to the guarded child list).

---

## M11 — Projects & undertakings · 12/13 · ⚠️ one finding

**Working correctly:** project listing requires a token, creation and update persist
(`progress` 25 → 80), the project reaches the `/bootstrap` feed, project applications are
created and listed, and the **real** `renderProjectRows()` renderer (run against the live
payload in the L3 harness) shows the new project with its progress and role.

### F11 (Minor) — project applications are client-authoritative, and the SPA fakes the date

Unlike circle applications — which the server stamps itself as `pending` with a
server-allocated queue position — project applications store whatever the client sends.
A submission without a status leaves `status = NULL`, and the SPA hardcodes the date:

```js
// index.html:10660-10670
var projectApp = { …, status: 'pending', appliedDate: 'Jul 26, 2026', … };
```

Every project application therefore carries the same fictitious date.

**Fix** — make the server authoritative (as for circle applications): force
`status = 'pending'`, stamp `applied_date` with the current date, and drop the hardcoded
date from the client.

---

## M12 — Participants & organisations · 12/15 · ⚠️ two findings

**Working correctly:** the user list and single-user read never expose `password_hash`;
the participant projection carries circle membership and domain competence; the real
participant-grid renderer shows the seeded members; organisation summaries update and
persist.

### F12 (Blocker — security) — any active member can rewrite any member's record

The generic resource router gates writes on `assertActiveMember` only — there is no
ownership or steward check on the `users` table:

```
PATCH /users/dm   {"status":"Active"}   (as a member of no circle)  →  200
PATCH /users/sd   {"name":"Audit Renamed"}                          →  200
```

The first call **lifted a live jSTF sanction**: the seeded `dm` was `Restricted` by an
open jSTF case and became `Active` again. The judicial model treats `users.status` as
the enforcement record, so this route can undo a verdict's sanctions; the same route also
rewrites names, initials and locations of any participant.

**Fix** — restrict the `users` table in the generic router:

- `PATCH/PUT /users/:id` — only the user themselves may edit their own row (and only
  self-service fields: name, location, bio, essay); standing (`status`) and identity
  (`initials`, `id`) must never be client-writable.
- `DELETE /users/:id` — steward-only, and only for a `Former` member.

### F13 (Minor) — organisation member counts are client-writable

`PATCH /organisations/:id {"member_count": 999999}` succeeds for any active member, and
the count is what the public organisation cards show (and the marketing site's
organisation cards read from `/public/organisations`). Counts that are not backed by a
roster should be derived or steward-only.

---

## Fixes applied (verified — module now 37/37)

| Finding | Change |
|---|---|
| **F8** | The founder is seated automatically: `POST /circles` and an approved circle-creation snapshot both add the proposer to `circle_roster` (active) and recompute the member count (`seatCircleSteward()` in `api.php`). The circle is therefore staffable, manageable and disbandable from the first moment. |
| **F9** | `circle.members` is recomputed from the live roster on every roster insert, update and delete — the count a circle card shows now always equals the roster. |
| **F10** | `POST /observatory/publications` now calls `assertActiveMember()`, and `circle_application_domains` joins the guarded child list — a suspended member can no longer submit for approval. |
| **F11** | Project applications are server-authoritative (`status = 'pending'`, `applied_date` = today) and the SPA's hardcoded `Jul 26, 2026` date is gone. |
| **F12** | `users` writes are self-service only: a member may edit their own row and only `name`, `location`, `bio`, `essay`; `status`, `initials` and standing are no longer client-writable (so a jSTF sanction cannot be lifted by another member); creating a member goes through registration; members are never deleted. |
| **F13** | `organisations.member_count` is no longer client-writable, and every published count is derived from the real affiliation rows (`user_orgs`) — the fictional "20000 members" figure is gone. |

## Cross-cutting notes

- **F3 (Major — needs decision)** applies here too: the pending-publication queue, the
  approve/reject action and the news/events/library publishing routes are gated on
  *"active member of any circle"*, so every circle member can approve publications and
  publish news — not only the stewards of a particular circle.
- The organisation `member_count` and the circle `members` column are the same class of
  problem as F9: stored counters that no runtime path keeps in step with the roster.
