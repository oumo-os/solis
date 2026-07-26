# Solis Governance Model

## Overview

Solis uses a flat, permission-less governance model where **circle membership equals stewardship**. There are no roles within circles — every member is a steward with equal privileges.

---

## Circle Membership = Stewardship

### Core Principle

> Every circle member is a steward. There are no roles within circles. Membership = stewardship = steward privileges.

- All members can propose, draft, vote, and act on steward decisions
- No approval/rejection workflow for joining — membership is open to anyone who applies
- Stewards hold authority only while they remain members

### Roster Status Values

| Status | Meaning |
|--------|---------|
| `active` | Currently serving as steward |
| `former` | Previously served, no longer a member |
| `candidate` | In the succession queue (has applied to join) |

**Note:** There is no `invited` status. Users apply to circles; they are not invited.

---

## Succession Queue (Steward Candidacy)

### How It Works

1. Any user can apply to join a circle via "Apply to Join"
2. Applications enter the **succession queue** (visible in Co-Stewards modal)
3. When a seat opens (member departs), the system evaluates top candidates
4. A vSTF is spawned to verify the candidate's competence
5. Top candidate takes the post

### Succession Flow

- Candidate applies to the circle (via "Apply to Join") and enters the succession queue
- When a steward vacancy opens, the system automatically runs a vSTF evaluation
- vSTF evaluates pending candidates by interest alignment, competence (Ws), and workload
- Top evaluated candidate automatically takes the steward post (no human approval needed)
- Candidates can withdraw from the queue at any time
- The entire process is invisible and automatic — no steward action required

### Candidate Evaluation

The system evaluates candidates automatically based on:
- **Interest alignment** — domains of interest vs circle mandate
- **Competence** — domain knowledge scores (Ws)
- **Workload** — current participation in other circles/cells

---

## Co-Stewards Modal

The Co-Stewards modal (`openMembersModal()`) shows three sections:

### 1. Active Members
- Currently serving stewards
- Shows domain overlap, competence bars, last active

### 2. Succession Queue
- Candidates waiting for a seat to open
- Shows application date, motivation, queue position
- vSTF auto-evaluates candidates when vacancies open (top candidate takes the post)
- Candidates can withdraw from the queue at any time
- No steward action required — fully automatic

### 3. Former Members
- Previously served stewards
- Shows departure date and reason
- History is preserved but read-only

---

## Deliberation Cells

### Deliberation Flow

1. Proposal submitted → creates deliberation cell
2. Discussion + messages accumulate
3. AI drafter generates resolution (if quorum met)
4. Resolution enters confirmation phase (1/3 quorum)
5. Confirmed → crystallised → vSTF spawned
6. Vote → outcome

### One Resolution Per Cell

Each deliberation cell has exactly one resolution slot. This ensures clear ownership and prevents conflicting proposals.

---

## Settings-State Resolutions

When a settings change is proposed (e.g. "change steward term to 18 months"), the deliberation cell shows:

### Origin Section

1. **Current Settings (Snapshot)** — the system settings at the time the proposal was created, stored as `settingsSnapshot` on the cell
2. **Proposed Changes** — the proposer's submitted changes with:
   - Setting name
   - Old value (struck through, red)
   - Arrow → New value (green, bold)
   - Rationale text (italic)
3. **Info note** — "If this resolution passes, stewards must manually update these values in System Settings."

### Key Difference from Standard Resolutions

- The resolution text is **freeform** — it documents the discussion and final agreed changes, which may differ from the original proposal
- Example: Steward proposes "change steward term to 2 years" → after deliberation, resolution says "change STF quorum to 9" → all mutations documented in the final resolution
- After resolution passes, stewards **manually apply** the changes in System Settings
- No automated settings mutation — the resolution text is the source of truth

### Resolution Outcomes

- **Approved** → stewards update system settings manually, document changes
- **Failed** → no changes applied, proposal recorded as rejected

---

## Publication Deliberations

Publication deliberations use a different voting model than standard deliberations.

### Vote Labels

| Standard | Publication |
|----------|------------|
| Yea | Approve |
| Nay | Not Approve |
| Abstain | Abstain (same) |

### Semantic Difference

- **Standard vote**: "I second this resolution" (consensus on a statement)
- **Publication vote**: "I approve this action" (authorization to publish)

### Outcomes

- **Approved** → publication proceeds to aSTF for formal review → if aSTF approves → published
- **Not Approved** → no aSTF spawned → publication does not happen
- **Abstained** → counted as a number, not factored into weight

### Resolution Text

The resolution text documents the discussion and deliberation outcome — even if the vote fails. This creates a record of what was discussed and why the publication was or wasn't approved.

---

## Publication Flow

### Thread → Publication

1. A discussion thread in Commons gains traction
2. A circle steward clicks "Submit for Publication"
3. This creates a `publication-approval` deliberation cell
4. The circle reviews and votes
5. If approved → published as official publication

### Project Deliverables → Commons

1. A project cell completes deliverables
2. The supervising circle steward clicks "Publish to Commons"
3. This creates a new discussion thread in Commons
4. The thread can then be submitted for formal publication

---

## Project Cell Governance

### Supervision

- Project cells are supervised by a circle
- Only stewards of the supervising circle can manage the project
- Settings card visible only to circle stewards

### Team Management

- Proposer selects team upfront when creating the project
- Stewards can add/remove members (creates deliberation)
- Members can apply to join (creates application)
- All team changes are deliberated

### Project Lifecycle

1. **Proposal** — proposer creates project proposal with team
2. **Sponsorship** — circle steward sponsors the proposal
3. **Deliberation** — circle deliberates and votes
4. **Activation** — project cell created if approved
5. **Execution** — team works on deliverables
6. **Publishing** — deliverables published to Commons
7. **Completion** — project archived

---

## System Settings

### Global Defaults

- **Steward Term** — default term length for all circles
- **Cool-off Period** — required gap between consecutive terms
- **Max Consecutive Terms** — maximum terms before cool-off
- **p-aSTF Cycle Duration** — time window for participant-aSTF

### Per-Circle Overrides

- **Steward Term Override** — custom term for this circle
- **Circle Expiry Override** — custom expiry for this circle

---

## Governance Events

The Governance view tracks:

- Resolution votes (passed/failed/pending)
- Integrity records (sanctions, disputes, amendments)
- Stewardship events (circle formations, member departures)

### Filter System

- **All** — everything
- **Integrity** — sanctions, disputes, amendments
- **Stewardship** — formations, departures, appointments

---

## Technical Implementation

### Key Functions

- `isStewardOfCircle(circleId)` — checks if current user is in `circle.roster.active[]`
- `isStewardOfAnyCircle()` — checks if user is steward of any active circle
- `openMembersModal()` — shows Co-Stewards modal with 3 sections
- `renderProjectSettings(cellId)` — shows settings card for supervising circle stewards
- `submitThreadForPublication()` — creates publication-approval deliberation cell
- `publishDeliverablesToCommons(cellId)` — publishes project deliverables as discussion thread

### Data Structures

```json
{
  "circles": [
    {
      "id": "space-law",
      "roster": {
        "active": [{ "id": "os", "name": "...", "status": "active" }],
        "former": [{ "id": "...", "name": "...", "status": "former" }]
      }
    }
  ],
  "circleApplications": [
    {
      "id": "cand-1",
      "name": "Amara Osei",
      "circleId": "space-law",
      "status": "pending",
      "motivation": "...",
      "applied": "Jun 2026"
    }
  ]
}
```
