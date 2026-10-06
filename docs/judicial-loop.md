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

- Adjudicators comes from settings (`jstf_adjudicators`, default 3) —
  the minimum acceptances to seat a team. (Vote quorums for decisions
  live under the Quorum tab; team size lives here, per STF type.)
- The eligible pool is randomly sampled from the top half:
  - **competence pool** (default): every member in good standing,
    stewards first, then everyone else ordered by summed domain
    competence. With `jstf_domains` set, only members competent
    (`ws > 0`) in a listed domain qualify; blank means every member
    is eligible. Steward = member of a circle.
  - **stewards pool** (`jstf_pool_mode = 'stewards'`): active stewards
    in good standing only. The already-entrusted pool.
- Excluded from every pool: the **target** and the **petitioner**
  (thread `submitter_id`). The escalating sponsor is eligible and must
  be sampled like anyone else — sponsorship confers no seat.
- Oversampled invitations go out (`stf_candidates`, `status=invited`):
  roughly 3× quorum drawn from the top half; the first quorum
  acceptances start deliberation and lock the invitation.

Toggle the pool in Settings → STF → jSTF: Pool, Domains (comma
list, blank = every member eligible), Adjudicators. Like other STF
settings these go through the settings proposal flow and persist to
`system_settings`.

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

There is one xSTF with different settings — judicial and circle
probes are the same entity, a project task group. The seated team
deliberates on the sealed case thread. For deep questions the team
frames mandate questions (`cell_objectives` carry `assessors` = how
many eyes, and a due date) and commissions xSTF probes per question —
**siloed** (one isolated probe per investigator, each delivering its
own report, so one task yields many deliverables) or
**collaborative** (one shared probe whose team works together,
sometimes blind to each other), chosen per commission.

A probe operates **only on its assigned information package**:

- Authority proving the commissioning body may task it — a jSTF
  commission is itself the authority; circle commissions cite the
  approved resolution plus any extra refs. Recorded visibly on the
  probe; nothing else may be acted on.
- The deliberated and approved deliverable description, cited
  resolutions, and useful content.
- Mandate, objectives, and prefilled tasks (by the commissioner),
  written to the probe's tasks/objectives so progress is shared.

**Every deliverable is a composition** — a draft, research, an
investigation report; a report on attended work is a composition too.
The team composes, stewards review (approve / request revision), and
the commissioning team accepts reports into case findings per
deliverable. The probe talks to its commissioners through **task
status** (pending → in-progress → complete), visible on the
commissioning question — and commissioning-body members may post
directly in the probe deliberation, as if on the team, even on
siloed paths.

The probe talks to its commissioners through **task status**
(pending → in-progress → complete), visible as task counts on the
commissioning question. One probe per (question, investigator);
completed probes don't block.

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

## 9. After the verdict: ripples, not orders

jSTF has no wire to any vSTF and commissions none. A verdict does two
things at most: it executes its own sanctions (removal, freezes, guest
level) and it sets conditions. `remove_from_circle` removes the member
and records a vacancy on the circle. `reverify_competences` flags every
competence claim of the target unverified. That is the whole of jSTF's
act — it neither knows nor cares whether reverification ever happens.

The integrity engine (`integrityEnginePoll`, lazy on bootstrap, capped
per run, idempotent) notices the conditions and commissions what they
call for. Ripple A: anyone active with unverified claims and no open
competence-claim gets one auto-commissioned (`commissioned_by:
system`). Ripple B: a recorded vacancy vets its succession pool —
pending applicants without a recent (12-month) candidacy vetting get a
steward-candidacy vSTF each — and then seats the top approved candidate
per open seat, accepting their application and clearing the vacancy.
Capacity is split so a verification backlog can never starve succession.

## Deferred / known limits

- AI verdict drafting does not exist yet (AI drafting covers
  deliberation resolutions only); all verdicts are member-drafted.
- Audit-triggered refresh reseats a fresh team directly rather than
  opening a new invitation vacancy.
- `user_competence` pool data is thin in development seeds; small
  pools degrade to whoever is eligible.
