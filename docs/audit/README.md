# Solis — Module-by-Module Functionality Audit

Audit of every functional module of the Solis platform: UI render ↔ API ↔ database,
run against an isolated copy of the production data so write paths could be exercised
without touching development data.

## Method

| Layer | What it verifies |
|---|---|
| **L1 API contract** | Status codes, response shapes, authorization boundaries for every endpoint in the module |
| **L2 Database state** | That the action actually persisted (SQL assertions after each step, not just "200 OK") |
| **L3 UI render** | The real SPA render function executed against the real `/api/bootstrap` payload in a sandboxed DOM (no browser needed) |
| **L4 Static wiring** | Every module control maps to a real API call; every content id has a JS producer |

### Harness

- **Isolated database** — `solis` is dumped and restored into `solis_audit`; every module
  starts from the same pristine state (`reset-audit-db.cmd`).
- **Isolated API** — a wrapper under `htdocs/solis-audit/api.php` sets `SOLIS_DB_NAME=solis_audit`
  and includes the repo's `platform/api.php` (self-contained, no file dependencies).
  The wrapper lives **outside the repository** and is deleted at teardown.
- **Live API** — `http://localhost/solis/api` is used for read-only contract checks and for
  the application's own behaviour; write-path tests always target the isolated copy.
- **Rate limits** — the persistent login limiter (10 / 15 min) is cleared in the isolated
  database only; the live application keeps its limiter, and the auth module audit
  exercises it deliberately.

### Severity scale

| Level | Meaning |
|---|---|
| **Blocker** | The module does not work — the core outcome is wrong or unreachable |
| **Major** | Works partially, or works unsafely (data loss, wrong governance outcome, missing authorization) |
| **Minor** | Edge case, contract inconsistency, or hygiene issue |
| **Info** | Observation or design question — no code change implied yet |

## Roll-up

| # | Module | Checks | Result | Verdict |
|---|---|---|---|---|
| M0 | Harness isolation | 11 | 11 pass | ✅ harness trustworthy |
| M1 | Deliberation lifecycle | 38 | 38 pass | ✅ works |
| M2 | Voting & crystallisation | 23 | 23 pass | ✅ works |
| M3 | aSTF adjudication | 26 | 26 pass | ✅ works |
| M4 | jSTF judicial investigation | 50 | 50 pass | ✅ works |
| M5 | xSTF execution | 16 | 16 pass | ✅ works |
| M6 | vSTF verification | 20 | 20 pass | ✅ works |
| M7 | p-aSTF health review | 14 | 14 pass | ✅ works |
| M8 | Circles & membership | 37 | 37 pass | ✅ works |
| M9 | Threads & engagement | 25 | 25 pass | ✅ works |
| M10 | Publications & Observatory | 24 | 24 pass | ✅ works |
| M11 | Projects & undertakings | 13 | 13 pass | ✅ works |
| M12 | Participants & organisations | 15 | 15 pass | ✅ works |
| M13 | Auth, session & registration | 21 | 21 pass | ✅ works |
| M14 | Competence, profile & governance records | 19 | 19 pass | ✅ works |
| M15 | Whole-application boot & render | 23 | 23 pass | ✅ the SPA boots and renders live data |
| M16 | Authorization matrix | 17 | 17 pass | ✅ writes are gated |
| M17 | Participation & domain separation | 15 | 15 pass | ✅ topics decide who takes part |

**All 18 modules green — 409/409 checks pass.**

The audit found 19 findings; 16 were fixed and re-verified (F1, F2, F8–F19). Three remain
open by decision: F3 (the "steward" gate is "active member of any circle" — kept as the
intended model, with participation separated by domains), F4 (child-item GETs answer 405)
and F5 (`GET /bootstrap` runs the integrity engine, so a read can write).

## The governance model (as confirmed by the platform owner)

> A steward is someone in a circle. Any steward may do what any other steward may.
> Participation is the exception — domains (topics) decide who takes part.

| Concern | Rule |
|---|---|
| Steward actions | Open to every steward, whatever circle they belong to |
| Speaking | In a deliberation, circle or project cell, only members holding standing in one of the cell's topics speak there |
| Voting | Only in a domain where the member holds standing |
| Weight | The member's own recorded standing — never a client-supplied number |

See [`wave-6-participation.md`](wave-6-participation.md).

**Wave 1 (governance chain)** — the two STF-family modules that write governance
outcomes (aSTF, jSTF) work end to end, including parallel sealed filings, quorum
handling, snapshot application and the judicial-audit hand-off.

**Wave 5 (application boot)** — the whole SPA boots against the live payload in a
sandboxed DOM and renders every surface with live data; no fabricated fixture figure
appears anywhere in the rendered DOM.

## Finding index

| ID | Severity | Module | Status | Summary |
|---|---|---|---|---|
| **F1** | **Blocker** | M2 | ✅ **fixed** | Vote aggregates were never written — votes were stored but never counted, and crystallisation always resolved "passed" |
| **F2** | **Blocker** | M1 / M9 | ✅ **fixed** | `ON DUPLICATE KEY UPDATE 1=1` is invalid SQL on MariaDB — implementing-circle links and thread endorse/bookmark always returned 500 |
| **F8** | **Blocker** | M8 | ✅ **fixed** | A newly created circle could never be staffed — the founder is now seated automatically |
| **F12** | **Blocker** | M12 | ✅ **fixed** | Any active member could rewrite any member's record — including lifting a live jSTF sanction via `users.status` |
| **F15** | **Blocker** | M14 / M16 | ✅ **fixed** | Three endpoints accepted unauthenticated writes: resolution versions, implementing circles, system settings |
| **F16** | **Blocker** | M14 / M16 | ✅ **fixed** | The generic CRUD had no ownership or role gate — any member could rewrite policies, delete users, create users |
| **F3** | Major — needs decision | cross-cutting | ✅ confirmed as the model | The "steward" gate is "active member of *any* circle" — confirmed intended; participation is separated by domains instead (see wave 6) |
| **F9** | Major | M8 | ✅ **fixed** | `circle.members` was not recomputed when a member was added — the count on every circle card drifted from the roster |
| **F10** | Major | M10 | ✅ **fixed** | Publication submission skipped `assertActiveMember` — a suspended member could still submit for approval |
| **F4** | Minor | API contract | ⏳ open | `GET` on a child-item id (`/cells/:id/messages/:mid`) answers 405; only collection GETs are supported |
| **F5** | Minor | API contract | ⏳ open | `GET /bootstrap` mutates data — it runs the integrity engine, which can create cells, seat stewards and accept applications |
| **F6** | Minor | hygiene | ✅ **fixed** | The shadowed vote route was removed with the F1 fix; the static `POST /competence/verify-wh` 410 endpoint now answers 410 by design |
| **F11** | Minor | M11 | ✅ **fixed** | Project applications were client-authoritative and the SPA hardcoded the date `Jul 26, 2026` |
| **F13** | Minor | M12 | ✅ **fixed** | Organisation member counts were client-writable and were published on the public cards — now derived from the affiliation rows |
| **F14** | Minor | M13 | ✅ **fixed** | Registering a second member with the same name returned 500 (id slug collision) |
| **F17** | Minor | M14 | ✅ **fixed** | The seeded `stats` fixture ("200+ resources", "38 events") was still published — the snapshot is now derived from live tables |
| **F18** | Major | M17 | ✅ **fixed** | The deliberation, project-cell and circle-cell composers had no handler — members could read a cell's record but never write to it |
| **F19** | Minor | M17 | ✅ **fixed** | The circle-cell copy claimed messages were "restricted to circle members" while every steward may speak there |
| **F7** | Info | M4 | ⏳ open (by design) | A restricted steward target is frozen (`Suspended`) rather than `Restricted` — verified consistent |

## Waves

- Wave 1 — governance chain: [`wave-1-governance-chain.md`](wave-1-governance-chain.md)
- Waves 2–3 — circles & content: [`wave-2-3-circles-and-content.md`](wave-2-3-circles-and-content.md)
- Waves 4–5 — account, boot & security: [`wave-4-5-account-and-security.md`](wave-4-5-account-and-security.md)
- Wave 6 — the participation model: [`wave-6-participation.md`](wave-6-participation.md)
