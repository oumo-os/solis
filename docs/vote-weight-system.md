# Vote Weight System

**Version:** 1.0
**Last updated:** 26 July 2026

---

## Overview

Every vote in Solis carries weight proportional to the voter's competence in the domains relevant to the resolution. This ensures that decisions are influenced most by those with the greatest stake and knowledge in the affected areas.

---

## Core Concepts

### Ws (Perceived Competence)

Each participant has a **Ws value per domain** — a number between 0 and 3000 representing their perceived competence in that domain. Ws is initially equal to Wh (declared competence) and drifts over time based on activity, endorsements, and assessment outcomes.

### Domain Intersection

A resolution is attached to one or more **implementing domains**. A voter's effective weight in a resolution is derived from the intersection of their domain competences with the resolution's attached domains.

### Equal Domain Share

When a resolution is attached to **N domains**, each domain receives an equal share of influence:

```
Domain share = 1 / N
```

For example, a resolution attached to Space Law, Liability, and Remote Sensing gives each domain 33.3% influence.

---

## Vote Weight Formula

### Step 1: Per-Domain Weight

For each domain `d` attached to the resolution:

```
Voter's weight in domain d = Ws(voter, d) / N
```

Where:
- `Ws(voter, d)` = the voter's competence in domain d
- `N` = total number of attached domains

### Step 2: Aggregate Weight

The voter's total effective weight across all domains:

```
Effective weight = Σ (Ws(voter, d) / N) for all attached domains d
```

### Step 3: Vote Ratio

The final vote ratio is computed as:

```
Yea ratio = Σ (yea voters' effective weights) / Σ (all voters' effective weights)
Nay ratio = Σ (nay voters' effective weights) / Σ (all voters' effective weights)
Abstain ratio = Σ (abstain voters' effective weights) / Σ (all voters' effective weights)
```

---

## Example

### Resolution: "Debris Liability Framework"
- **Attached domains:** Space Law, Liability, Remote Sensing (N = 3)

### Voters

| Voter | Domain | Raw Ws | Effective Ws (Ws/3) | Vote |
|-------|--------|--------|---------------------|------|
| Akello Jane | Space Law | 1,800 | 600 | Yea |
| Akello Jane | Liability | 800 | 267 | Yea |
| Akello Jane | Remote Sensing | 0 | 0 | Yea |
| Osei Kwame | Space Law | 1,040 | 347 | Yea |
| Osei Kwame | Liability | 400 | 133 | Yea |
| Osei Kwame | Remote Sensing | 0 | 0 | Yea |
| Namugga Claire | Space Law | 620 | 207 | Nay |
| Namugga Claire | Liability | 312 | 104 | Nay |
| Namugga Claire | Remote Sensing | 0 | 0 | Nay |
| Mwenda Thomas | Remote Sensing | 920 | 307 | Yea |

### Results

| Vote | Effective Weight | Ratio |
|------|-----------------|-------|
| Yea | 600 + 267 + 0 + 347 + 133 + 0 + 307 = **1,654** | **60%** |
| Nay | 207 + 104 + 0 = **311** | **20%** |
| Abstain | 340 (from mock data) | **20%** |
| **Total** | **2,305** | **100%** |

### Quorum Check

- **Voted:** 4 members (yea or nay)
- **Required:** 2/3 of 8 deliberating members = 5.33 → **6 required**
- **Result:** Quorum NOT met (4 < 6)

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

---

## Future: AI Domain Categorisation

Currently, all attached domains receive equal share. In a future version:

- An AI will analyse the resolution text and assign **weighted relevance scores** to each domain
- Domains more central to the resolution will carry greater influence
- This replaces the equal-share model with a relevance-weighted model

The formula becomes:

```
Domain share = relevance_score(d) / Σ relevance_scores(all domains)
```

---

## Design Rationale

### Why per-domain weights?

- A resolution about Space Law should be most influenced by Space Law experts
- But if it also affects Remote Sensing, RS practitioners should have a voice
- Per-domain Ws ensures both conditions are met

### Why equal domain share?

- Prevents gaming by attaching many low-relevance domains
- Simple and transparent
- Easy to understand and audit

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

// Resolution attached domains
resolution.implementingCircles = ["Space Law Circle", "Remote Sensing Circle"];
// Derived domains from circle mandates
resolution.domains = ["Space Law", "Liability", "Remote Sensing"];

// Vote per domain
resolution.votes.domains = [
  { name: "Space Law", yea: 2840, nay: 620, total: 3460 },
  { name: "Liability", yea: 1200, nay: 312, total: 1512 },
  { name: "Remote Sensing", yea: 920, nay: 0, total: 920 }
];
```

### Calculation Flow

1. When a resolution is opened in the modal, `updateVoteSummary()` is called
2. It reads the domain vote data and computes effective weights
3. It displays the aggregate percentages in the vote summary bar
4. The breakdown table shows per-domain detail with voter chips

---

## References

- `to_prod.md` — Phase 3: Competence & Weight System
- `platform/index.html` — `updateVoteSummary()`, `selectVote()`
- `platform/mock.json` — `votes.domains`, `members.domainWs`
