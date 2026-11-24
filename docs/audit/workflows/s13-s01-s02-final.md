# S13, S1, S2 — Publishing & records, the public site, onboarding

Final three sections of the section-by-section walk. Probes:
`docs/audit/suite/s13-s01-s02-final.mjs` (14 + 3 + 6 checks).

## Verdict: as expected — 23/23, no divergences

### S13 — publishing & records
- A member submits a publication; it lands in the steward's pending queue, stays out of
  the public list, and reaches that list only after a steward approves it.
- News, events and library items are steward-published.
- The public organisation feed serves live rows with **derived** member counts (F13).
- Policies, integrity records, governance events, the ledger and exit-reason labels are
  all readable.

### S1 — the public site
- The homepage's data containers are present and its markup contains no fixture figures
  (the de-hardcode sweep held).
- The live public bootstrap is readable with no token.

### S2 — onboarding
- A new member registers and receives a token; `/auth/me` reads back the same record;
  they declare a competence (stored **unverified** — vSTF verifies it later, S10) and rank
  an interest; the standing endpoint lists the new member.

## The walk is complete

All 13 sections (S1–S13) have been walked against the intended workflows in `docs_v2/`
and `to_prod.md`, with probes in `docs/audit/suite/` and a workflow card per section under
`docs/audit/workflows/`. Every divergence found has been fixed and re-probed:
F-A/F-B/F-C (S4), F-D (S6), F-E/F-F (S7). The other sections matched the design.
