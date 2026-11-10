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
| M1 | Deliberation lifecycle | 38 | 38 pass | ✅ works *(after F2 fix)* |
| M2 | Voting & crystallisation | 23 | 23 pass | ✅ works *(after F1 fix)* |
| M3 | aSTF adjudication | 26 | 26 pass | ✅ works |
| M4 | jSTF judicial investigation | 50 | 50 pass | ✅ works |
| M5 | xSTF execution | 16 | 16 pass | ✅ works |
| M6 | vSTF verification | 20 | 20 pass | ✅ works |
| M7 | p-aSTF health review | 14 | 14 pass | ✅ works |
| M8 | Circles & membership | 36 | 33 pass / 3 fail | ⚠️ new circles cannot be staffed; member count drifts |
| M9 | Threads & engagement | 25 | 25 pass | ✅ works |
| M10 | Publications & Observatory | 24 | 23 pass / 1 fail | ⚠️ suspended members can submit publications |
| M11 | Projects & undertakings | 13 | 12 pass / 1 fail | ⚠️ client-authoritative applications, faked date |
| M12 | Participants & organisations | 15 | 12 pass / 3 fail | ❌ any member can rewrite any record |
| M13 | Auth, session & registration | 21 | 20 pass / 1 fail | ⚠️ same-name registration 500s |
| M14 | Competence, profile & governance records | 19 | 17 pass / 2 fail | ⚠️ settings + policy writes ungated |
| M15 | Whole-application boot & render | 23 | 23 pass | ✅ the SPA boots and renders live data |
| M16 | Authorization matrix | 17 | 9 pass / 8 fail | ❌ three anonymous write paths, ungated CRUD |

**Wave 1 (governance chain) — all 8 modules green (198/198 checks).** The two STF-family
modules that write governance outcomes (aSTF, jSTF) work end to end, including parallel
sealed filings, quorum handling, snapshot application and the judicial-audit hand-off.

The two blockers found during the audit (F1, F2) were fixed and re-verified: the full
wave-1 suite now passes 198/198.

**Waves 2–5 — 17 modules, 391 checks.** Fourteen further findings, including four
blockers: a new circle can never be staffed (F8), any member can rewrite another member's
record (F12), three endpoints accept **unauthenticated writes** (F15) and the generic CRUD
lets any member edit governance records (F16).

## Finding index

| ID | Severity | Module | Status | Summary |
|---|---|---|---|---|
| **F1** | **Blocker** | M2 | ✅ **fixed** | Vote aggregates were never written — votes were stored but never counted, and crystallisation always resolved "passed" |
| **F2** | **Blocker** | M1 / M9 | ✅ **fixed** | `ON DUPLICATE KEY UPDATE 1=1` is invalid SQL on MariaDB — implementing-circle links and thread endorse/bookmark always returned 500 |
| **F8** | **Blocker** | M8 | ⏳ open | A newly created circle can never be staffed — nobody can join its roster and the succession engine skips it |
| **F12** | **Blocker** | M12 | ⏳ open | Any active member can rewrite any member's record — including lifting a live jSTF sanction via `users.status` |
| **F15** | **Blocker** | M14 / M16 | ⏳ open | Three endpoints accept unauthenticated writes: resolution versions, implementing circles, system settings |
| **F16** | **Blocker** | M14 / M16 | ⏳ open | The generic CRUD has no ownership or role gate — any member can rewrite policies, delete users, create users |
| **F3** | Major — needs decision | cross-cutting | ⏳ open | The "steward" gate is "active member of *any* circle", not membership of the circle that owns the cell |
| **F9** | Major | M8 | ⏳ open | `circle.members` is not recomputed when a member is added — the count shown on every circle card drifts from the roster |
| **F10** | Major | M10 | ⏳ open | Publication submission skips `assertActiveMember` — a suspended member can still submit for approval |
| **F4** | Minor | API contract | ⏳ open | `GET` on a child-item id (`/cells/:id/messages/:mid`) answers 405; only collection GETs are supported |
| **F5** | Minor | API contract | ⏳ open | `GET /bootstrap` mutates data — it runs the integrity engine, which can create cells, seat stewards and accept applications |
| **F6** | Minor | hygiene | ✅ **fixed** (partly) | The shadowed vote route (`api.php:938-962`) was removed with the F1 fix; the static `POST /competence/verify-wh` 410 endpoint still stands |
| **F11** | Minor | M11 | ⏳ open | Project applications are client-authoritative and the SPA hardcodes the date `Jul 26, 2026` |
| **F13** | Minor | M12 | ⏳ open | Organisation member counts are client-writable (`member_count`) and are published on the public cards |
| **F14** | Minor | M13 | ⏳ open | Registering a second member with the same name returns 500 (id slug collision) |
| **F17** | Minor | M14 | ⏳ open | The seeded `stats` fixture ("200+ resources", "38 events") is still published although nothing consumes it |
| **F7** | Info | M4 | ⏳ open (by design) | A restricted steward target is frozen (`Suspended`) rather than `Restricted` — verified consistent |

## Waves

- Wave 1 — governance chain: [`wave-1-governance-chain.md`](wave-1-governance-chain.md)
- Waves 2–3 — circles & content: [`wave-2-3-circles-and-content.md`](wave-2-3-circles-and-content.md)
- Waves 4–5 — account, boot & security: [`wave-4-5-account-and-security.md`](wave-4-5-account-and-security.md)
