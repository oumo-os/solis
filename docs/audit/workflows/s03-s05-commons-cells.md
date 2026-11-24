# S3–S5 — The Commons and the cell workspaces

Workflow review of `docs_v2/governance-model.md` (§Deliberation Cells, §Project Cell
Governance). Probes: `docs/audit/suite/s03-s05-commons-cells.mjs` (8 + 5 checks).

## Verdict: as expected — 13/13

| Section | Evidence |
|---|---|
| **S3** — compose a discussion, reply as a steward, endorse (with the refreshed counter), bookmark, pin, the thread reaching the bootstrap feed, and raising it into a deliberation cell — including the duplicate-proposal guard |
| **S5** — an active project cell carries objectives and tasks; the **wired composer** posts through the real SPA handler (`postCellMessage`) into the API and records the signed-in member as the author |

No divergences. The S5 check is the end-to-end confirmation of the F18 fix: the composer
that used to be a decorative textarea now actually writes a message, with the real user's
identity.

## Note

The composer's author falls back to the literal `"Member"` when `MOCK.currentUser` is
absent (a logged-out browser). The API still requires a valid token, so this cannot create
a ghost message without a session — it is only a display fallback. The probe sets the
bootstrap user, as the running app always has.
