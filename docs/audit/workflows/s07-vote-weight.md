# S7 — Vote weight system

Workflow review of the vote weighting and the crystallisation decision, against
`docs_v2/vote-weight-system.md` (§2 Ws, §3 Domain shares, §4 Mandate multiplier,
§5 Effective weight, §6 Quorum and pass rules, §7 Two denominators).

Probes: `docs/audit/suite/s07-vote-weight.mjs` (12 checks, isolated database + a booted
copy of the SPA).

## Verdict: the arithmetic matches the design; the decision does not

**12/12 checks pass.** Every documented rule is implemented as written — in the browser.
The gap is that the *server* decides the outcome by a different, simpler rule.

## As expected

| Rule | Evidence |
|---|---|
| Mandate multiplier: primary 1.5, secondary 1.0, none 0.25 | `getMandateMultiplier()` returns exactly these; a member of a circle without a mandate on the voted domain gets 0.25 |
| Quorum: two thirds of the participating members | the panel computes `ceil(8 × 2/3) = 6` (the participating circles' vote counts, 5 + 3) |
| Pass: yea ratio above 50% of (yea + nay) | `passRatio > 50` |
| Two denominators, deliberately | the buttons divide by `effYea + effNay + absTotal`, the pass ratio by `effYea + effNay` |
| Abstain is a Ws sum, added to the button denominator only | the server's summary carries `abstain` as a weight sum; "not voted" is counted separately |

## F-E (Major) — the server crystallises without a quorum

The rule is *"if quorum is not met, the result is Pending — never Approved or
Rejected"*. The panel honours it: with two votes of the six it needs, it shows
`vs-pass-status = pending`.

The server does not check the quorum at all — `POST /cells/:id/debate/close` reads the
totals and decides:

```
POST /cells/cell-21/debate/close  →  {"ok":true,"status":"crystallised","outcome":"failed","yea":900,"nay":1200}
```

Two of eight participating members voted, and the resolution was still crystallised and
its draft marked `failed`/`passed`. The governance record therefore records an outcome the
platform's own rules say has not been reached.

## F-F (Major) — the panel and the server weigh the same votes differently

The panel's numbers are *effective* weights — `Ws × domain share × mandate multiplier`
(`index.html:2552-2555`). The server's numbers are **raw Ws sums**
(`api.php`: `SUM(CASE WHEN vote='yea' THEN ws END)`), with no share and no multiplier.

The probe puts both on one pair of votes in `cell-21` (domains Liability / Remote Sensing
/ Space Law, participating circles Space Law (5) + Remote Sensing (3)):

| | yea (sd — Space Law 900, primary mandate) | nay (mt — Remote Sensing 1200, no mandate there) | reading |
|---|---|---|---|
| **raw (server)** | 900 | 1200 | nay leads → crystallises **failed** |
| **effective (panel)** | 900 × 0.5 × **1.5** = 675 | 1200 × 0.5 × **0.25** = 150 | yea leads by 82% |

The same votes, read by the two halves of the platform, point in opposite directions.
Which one governs is not a matter of preference — it decides resolutions.

## Fix direction

One rule, computed once, on the server:

- compute the effective weight where the vote is recorded (the server already knows the
  voter's standing, the domain share and the voter's circle mandate) and store **that** in
  `vote_records` — so the aggregates, the panel and the crystallisation all read the same
  numbers;
- enforce the quorum in `debate/close`: below quorum the outcome is *pending*, not a
  verdict;
- persist the domain shares with the draft (`draft_resolutions` has no shares column
  today, so every load re-derives them from the equal-share fallback — the drafter's
  shares do not survive a reload) and keep the mandate lookup in one place.

The doc's §3 already notes that shares "are **not persisted** … re-derived on every load
from the hardcoded fallback" — that is why the shares can differ between the moment a
resolution is drafted and the moment it is judged.
