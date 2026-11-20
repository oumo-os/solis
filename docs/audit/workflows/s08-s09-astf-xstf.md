# S8–S9 — aSTF adjudication and xSTF execution

Workflow review of `docs_v2/stf-auto-evaluation.md` (§3 invitation pools, §5
steward-created xSTF). Probes: `docs/audit/suite/s08-astf-xstf.mjs` (8 + 9 checks).

## Verdict: as expected — 17/17

## S8 — aSTF

| Workflow | Evidence |
|---|---|
| A motion audit is a blind cell in `Blind Review` | `type: aSTF Cell`, `blind: 1` |
| Invitations | exactly `quorum + 2` candidates; the motion proposer is excluded from the pool |
| First quorum acceptances seat the team and lock the invitations | the 4th accept answers 409 "Assessors already seated" |
| Filings are sealed and parallel | after the first filing the cell still reads `Blind Review` / `Pending`; the second and third filings decide the audit as a majority |
| A split falls through to revision | 1 approved / 1 rejected / 1 revision → the verdict is `revision` (a rule not previously probed) |
| The audit unblinds and records the verdict | `status: Verdict Filed`, `resolution.verdict` |

## S9 — xSTF

| Workflow | Evidence |
|---|---|
| An execution cell requires an approved verdict | spawning before approval answers 400 |
| The steward selects the team and the blind mode | the chosen team is stored and `blind: 1` when selected |
| Authority | the xSTF source carries the approving aSTF id |
| The task ladder | seven default tasks are seeded |
| Deliverables | the team files one; the steward approves it; the cell completes |

The doc notes that the ranked candidate list (top 8, first 3 pre-checked) is a
**client-side** aid — the server stores only the team the steward selects. The probe
confirms that shape: no ranked-candidate endpoint exists; the chosen team is what persists.

No divergences in either section.
