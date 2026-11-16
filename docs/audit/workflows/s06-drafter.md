# S6 — Deliberation & the AI drafter

Workflow review of the deliberation cell's drafting flow, against
`docs_v2/ai-drafter.md` (§3 Generate Resolution, §4 Auto Redraft, §5 Confirmation flow,
§6–7 Vote nullification, §11 Production notes).

Probes: `docs/audit/suite/s06-drafter.mjs` (13 checks, isolated database + a booted
copy of the SPA).

## Verdict: works; the guards are documented gaps that the server does not enforce

**13/13 checks pass.** The drafting itself behaves as the design describes.

## As expected

| Workflow | Evidence |
|---|---|
| "Generate Resolution" reads the deliberation, not a fixture | the drafted **title** is the cell's own title; the text opens `MOTION: <cell title>` and its points are drawn from the cell's real messages (`The deliberation must establish proportional liability.`), ending with `Drafted from the deliberation record — 1 message, 16 participants.` |
| A member with standing in the topic can speak first | the message that feeds the draft is accepted by the API |
| The modal opens with the drafted content | `openResolutionModal` runs on the produced draft |

## F-D (Major) — the drafter's guards live in the browser, ignore the settings, and are not enforced by the server

Three separate weaknesses in one place:

**1. The settings are collected but never read.** The settings modal collects
`aiMaxRedrafts`, `aiRedraftCooldown` and `aiConfirmQuorum`
(`platform/index.html:7816-7818`) and stores them in `MOCK.systemSettings.deliberation`,
but the drafter hardcodes its own numbers (`index.html:2874-2878`):

```js
aiDraftMeta: { draftCount: 1, maxDrafts: 3, cooldownMs: 300000, …,
               confirmQuorum: Math.ceil(delibParticipants.length / 3) }
```

The probe sets the configured cap to **1** and asks the drafter whether a third redraft is
allowed: it answers *yes*. `docs_v2/ai-drafter.md §11` already records this ("collected
but not read") — it is the state the doc describes.

**2. The server enforces none of it.** The redraft guard lives only in the browser
(`canRedraft()`), and the endpoint that stores a redraft
(`POST /cells/:id/draft-resolutions/:did/versions`) has no quota of its own:

```
five version appends against one draft  →  201, 201, 201, 201, 201
resolution_versions rows for that draft  →  5
```

So the cap, the five-minute cooldown and the confirmation quorum are client-side
suggestions: any other client — or a script — can append unlimited versions and redraft
without waiting or without a single confirmation.

**3. The confirmation quorum has nowhere to live.** The confirmations sit in the
browser's `aiDraftMeta`; `draft_resolutions` stores no confirmation state (the table has
no such column), so a redraft quorum cannot be checked by the server, and a quorum in
progress is lost on reload.

**Fix direction** — make the server the authority, the way the rest of the governance
chain now works:

- persist the drafter's state (draft count, last draft timestamp, confirmations) with the
  draft — the resolutions table already carries `votes_nullified`; the same row can carry
  the draft counter and the confirmations;
- enforce the cap, the cooldown and the quorum in the version-append route, reading the
  values from `system_settings.deliberation` (the settings the platform already collects);
- have the browser read those settings instead of the literals.

The three settings already exist in `system_settings` (`astf/jstf` durations are stored
there today), so this is a matter of storing and enforcing them rather than inventing a
new concept.

## Notes

- The drafter is still a deterministic derivation, not a model call — the 1.5s delay and
  the "AI" framing are the simulation the design documents (§11). It now produces text
  from the cell's own record rather than a fixture, so the output is honest about what it
  is, but it is not an AI.
- Vote nullification on save and on redraft behaves as documented: the draft carries
  `votesNullified`, and the panel reflects it.
