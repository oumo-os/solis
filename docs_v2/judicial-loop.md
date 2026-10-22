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

Visible to and commentable by: stewards, the target, and the author
**before escalation**. Once escalated, the thread belongs to the case:
seated team, the parties (target, reporter) and the sponsor only.
Everyone else — stewards included — sees a sealed case. Authors post
as Anonymous.

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
  quorum + 2 drawn from the top half; the first quorum
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
(`majority = max(2, floor(n/2)+1)` — no one-vote courts), the
deliberation deadline starts (escalation date + `jstf_duration_days`),
and leftover invitations expire. Late acceptances are rejected — the
team is set.

Restriction voting unlocks only once the team is seated.

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
The team composes, the **commissioning team** reviews (approve /
request revision) — never an off-case steward — and accepts reports
into case findings per deliverable. The probe talks to its
commissioners through **task status** (pending → in-progress →
complete), visible on the commissioning question — and
commissioning-body members may post directly in the probe
deliberation, as if on the team, even on siloed paths.

One probe per (question, investigator); completed probes don't block.

## 5. Draft → endorsement → filing

Any seated adjudicator drafts the verdict (description; optional policy
citations, executing circles, system actions). **Saving a draft resets
endorsements** — agreement is always measured against current wording
(the response reports how many were cleared). Endorsement is
one-member-one-vote; majority carries. Filing requires a team
endorsement majority from a **seated adjudicator** — stewardship alone
no longer files. Then the aSTF audit opens. An empty verdict
(description only, no directive, no actions) records **exoneration**:
the claims were found insignificant.

## 6. aSTF formation and decision

The filed verdict opens an aSTF **vacancy** (`assessors` from settings,
`astf_assessors`, default 3). Assessor invitations disclose the
assignment only — case content stays sealed until acceptance, and each
invitee sees only their own invitation. The pool is stewards in good
standing with **complete separation**: the jSTF team, the target, the
petitioner and the sponsor can never assess the verdict they made,
faced, or filed. Declines trigger top-up invitations; quorum seats the
assessors (`aSTF adjudicator`, blind to each other by design).

Each seated assessor files rubric
(Due diligence 9 / Justice 9 / Proportionality 6 / Integrity 6) +
stance (approve / reject / revision) + rationale, exactly once — then
their task is complete. Filings stay **sealed permanently**, even from
fellow assessors; everyone sees only the count and their own filed
state. The jSTF case view tracks filings toward quorum:

- **Majority of filings decides** once quorum is reached (rubric
  averaged and flags unioned across the deciding filings only —
  dissent is not recorded, by blind-seal design).
- **No majority (ties and splits) → revision**: the same team redrafts.
- **Rejection majority** → composition flushed to a new team, case reopens.

On decision the verdict applies: JR policy minted and citeable,
system actions execute, restriction lifted on user and record,
implementing circles receive the JR in their mandated resolutions,
case closes (`Resolution Applied`, or `Exonerated` for exonerating
verdicts, which mint no policy and attach no action). Motion audits
follow the same machinery (proposer excluded instead of the
separation set); on approval the origin motion enacts.

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
next team write refreshes the composition automatically — new sample
under the case's frozen pool rules, full allowance, no cap. The lapsed
write itself is rejected with an explicit 409 (re-cast under the new
team) instead of failing opaquely. Votes and drafts from departed
members are dropped; history is kept.

## 9. After the verdict: ripples, not orders

jSTF has no wire to any vSTF and commissions none. A verdict does two
things at most: it executes its own sanctions (removal, freezes, guest
level) and it sets conditions. `remove_from_circle` removes the member
and records a vacancy on the circle. `reverify_competences` flags every
competence claim of the target unverified. That is the whole of jSTF's
act — it neither knows nor cares whether reverification ever happens.

The integrity engine (`integrityEnginePoll`, lazy on authenticated
bootstrap, capped per run with capacity split so verification can
never starve succession, idempotent) notices the conditions and
commissions what they call for. Ripple A: anyone active with
unverified claims and no open competence-claim gets one
auto-commissioned (`commissioned_by: system`). Ripple B: a recorded
vacancy vets its succession pool — pending applicants without a
recent (12-month) candidacy vetting get a steward-candidacy vSTF
each — and then seats the top approved candidate per open seat
(matched to that circle's vacancy, frozen/restricted/skipped
applicants excluded, capacity honored), accepting their application
and clearing the vacancy.

## 10. Identity: user IDs decide, initials display

Every membership, vote, filing, assessment, review and candidacy is
keyed on `user_id`. Initials survive as display labels and as a
fallback for legacy rows that predate the keys — they never decide
access on new data. Consequences: two members sharing initials cannot
collide (votes, seats and filings stay separate); invitations,
applications and candidates resolve by id first; the sponsor is stored
as `escalatedById`, not a name lookup. History and event text keep
names for the audit trail; gates never trust them.

## 11. Blindness matrix

Who sees what on blind cells:

| Cell | Seated team / readers | Everyone else |
|------|----------------------|---------------|
| jSTF (open) | full case | sealed case (`···ref`), no target/thread/questions/draft/counts |
| jSTF (closed) | full case | sealed record (precedent lives in JR policies + integrity records) |
| xSTF probe | probe team + commissioning jSTF team | sealed probe |
| vSTF claim | candidate (minus filed assessments until completion) + filed assessors | sealed verification |
| aSTF motion (open) | stewards | sealed from non-stewards |
| aSTF judicial (open) | seated assessors only | sealed audit |
| aSTF judicial (closed) | nobody (sealed for all) | sealed audit |

Sealed titles carry a short opaque reference (`···4034`) — stable
across viewers, unlinkable to identity. Direct row APIs 404 exactly
where bootstrap seals. Assessors on one audit never learn each other;
filings are never revealed, only counted.

## Deferred / known limits

- AI verdict drafting does not exist yet (AI drafting covers
  deliberation resolutions only); all verdicts are member-drafted.
- Audit-triggered refresh reseats a fresh team directly rather than
  opening a new invitation vacancy.
- Stalled audits (vacancy never filled, assessors never filing) have no
  expiry transition yet — they sit in `Blind Review` until humans act.
