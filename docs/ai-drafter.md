# AI Drafter

**Version:** 1.0
**Last updated:** 26 July 2026

---

## Overview

The AI Drafter generates resolution text, titles, types, and domain weight shares from a proposal and deliberation discussion. Each deliberation cell has exactly one resolution — the AI creates it on demand and can redraft it up to 3 times with participant confirmation.

---

## Flow

### Generate Resolution (first draft)

When no resolution exists in a cell:

1. User clicks **"Generate Resolution (AI)"** in the sidebar
2. Button shows loading state: "Generating resolution…"
3. AI receives:
   - **Proposal text** — the original proposal that entered the cell
   - **Deliberation messages** — the full discussion thread
   - **Attached domains** — which domains are relevant
4. AI produces:
   - `title` — resolution title
   - `text` — full resolution body with numbered clauses
   - `action` — resolution type (Policy, Resolution, Declaration, Report)
   - `implementingCircles` — suggested implementing circles
   - `domainShares` — relevance-weighted shares per domain
5. Resolution is created, version 1 pushed, modal opens automatically

### Auto Redraft (revision)

When a resolution already exists:

1. User clicks **"Auto Redraft (AI)"** in the sidebar or modal
2. Confirmation quorum check (see below)
3. If quorum met, AI receives:
   - **Current resolution text** (the existing draft)
   - **All deliberation messages** (including any new ones since last draft)
   - **Current domain shares** (for reference)
4. AI produces a revised resolution
5. New version appended, votes nullified, modal opens

---

## Redraft Limits

To prevent abuse (spamming redrafts until weights favour a particular outcome), three controls are in place:

### Maximum Redrafts

Each resolution has a maximum of **3 AI redrafts** (configurable in system settings). The counter increments each time `executeRedraft()` runs.

```
resolution.aiDraftMeta.draftCount  // 0, 1, 2, 3 (max)
resolution.aiDraftMeta.maxDrafts   // default: 3
```

### Cooldown

There is a **5-minute cooldown** between redrafts (configurable). The system checks `lastDraftTs` before allowing a new redraft.

```
resolution.aiDraftMeta.lastDraftTs   // timestamp of last AI draft
resolution.aiDraftMeta.cooldownMs    // default: 300000 (5 min)
```

### Confirmation Quorum

Before a redraft executes, **1/3 of deliberating participants** must confirm (configurable: 1/3, 1/2, or unanimous).

```
resolution.aiDraftMeta.confirmations   // array of user IDs who confirmed
resolution.aiDraftMeta.confirmQuorum   // Math.ceil(participants.length / 3)
```

#### Confirmation flow:

1. First user clicks "Auto Redraft (AI)" → their ID added to `confirmations[]`
2. System shows: "Confirmation recorded (1/3). 2 more participants must confirm."
3. Second user clicks → "Confirmation recorded (2/3). 1 more participant must confirm."
4. Third user clicks → quorum met, `executeRedraft()` runs
5. After redraft, `confirmations[]` is reset to `[]`

---

## Domain Shares

### How shares are computed

The AI analyses the resolution text and assigns a relevance score (0-1) to each attached domain. Shares are normalised to sum to 1.0:

```
share(d) = relevance_score(d) / Σ relevance_scores(all domains)
```

### Example

Resolution: "Establish proportional liability framework for manoeuvre-induced orbital debris"

| Domain | Relevance Score | Share |
|--------|----------------|-------|
| Space Law | 0.45 | 0.38 |
| Liability | 0.42 | 0.35 |
| Remote Sensing | 0.33 | 0.27 |
| **Total** | **1.20** | **1.00** |

### Why shares are not user-editable

- Prevents gaming: users could inflate their own domain's weight
- AI can objectively assess relevance from text analysis
- Redraft mechanism gives recourse if shares seem wrong
- Equal-share fallback (1/N) ensures system works if AI fails

### Fallback

If the AI fails to produce domain shares (API error, timeout, etc.), the system defaults to equal shares:

```javascript
if (!res.domainShares) {
  res.domainShares = { 'Space Law': 0.33, 'Liability': 0.33, 'Remote Sensing': 0.34 };
}
```

---

## Data Structure

### Resolution object (new fields)

```javascript
{
  id: 1,
  title: 'Debris Liability Framework — Proportional Model',
  text: 'MOTION: Establish proportional...',
  action: 'Policy',
  implementingCircles: ['Space Law Circle', 'Remote Sensing Circle'],

  // AI-generated domain shares (not user-editable)
  domainShares: {
    'Space Law': 0.38,
    'Liability': 0.35,
    'Remote Sensing': 0.27
  },

  // AI drafter metadata
  aiDraftMeta: {
    draftCount: 1,          // how many AI drafts have been generated
    maxDrafts: 3,           // configurable limit
    cooldownMs: 300000,     // 5 minutes between drafts
    lastDraftTs: 1721990400000, // timestamp of last AI draft
    confirmations: [],      // user IDs who confirmed the next redraft
    confirmQuorum: 3        // ceil(8 participants / 3)
  },

  votesNullified: false,
  versions: [
    { title: '...', text: '...', action: 'Policy', author: 'AI Drafter', ts: 'Jul 26, 2026 14:30' }
  ]
}
```

### `canRedraft(res)` — limit checker

```javascript
function canRedraft(res) {
  var meta = res.aiDraftMeta;
  if (meta.draftCount >= meta.maxDrafts)
    return { ok: false, reason: 'Max redrafts (3) reached' };
  if (meta.lastDraftTs && (Date.now() - meta.lastDraftTs) < meta.cooldownMs) {
    var mins = Math.ceil((meta.cooldownMs - (Date.now() - meta.lastDraftTs)) / 60000);
    return { ok: false, reason: 'Cooldown ' + mins + 'm' };
  }
  return { ok: true };
}
```

### `requestRedraft()` — confirmation handler

```javascript
function requestRedraft() {
  var res = delibResolutions[0];
  var check = canRedraft(res);
  if (!check.ok) { alert(check.reason); return; }

  var meta = res.aiDraftMeta;
  var userId = MOCK.currentUser.id;

  if (meta.confirmations.indexOf(userId) !== -1) {
    alert('You have already confirmed this redraft.');
    return;
  }

  meta.confirmations.push(userId);
  if (meta.confirmations.length < meta.confirmQuorum) {
    updateResolutionSlot();
    alert('Confirmation recorded (' + meta.confirmations.length + '/' + meta.confirmQuorum + ')');
    return;
  }

  executeRedraft(); // quorum met
}
```

---

## System Settings

AI drafter settings are in **System Settings → Deliberation → AI Drafter**:

| Setting | Default | Description |
|---------|---------|-------------|
| Max Auto-Redrafts | 3 | Maximum AI drafts per resolution |
| Redraft Cooldown | 5 min | Minimum time between redrafts |
| Confirmation Quorum | 1/3 participants | How many must confirm before redraft |
| AI Sets Domain Weights | Yes | Whether AI assigns domain shares (fallback: equal) |

---

## Vote Nullification

Any change to the resolution nullifies all existing votes:

- **Save (manual edit)**: `votesNullified = true`
- **Auto Redraft (AI)**: `votesNullified = true`
- This is irreversible — once nullified, votes must be recast

The `votesNullified` flag is displayed in the sidebar resolution card and controls the status badge ("Votes nullified" / "Votes active").

---

## UI Layout

### Sidebar Resolution Card

```
┌─────────────────────────────────────┐
│ Resolution                          │
│ Debris Liability Framework    Policy│
│ 1 version · Votes active            │
│ [Open] [Edit] [Redraft]    Draft   │
└─────────────────────────────────────┘
```

When no resolution exists:

```
┌─────────────────────────────────────┐
│ Resolution                          │
│      No resolution drafted yet      │
│  [ Generate Resolution (AI) ]       │
└─────────────────────────────────────┘
```

### Modal Modes

**View only** (Open): fields readonly, no save/redraft buttons, vote buttons enabled
**Edit**: fields editable, Save + Auto Redraft buttons visible

---

## Production Implementation

In production, the AI drafter would:

1. **API endpoint**: `POST /api/ai/draft` with proposal, discussion, domains
2. **Model**: LLM fine-tuned on legislative drafting, domain relevance classification
3. **Domain scoring**: Separate model or rule-based system for domain relevance
4. **Rate limiting**: Server-side enforcement of cooldown and draft limits
5. **Persistence**: Draft metadata stored in database, not just in-memory

The current implementation simulates the AI with a 1.5s timeout and hardcoded output.

---

## References

- `platform/index.html` — `generateResolution()`, `executeRedraft()`, `canRedraft()`, `requestRedraft()`
- `docs/vote-weight-system.md` — Domain weight calculation and rationale
- `docs/modal-design.md` — Resolution modal UI decisions
