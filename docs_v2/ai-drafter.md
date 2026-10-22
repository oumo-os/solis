# AI Drafter

**Status: implementation truth (v2). Supersedes `docs/ai-drafter.md`.**

## 1. Overview

The AI drafter generates resolution drafts from deliberation content.
Each deliberation cell has exactly one resolution. Resolutions can be
redrafted up to 3 times with participant confirmation. Every redraft
nullifies existing votes.

**The AI is simulated** — a 1.5s timeout with hardcoded output. The
production implementation will replace this with a real AI call.

## 2. Resolution structure

```json
{
  "title": "string",
  "text": "string",
  "action": "string",
  "domainShares": { "Space Law": 0.38, "Liability": 0.35, "Remote Sensing": 0.27 },
  "implementingCircles": ["Space Law Circle"],
  "aiDraftMeta": {
    "maxDrafts": 3,
    "cooldownMs": 300000,
    "confirmQuorum": 0.33,
    "domainShares": { ... },
    "implementingCircles": [ ... ]
  }
}
```

## 3. Generate Resolution

Button: **Generate Resolution** (`index.html:2998`). Flow:

1. AI processes deliberation content (1.5s simulated delay).
2. AI outputs title, text, action, implementingCircles, domainShares.
3. Modal opens automatically with AI-drafted content.
4. Falls back to equal shares if no AI shares: `1 / domains.length`.

## 4. Auto Redraft

Button: **Auto Redraft** in titlebar (`index.html:1901-1903`). Flow:

1. Check `canRedraft(res)` — max drafts, cooldown, and quorum.
2. Confirmation quorum required: 1/3 of participants (hardcoded,
   not configurable despite the settings UI).
3. Execute redraft → new version, votes nullified, modal opens.
4. Confirmations reset after each redraft.

Max drafts: 3 (hardcoded). Cooldown: 5 minutes (hardcoded). These
settings are collected in the UI (`index.html:2136-2147`) but never
read by the drafter.

## 5. Confirmation flow

- 1/3 of participants must confirm before redraft proceeds.
- Quorum met → confirmation proceeds.
- Confirmations reset after each redraft.

## 6. Vote nullification

- Save → `votesNullified = true`.
- Redraft → `votesNullified = true`.
- Nullification is irreversible once set.
- Shown in sidebar resolution card.

## 7. Vote nullification rules

- Save: nullifies votes.
- Redraft: nullifies votes.
- Irreversible.

## 8. Modal

The modal is always editable — there is no separate "View only" mode.
Fields are never read-only. Save button always in footer. Auto Redraft
button in titlebar.

## 9. Sidebar resolution card

Shows title, status, votes (Yea/Nay), votesNullified flag, author,
timestamp, AI draft metadata (maxDrafts, cooldown, confirmQuorum,
domainShares, implementingCircles).

## 10. Functions

- `generateResolution` (`index.html:3038`)
- `executeRedraft` (`index.html:3133`)
- `canRedraft` (`index.html:3090`)
- `requestRedraft` (`index.html:3103`)
- `saveResolution` (`index.html:3464`)
- `saveViewDraft` (`index.html:3961`)

## 11. Production notes

The current implementation simulates the AI with a 1.5s timeout and
hardcoded output (`index.html:3076`, `3162`). The production
implementation will replace this with a real AI call. The "configurable"
settings (maxDrafts, cooldown, confirmQuorum) are collected but not
read — they would need to be wired into the drafter before they take
effect.
