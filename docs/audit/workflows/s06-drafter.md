# S6 — Deliberation & the AI drafter

Workflow review of the deliberation cell's drafting flow, against
`docs_v2/ai-drafter.md` (§3 Generate Resolution, §4 Auto Redraft, §5 Confirmation flow,
§6–7 Vote nullification, §11 Production notes).

Probes: `docs/audit/suite/s06-drafter.mjs` (13 checks, isolated database + a booted
copy of the SPA).

## Verdict: FIXED � the guards are configured, persisted and enforced

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

## Fixes applied (re-probed: 14/14)

The settings now persist on `system_settings` (new `ai_max_redrafts`, `ai_redraft_cooldown`,
`ai_confirm_quorum`, `vote_nullify_on_edit` columns) and are applied when a settings
snapshot is approved. The draft row carries `draft_count`, `last_draft_ts` and
`confirmations` (JSON). `POST /cells/:id/draft-resolutions/:did/confirm` records a
confirmation; the version-append route enforces the cap, the cooldown and the confirmation
quorum from the stored settings. The browser reads the same settings through the bootstrap
and no longer hardcodes the numbers. Re-probed 14/14, with M01/M02/M17 green.

## Notes

- The drafter is still a deterministic derivation, not a model call — the 1.5s delay and
  the "AI" framing are the simulation the design documents (§11). It now produces text
  from the cell's own record rather than a fixture, so the output is honest about what it
  is, but it is not an AI.
- Vote nullification on save and on redraft behaves as documented: the draft carries
  `votesNullified`, and the panel reflects it.

