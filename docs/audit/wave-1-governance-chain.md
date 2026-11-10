# Wave 1 — Governance chain (M1–M7)

Module-by-module results for the governance chain:
deliberation → voting → crystallisation → aSTF adjudication → jSTF judicial → xSTF execution
→ vSTF verification → p-aSTF health review.

All write-path checks ran against the isolated `solis_audit` database; every module run
starts from a pristine restore of the seed.

---

## M1 — Deliberation lifecycle · 38/38 · ✅ works

> **Fixed after the audit (F2).** The audit originally scored 36/38: the
> implementing-circle link returned 500 because of an invalid SQL idiom. After the fix the
> module passes 38/38.

**Covered:** direct proposals, thread-raised proposals, system proposals (settings /
circle-settings), deliberation messages, objectives, draft resolution create/read/edit,
resolution versions, implementing-circle links, draft submission (aSTF motion-audit spawn).

**Working correctly:** proposal creation and authorization (401 anonymous / 403 non-steward),
thread back-linking and double-raise protection (409), system-proposal snapshot storage,
circle-settings target gating, message and objective persistence, draft CRUD, version
append, and the submit → aSTF-cell + STF-row + assessor-invitation hand-off.

### F2 (Blocker) — implementing-circle links always fail with 500 — **FIXED**

`POST /cells/:id/draft-resolutions/:did/implementing-circles` returned **500**.

Cause — `platform/api.php:836`:

```php
dbRun('INSERT INTO resolution_implementing_circles (draft_id, circle_name) VALUES (?,?)
       ON DUPLICATE KEY UPDATE 1=1', [...]);
```

`ON DUPLICATE KEY UPDATE 1=1` is a **syntax error** on MariaDB 10.4 (the XAMPP server this
project runs on):

```
ERROR 1064 (42000) ... you have an error in your SQL syntax; check the manual ... near '1=1'
```

The identical idiom at `api.php:850` breaks the **thread endorse / bookmark** endpoints
(`POST /threads/:id/endorsement`, `POST /threads/:id/bookmark`) — see F2 in the index.

**Reproduction**

```
POST /cells/<delib>/draft-resolutions/<row>/implementing-circles  {"circle_name":"Space Law Circle"}
→ 500 (no body; error_reporting is off)
```

**Fix (applied)**

```php
ON DUPLICATE KEY UPDATE circle_name = VALUES(circle_name)
```

and at line 850:

```php
ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)
```

(`server.mjs:308` and `:329` carry the same idiom — legacy, but the same portability landmine.)

---

## M2 — Voting & crystallisation · 23/23 · ✅ works

> **Fixed after the audit (F1).** The audit originally scored 10/23: votes were stored but
> never counted, so the vote panel showed zeros and every deliberation crystallised as
> "passed". After the fix the module passes 23/23.

**Covered:** casting yea/nay/abstain, one-member-one-vote replacement, voter identity
stamping, restriction of sanctioned members, aggregate tables, bootstrap read-back, the
live UI vote panel, debate closure, and the governance event written on crystallisation.

**Working correctly:** votes are stored with the voter's identity, a re-vote replaces the
previous vote rather than adding one, a sanctioned (`Restricted`) member cannot vote
(403), and the vote panel renderer itself is correct — a control run with vote data
injected renders the right percentages.

### F1 (Blocker) — votes were stored but never counted — **FIXED**

The live route that records a vote (`platform/api.php:750-761`, the generic child router)
writes **`vote_records` only**. The code that maintains the aggregate tables
`cell_votes` and `cell_vote_summary` lives in the route at `api.php:938-962`, which is
**shadowed and unreachable** — its own comment says *"the route below is shadowed by the
generic child router above … do not revive without removing the childDefs entry"*.

Evidence after three votes (nay 500 + nay 400 + yea 100):

| table | rows |
|---|---|
| `vote_records` | 3 ✅ |
| `cell_votes` | **0** ❌ |
| `cell_vote_summary` | **0** ❌ |

Three consequences, all reproduced:

1. **The vote panel renders zeros.** `/bootstrap` builds `cell.votes` from
   `cell_votes` / `cell_vote_summary` (`api.php:250,254,413`), so the panel shows
   `vs-yea-pct = 0%`, `vs-nay-pct = 0%` after a reload — even though the votes are in the
   database. The POST response also omits `domains`/`summary`, so the client's optimistic
   update (`applyCastResult`, `index.html:2446`) cannot fill the panel either: the user
   sees no votes at any point.

2. **Crystallisation ignores the votes.** `POST /cells/:id/debate/close` reads the empty
   summary (`api.php:995`):

   ```
   {"ok":true,"status":"crystallised","outcome":"passed","yea":0,"nay":0}
   ```

   With nay 1100 against yea 100 the resolution still crystallises as **passed**, and the
   draft is marked `passed` instead of `failed`.

3. **The governance record is wrong.** The crystallisation event reads
   `… resolution passed (yea 0 Ws / nay 0 Ws)`.

**Fix (applied)** — recompute the aggregates on every vote, inside the live route, and
return the shape the client already expects:

```php
// after inserting the vote_records row
$rows = dbAll("SELECT domain, COALESCE(SUM(CASE WHEN vote='yea' THEN ws END),0) AS yea, … 
               FROM vote_records WHERE cell_id = ? GROUP BY domain", [$parentId]);
// upsert cell_votes per domain, upsert cell_vote_summary with {yea,nay,abstain}
send(200, ['record' => $record, 'domains' => $rows, 'summary' => $summary]);
```

The now-redundant shadowed block at `api.php:938-962` was deleted in the same change, so
there is now exactly one place that maintains the aggregates.

**Re-verification:** M2 passes 23/23 — the panel renders the cast percentages, the
bootstrap carries `cell.votes` for the cell, crystallisation resolves to `failed` when nay
outweighs yea, the draft is marked `failed`, and the governance event records
`yea 100 Ws / nay 1100 Ws`.

---

## M3 — aSTF adjudication · 26/26 · ✅ works

Formation opens with a quorum, the proposer is excluded from the assessor pool, non-invited
members cannot take a seat, accepted assessors are seated and the formation flips to
`seated`, filings are sealed and parallel, an assessor cannot file twice (409), the
majority stance decides (a split falls through to `revision`), the origin deliberation and
its draft follow the verdict (`Approved`/`passed`, `Rejected`/`failed`), the aSTF row moves
to `completed`, the verdict is written to the governance log, and an approved
**settings snapshot** is applied to `system_settings` with a `settings-applied` governance
event and a `governance_ledger` entry.

---

## M4 — jSTF judicial investigation · 50/50 · ✅ works

Anonymous report → sealed judicial thread → steward escalation → duplicate-case guard →
target excluded from the adjudicator pool → seating → **restriction vote** (majority flips
the case to `restricted`, the target's directory status is updated, and the change is
logged) → lift restores the member → investigation questions (create/update) → xSTF probe
commissioning with a mandate brief → deliverable filed → **off-case stewards are refused**
review rights → findings accepted → working resolution draft (saving it clears stale
endorsements) → verdict refused without team endorsement (403) → endorsement poll →
verdict with policy citations → **blind judicial aSTF audit spawned** → the judicial thread
is not publicly visible.

**F7 (Info)** — a steward target restricted by a non-unanimous vote is *frozen*
(`users.status = 'Suspended'`), while a non-steward target is `Restricted`. This is the
documented mapping in `syncTargetRestriction` (`api.php:65-70`) and was verified consistent.

---

## M5 — xSTF execution · 16/16 · ✅ works

An unapproved audit cannot spawn an execution cell (400), non-stewards are refused (403),
an approved audit spawns a blind execution cell carrying the aSTF resolution as its
authority, the seven-step task ladder is seeded, the named team is seated, a second spawn
is refused (409), deliverables can be filed, sent back for revision (cell stays active) or
approved (cell → `Completed`, resolution `Delivered`, STF row completed), and a completed
cell accepts no further deliverables.

---

## M6 — vSTF verification · 20/20 · ✅ works

Claims are gated on the claim type, one open claim per candidate (409), a candidate cannot
assess their own claim (403), a rationale is mandatory, an assessor cannot file twice, the
quorum decision averages the scores (75/100 → approved at the documented ≥60 threshold),
the candidacy is written to the governance log, and **competence claims verify for real**:
the claimed domain flips to `verified = 1` in `user_competence`.

---

## M7 — p-aSTF health review · 14/14 · ✅ works

Archived circles cannot be reviewed (403), non-stewards cannot spawn (403), a second review
from the same host is refused (409), the circle rubric total is computed (25/30), a reviewer
cannot file twice, the quorum decides the health tier, the circle records
`lastPastfReview`, the p-aSTF row completes, and a member flagged as *indispensable* is
referred to the jSTF intake as an anonymous report.

---

## Cross-cutting observations

### F3 (Major — needs a product decision)

Governance routes gate on *"active member of **any** circle"* rather than membership of the
circle that owns the cell — e.g. `debate/close` (`api.php:991`), draft submit
(`api.php:969`), `astf-verdict` (`api.php:1013`), `raise-proposal` (`api.php:878`), and
`pin` (`api.php:864`).

In the current data model the circle roster *is* the steward body (15 of 17 users are
active roster members), so this may be intended — but its practical effect is that
**almost any member can crystallise any deliberation, submit any draft, file any aSTF
verdict and pin any thread**. Circle-scoped gating exists only for roster writes.

### F4 (Minor)

`GET /cells/:id/messages/:messageId` (and every other child-item GET) answers **405**;
only collection GETs are implemented (`api.php:816`). No client currently calls these
paths, so it is a contract gap rather than a live break.

### F5 (Minor)

`GET /bootstrap` is write-capable: it runs `integrityEnginePoll(3)` (`api.php:158`), which
can commission vSTFs, seat vetted successors and accept circle applications as a side
effect of a read. It also makes the endpoint unsafe to cache and complicates retries.

### F6 (Minor — hygiene)

- `api.php:938-962` — the shadowed vote route, kept "for reference"; once F1 is fixed it
  should be deleted rather than left to mislead.
- `POST /competence/verify-wh` (`api.php:2863`) — a static 410 endpoint with no
  authentication and no database access.
