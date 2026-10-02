# Judicial Loop (jSTF + judicial xSTF + judicial aSTF)

How a report becomes a verdict, who decides at each gate, and how the
loop closes. This is the normative flow; code references are illustrative.

## 1. Report → thread

Any authenticated member reports another member (`POST /jstf/report`,
`{targetId, description}`). A thread is created (`thread-jstf-*`,
badge `b-judicial`, `visibility: stewards-only`). Further reports on the
same target accumulate onto the pending thread, or onto the open case's
thread if one exists. New reports on a closed-case target open a fresh
thread — closed cases never absorb new reports.

Visible to and commentable by: stewards, the target, and the author.
Everyone else sees nothing. Authors post as Anonymous.

## 2. Escalation → vacancy

Any steward escalates the thread (`POST /jstf/escalate {threadId}`).
A jSTF cell is created (`Under Investigation`) **without a team**.
Instead a **vacancy** opens (`meta.formation.state = 'inviting'`):

- Quorum comes from settings (`jstf_quorum`, default 3).
- The eligible pool is sampled randomly (`ORDER BY RAND()`):
  - **competence pool** (default): active stewards in good standing
    with `user_competence.ws > 0` in one of `jstf_domains`. Empty
    domain list means every steward is eligible.
  - **stewards pool** (`jstf_pool_mode = 'stewards'`): active stewards
    in good standing, no competence filter. The already-entrusted pool.
- Excluded from every pool: the **target** and the **petitioner**
  (thread `submitter_id`). The escalating sponsor is eligible and must
  be sampled like anyone else — sponsorship confers no seat.
- `quorum + 2` invitations go out (`stf_candidates`, `status=invited`).

Toggle the pool in Settings → STF: jSTF Pool, jSTF Domains (comma
list, blank = all), jSTF Quorum. Like other STF settings these go
through the settings proposal flow and persist to `system_settings`.

## 3. Invitation → seating

Each invitee Accepts or Declines (`POST /cells/:id/jstf-membership`).
Accept seats immediately (`cell_team`, role `jSTF adjudicator` — the
only jSTF role; there are no ranks). Declines trigger one replacement
invitation while the vacancy is open.

The **first quorum acceptances close the vacancy**: participants,
team size and majority recompute from the real team
(`majority = floor(n/2)+1`), the deliberation deadline starts
(escalation date + `jstf_duration_days`), and leftover invitations
expire. Late acceptances are rejected — the team is set.

Restriction voting unlocks only once the team is seated. Cases created
before vacancies existed have no `formation` key and are treated as
seated.

## 4. Deliberation → xSTF probes

The seated team deliberates on the sealed case thread. For deep
questions the team frames mandate questions (`cell_objectives` carry
`assessors` = how many eyes, and a due date) and commissions xSTF
probes per question — **siloed** (one isolated probe per investigator)
or **collaborative** (one shared probe, chosen per commission).

- Each siloed probe has a single-investigator team
  (`jSTF-xSTF investigator` — the only xSTF role), its own deadline
  (the question due date), and only the assignee may file into it.
- Probe deliverables are reviewed by stewards; the team accepts
  reports into case findings per deliverable (`POST .../accept-findings`).
- One probe per (question, investigator); completed probes don't block.

## 5. Draft → endorsement → filing

Any seated adjudicator drafts the verdict (description; optional policy
citations, executing circles, system actions). **Saving a draft resets
endorsements** — agreement is always measured against current wording.
Endorsement is one-member-one-vote; majority carries. Filing requires
team endorsement majority **and** stewardship, then opens the aSTF
audit. An empty verdict (description only, no directive, no actions)
records **exoneration**: the claims were found insignificant.

## 6. aSTF formation and decision

The filed verdict opens an aSTF **vacancy** (`assessors` from settings).
Assessor invitations disclose the assignment only — case content stays
sealed until acceptance. Each seated adjudicator files rubric
(Due diligence 9 / Justice 9 / Proportionality 6 / Integrity 6) +
stance (approve / reject / revision) + rationale, then their task is
complete. The jSTF case view tracks counts toward quorum:

- **Approval quorum** → verdict applied: JR policy minted and citeable,
  system actions execute, restriction lifted on user and record,
  implementing circles receive the JR in their mandated resolutions,
  case closes (`Resolution Applied`, or `Exonerated` for exonerating
  verdicts).
- **Revision quorum** → same composition continues (verdict cleared,
  draft reopens).
- **Rejection quorum** → composition flushed to a new team, case reopens.

## 7. Closeout, freeze, appeal

On close the case thread is **frozen** (no further replies) with the
verdict posted as the last auto-comment. Restriction is lifted
automatically on user and record. New reports on the target open a
fresh thread and, if escalated, a fresh case.

**Appeal completes the loop:** appeals of resolutions or cases route
through intake and, when escalated, spawn a new case carrying
`appealOf`/`revisionOf` links. An overturning verdict supersedes the
original (`Superseded`); an upholding verdict records support. No one —
steward or otherwise — can overturn a jSTF outcome except through a
fresh case and a blind aSTF audit. jSTF is the last point of resolution.

## 8. Deadlines and refresh

Each composition gets `jstf_duration_days` from seating (visible as a
countdown on the case). If a seated team lets its deadline lapse, the
next team write refreshes the composition automatically — new sample,
same rules, full allowance, no cap. Votes and drafts from departed
members are dropped; history is kept.

## Deferred / known limits

- AI verdict drafting does not exist yet (AI drafting covers
  deliberation resolutions only); all verdicts are member-drafted.
- Audit-triggered refresh reseats a fresh team directly rather than
  opening a new invitation vacancy.
- `user_competence` pool data is thin in development seeds; small
  pools degrade to whoever is eligible.
- Vote records still key on initials; a `user_id` migration is pending
  (invitation accept already matches on `user_id`).
