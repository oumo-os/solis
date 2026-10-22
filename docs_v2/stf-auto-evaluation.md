# STF Auto-Evaluation

**Status: implementation truth (v2). Supersedes `docs/stf-auto-evaluation.md`.**

The original doc described an auto-evaluation pipeline that does not exist.
This rewrite matches the code. Cross-references: `docs_v2/judicial-loop.md`,
`docs_v2/governance-model.md`.

## 1. What STFs actually are

There are five STF types. Only one (xSTF) is steward-created; the other
four are server-commissioned or audit-spawned.

| Type | Created by | Purpose |
|------|-----------|---------|
| **vSTF** | steward (`POST /cells/:id/spawn-vstf`) or integrity engine | Verify one named candidate's competence or steward candidacy |
| **aSTF** | motion submit (motion-audit) or jSTF verdict (judicial-audit) | Blind audit of a motion or a judicial verdict |
| **jSTF** | steward escalation (`POST /jstf/escalate`) | Judicial investigation of a member |
| **xSTF** | steward (`POST /cells/:id/spawn-xstf`, from an approved aSTF) | Execute a verified resolution |
| **p-aSTF** | steward or integrity engine | Periodic circle health review |

## 2. vSTF — the only "verification" STF

A vSTF assesses **one named candidate** in **one circle** for **one
claim type** (`competence-claim` or `steward-candidacy`). It is not a
random sample and not a cell of peers.

- **Spawn**: `POST /cells/:id/spawn-vstf` requires a steward of any
  circle. Body: `vstfType`, `candidateName`, `candidateInitials`,
  `circleName`, `domains[]`, `minAssessors` (clamped 2–7, default 3).
  The candidate is resolved to a `user_id` at spawn and stamped on
  `source.candidateId` — identity is id-keyed, not initials-based.
- **Assessors**: 3 stewards (or `minAssessors`), invited. Candidate
  cannot self-assess. Frozen/restricted members cannot file.
- **Completion**: steward-candidacy averages assessor scores (avg ≥ 60
  approves); competence claims flip the candidate's claimed domains to
  `verified = 1` only when a majority of assessors evaluated each
  domain positively. `stfs` row completes on quorum.
- **Blind**: vSTF cells spawn blind; only candidate + filed assessors
  see the record; everyone else sees `vSTF — sealed verification`.
- **Deadlines**: `vstf_duration_days` from settings (default 14),
  honored at spawn.
- **Engine commissioning**: the integrity engine auto-commissions a
  competence-claim vSTF for any active member with unverified claims
  and no open claim. Commissioned by `system`, not by any steward.

## 3. aSTF / jSTF — invitation pools, not samples

aSTF and jSTF seat assessors/adjudicators by **invitation**, not random
sampling. The eligible pool is `jstfEligiblePool` (stewards first,
then everyone by competence score; pool mode `competence` or `stewards`).
Invitations go to the top half of the qualifying pool, shuffled, at
`quorum + 2`. The first `quorum` acceptances seat the team and lock
the invitation.

- **jSTF**: target and petitioner excluded from the pool; sponsor
  eligible but not guaranteed a seat.
- **aSTF (judicial)**: complete separation — jSTF team, target,
  petitioner, sponsor all excluded.
- **aSTF (motion)**: motion proposer excluded.

No workload-balancing term exists. No "max 2 active STFs" cap exists.
No `stfCandidates` is "hidden" — invitations are visible to invitees.

## 4. p-aSTF — assigned reviewers

p-aSTF cells are spawned by a steward or by the integrity engine
(overdue circles, one per poll). Reviewers file circle rubric + member
reviews. Completion is per-circle (`stf-<cell>`), not the first
pending row. Reviews are keyed on `user_id`.

## 5. xSTF — steward-created execution

xSTF is the only STF created directly by a steward. Ranked candidate
list (client-side, top 8, first 3 pre-checked) with match/interest/
competence scores. Requires an approved aSTF verdict to spawn. Team
selected by steward; blind optional.

## 6. What "auto-generated" means (and doesn't)

Nothing is auto-generated from a random sample. The integrity engine
auto-*commissions* vSTFs in response to conditions (unverified claims,
vacancies). The commissioning is automatic; the assessment is human.
No evaluation scores are hidden from the assessed candidate — they see
their own scores; assessors see all scores; bystanders see sealed.
