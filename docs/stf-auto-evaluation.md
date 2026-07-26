# STF Auto-Evaluation System

## Overview

STFs (Short-Term Facilitators) are assigned through two distinct mechanisms:

1. **xSTF (Execution)**: Created by a circle steward. The steward sees ranked candidates and selects invitees.
2. **All other STFs (vSTF, aSTF, jSTF, p-aSTF)**: Auto-generated from random samples. No candidate list is visible to anyone.

## Auto-Generated STFs (vSTF, aSTF, jSTF, p-aSTF)

### How Candidates Are Selected

When an STF is triggered (e.g., a motion crystallises → aSTF, a vacancy opens → vSTF), the system:

1. **Samples** all eligible participants
2. **Evaluates** each against the STF requirements:
   - **Interest alignment**: Does the participant have declared interest in the relevant domains?
   - **Competence fit**: Does the participant have verified competence (Wh) in the relevant domains?
   - **Workload balance**: Is the participant already assigned to other active STFs?
3. **Ranks** participants by composite score
4. **Randomly samples** from the top-ranked pool to form the STF cell

### Why Random Sampling?

- Prevents the same people from always being assigned
- Distributes governance workload across the community
- Reduces gaming of the evaluation system

### Visibility

- **No candidate list is exposed** in the UI
- **No evaluation scores are shown**
- **Participants only learn they are assigned** when they receive their STF invitation
- The assignment appears in their inbox as an STF invitation

### Design Rationale

The auto-evaluation is invisible by design:
- Prevents participants from optimising for STF selection
- Maintains the integrity of blind assignment
- Reduces social pressure and gaming
- Keeps the focus on competence and interest rather than visibility

## xSTF (Execution) — Steward-Created

xSTFs follow a different flow because they require specific task expertise:

1. **Steward creates xSTF** from the circle cell with full task specification
2. **System evaluates** all participants and returns a ranked candidate list
3. **Steward sees** the ranked list with match scores
4. **Steward selects invitees** from the list
5. **Invitations sent silently** to selected candidates

The steward is the only person who sees the candidate evaluation for their xSTF.

## Technical Notes

- Evaluation uses the same scoring engine as auto-generated STFs
- The `stfCandidates` data structure stores xSTF-specific candidate evaluations
- Auto-generated STFs do not populate `stfCandidates` — they sample and assign directly
- Workload check prevents over-assignment (max 2 active STFs per participant)
