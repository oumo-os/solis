# Wave 6 — The participation model (M17)

The audit's finding F3 (the "steward" gate is "active member of any circle") was confirmed
as the **intended** model, with one exception: *participation* is separated by topics.

> A steward is someone in a circle. Any steward may do what any other steward may.
> Participation is the exception — domains (topics) decide who takes part.

## What that means in the platform

| Concern | Rule | Where it is enforced |
|---|---|---|
| Steward actions | Open to every steward: crystallise a debate, submit a draft, file an aSTF verdict, approve a publication, publish news, pin a thread, manage settings | `resourceWriteGuard()` in `api.php` — gated on *being a steward*, never on which circle |
| **Speaking** | In a deliberation, circle or project cell, a member speaks only where they hold standing in one of the cell's topics | `participationDomains()` + the `cell_messages` gate in `api.php` |
| **Voting** | A member votes only in a domain where they hold standing | the `vote_records` gate in `api.php` |
| **Weight** | The weight of a vote is the member's own recorded standing — never a client-supplied number | `memberStanding()` in `api.php` |

"Standing" is the member's own record in `user_competence` (`ws` — their weighted standing —
or `wh`, their hard claim). The seed holds one or two domains per member, e.g. Akello Jane
(Space Law 1800, Astrophysics 1240), Zanele Khumalo (Remote Sensing 1300, Data Analysis
1050), Mwenda Thomas (Remote Sensing 1200, Events 890).

A cell's topics are its mandate domains (`cell_domains`), or — for a proposal that names a
domain — that proposal's own topic. A cell with no topics stays open to every steward.

## M17 — Participation & domain separation · 15/15 · ✅ works

**Covered:** topics exposed to the client, speaking gated by standing (member with standing
→ 201, member without → 403 with the topics named), voting gated by standing in that
domain, the stored weight being the member's own (a client claiming 10 is recorded as
1800), the same rule applied to project cells, topicless cells staying open, and steward
actions remaining global.

### F18 (Major) — the cell composers were decorative — **FIXED**

The three cell composers — deliberation ("Add to the deliberation…"), project cell ("Add to
the cell…") and circle cell ("Message to circle cell…") — rendered a textarea with **no
handler, no id and no delegated listener**. The API supported posting; the jSTF and xSTF
composers were wired; but in the platform's own deliberation, project and circle cells,
members could read the record and never write to it. The governance model was unusable from
the app.

**Fix** — the composers are wired (`postCellMessage()`), with Enter-to-send and a Post
button, and the participation rule is stated in the view: a member who holds no standing in
the cell's topics sees *"Participation follows your domains — this cell is about X, Y, so
you read here but do not speak here"* instead of a composer.

### F19 (Minor) — the circle-cell copy contradicted the model — **FIXED**

The circle cell's message card claimed *"Restricted to circle members"*, while the platform
treats every circle member as a steward and the messages are open to all of them. The copy
now reads: *"All messages are recorded. Open to every steward; what is spoken here is
separated by the cell's domains."*

## Notes

- Existing seeded messages that predate the rule are left untouched — history is history;
  only new messages are gated.
- The client mirrors the server rule (`participationGate()`), so the UI hides the composer
  rather than letting a member post into a refusal.
- jSTF, xSTF and aSTF cells keep their own membership rules (sealed teams, probe teams,
  assessors) — those are not topic-separated.
