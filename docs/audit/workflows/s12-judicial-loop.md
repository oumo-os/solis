# S12 — The judicial loop (jSTF)

Workflow review against `docs_v2/judicial-loop.md` (§1 report → thread, §2 escalation →
vacancy, §3 invitation → seating, §4 probes, §5 draft → endorsement → filing, §6 aSTF
formation and decision, §7 closeout, §9 ripples). Probe:
`docs/audit/suite/s12-judicial-loop.mjs` (20 checks).

## Verdict: as expected — 20/20

No divergences. The complete path from an anonymous report to an appealed, policy-cited
closeout works end to end on the isolated database.

| Stage | Evidence |
|---|---|
| Report → thread | sealed `b-judicial`, `stewards-only`, anonymised author, linked to `user:<target>`; a non-party gets 404 |
| Escalation → vacancy | a blind `jSTF Cell` under investigation, `quorum + 2` invitations, target and petitioner excluded |
| Seating | the first quorum acceptances seat the team; a later accept is refused (the invitations lock) |
| Restriction | a team majority changes the target's directory status (frozen → `Suspended` for a steward target) |
| Investigation | a question is recorded; a sealed xSTF probe is commissioned with the case id and question id; an approved finding closes the question |
| Draft → endorsement | filing before the team endorsement is refused (403); after the endorsement poll the verdict is filed |
| aSTF audit | a *separate* blind judicial audit cell is spawned with its own invitation pool and its own quorum of filings |
| Closeout | the case becomes `Resolution Applied` with a minted `JR-035` reference, the cited policy, the executing circle and the audit record; the target's restriction is lifted |
| Appeal | the verdict can be appealed into a new intake thread |

## Notes

- The jSTF team and the judicial aSTF have **different** pools and quorums — the jSTF
  adjudicators cannot audit their own verdict (complete separation, per §3/§6).
- A steward target is frozen (`users.status = Suspended`) rather than `Restricted` when
  the restriction vote is not unanimous — the mapping recorded as F7 in the audit.
- The judicial aSTF's rubric is the *justice* rubric (due diligence, justice,
  proportionality, integrity), not the motion-craft rubric — the cell's resolution
  carries `rubricKind: judicial`.
