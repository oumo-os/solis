# Vote Weight System

**Status: implementation truth (v2). Supersedes `docs/vote-weight-system.md`.**

Cross-references: `docs_v2/judicial-loop.md` §6 (aSTF quorum), `docs_v2/governance-model.md`.

## 1. Scope

This document covers **deliberation-cell resolution votes** only. aSTF
adjudication uses a separate rubric (Due diligence 9 / Justice 9 /
Proportionality 6 / Integrity 6 — see `docs_v2/judicial-loop.md` §6).
jSTF restriction and resolution votes use majority-of-team math, not
this formula.

## 2. Ws (standing weight)

- Range 0–3000. `user_competence.ws` per domain, summed into
  `users.standing`.
- `users.competence` is a separate verified-competence score, not
  the vote weight.
- Mandate multiplier is applied on top of Ws (§4).

## 3. Domain shares (AI-set, non-user-editable)

Each resolution declares `domainShares` — a map of domain → share
(0–1) summing to 1.0. Example: `{ "Space Law": 0.38, "Liability": 0.35,
"Remote Sensing": 0.27 }`.

- Set by AI during resolution drafting; users cannot edit.
- If a resolution has no `domainShares`, the equal-share fallback
  applies: `1 / resolution.domains.length` per domain.
- Shares are **not persisted** — `draft_resolutions` has no shares
  column. They are re-derived on every load from the hardcoded
  fallback (`index.html:8003`, `11803`). A resolution with AI shares
  carries them only in its in-memory draft object.

## 4. Mandate multiplier

For each voter, the multiplier depends on whether the voter's circle
has a mandate on the resolution's domain:

| Mandate | Multiplier |
|---------|-----------|
| Primary | 1.5× |
| Secondary | 1.0× |
| None (or voter not in any participating circle) | 0.25× |

Looked up from `circle.mandate.primary` / `circle.mandate.secondary`
(`api.php:224`). The lookup walks participating circles in array order
and returns on the first match — order-dependent in practice, though
circles are unique per member.

`desiredWs` (per-circle, per-domain target weight) is a **separate
concept**: competence bars, drift checks and mandate-domain settings
use it; the vote formula does not.

## 5. Effective weight formula

```
effectiveWeight = Ws × share × mandateMultiplier
```

Applied at the voter level (`index.html:2763-2765`), summed per
domain, then aggregated across domains.

## 6. Quorum and pass rules

- **Quorum**: 2/3 of `totalMembers` must have voted
  (`index.html:2721-2722`).
- **Pass**: yea ratio > 50% of (yea + nay) effective weight
  (`index.html:2795-2796`).
- **Abstain**: tracked as a **Ws sum**, not a head count — the server
  sums abstain Ws (`api.php:898,905`); the client adds it to the
  percentage denominator (`index.html:2754,2768`). "Not voted" is a
  separate count (`totalMembers − votedCount`).
- If quorum is not met, the result is **Pending** — never Approved or
  Rejected (`index.html:2828`).
- "Minimum Participants" setting (`index.html:2100`) is stored but
  never read by the vote calculation.

## 7. Two denominators (intentional, but confusing)

The button percentages use `effYea + effNay + absTotal`
(`index.html:2768-2771`); the pass ratio uses `effYea / (effYea + effNay)`
(`index.html:2795-2796`). They are not the same number. The UI labels
them separately; the docs describe both.

## 8. Data shapes

- Participants: `domains: [{ domain, ws, wh, interest, evidence, verified }]`
  — an array, not a map (`api.php:2780`).
- Resolution votes: `voters` is an array of
  `{ name, initials, ws, vote }` (`index.html:2667-2681`).
- `resolution.domains` is a string array; `resolution.voters` is
  per-domain.
- `resolution.domainShares` is not persisted; see §3.

## 9. Audit (verified against code)

| Claim in original doc | Status |
|---|---|
| Ws range 0–3000 | TRUE |
| Mandate multipliers 1.5/1.0/0.25 | TRUE |
| AI-set non-editable shares | TRUE |
| Quorum 2/3 | TRUE |
| Abstain = count only | FALSE (Ws sum) |
| Yea ratio = Σ yea / Σ all voters | MISLEADING (two denominators) |
| Pass while quorum not met | FALSE (Pending) |
| `domainWs` as a map | STALE (array of objects) |
| `voters` as a map | STALE (array) |
| `domainShares` persisted | STALE (not persisted) |
| Minimum participants enforced | FALSE |
