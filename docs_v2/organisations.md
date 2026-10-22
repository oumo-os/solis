# Organisations

**Status: implementation truth (v2). Supersedes `docs/organisations.md`.**

## 1. What organisations are

Officially endorsed partner institutions. They appear on the public
page (`organisations.html`) and contribute to domain classification on
the domain map (`index.html:9085-9088`). They are **not** participants:
no login, no Ws, no vote weight, no mandate multiplier. Their
knowledge domains are flagged `type: 'affiliate'` and appear on the
domain map as a third category alongside `knowledge` and
`experiential`.

## 2. Founding flow (what the code actually does)

The founding flow is a **structured form**, not an AI drafter:

1. A steward opens the Organisation Affiliation modal
   (`index.html:2227`) and fills in name, acronym, location, knowledge
   domains, summary, website, founding intent.
2. `submitOrgSettingsProposal` (`index.html:6572`) creates a
   **Deliberation Cell** with `delibType: 'org-creation'` and a
   `settingsSnapshot` of `type: 'org'`.
3. The deliberation cell renders the snapshot as a diff during
   deliberation (`index.html:11869-11900`).
4. On aSTF approval, the snapshot is applied **client-side only**
   (`index.html:6655-6665`) — org name, acronym, summary, location,
   website, knowledge domains. No server apply; no governance ledger
   entry for orgs.
5. A `Founding Cell` (`type: 'Founding Cell'`, `entityType: 'organisation'`)
   exists only in **seed data** (`db/mock.json:3047,3092`) — new orgs
   never create one.

There is no `generateOrgSettings()` function. `extractAcronym` /
`findOrgByAcronym` / `autoLinkOrgs` exist and work on the name field.

## 3. Data shape

`organisations` table (`db/schema.sql`, `api.php:203`):
`id, name, acronym, shortname, location, summary, status, founded,
founding_cell, member_count, website, logo, knowledgeDomains`.

Bootstrap ships them through `/api/bootstrap` (`api.php:432`) and the
public endpoint `/api/public/organisations` (`api.php:2846-2857`).

## 4. Org settings modal

Titlebar + Profile/Domains tabs, footer `Submit as Proposal` / `Cancel`
(`index.html:2227-2270`). Profile: name, acronym, location, summary,
website. Domains: knowledge domains (comma-separated input).

## 5. Org detail modal

Profile card, summary, domain tags, affiliated members
(`index.html:6683-6725`). Footer actions: Settings, Visit Website.

## 6. Domain map "Organisations" mode

Third category on the domain map alongside knowledge and experiential
(`index.html:9085-9088`). Affiliates counted in the legend
(`index.html:1418`).

## 7. Vote weight

Organisations contribute **nothing** to vote weight. `getMandateMultiplier`
(`index.html:2692-2707`) keys only on circle roster membership and
`circle.mandate`. Affiliate domains carry no multiplier. The doc's
claim that "A resolution about astronomy now has weighted votes from
UAS members" is false.

## 8. Future work

- Full founding flow with STF verification of org credentials (not
  yet built).
- Server-side apply of org settings on aSTF approval (currently
  client-only).
- Persist `domainShares` on resolutions (currently ephemeral).
