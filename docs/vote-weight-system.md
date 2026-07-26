# Vote Weight System

**Version:** 3.0
**Last updated:** 26 July 2026

---

## Overview

Every vote in Solis carries weight proportional to the voter's competence in the domains relevant to the resolution. Each deliberation cell has exactly one resolution. Domain shares are set by the AI drafter based on resolution relevance — users cannot edit them. If the AI fails, equal shares (1/N) are used as fallback.

---

## Core Concepts

### Ws (Perceived Competence)

Each participant has a **Ws value per domain** — a number between 0 and 3000 representing their perceived competence in that domain. Ws is initially equal to Wh (declared competence) and drifts over time based on activity, endorsements, and assessment outcomes.

### Domain Intersection

A resolution is attached to one or more **implementing domains**. A voter's effective weight in a resolution is derived from the intersection of their domain competences with the resolution's attached domains.

### Domain Shares (AI-Generated)

Each attached domain receives a **share** of influence. Shares are set by the AI drafter:

```
Domain share = relevance_score(d) / Σ relevance_scores(all domains)
```

Example with AI-generated shares:
- Space Law: 0.38 (most central to the resolution)
- Liability: 0.35 (strongly related)
- Remote Sensing: 0.27 (tangentially related)

**Shares are not user-editable.** If the AI fails to produce shares, equal shares (1/N) are used as fallback.

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
Voter's weight in domain d = Ws(voter, d) × share(d) × mandateMultiplier(voter, d)
```

Where:
- `Ws(voter, d)` = the voter's competence in domain d
- `share(d)` = the domain's assigned share (default 1/N)
- `mandateMultiplier(voter, d)` = multiplier based on the voter's circle mandate on domain d

### Step 1a: Mandate Multiplier

Each voter belongs to one of the participating circles. That circle's mandate determines the multiplier for each domain:

| Circle Mandate | Multiplier | Effect |
|---------------|-----------|--------|
| **Primary** | 1.5× | Boosted — circle has deep expertise in this domain |
| **Secondary** | 1.0× | Normal — circle has related expertise |
| **No mandate** | 0.25× | Weakened — circle is outside its expertise area |

The multiplier is looked up per-voter per-domain:
1. Find which participating circle the voter belongs to (via `circle.roster.active[]`)
2. Check if the domain is in that circle's `mandate.primary[]` or `mandate.secondary[]`
3. Apply the corresponding multiplier

If a voter doesn't belong to any participating circle, the multiplier defaults to 0.25× (no mandate).

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
- **Participating circles:** Space Law Circle (primary: Space Law, Liability; secondary: Policy)

### Per-Domain Breakdown (with Mandate Multipliers)

| Domain | Share | Yea Ws | Nay Ws | Total | AJ(P) | OK(P) | NC(S) | MT(–) |
|--------|-------|--------|--------|-------|-------|-------|-------|-------|
| LAW Space Law | 38% | 2,840 | 620 | 3,460 | +1,800 | +1,040 | -620 | — |
| LAW Liability | 35% | 1,200 | 312 | 1,512 | +800 | +400 | -312 | — |
| RS Remote Sensing | 27% | 920 | 0 | 920 | — | — | — | +920 |

**Mandate multipliers applied:**
- AJ, OK, NC → Space Law Circle → primary on Space Law (1.5×), primary on Liability (1.5×), no mandate on Remote Sensing (0.25×)
- MT → Remote Sensing Circle → no mandate on any of these domains (0.25×)

### Effective Weight Calculation

| Domain | AJ Ws | × Mult | = Eff | OK Ws | × Mult | = Eff | NC Ws | × Mult | = Eff | MT Ws | × Mult | = Eff |
|--------|-------|--------|-------|-------|--------|-------|-------|--------|-------|-------|--------|-------|
| Space Law | 1,800 | ×1.5 | 2,700 | 1,040 | ×1.5 | 1,560 | -620 | ×1.0 | -620 | — | ×0.25 | — |
| Liability | 800 | ×1.5 | 1,200 | 400 | ×1.5 | 600 | -312 | ×1.0 | -312 | — | ×0.25 | — |
| Remote Sensing | — | ×0.25 | — | — | ×0.25 | — | — | ×0.25 | — | 920 | ×0.25 | 230 |

### Totals

| Row | Yea | Nay | Total |
|-----|-----|-----|-------|
| **Simple Totals** (Σ raw) | 4,960 | 932 | 5,892 |
| **Effective Totals** (Σ raw × share × mandate) | 1,501 | 273 | 1,774 |

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

## AI Domain Categorisation (Implemented)

Domain shares are set by the AI drafter when a resolution is generated or redrafted:

1. **AI Drafter**: Analyses proposal text, deliberation messages, and context
2. **Share assignment**: `share(d) = relevance_score(d) / Σ relevance_scores`
3. **AI Categoriser**: Suggests resolution type (Policy, Resolution, Declaration, Report)
4. **No human override**: Shares are not editable — users can request a redraft if shares seem wrong
5. **Fallback**: If AI fails, equal shares (1/N) are used

Redraft limits prevent abuse:
- Maximum 3 auto-redrafts per resolution
- 5-minute cooldown between redrafts
- 1/3 of deliberating participants must confirm before redraft executes

See `docs/ai-drafter.md` for full details.

---

## Design Rationale

### Why per-domain weights?

- A resolution about Space Law should be most influenced by Space Law experts
- But if it also affects Remote Sensing, RS practitioners should have a voice
- Per-domain Ws ensures both conditions are met

### Why AI-generated (not user-editable) shares?

- Users could game editable shares by inflating their own domain's weight
- AI can objectively assess relevance from the resolution text and deliberation
- Redraft mechanism gives users recourse if AI shares seem wrong
- Equal-share fallback ensures system works even if AI fails

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
// Domain with type field
domain = {
  label: "Astronomy & Astrophysics",
  short: "ASTRO",
  color: "#6EB8FF",
  hasCircle: true,
  type: "knowledge" | "experiential" | "affiliate"
};

// Affiliate domain (created when organisation joins)
domain = {
  label: "Uganda Astronomical Society",
  short: "UAS",
  color: "#C0A0E0",
  hasCircle: false,
  type: "affiliate"
};

// Organisation
organisation = {
  id: "uas",
  name: "Uganda Astronomical Society",
  acronym: "UAS",
  shortname: "Uganda Astro",
  knowledgeDomains: ["astronomy-astrophysics", "science-communication"],
  memberCount: 600,
  foundingCell: null // or cell ID
};

// Per-member domain competence
member.domainWs = {
  "Space Law": 1800,
  "Liability": 800,
  "Remote Sensing": 0
};

// Resolution: domain shares (AI-generated, not user-editable)
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

// Circle mandate (determines multiplier)
circle.mandate = {
  primary: ["Space Law", "Liability"],  // 1.5× multiplier
  secondary: ["Policy"]                  // 1.0× multiplier
};
// Domains not in primary or secondary get 0.25× multiplier

// Participating circles on deliberation cell (must have 'id' for lookup)
cell.participatingCircles = [
  { id: "space-law", name: "Space Law Circle", role: "Lead", votes: 5 },
  { id: "remote-sensing", name: "Remote Sensing Circle", role: "Contributing", votes: 3 }
];
```

### Calculation Flow

1. When a resolution is opened in the modal, `updateVoteSummary()` is called
2. It reads the domain vote data and computes effective weights using domain shares
3. **Mandate multiplier** is applied per-voter per-domain via `getMandateMultiplier()`
4. Simple totals (Σ raw) and effective totals (Σ raw × share × mandate) are computed
5. Percentages shown in vote buttons use effective totals
6. Quorum and pass/fail status are displayed in the quorum bar and threshold table
7. Breakdown table is rendered dynamically with per-voter signed columns and mandate indicators (P/S/–)

---

## References

- `to_prod.md` — Phase 3: Competence & Weight System
- `platform/index.html` — `updateVoteSummary()`, `selectVote()`, `getMandateMultiplier()`
- `platform/mock.json` — `votes.domains`, `members.domainWs`, `domains[type]`, `organisations[]`, `circle.mandate`
- `docs/modal-design.md` — Resolution modal UI decisions
- `docs/organisations.md` — Organisation feature design
- `docs/governance-model.md` — Settings-state resolutions, publication deliberations
