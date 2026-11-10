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

**Wave 1 (governance chain) — all 8 modules green (198/198 checks).** The two STF-family
modules that write governance outcomes (aSTF, jSTF) work end to end, including parallel
sealed filings, quorum handling, snapshot application and the judicial-audit hand-off.

The two blockers found during the audit (F1, F2) were fixed and re-verified: the full
wave-1 suite now passes 198/198.

## Finding index

| ID | Severity | Module | Status | Summary |
|---|---|---|---|---|
| **F1** | **Blocker** | M2 | ✅ **fixed** | Vote aggregates were never written — votes were stored but never counted, and crystallisation always resolved "passed" |
| **F2** | **Blocker** | M1 / M9 | ✅ **fixed** | `ON DUPLICATE KEY UPDATE 1=1` is invalid SQL on MariaDB — implementing-circle links and thread endorse/bookmark always returned 500 |
| **F3** | Major — needs decision | cross-cutting | ⏳ open | The "steward" gate is "active member of *any* circle", not membership of the circle that owns the cell |
| **F4** | Minor | API contract | ⏳ open | `GET` on a child-item id (`/cells/:id/messages/:mid`) answers 405; only collection GETs are supported |
| **F5** | Minor | API contract | ⏳ open | `GET /bootstrap` mutates data — it runs the integrity engine, which can create cells, seat stewards and accept applications |
| **F6** | Minor | hygiene | ✅ **fixed** (partly) | The shadowed vote route (`api.php:938-962`) was removed with the F1 fix; the static `POST /competence/verify-wh` 410 endpoint still stands |
| **F7** | Info | M4 | ⏳ open (by design) | A restricted steward target is frozen (`Suspended`) rather than `Restricted` — verified consistent |

## Wave 1 — Governance chain (detail)

See [`wave-1-governance-chain.md`](wave-1-governance-chain.md) for the per-module
check listings, reproduction steps and the recommended fixes for F1–F7.
