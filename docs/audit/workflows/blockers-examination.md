# The three governance blockers — examination

> **RESOLVED (2026-11-25).** F-D, F-E and F-F were all fixed and re-probed. See
> [`s06-drafter.md`](s06-drafter.md) (14/14), [`s07-vote-weight.md`](s07-vote-weight.md)
> (15/15) and the authoritative status register in `../../to_prod.md`. The examination
> below is kept as the pre-fix evidence and rationale.

An evidence-backed examination of F-D, F-E and F-F before deciding on fixes. All three
are the same shape: **a governance decision is computed in the browser, while the server
records a different one**.

---

## F-D — the drafter's guards are browser-only

### Where it lives

| Concern | Location | Current state |
|---|---|---|
| Collecting the settings | `index.html:7816-7818` | `aiMaxRedrafts`, `aiRedraftCooldown`, `aiConfirmQuorum` are collected from the settings modal |
| Storing them | `index.html:3125` (defaults) | written into `MOCK.systemSettings.deliberation` — **browser memory only**; `system_settings` has 14 columns (`steward_term_months` … `astf_assessors`) and none for these |
| Applying the snapshot | `api.php` `applySettingsSnapshotServer()` | maps **only the `stf` keys** to columns; the `deliberation`, `quorum` and `circles` sections are dropped |
| Enforcing the cap | `index.html:2896-2906` `canRedraft()` | `maxDrafts: 3`, `cooldownMs: 300000` hardcoded literals |
| Enforcing the quorum | `index.html:2909-2937` `requestRedraft()` | `confirmQuorum = ceil(participants / 3)` hardcoded; confirmations are pushed onto `res.aiDraftMeta.confirmations` **in memory** |
| Recording a redraft | `index.html:2939-2968` → `SolisApi.saveDraftVersion()` | the version is stored, but the counter, the timestamp and the confirmations are not — `draft_resolutions` has 9 columns and none of them hold drafter state |
| Server-side guard | `api.php` `POST /cells/:id/draft-resolutions/:did/versions` | authentication only — **no cap, no cooldown, no quorum** |

### Why it matters
Five version appends against one draft are all accepted (`s06-drafter.mjs`); the browser's
"3 remaining / 5 minute cooldown / 1/3 confirmations" are suggestions another client can
ignore. A quorum in progress is lost on reload.

### What a fix requires
1. Persist the settings: add `ai_max_redrafts`, `ai_redraft_cooldown`, `ai_confirm_quorum`
   columns to `system_settings` (schema.sql, seed-mysql.php, and an `ALTER TABLE` for the
   live database), map them in `applySettingsSnapshotServer()`, and read them in the
   settings UI.
2. Persist the drafter state with the draft: add `draft_count`, `last_draft_ts` and
   `confirmations` (JSON) to `draft_resolutions`, or a small `resolution_draft_meta` table.
3. Enforce the cap, cooldown and quorum in the version-append route, reading both from
   the DB; the browser then reads the same values for its display.

---

## F-E — crystallisation ignores the quorum

### Where it lives

| Concern | Location | Current state |
|---|---|---|
| The rule | `vote-weight-system.md §6` | "if quorum is not met, the result is **Pending** — never Approved or Rejected" |
| Panel's quorum | `index.html:2510-2515` | `totalMembers = Σ participatingCircles[].votes`; `quorumReq = ceil(totalMembers × 2/3)` |
| Panel's verdict | `index.html:2590-2598` | if the quorum is not met, `vs-pass-status = pending` |
| Server's decision | `api.php:1169-1184` `POST /cells/:id/debate/close` | reads `cell_vote_summary`, computes `$outcome = $nay > $yea ? 'failed' : 'passed'` — **no quorum, no pending state** |

### Proven
With 2 of 8 participating members voting, the panel shows `pending` and the server still
returns `{"outcome":"failed","yea":900,"nay":1200}` and marks the draft failed
(`s07-vote-weight.mjs`).

### What a fix requires
The server can compute the same quorum from data it already has:
- `SELECT SUM(votes) FROM cell_circles WHERE cell_id = ?` → `totalMembers` (the same 5+3=8);
- `SELECT COUNT(DISTINCT user_id) FROM vote_records WHERE cell_id = ?` → voters;
- if `voters < ceil(totalMembers × 2/3)` → outcome `pending`: do not set a passed/failed
  resolution, leave the draft in `submitted`, and write a governance event that says why.

The response shape already has `outcome`, so the browser can display it — no new field needed.

---

## F-F — the panel and the server weigh the same votes differently

### The exact data flow

| | Weight used | where |
|---|---|---|
| Vote recorded | the member's own standing in the domain (F11 fix) | `memberStanding()` in `api.php` |
| Server aggregate | `SUM(ws)` per vote — **raw** | `api.php` vote-records child route → `cell_votes` / `cell_vote_summary` |
| Bootstrap | exposes the raw sum **and** each voter's raw `ws` | `api.php:436` → `cell.votes.domains[].voters[]` |
| Panel | `ws × domain share × mandate multiplier` | `index.html:2528-2559` (`getMandateMultiplier()` at 2556: 1.5 primary / 1.0 secondary / 0.25 none) |
| Crystallisation | reads the **raw** summary | `api.php:1175-1177` |

### Proven
`cell-21`, two votes:

| | yea (sd, Space Law 900, primary) | nay (mt, Remote Sensing 1200, no mandate) | reading |
|---|---|---|---|
| raw (server) | 900 | 1200 | **failed** |
| effective (panel) | 900 × 0.5 × 1.5 = 675 | 1200 × 0.5 × 0.25 = 150 | **82% yea** |

### What a fix requires — one canonical number
Compute the effective weight **once, where the vote is recorded**, and store it in place of
the raw standing in `vote_records.ws`:

- the server knows the voter (`user_id`), the domain, the member's standing, and the
  participating circles (`cell_circles`) with their mandate domains (`circle_domains`);
- the domain share is derived from the implementing circles' primary mandates
  (`deriveDomainShares()` in the browser) with an equal-share fallback over the voted
  domains — the server can replicate this, or persist the shares on the draft
  (`draft_resolutions` currently has no shares column and re-derives them every load);
- then `cell_votes`, `cell_vote_summary`, `debate/close` and the panel all read the same
  effective numbers. The panel stops re-applying the multiplier to `voter.ws` (otherwise
  it double-counts) and simply sums the stored weights.

The abstain sum must be handled the same way (effective abstain weight), and the two
deliberately different denominators in the panel (buttons include abstain, pass ratio does
not) must be kept.

---

## The common shape

| Blocker | Browser decides | Server records |
|---|---|---|
| F-A (fixed) | applied the founding snapshot | applied the same snapshot → two circles |
| F-D | redraft cap, cooldown, quorum | stores any version, no state |
| F-E | quorum → `pending` | crystallises anyway |
| F-F | effective weights | raw sums |

The established fix pattern from this audit: **compute the decision once on the server,
persist it, and let the browser read it back.** That is what fixed the vote aggregates
(F1), the circle counts (F9), the participation rule and the settings snapshots (F-A).

## Recommended fix order
1. **F-E** — smallest and independent: add the quorum check to `debate/close` using
   `cell_circles` + `vote_records`; return `pending` below quorum. Re-probe S7.
2. **F-F** — compute and store effective weights at vote time; update the panel to read
   them; persist/derive domain shares. Re-probe S7 and M02.
3. **F-D** — persist the settings and the drafter state, then enforce the cap/cooldown/
   quorum in the version route and read the same values in the browser. Re-probe S6.

Each step is independently verifiable with the probes already in `docs/audit/suite/`.
