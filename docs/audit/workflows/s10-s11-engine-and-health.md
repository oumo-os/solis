# S10–S11 — The integrity engine and the p-aSTF health review

Workflow review of `docs_v2/stf-auto-evaluation.md` (§2 vSTF, §4 p-aSTF) and
`docs_v2/governance-model.md` (the engine's ripples). Probes:
`docs/audit/suite/s10-engine-ripples.mjs` (14 + 7 checks, isolated database).

## Verdict: as expected — 21/21

The three engine ripples and the periodic health review behave as the design describes.
No new divergences.

## S10 — the three ripples

| Ripple | Evidence |
|---|---|
| A — unverified claims | with nothing due the engine correctly does nothing; a newly registered member declaring a claim is picked up on the next poll, a competence-claim vSTF cell is spawned with the domain in its `meta.domains`, and a second poll does not duplicate it |
| A — verification | three assessors evaluate the domain positively; the claim reaches `Assessment Filed` with `verifiedDomains` and the member's `user_competence` row flips to `verified = 1` |
| B — succession | proven in S4 (apply → vacancy → vetting → 3 assessments → top approved candidate seated) |
| C — periodic review | when a circle's review is completed and its `lastPastfReview` cleared, the engine commissions one new p-aSTF review per run for that circle, stamped `commissionedBy: integrity-engine` |

The shipped seed deliberately occupies every ripple: 30 open competence claims cover all
17 members, and all active circles have either an open health review or a recent review
date. So on a fresh install the engine is inert (`acted: 0`) — correct, since nothing is
due, but worth knowing when looking for "AI activity" in the demo.

One contract quirk (not a divergence worth changing): `POST /engine/poll` returns
`acted` from ripples A+B only; ripple C's commissioned review is not counted.

## S11 — the periodic health review

| Workflow | Evidence |
|---|---|
| A reviewer files the circle rubric (30 pt) and the member rubric (35 pt) | the response reports the filed count and `circleTotal: 25` |
| A reviewer cannot file twice | 409 |
| Three reviewers reach quorum | the review becomes `Review Complete` with `avgCircle: 25` and the majority tier `concern` (two concern, one healthy) |
| The reviewed circle records the date | `meta.lastPastfReview` is written on the circle that was actually reviewed |
| Referrals | a member flagged `indispensable: 5` is routed to a jSTF-style intake thread |

## Notes

- The review cell stores its circle as a **name** and its source's `sourceCellId` as the
  literal `'system'` for engine-commissioned reviews; probes must key on the right one.
- The engine runs on an explicit `POST /engine/poll` (F5), which the application calls
  after each load — the succession and verification paths above are only live because that
  call exists.
