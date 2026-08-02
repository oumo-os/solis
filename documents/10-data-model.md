# Solis Data Model — Database Prototype

Generated from `platform/db/schema.sql` — 57 tables. Seed source: `platform/mock.json` via `platform/db/seed.js`.

## Table of contents
- [users](#users)
- [user_competence](#user_competence)
- [user_circles](#user_circles)
- [user_orgs](#user_orgs)
- [participants](#participants)
- [user_activity](#user_activity)
- [domains](#domains)
- [domain_layout](#domain_layout)
- [organisations](#organisations)
- [org_knowledge_domains](#org_knowledge_domains)
- [circles](#circles)
- [circle_domains](#circle_domains)
- [circle_roster](#circle_roster)
- [circle_roster_domains](#circle_roster_domains)
- [circle_proposals](#circle_proposals)
- [circle_resolutions](#circle_resolutions)
- [circle_activity](#circle_activity)
- [exit_reason_labels](#exit_reason_labels)
- [cells](#cells)
- [cell_domains](#cell_domains)
- [cell_circles](#cell_circles)
- [cell_messages](#cell_messages)
- [cell_tasks](#cell_tasks)
- [cell_objectives](#cell_objectives)
- [cell_team](#cell_team)
- [draft_resolutions](#draft_resolutions)
- [resolution_versions](#resolution_versions)
- [resolution_implementing_circles](#resolution_implementing_circles)
- [cell_votes](#cell_votes)
- [vote_records](#vote_records)
- [cell_vote_summary](#cell_vote_summary)
- [stfs](#stfs)
- [stf_candidates](#stf_candidates)
- [stf_candidate_domains](#stf_candidate_domains)
- [threads](#threads)
- [inbox](#inbox)
- [inbox_actions](#inbox_actions)
- [inbox_meta](#inbox_meta)
- [publications](#publications)
- [publication_authors](#publication_authors)
- [news](#news)
- [events](#events)
- [opportunities](#opportunities)
- [projects](#projects)
- [project_domains](#project_domains)
- [system_settings](#system_settings)
- [stats](#stats)
- [registration_domains](#registration_domains)
- [registration_meta](#registration_meta)
- [integrity_records](#integrity_records)
- [governance_events](#governance_events)
- [circle_applications](#circle_applications)
- [circle_application_domains](#circle_application_domains)
- [project_applications](#project_applications)
- [governance_ledger](#governance_ledger)
- [domain_layout_meta](#domain_layout_meta)
- [auth_tokens](#auth_tokens)

## --

### users

| Column | Type | Notes |
|---|---|---|
| id | TEXT PRIMARY KEY |  |
| name | TEXT NOT NULL |  |
| initials | TEXT |  |
| email | TEXT UNIQUE |  |
| location | TEXT |  |
| joined | TEXT |  |
| status | TEXT |  |
| standing | INTEGER |  |
| standing_drift | TEXT |  |
| competence | INTEGER |  |
| competence_note | TEXT |  |
| interest_score | INTEGER |  |
| interest_drift | TEXT |  |
| active_roles | INTEGER |  |
| roles_breakdown | TEXT |  |
| bio | TEXT |  |
| essay | TEXT |  |
| avatar | TEXT | JSON: { gold: bool, gradient: string } |
| is_current | INTEGER DEFAULT 0 | 1 = the signed-in mock user |
| password_hash | TEXT | for auth; seeded users may be null |
| created_at |  |  |

### user_competence

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PRIMARY KEY AUTOINCREMENT |  |
| user_id | TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE |  |
| domain | TEXT NOT NULL | display name e.g. 'Space Law' |
| ws | INTEGER |  |
| wh | INTEGER |  |
| interest | INTEGER |  |
| bar_ws | INTEGER |  |
| bar_wh | INTEGER |  |
| members | INTEGER |  |
| color | TEXT |  |
| rank | INTEGER |  |
| kind |  |  |

### user_circles

| Column | Type | Notes |
|---|---|---|
| user_id | TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE |  |
| circle | TEXT NOT NULL | display name e.g. 'SL Circle' |
| status | TEXT |  |
| since | TEXT |  |
| kind |  |  |

- PK: user_id, circle

### user_orgs

| Column | Type | Notes |
|---|---|---|
| user_id | TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE |  |
| org_acronym | TEXT NOT NULL |  |

- PK: user_id, org_acronym

### participants

| Column | Type | Notes |
|---|---|---|
| user_id | TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE |  |
| location | TEXT | directory card (differs from login profile) |
| joined | TEXT |  |
| bio | TEXT |  |

### user_activity

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PRIMARY KEY AUTOINCREMENT |  |
| user_id | TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE |  |
| seq | INTEGER NOT NULL DEFAULT 0 |  |
| text | TEXT |  |
| time | TEXT |  |
| type | TEXT |  |

### domains

| Column | Type | Notes |
|---|---|---|
| id | TEXT PRIMARY KEY | e.g. 'astronomy-astrophysics' |
| label | TEXT |  |
| short | TEXT |  |
| color | TEXT |  |
| has_circle | INTEGER DEFAULT 0 |  |
| type | TEXT |  |
| taxonomy | TEXT |  |

### domain_layout

| Column | Type | Notes |
|---|---|---|
| domain_id | TEXT PRIMARY KEY REFERENCES domains(id) ON DELETE CASCADE |  |
| x | INTEGER |  |
| y | INTEGER |  |

### organisations

| Column | Type | Notes |
|---|---|---|
| id | TEXT PRIMARY KEY |  |
| name | TEXT |  |
| acronym | TEXT |  |
| shortname | TEXT |  |
| location | TEXT |  |
| summary | TEXT |  |
| status | TEXT |  |
| founded | TEXT |  |
| founding_cell | TEXT |  |
| member_count | INTEGER |  |
| website | TEXT |  |
| logo | TEXT |  |

### org_knowledge_domains

| Column | Type | Notes |
|---|---|---|
| org_id | TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE |  |
| domain | TEXT NOT NULL |  |

- PK: org_id, domain

### circles

| Column | Type | Notes |
|---|---|---|
| id | TEXT PRIMARY KEY |  |
| name | TEXT |  |
| status | TEXT |  |
| members | INTEGER |  |
| motions | INTEGER |  |
| description | TEXT |  |
| founded | TEXT |  |
| term_override | TEXT |  |
| expiry_override | TEXT |  |
| meta | TEXT | JSON catch-all (maxMembers, archivedDate, ...) |

### circle_domains

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PRIMARY KEY AUTOINCREMENT |  |
| circle_id | TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE |  |
| domain | TEXT NOT NULL |  |
| mandate | TEXT | 'primary' \| 'secondary' \| NULL (general) |
| desired_ws | INTEGER |  |

### circle_roster

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PRIMARY KEY AUTOINCREMENT |  |
| circle_id | TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE |  |
| member_id | TEXT NOT NULL | from roster entries (may be id or name) |
| name | TEXT |  |
| initials | TEXT |  |
| color | TEXT |  |
| ws | INTEGER |  |
| status | TEXT | 'active' \| 'former' |
| joined | TEXT |  |
| last_active | TEXT |  |
| left | TEXT |  |
| left_reason | TEXT |  |
| top_domain | TEXT |  |

### circle_roster_domains

| Column | Type | Notes |
|---|---|---|
| roster_id | INTEGER NOT NULL REFERENCES circle_roster(id) ON DELETE CASCADE |  |
| domain | TEXT NOT NULL |  |
| ws | INTEGER |  |

- PK: roster_id, domain

### circle_proposals

| Column | Type | Notes |
|---|---|---|
| id | TEXT NOT NULL |  |
| circle_id | TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE |  |
| title | TEXT |  |
| status | TEXT |  |
| date | TEXT |  |

- PK: id, circle_id

### circle_resolutions

| Column | Type | Notes |
|---|---|---|
| id | TEXT NOT NULL |  |
| circle_id | TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE |  |
| title | TEXT |  |
| date | TEXT |  |
| type | TEXT |  |

- PK: id, circle_id

### circle_activity

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PRIMARY KEY AUTOINCREMENT |  |
| circle_id | TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE |  |
| text | TEXT |  |
| time | TEXT |  |
| type | TEXT |  |

### exit_reason_labels

| Column | Type | Notes |
|---|---|---|
| key | TEXT PRIMARY KEY |  |
| label | TEXT |  |

### cells

| Column | Type | Notes |
|---|---|---|
| id | TEXT PRIMARY KEY |  |
| type | TEXT | Project\|Circle\|Deliberation\|aSTF\|xSTF\|Founding Cell |
| title | TEXT |  |
| status | TEXT |  |
| delib_type | TEXT |  |
| participants | INTEGER |  |
| members | INTEGER |  |
| progress | INTEGER |  |
| days_active | INTEGER |  |
| lead | TEXT |  |
| circle | TEXT |  |
| created | TEXT |  |
| deadline | TEXT |  |
| blind | INTEGER DEFAULT 0 |  |
| assessors | INTEGER |  |
| commissioned_by | TEXT |  |
| resolution_ref | TEXT |  |
| entity_type | TEXT |  |
| source | TEXT | JSON { type, proposer } |
| resolution | TEXT | JSON { status } |
| deliverable_specs | TEXT | JSON for xSTF cells |
| meta | TEXT | JSON catch-all |

### cell_domains

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PRIMARY KEY AUTOINCREMENT |  |
| cell_id | TEXT NOT NULL REFERENCES cells(id) ON DELETE CASCADE |  |
| domain | TEXT NOT NULL |  |

### cell_circles

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PRIMARY KEY AUTOINCREMENT |  |
| cell_id | TEXT NOT NULL REFERENCES cells(id) ON DELETE CASCADE |  |
| circle_id | TEXT |  |
| name | TEXT |  |
| initials | TEXT |  |
| gradient | TEXT |  |
| status | TEXT | 'active' \| 'self-disqualified' ... |
| role | TEXT | 'Lead' \| 'Contributing' \| 'Withdrew' |
| votes | INTEGER |  |

### cell_messages

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PRIMARY KEY AUTOINCREMENT |  |
| cell_id | TEXT NOT NULL REFERENCES cells(id) ON DELETE CASCADE |  |
| author | TEXT |  |
| initials | TEXT |  |
| text | TEXT |  |
| time | TEXT |  |
| color | TEXT |  |

### cell_tasks

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PRIMARY KEY AUTOINCREMENT |  |
| cell_id | TEXT NOT NULL REFERENCES cells(id) ON DELETE CASCADE |  |
| task_id | TEXT |  |
| label | TEXT |  |
| status | TEXT |  |
| locked | INTEGER DEFAULT 0 |  |
| assignee | TEXT |  |

### cell_objectives

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PRIMARY KEY AUTOINCREMENT |  |
| cell_id | TEXT NOT NULL REFERENCES cells(id) ON DELETE CASCADE |  |
| obj_id | TEXT |  |
| label | TEXT |  |
| status | TEXT |  |

### cell_team

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PRIMARY KEY AUTOINCREMENT |  |
| cell_id | TEXT NOT NULL REFERENCES cells(id) ON DELETE CASCADE |  |
| name | TEXT |  |
| initials | TEXT |  |
| role | TEXT |  |
| focus | TEXT |  |

### draft_resolutions

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PRIMARY KEY AUTOINCREMENT |  |
| cell_id | TEXT NOT NULL REFERENCES cells(id) ON DELETE CASCADE |  |
| res_id | INTEGER |  |
| title | TEXT |  |
| text | TEXT |  |
| action | TEXT |  |
| votes_nullified | INTEGER DEFAULT 0 |  |

### resolution_versions

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PRIMARY KEY AUTOINCREMENT |  |
| draft_id | INTEGER NOT NULL REFERENCES draft_resolutions(id) ON DELETE CASCADE |  |
| title | TEXT |  |
| text | TEXT |  |
| action | TEXT |  |
| author | TEXT |  |
| ts | TEXT |  |

### resolution_implementing_circles

| Column | Type | Notes |
|---|---|---|
| draft_id | INTEGER NOT NULL REFERENCES draft_resolutions(id) ON DELETE CASCADE |  |
| circle_name | TEXT NOT NULL |  |

- PK: draft_id, circle_name

### cell_votes

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PRIMARY KEY AUTOINCREMENT |  |
| cell_id | TEXT NOT NULL REFERENCES cells(id) ON DELETE CASCADE |  |
| domain | TEXT NOT NULL |  |
| yea | INTEGER |  |
| nay | INTEGER |  |
| total | INTEGER |  |

### vote_records

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PRIMARY KEY AUTOINCREMENT |  |
| cell_id | TEXT NOT NULL REFERENCES cells(id) ON DELETE CASCADE |  |
| domain | TEXT NOT NULL |  |
| name | TEXT |  |
| initials | TEXT |  |
| ws | INTEGER |  |
| vote | TEXT |  |

### cell_vote_summary

| Column | Type | Notes |
|---|---|---|
| cell_id | TEXT PRIMARY KEY REFERENCES cells(id) ON DELETE CASCADE |  |
| summary | TEXT | JSON |

### stfs

| Column | Type | Notes |
|---|---|---|
| id | TEXT PRIMARY KEY |  |
| type | TEXT | vSTF\|aSTF\|jSTF\|xSTF\|p-aSTF |
| purpose | TEXT |  |
| title | TEXT |  |
| circle | TEXT |  |
| deadline | TEXT |  |
| status | TEXT |  |
| bucket | TEXT | pending\|active\|completed |

### stf_candidates

| Column | Type | Notes |
|---|---|---|
| id | TEXT PRIMARY KEY |  |
| stf_id | TEXT NOT NULL REFERENCES stfs(id) ON DELETE CASCADE |  |
| name | TEXT |  |
| initials | TEXT |  |
| match_score | INTEGER |  |
| interest_score | INTEGER |  |
| competence_score | INTEGER |  |
| status | TEXT |  |
| invited_date | TEXT |  |

### stf_candidate_domains

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PRIMARY KEY AUTOINCREMENT |  |
| candidate_id | TEXT NOT NULL REFERENCES stf_candidates(id) ON DELETE CASCADE |  |
| domain | TEXT NOT NULL |  |

### threads

| Column | Type | Notes |
|---|---|---|
| id | TEXT PRIMARY KEY |  |
| title | TEXT |  |
| body | TEXT |  |
| author | TEXT |  |
| initials | TEXT |  |
| avatar | TEXT | JSON |
| domain | TEXT |  |
| domain_color | TEXT |  |
| badge | TEXT |  |
| badge_class | TEXT |  |
| replies | INTEGER |  |
| likes | INTEGER |  |
| shares | INTEGER |  |
| time | TEXT |  |
| pinned | INTEGER DEFAULT 0 |  |

### inbox

| Column | Type | Notes |
|---|---|---|
| id | TEXT PRIMARY KEY |  |
| type | TEXT |  |
| title | TEXT |  |
| desc | TEXT |  |
| time | TEXT |  |
| badge | TEXT |  |
| unread | INTEGER DEFAULT 1 |  |
| detail | TEXT |  |
| nav | TEXT |  |

### inbox_actions

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PRIMARY KEY AUTOINCREMENT |  |
| inbox_id | TEXT NOT NULL REFERENCES inbox(id) ON DELETE CASCADE |  |
| label | TEXT |  |
| style | TEXT |  |
| action | TEXT |  |

### inbox_meta

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PRIMARY KEY AUTOINCREMENT |  |
| inbox_id | TEXT NOT NULL REFERENCES inbox(id) ON DELETE CASCADE |  |
| label | TEXT |  |
| value | TEXT |  |

### publications

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PRIMARY KEY AUTOINCREMENT |  |
| title | TEXT |  |
| journal | TEXT |  |
| date | TEXT |  |
| views | INTEGER |  |
| downloads | INTEGER |  |

### publication_authors

| Column | Type | Notes |
|---|---|---|
| publication_id | INTEGER NOT NULL REFERENCES publications(id) ON DELETE CASCADE |  |
| author | TEXT NOT NULL |  |

- PK: publication_id, author

### news

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PRIMARY KEY AUTOINCREMENT |  |
| title | TEXT |  |
| time | TEXT |  |
| source | TEXT |  |

### events

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PRIMARY KEY AUTOINCREMENT |  |
| title | TEXT |  |
| date | TEXT |  |
| location | TEXT |  |

### opportunities

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PRIMARY KEY AUTOINCREMENT |  |
| title | TEXT |  |
| deadline | TEXT |  |
| type | TEXT |  |

### projects

| Column | Type | Notes |
|---|---|---|
| id | TEXT PRIMARY KEY |  |
| title | TEXT |  |
| lead | TEXT |  |
| progress | INTEGER |  |
| role | TEXT |  |

### project_domains

| Column | Type | Notes |
|---|---|---|
| project_id | TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE |  |
| domain | TEXT NOT NULL |  |

- PK: project_id, domain

### system_settings

| Column | Type | Notes |
|---|---|---|
| id |  |  |
| steward_term_months | INTEGER |  |
| max_consecutive_terms | INTEGER |  |
| cooloff_months | INTEGER |  |
| p_astf_cycle_months | INTEGER |  |
| auto_expire_circles | INTEGER DEFAULT 0 |  |
| default_circle_expiry_months | INTEGER |  |

### stats

| Column | Type | Notes |
|---|---|---|
| id |  |  |
| stats | TEXT | JSON blob mirroring mock stats object |

### registration_domains

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PRIMARY KEY AUTOINCREMENT |  |
| name | TEXT |  |
| type | TEXT |  |

### registration_meta

| Column | Type | Notes |
|---|---|---|
| id |  |  |
| elo_map | TEXT | JSON |
| knowledge_levels | TEXT | JSON |
| experiential_levels | TEXT | JSON |
| default_interests | TEXT | JSON |

### integrity_records

| Column | Type | Notes |
|---|---|---|
| id | TEXT PRIMARY KEY |  |
| type | TEXT |  |
| subject | TEXT |  |
| purpose | TEXT |  |
| circle | TEXT |  |
| date | TEXT |  |
| verdict | TEXT |  |
| text | TEXT |  |

### governance_events

| Column | Type | Notes |
|---|---|---|
| id | TEXT PRIMARY KEY |  |
| type | TEXT |  |
| circle | TEXT |  |
| date | TEXT |  |
| text | TEXT |  |
| participant | TEXT |  |

### circle_applications

| Column | Type | Notes |
|---|---|---|
| id | TEXT PRIMARY KEY |  |
| circle_id | TEXT |  |
| circle_name | TEXT |  |
| applicant | TEXT |  |
| initials | TEXT |  |
| motivation | TEXT |  |
| status | TEXT |  |
| applied_date | TEXT |  |
| queue_position | INTEGER |  |

### circle_application_domains

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PRIMARY KEY AUTOINCREMENT |  |
| app_id | TEXT NOT NULL REFERENCES circle_applications(id) ON DELETE CASCADE |  |
| domain | TEXT NOT NULL |  |

### project_applications

| Column | Type | Notes |
|---|---|---|
| id | TEXT PRIMARY KEY |  |
| cell_id | TEXT |  |
| project_name | TEXT |  |
| applicant | TEXT |  |
| initials | TEXT |  |
| motivation | TEXT |  |
| status | TEXT |  |
| applied_date | TEXT |  |
| proposed_role | TEXT |  |

### governance_ledger

| Column | Type | Notes |
|---|---|---|
| id | TEXT PRIMARY KEY |  |
| type | TEXT |  |
| target | TEXT |  |
| settings | TEXT | JSON |
| applied_by | TEXT |  |
| applied_at | TEXT |  |
| status | TEXT |  |

### domain_layout_meta

| Column | Type | Notes |
|---|---|---|
| id |  |  |
| world_size | INTEGER |  |
| seeds | TEXT | JSON |
| camera | TEXT | JSON: { x, y, scale } |

### auth_tokens

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PRIMARY KEY AUTOINCREMENT |  |
| user_id | TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE |  |
| token | TEXT NOT NULL UNIQUE |  |
| expires_at | TEXT NOT NULL |  |
| created_at |  |  |

---

## Relationships (parent → children)

```
users ─┬─ user_competence      (kind: roster | self)
       ├─ user_circles         (kind: roster | self)
       ├─ user_orgs
       ├─ user_activity
       ├─ participants         (directory card overrides for login profile)
       └─ auth_tokens          (session tokens)

domains ─┬─ domain_layout      (x,y on the domain map)
         └─ domain_layout_meta (world size, seeds, camera) — singleton id=1

organisations ── org_knowledge_domains

circles ─┬─ circle_domains          (mandate domains, desired Ws)
         ├─ circle_roster          (members; left/left_reason for former)
         │    └─ circle_roster_domains
         ├─ circle_proposals
         ├─ circle_resolutions
         └─ circle_activity

cells ──┬─ cell_domains
        ├─ cell_circles        (plain circles vs participating circles w/ votes)
        ├─ cell_messages
        ├─ cell_tasks
        ├─ cell_objectives
        ├─ cell_team
        ├─ draft_resolutions   (res_id unique per cell)
        │    ├─ resolution_versions
        │    └─ resolution_implementing_circles
        ├─ cell_votes          (per-domain totals)
        │    └─ vote_records   (per-voter records)
        └─ cell_vote_summary   (JSON summary, singleton per cell)

stfs ── stf_candidates ── stf_candidate_domains

threads ── (domains live in threads.domain/domain_color; no child table)

inbox ──┬─ inbox_actions
        └─ inbox_meta

publications ── publication_authors
projects ── project_domains
circle_applications ── circle_application_domains
```

## Bootstrap shape (`GET /api/bootstrap`, requires Bearer token)

| Key | Source tables | Notes |
|---|---|---|
| `currentUser` | users, user_competence(self), user_circles(self), user_activity | identity from session token; roster fallback when no self-kind rows |
| `participants` | users + participants(directory) + user_competence(roster) + user_circles(roster) + user_orgs | directory cards |
| `organisations` | organisations + org_knowledge_domains | |
| `domains` | domains | id → {label, short, color, hasCircle, type, taxonomy} |
| `domainLayout` | domain_layout + domain_layout_meta | worldSize, seeds, camera |
| `circles` | circles + circle_domains + circle_roster(+domains) + proposals/resolutions/activity | meta extras (maxMembers, archivedDate, archiveReason) conditional |
| `cells` | cells + cell_domains + cell_circles + cell_messages + cell_tasks + cell_objectives + cell_team + draft_resolutions + versions + implementing_circles + cell_votes + vote_records + cell_vote_summary | JSON columns parsed; nulls stripped; `blind` only when true |
| `stfs` | stfs + stf_candidates + stf_candidate_domains | `{pending, active, completed}` buckets; pending uses `candidate` from title |
| `threads` | threads | |
| `inbox` | inbox + inbox_actions + inbox_meta | |
| `publications` | publications + publication_authors | |
| `news` / `events` / `opportunities` | news / events / opportunities | |
| `projects` | projects + project_domains | |
| `exitReasonLabels` | exit_reason_labels | |
| `systemSettings` | system_settings | |
| `stats` | stats | JSON |
| `registration` | registration_domains + registration_meta | domains, eloMap, levels |
| `integrityRecords` | integrity_records | |
| `governanceEvents` | governance_events | `participant` only when present |
| `circleApplications` | circle_applications + circle_application_domains | `relevantDomains` strings |
| `projectApplications` | project_applications | |
| `governanceLedger` | governance_ledger | settings JSON |

## Seed data (platform/mock.json → db/seed.js)

8 users, 5 circles, 22 cells, 6 stfs, 8 threads, 6 inbox, 3 publications.
All users login with `<id>@solis.local` / `solis123` (e.g. `os@solis.local` = Oumo Samuel).

