# Plan: STF linkage integrity + user-id tail

## A. Remaining user-id work (tail only — most items landed in c0e520b / circles Batch 2)

1. `stfs` has candidate_id/candidate_name/candidate_initials columns (ALTER landed) but every
   vSTF row is NULL: add `backfillStfCandidateIds()` to api.php (resolve from source JSON
   `candidateId`, else by candidate name) and call it once on bootstrap.
2. `ensureStfCandidateId($stfId, $userId)` helper: stamp/lookup a candidate row by id.
3. seed-mysql.php: add candidate_id/candidate_name/candidate_initials to the `stfs` DDL and
   user_id to `circle_applications` DDL; seed userId on app rows (mock already carries it).
4. seed-mysql.php: backfill stf candidate ids on reseed.

Already done (no action): vote upsert, questions/xSTF/p-aSTF gates, sponsor id, engine
applicant resolution, vSTF candidateId stamping, mock userId, updateCircleApplication,
withdraw persistence, p-aSTF scoping.

## B. STF linkage integrity (circle <-> jSTF <-> STF)

### Verified interaction map
- Circle -> STF: p-aSTF (per circle, engine on cycle); vSTF steward-candidacy
  (per circle, `vacancyFor`); xSTF (circle-delegated, circle roster in allowlist);
  aSTF motion-audit (origin cell's circle).
- jSTF -> STF: probes (xSTF, team-only); judicial audit (aSTF, separation set).
- jSTF -> circle: removal records a vacancy; the engine then runs succession.
- STF -> circle: p-aSTF writes `lastPastfReview`; aSTF motion approval enacts the origin.

### Findings
F1 (high) `stfs.circle` is overloaded: judicial rows store the TARGET NAME
    ("Mensah Naa", "Diallo Mamadou"), p-aSTF stores a circle name, competence-claim vSTFs
    store ''. The sidebar prints that column as "circle" — a person appears there.
    Fix: judicial rows store the case target in a dedicated field, circle column holds a
    real circle id/name or is blanked.
F2 (high) `cells.commissioned_by` is overloaded: cell id (audits), 'system' (engine),
    the sponsor's user id (jSTF), a circle NAME (cell-19 xSTF). Fix: consistent
    commissioner = id, with the circle recorded in its own field.
F3 (high) Manual `spawn-pastf` does not dedupe against an open review for the same circle
    (engine does). Two open Remote Sensing reviews exist. Fix: same per-circle guard.
F4 (medium) STF pools are not circle-scoped: aSTF auditors and jSTF teams in stewards
    mode draw from stewards of ANY circle. Fix (optional): prefer the circle's stewards.
F5 (medium) spawn-pastf / spawn-vstf accept any circleName string without checking the
    circle exists; legacy rows disagree with their cell ("Commons" vs "Space Law Circle",
    "Space Law" vs "Space Law Circle"). Fix: validate + normalise circle refs.
F6 (low) `stf-astf-debris` points at no cell (id convention `stf-<cellId>` broken for
    legacy); UI rescues it via a hardcoded legacy map. Fix: normalise legacy ids.

### Execution order
1. A1-A4 (user-id tail) — 1 file + seed
2. B-F1/F2 (overloaded columns) — api.php + mock
3. B-F3 (p-aSTF dedupe) — api.php
4. B-F5 (circle validation) — api.php
5. Verify live, commit + push
