# S4 — Circles & organisations

Workflow review of the circle and organisation lifecycle, against the intended
behaviour in `docs_v2/governance-model.md` (§Circle Lifecycle, §Succession Queue,
§Application Rules) and `docs_v2/organisations.md` (§2 Founding flow).

Probes: `docs/audit/suite/s04-circles-organisations.mjs` (28 checks, isolated database).

## Verdict: works, with three divergences

**23/28 checks pass.** Circle founding, the succession chain, mandate storage, the
governance ledger and circle settings persistence all behave as documented. Three
workflows diverge — all in the *snapshot application* path, where the server and the
browser both act (or neither does).

## As expected

| Workflow | Evidence |
|---|---|
| A founding proposal is raised server-side and approved by aSTF | one deliberation cell, one aSTF motion-audit cell, parallel sealed filings |
| An approved founding creates **one** circle with its mandate | `circles` +1, `status: Suggested`, `circle_domains` carries the primary domain with its desired Ws |
| The proposer is seated as the founding steward | `circle_roster` row, `members` recomputed, `user_circles` updated |
| The founding is written to the governance ledger | one `governance_ledger` row |
| An approved circle **settings** change is persisted | `circles.description` updated server-side |
| An application enters the succession queue | `pending`, server-assigned per-circle queue number, one per member per circle |
| A resignation opens a succession vacancy | `meta.vacancies` records it, `markFormer` updates the roster and count |
| The integrity engine vets pending applicants | a `steward-candidacy` vSTF cell is spawned for the applicant, tied to the circle with the vacancy |
| Vetting is human and quorate | three assessments → `Assessment Filed`, `approved: true` at the 60+ average |
| The engine seats the top **approved** candidate per open seat | the fresh applicant is seated on the circle the probe founded; the pre-vetted candidate (score 75, from the seed) takes an open seat in `space-law` ahead of a fresh applicant (80, but the seat was already filled) |

The last row is the documented rule working exactly as written: *"approval plus an open
vacancy does"* — a candidate is seated only because a seat is open, and the top approved
candidate takes it.

## Divergences

### F-A (Major) — a circle founding is applied twice

`applySettingsSnapshot()` in the browser (`platform/index.html:3341` → `:6500`) inserts the
new circle itself (`SolisApi.saveCircle` → `POST /circles`) while the server has already
inserted one (`applySettingsSnapshotServer` in `api.php`). Two rows result:

```
circles: 6 → 7 after one founding
id                  name               status      members
circle-mwjck3ug     Audit S4 Circle    Suggested   1     ← the browser's copy
circle-tolmbn-4619  Audit S4 Circle    Suggested   1     ← the server's copy
```

Both carry a steward (the browser's copy seats the person who raised the proposal), only the
server's copy has a mandate and a ledger entry, and both appear in the circle list for
every member afterwards. The duplication happens in the session that raised the proposal
(the browser keeps a local mirror of the proposal cell); after a reload the extra row
remains in the database.

**Fix** — one writer. The server owns the apply; the browser echoes locally and re-reads
(`loadApiData()`) instead of writing. Same for the `system` snapshot, which the browser
also pushes (`PUT /system-settings`) after the server has already applied it.

### F-B (Major) — an organisation founding never reaches the server

`submitOrgSettingsProposal()` (`platform/index.html:6572`) pushes the proposal cell into
`MOCK.cells` **in memory only** — no API call — so the proposal itself is not recorded.
The snapshot type `'org'` is then ignored by the server (`applySettingsSnapshotServer`
handles `'system'` and `'circle'` only), and the browser's own apply
(`index.html:6511-6521`) mutates an existing organisation object — for a *new* organisation
(`target: 'new'`) it finds nothing and does nothing at all.

Result: `organisations` 3 → 3 after an approved founding; no organisation row, no proposal
record, nothing to see after a reload. `docs_v2/organisations.md §2` records this as a
known limit — it is the one founding flow the platform does not actually perform.

**Fix** — raise the proposal server-side (`POST /proposals/system` with
`delibType: 'org-creation'`, which needs adding to the allowed list) and apply the `'org'`
snapshot in `applySettingsSnapshotServer`: create the organisation (with its knowledge
domains) for `target: 'new'`, update it otherwise, and write the governance ledger entry.

### F-C (Major) — organisation settings changes are lost on reload

Same root cause as F-B: the browser mutates `MOCK.orgs` in memory; the server ignores the
`'org'` snapshot. A change approved by aSTF disappears on the next load — the probe shows
`organisations.gss.summary` unchanged after approval.

**Fix** — covered by the F-B change (server-side `'org'` apply). The browser stops
mutating organisation objects locally.

## Fixes applied (re-probed: 32/32)

| Finding | Change |
|---|---|
| **F-A** | The server is now the single writer. `applySettingsSnapshot()` (the browser) no longer calls `saveCircle`, `saveGovernanceEntry` or `saveSystemSettings`; it echoes locally where cheap and re-reads the record with `loadApiData()`. One founding now produces exactly one circle, with its mandate, its seated founder and one governance-ledger entry. |
| **F-B** | Organisation founding runs on the server: `POST /proposals/system` accepts `delibType: 'org-creation'`, `applySettingsSnapshotServer` gained an `'org'` branch (creates the organisation with its knowledge domains, or updates an existing one) and writes the ledger entry. The browser raises the proposal through the API (`submitOrgSettingsProposal`) instead of pushing a cell into memory. |
| **F-C** | Same change as F-B — organisation settings changes are applied server-side and survive a reload. |

Re-verification: `s04-circles-organisations.mjs` → **32/32**, and the full suite
(M0–M17, 391 checks) passes with no regressions.
