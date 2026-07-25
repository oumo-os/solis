# Vote Weight System

**Version:** 2.0
**Last updated:** 26 July 2026

---

## Overview

Every vote in Solis carries weight proportional to the voter's competence in the domains relevant to the resolution. Domain shares are configurable — by default equal (1/N), but an AI categoriser can assign unequal weights based on resolution relevance.

---

## Core Concepts

### Ws (Perceived Competence)

Each participant has a **Ws value per domain** — a number between 0 and 3000 representing their perceived competence in that domain. Ws is initially equal to Wh (declared competence) and drifts over time based on activity, endorsements, and assessment outcomes.

### Domain Intersection

A resolution is attached to one or more **implementing domains**. A voter's effective weight in a resolution is derived from the intersection of their domain competences with the resolution's attached domains.

### Domain Shares

Each attached domain receives a **share** of influence. By default, shares are equal:

```
Domain share = 1 / N
```

But shares can be **unequal** — set by the AI categoriser based on how central each domain is to the resolution:

```
Domain share = relevance_score(d) / Σ relevance_scores(all domains)
```

Example with unequal shares:
- Space Law: 0.38 (most central)
- Liability: 0.35 (strongly related)
- Remote Sensing: 0.27 (tangentially related)

Shares must sum to 1.0.

---

## Vote Weight Formula

### Step 1: Per-Domain Weight

For each domain `d` attached to the resolution:

```
Voter's weight in domain d = Ws(voter, d) × share(d)
```

Where:
- `Ws(voter, d)` = the voter's competence in domain d
- `share(d)` = the domain's assigned share (default 1/N)

### Step 2: Aggregate Weight

The voter's total effective weight across all domains:

```
Effective weight = Σ (Ws(voter, d) × share(d)) for all attached domains d
```

### Step 3: Vote Ratio

```
Yea ratio = Σ (yea voters' effective weights) / Σ (all voters' effective weights)
Nay ratio = Σ (nay voters' effective weights) / Σ (all voters' effective weights)
```

Abstentions are tracked as a count only — their weight is not calculated.

---

## Example

### Resolution: "Debris Liability Framework"
- **Attached domains:** Space Law (38%), Liability (35%), Remote Sensing (27%)

### Per-Domain Breakdown

| Domain | Share | Yea Ws | Nay Ws | Total | AJ | OK | NC | MT |
|--------|-------|--------|--------|-------|----|----|----|----|
| LAW Space Law | 38% | 2,840 | 620 | 3,460 | +1,800 | +1,040 | -620 | — |
| LAW Liability | 35% | 1,200 | 312 | 1,512 | +800 | +400 | -312 | — |
| RS Remote Sensing | 27% | 920 | 0 | 920 | — | — | — | +920 |

### Totals

| Row | Yea | Nay | Total |
|-----|-----|-----|-------|
| **Simple Totals** (Σ raw) | 4,960 | 932 | 5,892 |
| **Effective Totals** (Σ raw × share) | 1,653 | 311 | 1,964 |

### Results

| Metric | Value |
|--------|-------|
| Yea ratio (effective) | 84% |
| Nay ratio (effective) | 16% |
| Abstained | 3 members |
| Pass threshold | >50% of effective Yea+Nay |
| Quorum required (2/3 of 8) | 6 |
| Quorum status | **Not met** (5 voted < 6 required) |

---

## Quorum Rules

Quorum is checked at two levels:

1. **Minimum participants:** At least N members must be present in the deliberation cell
2. **Minimum fraction:** At least 2/3 of deliberating members must cast a vote (yea or nay)

Both conditions must be met for a resolution to pass.

### Pass Threshold

Among valid votes:
- **Yea must exceed 50%** of total effective weight (yea + nay)
- Abstentions do not count toward the denominator
- If quorum is not met, the result is "Pending"

---

## UI Layout

### Vote Summary Bar

Three buttons showing:
- **Yea**: percentage of effective weight (e.g. "84% Yea")
- **Nay**: percentage of effective weight (e.g. "16% Nay")
- **Abstain**: count only (e.g. "3 abstain")

### Quorum Bar

Full-width informational bar below the vote buttons:
```
5 / 8 members voted  ·  Quorum (2/3): 6 required  ·  Quorum not met  ·  Pass: >50%  ·  Yea ratio: 84%  ·  Passed
```

### Per-Domain Breakdown Table

```
Domain            Share   Yea Ws  Nay Ws  Total    AJ      OK      NC      MT
─────────────────────────────────────────────────────────────────────────────────
LAW Space Law     38%     2,840     620   3,460  +1,800  +1,040   -620      —
LAW Liability     35%     1,200     312   1,512    +800    +400   -312      —
RS  Remote Sens.  27%       920       0     920      —       —       —    +920
─────────────────────────────────────────────────────────────────────────────────
Simple Totals     Σ raw   4,960     932   5,892
Effective Totals  Σ×share 1,653     311   1,964
```

Voter columns show signed weights: positive = yea, negative = nay.

### Quorum & Threshold Table

```
Quorum & Threshold
Deliberating members    8       Quorum required (2/3)  6
Voted (Yea + Nay)       5       Abstained              3
Quorum status           Not met Effective Yea+Nay      1,964
Pass threshold          >50% (>982)  Effective Yea     1,653
Result                  Passed — Yea 84% exceeds >50% threshold
```

---

## Future: AI Domain Categorisation

Domain shares will be set by an AI drafter and categoriser:

1. **AI Drafter**: Analyses resolution text and assigns relevance scores to each domain
2. **AI Categoriser**: Suggests resolution type (Policy, Resolution, Declaration, Report)
3. **Share assignment**: `share(d) = relevance_score(d) / Σ relevance_scores`
4. **Human override**: Shares are editable in the resolution modal before voting

This replaces the equal-share model with a relevance-weighted model, ensuring domains more central to the resolution carry greater influence.

---

## Design Rationale

### Why per-domain weights?

- A resolution about Space Law should be most influenced by Space Law experts
- But if it also affects Remote Sensing, RS practitioners should have a voice
- Per-domain Ws ensures both conditions are met

### Why configurable domain shares?

- Equal shares are a safe default — transparent and hard to game
- Unequal shares let the AI reflect that some domains are more central to a resolution
- Prevents a tangential domain from diluting the influence of core domains

### Why abstain as count only?

- Abstaining means "I have no opinion on this" — there's no weight to calculate
- Showing a count is sufficient for transparency
- Avoids confusion about what an abstain "weight" would mean

### Why not one-person-one-vote?

- Solis is a competence-weighted commons
- Expertise matters — a participant with Ws=2500 in Space Law has more stake in Space Law decisions than one with Ws=200
- This is not democratic in the traditional sense — it's **meritocratic by domain**

---

## Implementation Notes

### Data Structures

```javascript
// Per-member domain competence
member.domainWs = {
  "Space Law": 1800,
  "Liability": 800,
  "Remote Sensing": 0
};

// Resolution: domain shares (configurable)
resolution.domainShares = {
  "Space Law": 0.38,
  "Liability": 0.35,
  "Remote Sensing": 0.27
};

// Vote per domain (raw ws values, signed: positive=yea, negative=nay)
resolution.votes.domains = [
  { tag:'LAW', name:'Space Law', share:0.38, voters:{AJ:1800, OK:1040, NC:-620} },
  { tag:'LAW', name:'Liability', share:0.35, voters:{AJ:800, OK:400, NC:-312} },
  { tag:'RS',  name:'Remote Sensing', share:0.27, voters:{MT:920} }
];
```

### Calculation Flow

1. When a resolution is opened in the modal, `updateVoteSummary()` is called
2. It reads the domain vote data and computes effective weights using domain shares
3. Simple totals (Σ raw) and effective totals (Σ raw × share) are computed
4. Percentages shown in vote buttons use effective totals
5. Quorum and pass/fail status are displayed in the quorum bar and threshold table
6. Breakdown table is rendered dynamically with per-voter signed columns

---

## References

- `to_prod.md` — Phase 3: Competence & Weight System
- `platform/index.html` — `updateVoteSummary()`, `selectVote()`
- `platform/mock.json` — `votes.domains`, `members.domainWs`
- `docs/modal-design.md` — Resolution modal UI decisions
